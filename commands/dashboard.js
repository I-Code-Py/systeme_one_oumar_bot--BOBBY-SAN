// commands/dashboard.js — /dashboard, /prison, /profil
const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, EmbedBuilder
} = require('discord.js');
const {
  getConfig, getLeaderboard, getMember, ensureMember,
  addPoints, getPointsHistory, setConfig, db
} = require('../utils/database');
const { leaderboard, memberProfile, profileButtons, error, success, sone, warning, footer } = require('../utils/embeds');
const { isBotManager, isAdmin, checkLicense, denyInteraction } = require('../utils/guards');

// ─── /dashboard ───────────────────────────────────────────────────────────────

const dashboardCmd = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('🏆 Voir le classement des points en direct'),

  async execute(interaction) {
    const { valid, config, reason } = checkLicense(interaction.guild.id);
    if (!valid) return denyInteraction(interaction, reason);

    const rows = getLeaderboard(interaction.guild.id, 20);
    const embed = leaderboard(rows, interaction.guild.name);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('dashboard_refresh')
        .setLabel('🔄 Actualiser')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};

// ─── /prison ──────────────────────────────────────────────────────────────────

const prisonCmd = {
  data: new SlashCommandBuilder()
    .setName('prison')
    .setDescription('🔒 [MOD] Mettre un membre en prison (ticket isolé)')
    .addUserOption(opt =>
      opt.setName('membre').setDescription('Membre à isoler').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const { valid, config, reason } = checkLicense(interaction.guild.id);
    if (!valid) return denyInteraction(interaction, reason);
    if (!isBotManager(interaction.member, config) && !isAdmin(interaction.member)) {
      return denyInteraction(interaction, 'Seuls les modérateurs peuvent utiliser cette commande.');
    }

    const target = interaction.options.getMember('membre');
    if (!target) return interaction.reply({ embeds: [error('Membre introuvable', 'Ce membre n\'existe pas.')], ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    try {
      // Ajouter le rôle prison
      if (config.role_prison_id) {
        await target.roles.add(config.role_prison_id);
      }

      // Créer le salon ticket prison
      const guild = interaction.guild;
      const everyone = guild.roles.everyone;
      const managerRole = config.role_botmanager_id ? guild.roles.cache.get(config.role_botmanager_id) : null;

      const prisonChannel = await guild.channels.create({
        name: `🔒・prison-${target.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: everyone.id, deny: ['ViewChannel'] },
          { id: target.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'], deny: ['AttachFiles', 'EmbedLinks'] },
          { id: interaction.client.user.id, allow: ['ViewChannel', 'SendMessages', 'ManageChannels'] },
          ...(managerRole ? [{ id: managerRole.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages'] }] : []),
        ],
        reason: `S-ONE Prison — ${target.user.tag}`,
      });

      // Sauvegarder en DB
      db.prepare(`
        INSERT INTO prison_channels (guild_id, user_id, channel_id) VALUES (?, ?, ?)
      `).run(guild.id, target.id, prisonChannel.id);

      const embed = new EmbedBuilder()
        .setColor(0x636E72)
        .setTitle('🔒 Accès restreint')
        .setDescription(
          `<@${target.id}>, vous avez été placé en **prison** par un modérateur.\n\n` +
          `Ce salon est réservé aux échanges avec l\'équipe de modération.\n` +
          `Attendez qu\'un modérateur vous contacte.`
        )
        .setFooter({ text: '⚡ Designed by Hackend — Systeme.one' })
        .setTimestamp();

      const releaseRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`prison_release_${target.id}`)
          .setLabel('🔓 Libérer')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`prison_close_${target.id}`)
          .setLabel('🗑️ Fermer le ticket')
          .setStyle(ButtonStyle.Danger),
      );

      await prisonChannel.send({ content: `<@${target.id}> <@&${config.role_botmanager_id || ''}>`, embeds: [embed], components: [releaseRow] });

      await interaction.editReply({
        embeds: [success('Prison créée', `<@${target.id}> a été placé en prison → <#${prisonChannel.id}>`)],
      });

    } catch (err) {
      console.error('[prison]', err);
      await interaction.editReply({ embeds: [error('Erreur', err.message)] });
    }
  },
};

// ─── /profil ──────────────────────────────────────────────────────────────────

const profilCmd = {
  data: new SlashCommandBuilder()
    .setName('profil')
    .setDescription('👤 [ADMIN] Voir le profil complet d\'un membre')
    .addUserOption(opt =>
      opt.setName('membre').setDescription('Membre à consulter').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const { valid, config, reason } = checkLicense(interaction.guild.id);
    if (!valid) return denyInteraction(interaction, reason);
    if (!isBotManager(interaction.member, config) && !isAdmin(interaction.member)) {
      return denyInteraction(interaction, 'Accès réservé aux modérateurs.');
    }

    const target = interaction.options.getUser('membre');
    const member = ensureMember(interaction.guild.id, target.id, target.username);
    const history = getPointsHistory(interaction.guild.id, target.id, 10);
    const purchases = db.prepare('SELECT * FROM purchases WHERE guild_id = ? AND user_id = ? ORDER BY purchased_at DESC').all(interaction.guild.id, target.id);

    const guildMember = interaction.guild.members.cache.get(target.id) || await interaction.guild.members.fetch(target.id).catch(() => null);

    const embed = memberProfile(member, { ...target, displayAvatarURL: (opts) => target.displayAvatarURL(opts) }, history, purchases);
    const buttons = profileButtons(target.id);

    await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
  },
};

// ─── Handlers boutons profil ───────────────────────────────────────────────────

async function handleProfilePrison(interaction, targetId) {
  // Rediriger vers /prison en simulant
  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!target) return interaction.reply({ embeds: [error('Introuvable', 'Membre introuvable.')], ephemeral: true });

  await interaction.deferUpdate();
  // Réutiliser la logique prison
  const fakeInteraction = { ...interaction, options: { getMember: () => target } };
  // Appel manuel simplifié
  await interaction.followUp({ embeds: [sone('Prison', `Utilisez la commande \`/prison @${target.user.username}\` pour isoler ce membre.`)], ephemeral: true });
}

async function handleProfileAddPts(interaction, targetId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_addpts_${targetId}`)
    .setTitle('➕ Ajouter des points');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('amount').setLabel('Nombre de points à ajouter').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Raison').setStyle(TextInputStyle.Short).setRequired(true)
    )
  );
  await interaction.showModal(modal);
}

async function handleProfileRmvPts(interaction, targetId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_rmvpts_${targetId}`)
    .setTitle('➖ Retirer des points');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('amount').setLabel('Nombre de points à retirer').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Raison').setStyle(TextInputStyle.Short).setRequired(true)
    )
  );
  await interaction.showModal(modal);
}

async function handleAddPtsModal(interaction, targetId) {
  const amount = parseInt(interaction.fields.getTextInputValue('amount'));
  const reason = interaction.fields.getTextInputValue('reason');
  if (isNaN(amount) || amount <= 0) return interaction.reply({ embeds: [error('Valeur invalide', 'Entrez un nombre positif.')], ephemeral: true });

  ensureMember(interaction.guild.id, targetId, '');
  addPoints(interaction.guild.id, targetId, amount, reason, interaction.user.id);
  await interaction.reply({ embeds: [success('Points ajoutés', `+${amount} pts ajoutés à <@${targetId}> — ${reason}`)], ephemeral: true });
}

async function handleRmvPtsModal(interaction, targetId) {
  const amount = parseInt(interaction.fields.getTextInputValue('amount'));
  const reason = interaction.fields.getTextInputValue('reason');
  if (isNaN(amount) || amount <= 0) return interaction.reply({ embeds: [error('Valeur invalide', 'Entrez un nombre positif.')], ephemeral: true });

  ensureMember(interaction.guild.id, targetId, '');
  addPoints(interaction.guild.id, targetId, -amount, reason, interaction.user.id);
  await interaction.reply({ embeds: [success('Points retirés', `-${amount} pts retirés à <@${targetId}> — ${reason}`)], ephemeral: true });
}

async function handleProfileBlock(interaction, targetId) {
  await interaction.deferUpdate();
  const member = getMember(interaction.guild.id, targetId);
  const newState = member ? (member.rewards_blocked ? 0 : 1) : 1;
  db.prepare('UPDATE members SET rewards_blocked = ? WHERE guild_id = ? AND user_id = ?').run(newState, interaction.guild.id, targetId);
  await interaction.followUp({
    embeds: [success('Récompenses', `<@${targetId}> : récompenses ${newState ? '**bloquées**' : '**débloquées**'}.`)],
    ephemeral: true
  });
}

async function handleProfileNote(interaction, targetId) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_note_${targetId}`)
    .setTitle('📝 Note membre');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('note').setLabel('Note (visible par les modérateurs)').setStyle(TextInputStyle.Paragraph).setRequired(false)
    )
  );
  await interaction.showModal(modal);
}

async function handleNoteModal(interaction, targetId) {
  const note = interaction.fields.getTextInputValue('note');
  db.prepare('UPDATE members SET notes = ? WHERE guild_id = ? AND user_id = ?').run(note, interaction.guild.id, targetId);
  await interaction.reply({ embeds: [success('Note enregistrée', `Note mise à jour pour <@${targetId}>.`)], ephemeral: true });
}

// Prison release/close handlers
async function handlePrisonRelease(interaction, targetId) {
  await interaction.deferUpdate();
  const config = getConfig(interaction.guild.id);
  try {
    const member = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (member && config.role_prison_id) {
      await member.roles.remove(config.role_prison_id);
    }
    await interaction.followUp({ embeds: [success('Libéré', `<@${targetId}> a été libéré de prison.`)], ephemeral: false });
    db.prepare('UPDATE prison_channels SET active = 0 WHERE guild_id = ? AND user_id = ?').run(interaction.guild.id, targetId);
  } catch (e) {
    await interaction.followUp({ embeds: [error('Erreur', e.message)], ephemeral: true });
  }
}

async function handlePrisonClose(interaction, targetId) {
  await interaction.deferUpdate();
  try {
    await interaction.channel.delete('S-ONE Prison fermée');
    db.prepare('UPDATE prison_channels SET active = 0 WHERE channel_id = ?').run(interaction.channel.id);
  } catch (e) {
    await interaction.followUp({ embeds: [error('Erreur', e.message)], ephemeral: true });
  }
}

module.exports = { dashboardCmd, prisonCmd, profilCmd };
module.exports.handlers = {
  handleProfilePrison, handleProfileAddPts, handleProfileRmvPts,
  handleAddPtsModal, handleRmvPtsModal,
  handleProfileBlock, handleProfileNote, handleNoteModal,
  handlePrisonRelease, handlePrisonClose,
};

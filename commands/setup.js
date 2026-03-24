// commands/setup.js — S-ONE Bot /setup onboarding
const {
  SlashCommandBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, ChannelType, RoleManager
} = require('discord.js');
const { createConfig, setConfig, getConfig } = require('../utils/database');
const { success, error, sone, warning, footer } = require('../utils/embeds');
const { isAdmin, isHackend } = require('../utils/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('⚙️ [ADMIN] Configuration initiale du bot S-ONE')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [error('Accès refusé', 'Seuls les administrateurs peuvent lancer le setup.')], ephemeral: true });
    }

    // Demander la clé de licence via modal
    const modal = new ModalBuilder()
      .setCustomId('setup_license_modal')
      .setTitle('🔑 Activation S-ONE Bot');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('license_key')
          .setLabel('Clé de licence (fournie par Hackend)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('SONE-XXXX-XXXX-XXXX-XXXX')
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  },
};

// ─── Handler du modal setup (appelé depuis interactionCreate) ─────────────────
async function handleSetupModal(interaction) {
  const licenseKey = interaction.fields.getTextInputValue('license_key').trim().toUpperCase();
  const expectedKey = process.env.LICENSE_KEY;

  if (licenseKey !== expectedKey) {
    return interaction.reply({
      embeds: [error('Licence invalide', `La clé \`${licenseKey}\` est invalide.\nContactez **Hackend - Systeme.one** pour obtenir votre licence.`)],
      ephemeral: true
    });
  }

  const guildId = interaction.guild.id;
  createConfig(guildId, licenseKey);

  // Proposer la suite de la configuration
  const embed = sone(
    '🚀 S-ONE Bot — Configuration',
    `Licence validée avec succès !\n\n` +
    `Bienvenue dans l\'assistant de configuration **S-ONE Bot**.\n` +
    `Suivez les étapes ci-dessous pour finaliser le paramétrage.\n\n` +
    `**Étapes :**\n` +
    `1️⃣ Créer les rôles automatiques\n` +
    `2️⃣ Définir les rôles Coach & Élève\n` +
    `3️⃣ Personnaliser le bot\n` +
    `4️⃣ Activer le système de récompenses\n`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_step1')
      .setLabel('1️⃣ Créer les rôles automatiques')
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// Étape 1 — Créer les rôles automatiques
async function handleSetupStep1(interaction) {
  await interaction.deferUpdate();
  const guild = interaction.guild;

  try {
    // Rôle Bot Manager
    let roleManager = guild.roles.cache.find(r => r.name === 'Bot Manager');
    if (!roleManager) {
      roleManager = await guild.roles.create({
        name: 'Bot Manager',
        color: '#6C5CE7',
        reason: 'S-ONE Bot — Rôle Bot Manager',
      });
    }

    // Rôle Prison
    let rolePrison = guild.roles.cache.find(r => r.name === '🔒 Prison');
    if (!rolePrison) {
      rolePrison = await guild.roles.create({
        name: '🔒 Prison',
        color: '#636E72',
        reason: 'S-ONE Bot — Rôle Prison',
      });
    }

    // Salon log bot (visible seulement admins + Bot Manager)
    let channelLog = guild.channels.cache.find(c => c.name === '📊・sone-logs');
    if (!channelLog) {
      channelLog = await guild.channels.create({
        name: '📊・sone-logs',
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone, deny: ['ViewChannel'] },
          { id: roleManager.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        ],
        reason: 'S-ONE Bot — Salon de logs',
      });
    }

    // Appliquer les permissions "Prison" sur tous les salons existants
    // (blocage — sera appliqué réellement dans /prison)

    setConfig(guild.id, {
      role_botmanager_id: roleManager.id,
      role_prison_id: rolePrison.id,
      channel_botlog_id: channelLog.id,
    });

    const embed = sone(
      '✅ Étape 1 — Rôles créés',
      `Les éléments suivants ont été créés :\n\n` +
      `🟣 Rôle **Bot Manager** → <@&${roleManager.id}>\n` +
      `⚫ Rôle **🔒 Prison** → <@&${rolePrison.id}>\n` +
      `📊 Salon logs → <#${channelLog.id}>\n\n` +
      `Passez à l\'étape suivante pour définir les rôles Coach & Élève.`
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_step2')
        .setLabel('2️⃣ Définir Coach & Élève')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[setup step1]', err);
    await interaction.editReply({ embeds: [error('Erreur', `Impossible de créer les ressources : ${err.message}`)], components: [] });
  }
}

// Étape 2 — Définir Coach & Élève via modal
async function handleSetupStep2(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('setup_roles_modal')
    .setTitle('🎭 Rôles Coach & Élève');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('role_coach_id')
        .setLabel('ID du rôle Coach')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Clic droit sur le rôle → Copier l\'ID')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('role_student_id')
        .setLabel('ID du rôle Élève')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Clic droit sur le rôle → Copier l\'ID')
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function handleRolesModal(interaction) {
  const coachId = interaction.fields.getTextInputValue('role_coach_id').trim();
  const studentId = interaction.fields.getTextInputValue('role_student_id').trim();
  const guild = interaction.guild;

  const coachRole = guild.roles.cache.get(coachId);
  const studentRole = guild.roles.cache.get(studentId);

  if (!coachRole || !studentRole) {
    return interaction.reply({
      embeds: [error('Rôle introuvable', 'Vérifiez les IDs saisis et réessayez.')],
      ephemeral: true
    });
  }

  setConfig(guild.id, { role_coach_id: coachId, role_student_id: studentId });

  const embed = sone(
    '✅ Étape 2 — Rôles définis',
    `🎓 Coach → <@&${coachId}>\n👨‍🎓 Élève → <@&${studentId}>\n\nPassez à l\'étape 3.`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_step3')
      .setLabel('3️⃣ Personnaliser le bot')
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// Étape 3 — Personnalisation
async function handleSetupStep3(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('setup_perso_modal')
    .setTitle('🎨 Personnalisation du Bot');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('bot_name')
        .setLabel('Nom du bot (affiché dans les embeds)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('S-ONE Bot')
        .setRequired(false)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('bot_avatar_url')
        .setLabel('URL de l\'avatar du bot (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://...')
        .setRequired(false)
    )
  );

  await interaction.showModal(modal);
}

async function handlePersoModal(interaction) {
  const botName = interaction.fields.getTextInputValue('bot_name').trim() || 'S-ONE Bot';
  const avatarUrl = interaction.fields.getTextInputValue('bot_avatar_url').trim();

  setConfig(interaction.guild.id, { bot_name: botName, bot_avatar_url: avatarUrl });

  const embed = sone(
    '✅ Étape 3 — Personnalisation',
    `Nom : **${botName}**\nAvatar : ${avatarUrl || '*par défaut*'}\n\nDernière étape !`
  );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_step4_vocal_on')
      .setLabel('🎙️ Récompenses vocales : OUI')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('setup_step4_vocal_off')
      .setLabel('🎙️ Récompenses vocales : NON')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('setup_step4_text_on')
      .setLabel('💬 Récompenses texte : OUI')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('setup_step4_text_off')
      .setLabel('💬 Récompenses texte : NON')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleSetupStep4(interaction, vocalOn, textOn) {
  await interaction.deferUpdate();
  setConfig(interaction.guild.id, {
    rewards_vocal: vocalOn ? 1 : 0,
    rewards_text: textOn ? 1 : 0,
    setup_done: 1,
  });

  const config = getConfig(interaction.guild.id);
  const embed = sone(
    '🎉 Configuration terminée !',
    `**S-ONE Bot** est maintenant actif sur ce serveur.\n\n` +
    `🎙️ Récompenses vocales : ${vocalOn ? '✅ Activées' : '❌ Désactivées'}\n` +
    `💬 Récompenses texte : ${textOn ? '✅ Activées' : '❌ Désactivées'}\n\n` +
    `Utilisez \`/paramètres\` pour ajuster les valeurs de points.\n` +
    `Salon de logs : <#${config.channel_botlog_id}>\n\n` +
    `*Powered by Hackend — Systeme.one*`
  );

  await interaction.editReply({ embeds: [embed], components: [] });
}

module.exports.handlers = {
  handleSetupModal,
  handleSetupStep1,
  handleSetupStep2,
  handleRolesModal,
  handleSetupStep3,
  handlePersoModal,
  handleSetupStep4,
};

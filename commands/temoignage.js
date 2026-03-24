// commands/temoignage.js — S-ONE Bot /témoignage
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const {
  getConfig, ensureMember, getMember, addPendingPoints,
  approvePendingPoints, rejectPendingPoints,
  createTestimonial, getTestimonial, updateTestimonial, db
} = require('../utils/database');
const { testimonialDM, testimonialModNotif, error, success, warning, sone } = require('../utils/embeds');
const { checkLicense, denyInteraction, isHackend, isBotManager } = require('../utils/guards');
const { createTestimonialFolder, checkTestimonialVideo } = require('../utils/n8n');

const CLICK_TIMEOUT_MS = 10_000;
const MAX_FAIL_CLICKS = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('témoignage')
    .setDescription('🎥 Soumettre un témoignage vidéo et gagner des points'),

  async execute(interaction) {
    const { valid, config, reason } = checkLicense(interaction.guild.id);
    if (!valid) return denyInteraction(interaction, reason);

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;

    await interaction.deferReply({ ephemeral: true });

    const member = ensureMember(guildId, userId, interaction.user.username);

    // Vérifier ban témoignage
    if (member.testimonial_banned) {
      return interaction.editReply({
        embeds: [error('Accès bloqué', 'Vous avez été banni de la fonctionnalité témoignage.\nContactez un modérateur.')]
      });
    }

    // Vérifier récompenses bloquées
    if (member.rewards_blocked) {
      return interaction.editReply({
        embeds: [error('Récompenses bloquées', 'Vos récompenses sont actuellement bloquées par un modérateur.')]
      });
    }

    // Créer la demande en DB
    const testimonialId = createTestimonial(guildId, userId);

    // Appel n8n pour créer le dossier Drive
    const n8nRes = await createTestimonialFolder(userId, interaction.user.username, guildId, testimonialId);

    let driveFolderUrl = 'https://drive.google.com'; // fallback
    let driveFolderId = '';

    if (n8nRes.ok && n8nRes.data) {
      driveFolderUrl = n8nRes.data.folderUrl || driveFolderUrl;
      driveFolderId = n8nRes.data.folderId || '';
    }

    updateTestimonial(testimonialId, { drive_folder_id: driveFolderId, status: 'folder_created' });

    // Envoyer le DM à l'utilisateur
    try {
      const { embed, row } = testimonialDM(driveFolderUrl, testimonialId);
      const dm = await interaction.user.send({ embeds: [embed], components: [row] });
      updateTestimonial(testimonialId, { message_id: dm.id });
    } catch (e) {
      // DMs fermés
      return interaction.editReply({
        embeds: [error('DMs fermés', 'Activez les messages privés pour recevoir les instructions.')]
      });
    }

    await interaction.editReply({
      embeds: [success('Témoignage initié', 'Un message privé vous a été envoyé avec le lien Drive et les instructions !')]
    });
  },
};

// ─── Handler bouton "Vidéo déposée" ───────────────────────────────────────────
async function handleTestimonialSubmitted(interaction, testimonialId) {
  await interaction.deferUpdate();

  const t = getTestimonial(parseInt(testimonialId));
  if (!t) return interaction.followUp({ embeds: [error('Introuvable', 'Demande introuvable.')], ephemeral: true });

  if (t.status === 'video_submitted' || t.status === 'approved') {
    return interaction.followUp({ embeds: [warning('Déjà soumis', 'Cette demande a déjà été soumise.')], ephemeral: true });
  }

  const now = Date.now();

  // Anti-spam timeout 10s
  if (t.last_click && (now - t.last_click * 1000) < CLICK_TIMEOUT_MS) {
    const remaining = Math.ceil((CLICK_TIMEOUT_MS - (now - t.last_click * 1000)) / 1000);
    return interaction.followUp({
      embeds: [warning('Attends !', `Tu dois attendre encore **${remaining}s** avant de recliquer.`)],
      ephemeral: true
    });
  }

  // Incrémenter fail count
  const newFailCount = (t.fail_count || 0) + 1;
  updateTestimonial(t.id, { fail_count: newFailCount, last_click: Math.floor(now / 1000) });

  // Ban si trop de clics sans vidéo
  if (newFailCount >= MAX_FAIL_CLICKS) {
    db.prepare('UPDATE members SET testimonial_banned = 1 WHERE guild_id = ? AND user_id = ?').run(t.guild_id, t.user_id);
    updateTestimonial(t.id, { status: 'banned' });
    return interaction.followUp({
      embeds: [error('Accès banni', `Vous avez cliqué trop de fois sans déposer de vidéo.\nVous êtes banni de cette fonctionnalité.\nContactez un modérateur ou **Hackend** pour débloquer.`)],
      ephemeral: true
    });
  }

  // Vérifier auprès de n8n si une vidéo est présente
  const checkRes = await checkTestimonialVideo(t.user_id, t.guild_id, t.drive_folder_id, t.id);

  if (!checkRes.ok || !checkRes.data?.videoFound) {
    return interaction.followUp({
      embeds: [warning('Pas de vidéo détectée', `Aucune vidéo n'a été trouvée dans votre dossier Drive.\n*Tentative ${newFailCount}/${MAX_FAIL_CLICKS}*\nDéposez votre vidéo puis réessayez.`)],
      ephemeral: true
    });
  }

  // Vidéo trouvée → points en attente + notif modération
  updateTestimonial(t.id, { status: 'video_submitted', fail_count: 0 });

  // Trouver le guild (le bot doit être dans le guild)
  const client = interaction.client;
  const guild = client.guilds.cache.get(t.guild_id);
  if (!guild) return;

  const config = getConfig(t.guild_id);
  addPendingPoints(t.guild_id, t.user_id, config.pts_testimonial);

  // Notifier le salon log
  if (config.channel_botlog_id) {
    const logChannel = guild.channels.cache.get(config.channel_botlog_id);
    if (logChannel) {
      const { embed: notifEmbed, row: notifRow } = testimonialModNotif(t.user_id, t.id, t.guild_id);
      const notifMsg = await logChannel.send({
        content: config.role_botmanager_id ? `<@&${config.role_botmanager_id}>` : '',
        embeds: [notifEmbed],
        components: [notifRow]
      });
      updateTestimonial(t.id, { notif_message_id: notifMsg.id });
    }
  }

  await interaction.followUp({
    embeds: [success('Vidéo reçue !', `Votre témoignage est en attente de validation.\n**${config.pts_testimonial} points** vous seront crédités après validation.`)],
    ephemeral: true
  });
}

async function handleTestimonialCancel(interaction, testimonialId) {
  await interaction.deferUpdate();
  updateTestimonial(parseInt(testimonialId), { status: 'cancelled' });
  await interaction.followUp({ embeds: [success('Annulé', 'Votre demande de témoignage a été annulée.')], ephemeral: true });
}

// ─── Handlers modérateur ──────────────────────────────────────────────────────

async function handleTmodApprove(interaction, testimonialId) {
  const { valid, config } = checkLicense(interaction.guild.id);
  if (!valid || !isBotManager(interaction.member, config)) {
    return interaction.reply({ embeds: [error('Accès refusé', 'Réservé aux Bot Managers.')], ephemeral: true });
  }

  await interaction.deferUpdate();
  const t = getTestimonial(parseInt(testimonialId));
  if (!t || t.status !== 'video_submitted') {
    return interaction.followUp({ embeds: [warning('Déjà traité', 'Cette demande a déjà été traitée.')], ephemeral: true });
  }

  approvePendingPoints(t.guild_id, t.user_id, config.pts_testimonial, 'Témoignage vidéo approuvé');
  updateTestimonial(t.id, { status: 'approved' });

  // DM à l'utilisateur
  try {
    const user = await interaction.client.users.fetch(t.user_id);
    await user.send({
      embeds: [success('Témoignage approuvé ! 🎉', `Votre témoignage a été validé.\n**+${config.pts_testimonial} points** ont été ajoutés à votre compte !`)]
    });
  } catch (e) { /* DMs fermés */ }

  await interaction.followUp({
    embeds: [success('Approuvé', `Témoignage de <@${t.user_id}> approuvé. +${config.pts_testimonial} pts crédités.`)],
    ephemeral: false
  });

  // Désactiver les boutons
  await disableModButtons(interaction);
}

async function handleTmodReject(interaction, testimonialId) {
  const { valid, config } = checkLicense(interaction.guild.id);
  if (!valid || !isBotManager(interaction.member, config)) {
    return interaction.reply({ embeds: [error('Accès refusé', '')], ephemeral: true });
  }

  await interaction.deferUpdate();
  const t = getTestimonial(parseInt(testimonialId));
  if (!t) return;

  rejectPendingPoints(t.guild_id, t.user_id, config.pts_testimonial);
  updateTestimonial(t.id, { status: 'rejected' });

  try {
    const user = await interaction.client.users.fetch(t.user_id);
    await user.send({ embeds: [warning('Témoignage refusé', 'Votre témoignage n\'a pas été accepté par la modération.')] });
  } catch (e) { }

  await interaction.followUp({ embeds: [success('Refusé', `Témoignage de <@${t.user_id}> refusé.`)], ephemeral: false });
  await disableModButtons(interaction);
}

async function handleTmodBan(interaction, testimonialId) {
  const { valid, config } = checkLicense(interaction.guild.id);
  if (!valid || !isBotManager(interaction.member, config)) {
    return interaction.reply({ embeds: [error('Accès refusé', '')], ephemeral: true });
  }

  await interaction.deferUpdate();
  const t = getTestimonial(parseInt(testimonialId));
  if (!t) return;

  rejectPendingPoints(t.guild_id, t.user_id, config.pts_testimonial);
  updateTestimonial(t.id, { status: 'banned' });
  db.prepare('UPDATE members SET testimonial_banned = 1 WHERE guild_id = ? AND user_id = ?').run(t.guild_id, t.user_id);

  try {
    const user = await interaction.client.users.fetch(t.user_id);
    await user.send({ embeds: [error('Témoignage banni', 'Vous avez été banni de la fonctionnalité témoignage. Contactez un modérateur.')] });
  } catch (e) { }

  await interaction.followUp({ embeds: [success('Banni', `<@${t.user_id}> banni de la fonctionnalité témoignage.`)], ephemeral: false });
  await disableModButtons(interaction);
}

async function disableModButtons(interaction) {
  try {
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('disabled_1').setLabel('✅ Traité').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    await interaction.message.edit({ components: [disabledRow] });
  } catch (e) { }
}

module.exports.handlers = {
  handleTestimonialSubmitted,
  handleTestimonialCancel,
  handleTmodApprove,
  handleTmodReject,
  handleTmodBan,
};

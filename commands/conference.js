// commands/conference.js — S-ONE Bot /conférence & /fin-conférence
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const {
  getConfig, ensureMember, addPoints,
  startConference, getActiveConference, endConference,
  joinConference, leaveConference, getConferenceAttendance, markRewarded,
  getMember
} = require('../utils/database');
const { success, error, sone, warning, footer, BRAND_COLOR } = require('../utils/embeds');
const { isCoach, checkLicense, denyInteraction } = require('../utils/guards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('conférence')
    .setDescription('🎙️ [COACH] Démarrer une conférence dans votre salon vocal actuel'),

  async execute(interaction) {
    const { valid, config, reason } = checkLicense(interaction.guild.id);
    if (!valid) return denyInteraction(interaction, reason);
    if (!isCoach(interaction.member, config)) return denyInteraction(interaction, 'Seuls les **Coachs** peuvent démarrer une conférence.');

    const voiceState = interaction.member.voice;
    if (!voiceState.channel) {
      return interaction.reply({
        embeds: [error('Pas en vocal', 'Vous devez être dans un salon vocal pour démarrer une conférence.')],
        ephemeral: true
      });
    }

    // Vérifier si conférence déjà active
    const existing = getActiveConference(interaction.guild.id);
    if (existing) {
      return interaction.reply({
        embeds: [warning('Conférence déjà active', `Une conférence est déjà en cours dans <#${existing.channel_id}>.\nUtilisez \`/fin-conférence\` pour la terminer.`)],
        ephemeral: true
      });
    }

    const channel = voiceState.channel;
    const confId = startConference(interaction.guild.id, channel.id, interaction.user.id);

    // Enregistrer les membres déjà présents
    for (const [memberId, member] of channel.members) {
      if (member.user.bot) continue;
      ensureMember(interaction.guild.id, memberId, member.user.username);
      if (memberId !== interaction.user.id) {
        joinConference(confId, memberId);
      }
    }

    const embed = sone(
      '🎙️ Conférence démarrée !',
      `La conférence a commencé dans <#${channel.id}>.\n\n` +
      `👥 **${channel.members.size - 1}** participant(s) déjà connecté(s)\n` +
      `📊 Les présences sont enregistrées automatiquement.\n` +
      `✅ Seuil de récompense : **${config.conf_attendance_pct}%** du temps\n` +
      `🏆 Récompense : **${config.pts_conference} points**\n\n` +
      `Utilisez \`/fin-conférence\` pour terminer et distribuer les points.`
    );

    await interaction.reply({ embeds: [embed] });

    // Notifier le salon log
    await notifyLog(interaction.guild, config, `🎙️ Conférence démarrée par <@${interaction.user.id}> dans <#${channel.id}> (ID: ${confId})`);
  },
};

// Commande /fin-conférence
module.exports.endConference = {
  data: new SlashCommandBuilder()
    .setName('fin-conférence')
    .setDescription('🏁 [COACH] Terminer la conférence et distribuer les points'),

  async execute(interaction) {
    const { valid, config, reason } = checkLicense(interaction.guild.id);
    if (!valid) return denyInteraction(interaction, reason);
    if (!isCoach(interaction.member, config)) return denyInteraction(interaction, 'Seuls les **Coachs** peuvent terminer une conférence.');

    const conf = getActiveConference(interaction.guild.id);
    if (!conf) {
      return interaction.reply({
        embeds: [error('Aucune conférence', 'Aucune conférence n\'est en cours.')],
        ephemeral: true
      });
    }

    await interaction.deferReply();

    // Clôturer les présences encore actives
    const channel = interaction.guild.channels.cache.get(conf.channel_id);
    if (channel) {
      for (const [memberId] of channel.members) {
        leaveConference(conf.id, memberId);
      }
    }

    endConference(conf.id);

    const totalDuration = Math.floor(Date.now() / 1000) - conf.started_at;
    const attendances = getConferenceAttendance(conf.id);
    const threshold = (config.conf_attendance_pct / 100) * totalDuration;

    const rewarded = [];
    const missed = [];

    for (const att of attendances) {
      if (att.user_id === conf.coach_id) continue;
      const member = interaction.guild.members.cache.get(att.user_id);
      if (!member) continue;

      // Vérifier rôle élève
      if (config.role_student_id && !member.roles.cache.has(config.role_student_id)) continue;

      const dbMember = getMember(interaction.guild.id, att.user_id);
      if (!dbMember || dbMember.rewards_blocked) continue;

      if (att.total_seconds >= threshold && !att.rewarded) {
        addPoints(interaction.guild.id, att.user_id, config.pts_conference, 'Présence conférence ≥ seuil', 'system');
        markRewarded(conf.id, att.user_id);
        rewarded.push(att.user_id);
      } else if (!att.rewarded) {
        missed.push({ userId: att.user_id, pct: Math.round((att.total_seconds / totalDuration) * 100) });
      }
    }

    const duration = formatDuration(totalDuration);
    const rewardedStr = rewarded.length ? rewarded.map(id => `<@${id}>`).join(', ') : '*Personne*';
    const missedStr = missed.length
      ? missed.map(m => `<@${m.userId}> (${m.pct}%)`).join(', ')
      : '*Aucun*';

    const embed = new EmbedBuilder()
      .setColor(0x00B894)
      .setTitle('🏁 Conférence terminée !')
      .addFields(
        { name: '⏱️ Durée totale', value: duration, inline: true },
        { name: '🏆 Seuil', value: `${config.conf_attendance_pct}% → ${formatDuration(threshold)}`, inline: true },
        { name: `✅ Récompensés (${rewarded.length}) — +${config.pts_conference} pts`, value: rewardedStr },
        { name: `❌ Seuil non atteint (${missed.length})`, value: missedStr },
      )
      .setFooter({ text: '⚡ Designed by Hackend — Systeme.one' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Notifier log
    await notifyLog(interaction.guild, config,
      `🏁 Conférence terminée par <@${interaction.user.id}> — ` +
      `Durée: ${duration} | Récompensés: ${rewarded.length} | Non-atteint: ${missed.length}`
    );
  },
};

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function notifyLog(guild, config, message) {
  if (!config.channel_botlog_id) return;
  const logChannel = guild.channels.cache.get(config.channel_botlog_id);
  if (!logChannel) return;
  try {
    await logChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x74B9FF)
        .setDescription(message)
        .setFooter({ text: '⚡ Designed by Hackend — Systeme.one' })
        .setTimestamp()
      ]
    });
  } catch (e) { console.error('[log]', e.message); }
}

module.exports.notifyLog = notifyLog;

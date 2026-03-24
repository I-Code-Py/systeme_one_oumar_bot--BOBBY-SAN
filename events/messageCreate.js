// events/messageCreate.js — Récompenses messages texte
const { getConfig, ensureMember, getMember, addPoints } = require('../utils/database');

// Anti-spam : 1 point max par minute par utilisateur
const lastRewarded = new Map();
const COOLDOWN_MS = 60_000;

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (message.content.startsWith('/')) return; // Slash commands

    const guildId = message.guild.id;
    const config = getConfig(guildId);
    if (!config || !config.setup_done || !config.license_active) return;
    if (!config.rewards_text) return;

    const excludedChannels = JSON.parse(config.excluded_channels || '[]');
    if (excludedChannels.includes(message.channel.id)) return;

    const userId = message.author.id;
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const last = lastRewarded.get(key) || 0;

    if (now - last < COOLDOWN_MS) return;

    ensureMember(guildId, userId, message.author.username);
    const member = getMember(guildId, userId);
    if (!member || member.rewards_blocked) return;

    // Vérifier rôle élève
    const guildMember = message.member;
    if (config.role_student_id && !guildMember?.roles.cache.has(config.role_student_id)) return;

    addPoints(guildId, userId, config.pts_text_msg, 'Message envoyé', 'system');
    lastRewarded.set(key, now);
  }
};

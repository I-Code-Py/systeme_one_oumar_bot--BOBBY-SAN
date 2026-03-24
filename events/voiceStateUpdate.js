// events/voiceStateUpdate.js — Focus & Conference Voice Tracking
const {
  getConfig, ensureMember, getMember,
  addPoints, startFocus, endFocus,
  getActiveConference, joinConference, leaveConference
} = require('../utils/database');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    if (newState.member?.user.bot) return;

    const userId = newState.member?.id || oldState.member?.id;
    const member = newState.member || oldState.member;
    if (!userId || !member) return;

    const guild = newState.guild || oldState.guild;
    const guildId = guild.id;
    const config = getConfig(guildId);
    if (!config || !config.setup_done || !config.license_active) return;

    ensureMember(guildId, userId, member.user.username);
    const dbMember = getMember(guildId, userId);
    if (!dbMember || dbMember.rewards_blocked) return;

    const excludedChannels = JSON.parse(config.excluded_channels || '[]');

    // ─── Gestion conférence active ────────────────────────────────────────────
    const activeConf = getActiveConference(guildId);

    if (activeConf) {
      const confChannelId = activeConf.channel_id;

      // Quelqu'un rejoint le salon de conférence
      if (newState.channelId === confChannelId && oldState.channelId !== confChannelId) {
        // Vérifier rôle élève
        if (config.role_student_id && member.roles.cache.has(config.role_student_id)) {
          joinConference(activeConf.id, userId);
        }
      }

      // Quelqu'un quitte le salon de conférence
      if (oldState.channelId === confChannelId && newState.channelId !== confChannelId) {
        leaveConference(activeConf.id, userId);
      }
    }

    // ─── Gestion focus ────────────────────────────────────────────────────────
    if (!config.rewards_vocal) return;

    const joinedChannel = newState.channelId;
    const leftChannel = oldState.channelId;

    // Quitter un salon → stopper le focus
    if (leftChannel && leftChannel !== joinedChannel) {
      if (!excludedChannels.includes(leftChannel)) {
        endFocus(guildId, userId);
      }
    }

    // Rejoindre un salon → démarrer le focus
    if (joinedChannel && joinedChannel !== leftChannel) {
      if (!excludedChannels.includes(joinedChannel)) {
        // Ne pas démarrer focus si c'est le salon de conférence actif
        if (!activeConf || joinedChannel !== activeConf.channel_id) {
          startFocus(guildId, userId, joinedChannel);
        }
      }
    }

    // Déconnecté complètement
    if (!joinedChannel && leftChannel) {
      if (!excludedChannels.includes(leftChannel)) {
        endFocus(guildId, userId);
      }
    }
  }
};

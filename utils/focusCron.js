// utils/focusCron.js — Cron job attribution points focus
const cron = require('node-cron');
const {
  getActiveFocusSessions, getConfig, getMember, addPoints
} = require('./database');

let client = null;

function startFocusCron(discordClient) {
  client = discordClient;

  // Vérifie toutes les minutes
  cron.schedule('* * * * *', async () => {
    try {
      await processFocusSessions();
    } catch (e) {
      console.error('[FocusCron]', e.message);
    }
  });

  console.log('[FocusCron] Démarré — vérification toutes les minutes.');
}

async function processFocusSessions() {
  // Récupérer toutes les sessions actives
  const { db } = require('./database');
  const sessions = db.prepare('SELECT DISTINCT guild_id FROM focus_sessions WHERE active = 1').all();

  for (const { guild_id } of sessions) {
    const config = getConfig(guild_id);
    if (!config || !config.setup_done || !config.license_active || !config.rewards_vocal) continue;

    const intervalMin = config.focus_interval_min || 30;
    const intervalSec = intervalMin * 60;
    const excludedChannels = JSON.parse(config.excluded_channels || '[]');

    const activeSessions = db.prepare(`
      SELECT * FROM focus_sessions WHERE guild_id = ? AND active = 1
    `).all(guild_id);

    const now = Math.floor(Date.now() / 1000);

    for (const session of activeSessions) {
      if (excludedChannels.includes(session.channel_id)) continue;

      const elapsed = now - session.start_time;
      const intervals = Math.floor(elapsed / intervalSec);

      // Récupérer combien d'intervalles ont déjà été récompensés
      const rewardedKey = `focus_rewarded:${session.id}`;
      const rewardedData = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(rewardedKey);
      const alreadyRewarded = rewardedData ? parseInt(rewardedData.value) : 0;

      const toReward = intervals - alreadyRewarded;
      if (toReward <= 0) continue;

      // Vérifier le membre
      const member = getMember(guild_id, session.user_id);
      if (!member || member.rewards_blocked) continue;

      // Vérifier rôle élève via guild
      if (client) {
        const guild = client.guilds.cache.get(guild_id);
        if (guild && config.role_student_id) {
          const gMember = guild.members.cache.get(session.user_id);
          if (gMember && !gMember.roles.cache.has(config.role_student_id)) continue;
        }
      }

      const pointsToAdd = toReward * config.pts_focus_per_30m;
      addPoints(guild_id, session.user_id, pointsToAdd, `Focus vocal — ${toReward * intervalMin} min`, 'system');

      // Sauvegarder le nombre d'intervalles récompensés
      db.prepare(`
        INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)
      `).run(rewardedKey, intervals.toString());
    }
  }
}

module.exports = { startFocusCron };

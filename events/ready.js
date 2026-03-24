// events/ready.js — Bot ready
const { ActivityType } = require('discord.js');
const { startFocusCron } = require('../utils/focusCron');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`\n✅ S-ONE Bot connecté en tant que ${client.user.tag}`);
    console.log(`   Serveurs : ${client.guilds.cache.size}`);
    console.log(`   Designed by Hackend — Systeme.one\n`);

    client.user.setActivity('S-ONE | /setup', { type: ActivityType.Watching });

    startFocusCron(client);
  }
};

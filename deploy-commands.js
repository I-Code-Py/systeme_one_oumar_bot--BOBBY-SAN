// deploy-commands.js — Enregistrement des slash commands Discord
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const setupCmd = require('./commands/setup');
const paramsCmd = require('./commands/parametres');
const confCmd = require('./commands/conference');
const { dashboardCmd, prisonCmd, profilCmd } = require('./commands/dashboard');
const temoignageCmd = require('./commands/temoignage');
const shopCmd = require('./commands/shop');

const commands = [
  setupCmd.data.toJSON(),
  paramsCmd.data.toJSON(),
  confCmd.data.toJSON(),
  confCmd.endConference.data.toJSON(),
  dashboardCmd.data.toJSON(),
  prisonCmd.data.toJSON(),
  profilCmd.data.toJSON(),
  temoignageCmd.data.toJSON(),
  shopCmd.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`🔄 Enregistrement de ${commands.length} slash commands...`);
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Slash commands enregistrées avec succès !');
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement :', error);
  }
})();

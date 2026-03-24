// index.js — S-ONE Bot Entry Point
// Designed by Hackend — Systeme.one
require('dotenv').config();
require('./utils/dbPatch'); // Patch DB schema

const {
  Client, GatewayIntentBits, Partials, Collection
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { signPayload } = require('./utils/n8n');

// ─── Client Discord ───────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─── Chargement des commandes ─────────────────────────────────────────────────
client.commands = new Collection();

// Setup
const setupCmd = require('./commands/setup');
client.commands.set('setup', setupCmd);

// Paramètres
const paramsCmd = require('./commands/parametres');
client.commands.set('paramètres', paramsCmd);

// Conférence
const confCmd = require('./commands/conference');
client.commands.set('conférence', confCmd);
client.commands.set('fin-conférence', confCmd.endConference);

// Dashboard, Prison, Profil
const { dashboardCmd, prisonCmd, profilCmd } = require('./commands/dashboard');
client.commands.set('dashboard', dashboardCmd);
client.commands.set('prison', prisonCmd);
client.commands.set('profil', profilCmd);

// Témoignage
const temoignageCmd = require('./commands/temoignage');
client.commands.set('témoignage', temoignageCmd);

// ─── Chargement des events ────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`[Event] ${event.name} chargé`);
}

// ─── API interne (retour n8n) ─────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Vérification signature n8n
function verifyN8nSignature(req, res, next) {
  const sig = req.headers['x-sone-signature'];
  const secret = process.env.N8N_WEBHOOK_SECRET || '';
  if (!secret) return next();
  const expected = signPayload(req.body, secret);
  if (sig !== expected) {
    return res.status(401).json({ error: 'Signature invalide' });
  }
  next();
}

// Endpoint pour que n8n notifie le bot (ex: vidéo vérifiée côté Drive)
app.post('/webhook/n8n/callback', verifyN8nSignature, async (req, res) => {
  const { action, guildId, userId, data } = req.body;
  console.log(`[API] Callback n8n reçu : ${action} pour ${userId}`);

  try {
    if (action === 'purchase_sync') {
      // Synchroniser un achat depuis la webapp
      const { db } = require('./utils/database');
      const { product, amount } = data || {};
      if (guildId && userId && product) {
        db.prepare(`
          INSERT INTO purchases (guild_id, user_id, product, amount) VALUES (?, ?, ?, ?)
        `).run(guildId, userId, product, amount || 0);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[API Callback]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', bot: 'S-ONE Bot', by: 'Hackend - Systeme.one' }));

const PORT = process.env.API_PORT || 3000;
app.listen(PORT, () => {
  console.log(`[API] Serveur interne démarré sur le port ${PORT}`);
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('[Discord] Login en cours...'))
  .catch(err => {
    console.error('[Discord] Erreur de login :', err.message);
    process.exit(1);
  });

// Gestion des erreurs non-capturées
process.on('unhandledRejection', err => {
  console.error('[UnhandledRejection]', err?.message || err);
});
process.on('uncaughtException', err => {
  console.error('[UncaughtException]', err.message);
});

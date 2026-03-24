// Patch database.js — ajouter kv_store pour le cron focus
// Ce fichier est exécuté au démarrage pour patcher le schéma si besoin
const { db } = require('./database');

db.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

console.log('[DB] kv_store table ready.');

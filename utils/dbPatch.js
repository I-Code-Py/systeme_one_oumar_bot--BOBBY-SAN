// utils/dbPatch.js — Patch schéma au démarrage (idempotent)
const { db } = require('./database');

// kv_store (cron focus)
db.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Shop products
db.exec(`
  CREATE TABLE IF NOT EXISTS shop_products (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id            TEXT NOT NULL,
    name                TEXT NOT NULL,
    description         TEXT DEFAULT '',
    image_url           TEXT DEFAULT '',
    price_points        INTEGER NOT NULL DEFAULT 0,
    reward_type         TEXT DEFAULT 'none',
    reward_role_id      TEXT DEFAULT '',
    requires_validation INTEGER DEFAULT 0,
    stock               INTEGER DEFAULT -1,
    active              INTEGER DEFAULT 1,
    sort_order          INTEGER DEFAULT 0,
    created_by          TEXT DEFAULT '',
    created_at          INTEGER DEFAULT (unixepoch())
  );
`);

// Shop orders
db.exec(`
  CREATE TABLE IF NOT EXISTS shop_orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id      TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    product_id    INTEGER NOT NULL,
    product_name  TEXT NOT NULL,
    points_spent  INTEGER NOT NULL,
    status        TEXT DEFAULT 'pending',
    notif_msg_id  TEXT DEFAULT '',
    moderator_id  TEXT DEFAULT '',
    note          TEXT DEFAULT '',
    created_at    INTEGER DEFAULT (unixepoch())
  );
`);

// Colonnes optionnelles sur config (ALTER TABLE ignore si déjà présentes)
const safeCols = [
  `ALTER TABLE config ADD COLUMN channel_shop_id TEXT DEFAULT '';`,
];
for (const sql of safeCols) {
  try { db.exec(sql); } catch (_) { /* colonne déjà présente */ }
}

console.log('[DB] Schema patched — kv_store, shop_products, shop_orders ready.');

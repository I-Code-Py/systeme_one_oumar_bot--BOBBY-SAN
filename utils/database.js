// utils/database.js — S-ONE Bot Database Layer
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/sone.db');
if (!fs.existsSync(path.join(__dirname, '../data'))) {
  fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });
}

const db = new Database(DB_PATH);

// Performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schéma ──────────────────────────────────────────────────────────────────

db.exec(`
  -- Configuration globale du bot pour ce serveur
  CREATE TABLE IF NOT EXISTS config (
    guild_id          TEXT PRIMARY KEY,
    license_key       TEXT NOT NULL,
    license_active    INTEGER DEFAULT 1,
    bot_name          TEXT DEFAULT 'S-ONE Bot',
    bot_avatar_url    TEXT DEFAULT '',
    role_coach_id     TEXT DEFAULT '',
    role_student_id   TEXT DEFAULT '',
    role_prison_id    TEXT DEFAULT '',
    role_botmanager_id TEXT DEFAULT '',
    channel_botlog_id TEXT DEFAULT '',
    channel_prison_id TEXT DEFAULT '',
    rewards_vocal     INTEGER DEFAULT 1,
    rewards_text      INTEGER DEFAULT 1,
    pts_conference    INTEGER DEFAULT 10,
    pts_focus_per_30m INTEGER DEFAULT 1,
    pts_testimonial   INTEGER DEFAULT 20,
    pts_text_msg      INTEGER DEFAULT 1,
    conf_attendance_pct INTEGER DEFAULT 90,
    focus_interval_min INTEGER DEFAULT 30,
    excluded_channels TEXT DEFAULT '[]',
    webapp_api_url    TEXT DEFAULT '',
    webapp_api_key    TEXT DEFAULT '',
    setup_done        INTEGER DEFAULT 0,
    created_at        INTEGER DEFAULT (unixepoch())
  );

  -- Points & profils des membres
  CREATE TABLE IF NOT EXISTS members (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id          TEXT NOT NULL,
    user_id           TEXT NOT NULL,
    username          TEXT DEFAULT '',
    email             TEXT DEFAULT '',
    points            INTEGER DEFAULT 0,
    points_pending    INTEGER DEFAULT 0,
    rewards_blocked   INTEGER DEFAULT 0,
    testimonial_banned INTEGER DEFAULT 0,
    testimonial_fail_count INTEGER DEFAULT 0,
    notes             TEXT DEFAULT '',
    created_at        INTEGER DEFAULT (unixepoch()),
    UNIQUE(guild_id, user_id)
  );

  -- Historique des points
  CREATE TABLE IF NOT EXISTS points_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    delta       INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    granted_by  TEXT DEFAULT 'system',
    created_at  INTEGER DEFAULT (unixepoch())
  );

  -- Sessions de conférence
  CREATE TABLE IF NOT EXISTS conferences (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id        TEXT NOT NULL,
    channel_id      TEXT NOT NULL,
    coach_id        TEXT NOT NULL,
    started_at      INTEGER NOT NULL,
    ended_at        INTEGER DEFAULT NULL,
    active          INTEGER DEFAULT 1
  );

  -- Présences en conférence
  CREATE TABLE IF NOT EXISTS conference_attendance (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conference_id   INTEGER NOT NULL REFERENCES conferences(id),
    user_id         TEXT NOT NULL,
    join_time       INTEGER NOT NULL,
    leave_time      INTEGER DEFAULT NULL,
    total_seconds   INTEGER DEFAULT 0,
    rewarded        INTEGER DEFAULT 0,
    UNIQUE(conference_id, user_id)
  );

  -- Sessions focus (salon vocal hors conférence)
  CREATE TABLE IF NOT EXISTS focus_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    start_time  INTEGER NOT NULL,
    end_time    INTEGER DEFAULT NULL,
    active      INTEGER DEFAULT 1
  );

  -- Demandes de témoignage
  CREATE TABLE IF NOT EXISTS testimonials (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id        TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    drive_folder_id TEXT DEFAULT '',
    status          TEXT DEFAULT 'pending',
    message_id      TEXT DEFAULT '',
    notif_message_id TEXT DEFAULT '',
    fail_count      INTEGER DEFAULT 0,
    last_click      INTEGER DEFAULT 0,
    created_at      INTEGER DEFAULT (unixepoch())
  );

  -- Achats webapp (sync)
  CREATE TABLE IF NOT EXISTS purchases (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    product     TEXT NOT NULL,
    amount      REAL DEFAULT 0,
    purchased_at INTEGER DEFAULT (unixepoch())
  );

  -- Salons prison (tickets)
  CREATE TABLE IF NOT EXISTS prison_channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    created_at  INTEGER DEFAULT (unixepoch()),
    active      INTEGER DEFAULT 1
  );

  -- Produits du shop (stockés localement si pas de webapp)
  CREATE TABLE IF NOT EXISTS shop_products (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id      TEXT NOT NULL,
    name          TEXT NOT NULL,
    description   TEXT DEFAULT '',
    image_url     TEXT DEFAULT '',
    price_points  INTEGER NOT NULL DEFAULT 0,
    reward_type   TEXT DEFAULT 'none',     -- 'role' | 'none'
    reward_role_id TEXT DEFAULT '',        -- ID du rôle à donner si reward_type = 'role'
    requires_validation INTEGER DEFAULT 0, -- 0 = instantané, 1 = validation modérateur
    stock         INTEGER DEFAULT -1,      -- -1 = illimité
    active        INTEGER DEFAULT 1,
    sort_order    INTEGER DEFAULT 0,
    created_by    TEXT DEFAULT '',
    created_at    INTEGER DEFAULT (unixepoch())
  );

  -- Commandes shop (historique des achats de points)
  CREATE TABLE IF NOT EXISTS shop_orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id      TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    product_id    INTEGER NOT NULL REFERENCES shop_products(id),
    product_name  TEXT NOT NULL,
    points_spent  INTEGER NOT NULL,
    status        TEXT DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected' | 'delivered'
    notif_msg_id  TEXT DEFAULT '',
    moderator_id  TEXT DEFAULT '',
    note          TEXT DEFAULT '',
    created_at    INTEGER DEFAULT (unixepoch())
  );

  -- Config du salon shop (optionnel — pour épingler le shop dans un salon)
  ALTER TABLE config ADD COLUMN channel_shop_id TEXT DEFAULT '' ;
`);

// Ignore "duplicate column" error silently (ALTER TABLE sur colonne existante)
try {
  db.exec(`ALTER TABLE config ADD COLUMN channel_shop_id TEXT DEFAULT '';`);
} catch (_) { /* colonne déjà présente */ }

// ─── Helpers Config ───────────────────────────────────────────────────────────

function getConfig(guildId) {
  return db.prepare('SELECT * FROM config WHERE guild_id = ?').get(guildId);
}

function setConfig(guildId, fields) {
  const cols = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const vals = Object.values(fields);
  db.prepare(`UPDATE config SET ${cols} WHERE guild_id = ?`).run(...vals, guildId);
}

function createConfig(guildId, licenseKey) {
  db.prepare(`
    INSERT OR IGNORE INTO config (guild_id, license_key) VALUES (?, ?)
  `).run(guildId, licenseKey);
}

// ─── Helpers Members ─────────────────────────────────────────────────────────

function getMember(guildId, userId) {
  return db.prepare('SELECT * FROM members WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

function ensureMember(guildId, userId, username = '') {
  db.prepare(`
    INSERT OR IGNORE INTO members (guild_id, user_id, username) VALUES (?, ?, ?)
  `).run(guildId, userId, username);
  if (username) {
    db.prepare('UPDATE members SET username = ? WHERE guild_id = ? AND user_id = ?').run(username, guildId, userId);
  }
  return getMember(guildId, userId);
}

function addPoints(guildId, userId, delta, reason, grantedBy = 'system') {
  db.prepare(`
    UPDATE members SET points = points + ? WHERE guild_id = ? AND user_id = ?
  `).run(delta, guildId, userId);
  db.prepare(`
    INSERT INTO points_history (guild_id, user_id, delta, reason, granted_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, userId, delta, reason, grantedBy);
}

function addPendingPoints(guildId, userId, delta) {
  db.prepare(`
    UPDATE members SET points_pending = points_pending + ? WHERE guild_id = ? AND user_id = ?
  `).run(delta, guildId, userId);
}

function approvePendingPoints(guildId, userId, delta, reason) {
  db.prepare(`
    UPDATE members 
    SET points = points + ?, points_pending = CASE WHEN points_pending >= ? THEN points_pending - ? ELSE 0 END
    WHERE guild_id = ? AND user_id = ?
  `).run(delta, delta, delta, guildId, userId);
  db.prepare(`
    INSERT INTO points_history (guild_id, user_id, delta, reason, granted_by)
    VALUES (?, ?, ?, ?, 'moderator')
  `).run(guildId, userId, delta, reason);
}

function rejectPendingPoints(guildId, userId, delta) {
  db.prepare(`
    UPDATE members 
    SET points_pending = CASE WHEN points_pending >= ? THEN points_pending - ? ELSE 0 END
    WHERE guild_id = ? AND user_id = ?
  `).run(delta, delta, guildId, userId);
}

function getLeaderboard(guildId, limit = 20) {
  return db.prepare(`
    SELECT user_id, username, points 
    FROM members 
    WHERE guild_id = ? 
    ORDER BY points DESC 
    LIMIT ?
  `).all(guildId, limit);
}

function getPointsHistory(guildId, userId, limit = 10) {
  return db.prepare(`
    SELECT * FROM points_history 
    WHERE guild_id = ? AND user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(guildId, userId, limit);
}

// ─── Helpers Conférence ───────────────────────────────────────────────────────

function startConference(guildId, channelId, coachId) {
  const result = db.prepare(`
    INSERT INTO conferences (guild_id, channel_id, coach_id, started_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, channelId, coachId, Math.floor(Date.now() / 1000));
  return result.lastInsertRowid;
}

function getActiveConference(guildId) {
  return db.prepare(`
    SELECT * FROM conferences WHERE guild_id = ? AND active = 1 ORDER BY started_at DESC LIMIT 1
  `).get(guildId);
}

function endConference(conferenceId) {
  db.prepare(`
    UPDATE conferences SET ended_at = ?, active = 0 WHERE id = ?
  `).run(Math.floor(Date.now() / 1000), conferenceId);
}

function joinConference(conferenceId, userId) {
  const now = Math.floor(Date.now() / 1000);
  const existing = db.prepare(`
    SELECT * FROM conference_attendance WHERE conference_id = ? AND user_id = ?
  `).get(conferenceId, userId);
  if (!existing) {
    db.prepare(`
      INSERT INTO conference_attendance (conference_id, user_id, join_time) VALUES (?, ?, ?)
    `).run(conferenceId, userId, now);
  } else if (existing.leave_time !== null) {
    // Re-join: reset leave_time
    db.prepare(`
      UPDATE conference_attendance SET join_time = ?, leave_time = NULL WHERE conference_id = ? AND user_id = ?
    `).run(now, conferenceId, userId);
  }
}

function leaveConference(conferenceId, userId) {
  const now = Math.floor(Date.now() / 1000);
  const att = db.prepare(`
    SELECT * FROM conference_attendance WHERE conference_id = ? AND user_id = ?
  `).get(conferenceId, userId);
  if (att && !att.leave_time) {
    const elapsed = now - att.join_time;
    db.prepare(`
      UPDATE conference_attendance 
      SET leave_time = ?, total_seconds = total_seconds + ?
      WHERE conference_id = ? AND user_id = ?
    `).run(now, elapsed, conferenceId, userId);
  }
}

function getConferenceAttendance(conferenceId) {
  return db.prepare(`
    SELECT * FROM conference_attendance WHERE conference_id = ?
  `).all(conferenceId);
}

function markRewarded(conferenceId, userId) {
  db.prepare(`
    UPDATE conference_attendance SET rewarded = 1 WHERE conference_id = ? AND user_id = ?
  `).run(conferenceId, userId);
}

// ─── Helpers Focus ────────────────────────────────────────────────────────────

function startFocus(guildId, userId, channelId) {
  // Close any existing active session first
  db.prepare(`
    UPDATE focus_sessions SET end_time = ?, active = 0
    WHERE guild_id = ? AND user_id = ? AND active = 1
  `).run(Math.floor(Date.now() / 1000), guildId, userId);

  db.prepare(`
    INSERT INTO focus_sessions (guild_id, user_id, channel_id, start_time)
    VALUES (?, ?, ?, ?)
  `).run(guildId, userId, channelId, Math.floor(Date.now() / 1000));
}

function endFocus(guildId, userId) {
  const session = db.prepare(`
    SELECT * FROM focus_sessions WHERE guild_id = ? AND user_id = ? AND active = 1
  `).get(guildId, userId);
  if (!session) return null;
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`
    UPDATE focus_sessions SET end_time = ?, active = 0 WHERE id = ?
  `).run(now, session.id);
  return { duration: now - session.start_time, session };
}

function getActiveFocusSessions(guildId) {
  return db.prepare(`
    SELECT * FROM focus_sessions WHERE guild_id = ? AND active = 1
  `).all(guildId);
}

// ─── Helpers Témoignage ───────────────────────────────────────────────────────

function createTestimonial(guildId, userId) {
  const result = db.prepare(`
    INSERT INTO testimonials (guild_id, user_id) VALUES (?, ?)
  `).run(guildId, userId);
  return result.lastInsertRowid;
}

function getTestimonial(id) {
  return db.prepare('SELECT * FROM testimonials WHERE id = ?').get(id);
}

function updateTestimonial(id, fields) {
  const cols = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE testimonials SET ${cols} WHERE id = ?`).run(...Object.values(fields), id);
}

function getPendingTestimonials(guildId) {
  return db.prepare(`
    SELECT * FROM testimonials WHERE guild_id = ? AND status = 'video_submitted'
  `).all(guildId);
}

module.exports = {
  db,
  getConfig, setConfig, createConfig,
  getMember, ensureMember, addPoints, addPendingPoints,
  approvePendingPoints, rejectPendingPoints,
  getLeaderboard, getPointsHistory,
  startConference, getActiveConference, endConference,
  joinConference, leaveConference, getConferenceAttendance, markRewarded,
  startFocus, endFocus, getActiveFocusSessions,
  createTestimonial, getTestimonial, updateTestimonial, getPendingTestimonials,
};

// ─── Helpers Shop ─────────────────────────────────────────────────────────────

function getShopProducts(guildId, activeOnly = true) {
  const q = activeOnly
    ? 'SELECT * FROM shop_products WHERE guild_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM shop_products WHERE guild_id = ? ORDER BY sort_order ASC, id ASC';
  return db.prepare(q).all(guildId);
}

function getShopProduct(productId) {
  return db.prepare('SELECT * FROM shop_products WHERE id = ?').get(productId);
}

function createShopProduct(guildId, fields) {
  const { name, description, image_url, price_points, reward_type, reward_role_id, requires_validation, stock, sort_order, created_by } = fields;
  const result = db.prepare(`
    INSERT INTO shop_products
      (guild_id, name, description, image_url, price_points, reward_type, reward_role_id, requires_validation, stock, sort_order, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(guildId, name, description || '', image_url || '', price_points,
      reward_type || 'none', reward_role_id || '', requires_validation ? 1 : 0,
      stock ?? -1, sort_order || 0, created_by || '');
  return result.lastInsertRowid;
}

function updateShopProduct(productId, fields) {
  const cols = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE shop_products SET ${cols} WHERE id = ?`).run(...Object.values(fields), productId);
}

function deleteShopProduct(productId) {
  db.prepare('UPDATE shop_products SET active = 0 WHERE id = ?').run(productId);
}

function decrementStock(productId) {
  db.prepare('UPDATE shop_products SET stock = stock - 1 WHERE id = ? AND stock > 0').run(productId);
}

function createOrder(guildId, userId, productId, productName, pointsSpent) {
  const result = db.prepare(`
    INSERT INTO shop_orders (guild_id, user_id, product_id, product_name, points_spent)
    VALUES (?, ?, ?, ?, ?)
  `).run(guildId, userId, productId, productName, pointsSpent);
  return result.lastInsertRowid;
}

function getOrder(orderId) {
  return db.prepare('SELECT * FROM shop_orders WHERE id = ?').get(orderId);
}

function updateOrder(orderId, fields) {
  const cols = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE shop_orders SET ${cols} WHERE id = ?`).run(...Object.values(fields), orderId);
}

function getUserOrders(guildId, userId) {
  return db.prepare(`
    SELECT o.*, p.image_url FROM shop_orders o
    LEFT JOIN shop_products p ON o.product_id = p.id
    WHERE o.guild_id = ? AND o.user_id = ?
    ORDER BY o.created_at DESC LIMIT 20
  `).all(guildId, userId);
}

function getPendingOrders(guildId) {
  return db.prepare(`
    SELECT o.*, p.image_url FROM shop_orders o
    LEFT JOIN shop_products p ON o.product_id = p.id
    WHERE o.guild_id = ? AND o.status = 'pending'
    ORDER BY o.created_at ASC
  `).all(guildId);
}

// Re-export everything including shop helpers
Object.assign(module.exports, {
  getShopProducts, getShopProduct, createShopProduct, updateShopProduct,
  deleteShopProduct, decrementStock,
  createOrder, getOrder, updateOrder, getUserOrders, getPendingOrders,
});

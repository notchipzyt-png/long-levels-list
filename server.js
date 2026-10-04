const express = require('express');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

const PACKS_PATH = path.join(__dirname, 'data', 'packs.json');
const DB_PATH = path.join(__dirname, 'data', 'app.db');
const PACK_MAP_PATH = path.join(__dirname, 'data', 'pack_level_map.json');

// Initialize DB and run migrations
const db = new Database(DB_PATH);

function migrate() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      points INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_completed_levels (
      user_id TEXT,
      level_key TEXT,
      PRIMARY KEY(user_id, level_key)
    );

    CREATE TABLE IF NOT EXISTS user_claimed_packs (
      user_id TEXT,
      pack_id TEXT,
      PRIMARY KEY(user_id, pack_id)
    );

    CREATE TABLE IF NOT EXISTS packs (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      pointsReward INTEGER,
      verifier TEXT
    );

    CREATE TABLE IF NOT EXISTS pack_levels (
      pack_id TEXT,
      level_index INTEGER,
      level_key TEXT,
      level_title TEXT,
      PRIMARY KEY(pack_id, level_index)
    );
  `);
}

migrate();

function loadPacksFile() {
  try {
    return JSON.parse(fs.readFileSync(PACKS_PATH, 'utf8'));
  } catch (e) {
    return [];
  }
}

function loadPackLevelMap() {
  try {
    if (!fs.existsSync(PACK_MAP_PATH)) return {};
    return JSON.parse(fs.readFileSync(PACK_MAP_PATH, 'utf8'));
  } catch (e) {
    console.error('Failed to load pack_level_map.json', e.message);
    return {};
  }
}

function importPacksToDb() {
  const packs = loadPacksFile();
  const mapping = loadPackLevelMap();
  const insertPack = db.prepare('INSERT OR REPLACE INTO packs (id, title, description, pointsReward, verifier) VALUES (?, ?, ?, ?, ?)');
  const insertPackLevel = db.prepare('INSERT OR REPLACE INTO pack_levels (pack_id, level_index, level_key, level_title) VALUES (?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const pack of packs) {
      insertPack.run(pack.id, pack.title, pack.description, pack.pointsReward || 0, pack.verifier || null);
      (pack.levels || []).forEach((lvl, idx) => {
        // Prefer an explicit mapping if provided
        let mapped = null;
        if (mapping && mapping[pack.id]) {
          mapped = mapping[pack.id][lvl.id] || mapping[pack.id][lvl.title] || mapping[pack.id][lvl.title?.toString().trim()];
        }
        // fallback to provided id/title
        const levelKey = mapped || lvl.id || lvl.title || '';
        insertPackLevel.run(pack.id, idx, levelKey, lvl.title || '');
      });
    }
  });
  tx();
}

// Import on startup so DB is in sync with packs.json
importPacksToDb();

// Utilities
function normalizeKey(s) {
  if (!s) return '';
  return s
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Admin endpoint to re-import packs.json into DB
app.post('/import-packs', (req, res) => {
  try {
    importPacksToDb();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Complete level endpoint (atomic): accepts { userId, levelKeyOrTitle }
app.post('/complete-level', (req, res) => {
  const { userId, level } = req.body; // level can be level_key (pack level id) or level title/path
  if (!userId || !level) return res.status(400).json({ error: 'userId and level required' });

  const normalized = normalizeKey(level);

  const ensureUser = db.prepare('INSERT OR IGNORE INTO users (id, points) VALUES (?, 0)');
  const insertCompleted = db.prepare('INSERT OR IGNORE INTO user_completed_levels (user_id, level_key) VALUES (?, ?)');
  const insertClaim = db.prepare('INSERT OR IGNORE INTO user_claimed_packs (user_id, pack_id) VALUES (?, ?)');
  const updatePoints = db.prepare('UPDATE users SET points = points + ? WHERE id = ?');

  const awarded = [];

  const tx = db.transaction(() => {
    ensureUser.run(userId);

    // For each pack in DB, check if this level belongs to it and mark it complete
    const packs = db.prepare('SELECT id FROM packs').all();
    for (const pack of packs) {
      const packLevels = db.prepare('SELECT level_key, level_title FROM pack_levels WHERE pack_id = ? ORDER BY level_index').all(pack.id);
      
      // Find if the completed level matches any level in this pack
      for (const pl of packLevels) {
        const dbKey = normalizeKey(pl.level_key || pl.level_title);
        if (dbKey === normalized) {
          // Store the normalized DB key (not raw user input)
          insertCompleted.run(userId, dbKey);
          // Don't break - continue checking other packs
        }
      }
    }

    // After marking levels complete, check for newly completed packs
    const packsForCompletion = db.prepare('SELECT id, pointsReward, verifier FROM packs').all();
    for (const pack of packsForCompletion) {
      const packLevels = db.prepare('SELECT level_key, level_title FROM pack_levels WHERE pack_id = ? ORDER BY level_index').all(pack.id);
      const total = packLevels.length;
      if (total === 0) continue;

      // count completed by this user for pack
      let completedCount = 0;
      for (const pl of packLevels) {
        const key = normalizeKey(pl.level_key || pl.level_title);
        const row = db.prepare('SELECT 1 FROM user_completed_levels WHERE user_id = ? AND level_key = ?').get(userId, key);
        if (row) completedCount += 1;
      }

      if (completedCount === total) {
        // attempt to claim for the user
        const claimUser = insertClaim.run(userId, pack.id);
        if (claimUser.changes === 1) {
          // newly claimed, award points to user
          updatePoints.run(pack.pointsReward || 0, userId);
          awarded.push({ packId: pack.id, points: pack.pointsReward || 0, userId });

          // if pack has a verifier, award points to verifier as well and mark the pack claimed for them (only once)
          if (pack.verifier) {
            ensureUser.run(pack.verifier);
            // Insert claimed row for verifier and only award points if this insert created the row (prevents duplicate awards)
            const claimVerifier = insertClaim.run(pack.verifier, pack.id);
            if (claimVerifier.changes === 1) {
              updatePoints.run(pack.pointsReward || 0, pack.verifier);
              awarded.push({ packId: pack.id, points: pack.pointsReward || 0, userId: pack.verifier });
            }
          }
        }
      }
    }
  });

  try {
    tx();
    const user = db.prepare('SELECT id, points FROM users WHERE id = ?').get(userId);
    // return user's claimed packs for convenience
    const claimed = db.prepare('SELECT pack_id FROM user_claimed_packs WHERE user_id = ?').all(userId).map(r => r.pack_id);
    res.json({ userId: user.id, points: user.points, awarded, claimedPacks: claimed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get user state (including completed levels and claimed packs)
app.get('/user/:userId', (req, res) => {
  const userId = req.params.userId;
  const user = db.prepare('SELECT id, points FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  const completed = db.prepare('SELECT level_key FROM user_completed_levels WHERE user_id = ?').all(userId).map(r => r.level_key);
  const claimed = db.prepare('SELECT pack_id FROM user_claimed_packs WHERE user_id = ?').all(userId).map(r => r.pack_id);
  res.json({ id: user.id, points: user.points, completedLevels: completed, claimedPacks: claimed });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on :${PORT}`));

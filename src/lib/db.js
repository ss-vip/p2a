let schemaReady = false

const TOKENS_DDL = `CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL,
  token_masked TEXT NOT NULL, user_info TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`

const CONFIG_DDL = `CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  client_token TEXT NOT NULL DEFAULT '',
  dashboard_password_hash TEXT NOT NULL DEFAULT ''
)`

const MODELS_DDL = `CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL DEFAULT '',
  context INTEGER NOT NULL DEFAULT 0, details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`

const SCHEMA_META_DDL = `CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
)`

const ALL_DDLS = [TOKENS_DDL, CONFIG_DDL, MODELS_DDL, SCHEMA_META_DDL]

export async function initDB(db) {
  if (schemaReady) return
  let ok = 0
  for (const ddl of ALL_DDLS) {
    try { await db.prepare(ddl).run(); ok++ } catch (e) { console.error('[db] DDL failed:', e.message) }
  }
  let ver = '0'
  try { const meta = await db.prepare("SELECT value FROM schema_meta WHERE key='schema_ver'").first(); ver = meta?.value || '0' } catch (_) {}
  if (parseInt(ver, 10) < 2) {
    try { await db.prepare("INSERT OR IGNORE INTO config (id, client_token) VALUES (1, ?)").bind(generateToken()).run() } catch (_) {}
  }
  try {
    const row = await db.prepare("SELECT client_token FROM config WHERE id = 1").first()
    if (!row || !row.client_token) await db.prepare("INSERT OR REPLACE INTO config (id, client_token) VALUES (1, ?)").bind(generateToken()).run()
  } catch (_) {}
  if (parseInt(ver, 10) < 3) { try { await db.prepare("ALTER TABLE config ADD COLUMN dashboard_password_hash TEXT NOT NULL DEFAULT ''").run() } catch (_) {} }
  if (parseInt(ver, 10) < 4) { try { await db.prepare("ALTER TABLE config ADD COLUMN puter_key_pool TEXT NOT NULL DEFAULT ''").run() } catch (_) {} }
  if (parseInt(ver, 10) < 5) { try { await db.prepare("ALTER TABLE config ADD COLUMN auth_mode TEXT NOT NULL DEFAULT 'puter-signin'").run() } catch (_) {} }
  await db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_ver', '5')").run()
  schemaReady = true
}

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789', rand = new Uint32Array(30)
  crypto.getRandomValues(rand)
  let t = 'sk-'
  for (let i = 0; i < 30; i++) t += chars[rand[i] % chars.length]
  return t
}

export async function getActiveToken(db) {
  return await db.prepare('SELECT * FROM tokens WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1').first() || null
}

export async function saveToken(db, token, userInfo) {
  await db.prepare('UPDATE tokens SET is_active = 0').run()
  const masked = token.length > 10 ? token.slice(0, 4) + '...' + token.slice(-4) : '***'
  await db.prepare('INSERT INTO tokens (token, token_masked, user_info, is_active) VALUES (?, ?, ?, 1)').bind(token, masked, JSON.stringify(userInfo)).run()
}

export async function deleteActiveToken(db) {
  await db.prepare('UPDATE tokens SET is_active = 0').run()
}

export async function getClientToken(db) {
  try { const row = await db.prepare("SELECT client_token FROM config WHERE id = 1").first(); return row?.client_token || null } catch { return null }
}

export async function rotateClientToken(db) {
  const token = generateToken()
  await db.prepare("UPDATE config SET client_token = ? WHERE id = 1").bind(token).run()
  return token
}

export async function saveModels(db, models) {
  await db.prepare("DELETE FROM models").run()
  const stmt = db.prepare("INSERT OR REPLACE INTO models (id, provider, context, details) VALUES (?, ?, ?, ?)")
  for (const m of models) await stmt.bind(m.id || m.model_id || '', m.provider || '', m.context || 0, JSON.stringify(m)).run()
}

export async function getModels(db) {
  const { results } = await db.prepare("SELECT * FROM models ORDER BY provider, id").all()
  return results || []
}

export async function getDashboardPasswordHash(db) {
  try { const row = await db.prepare("SELECT dashboard_password_hash FROM config WHERE id = 1").first(); return row?.dashboard_password_hash || '' } catch { return '' }
}

export async function setDashboardPassword(db, hash) {
  await db.prepare("UPDATE config SET dashboard_password_hash = ? WHERE id = 1").bind(hash).run()
}

export async function getKeyPool(db) {
  try { const row = await db.prepare("SELECT puter_key_pool FROM config WHERE id = 1").first(); return row?.puter_key_pool || '' } catch { return '' }
}

export async function saveKeyPool(db, poolStr) {
  await db.prepare("UPDATE config SET puter_key_pool = ? WHERE id = 1").bind(poolStr).run()
}

export async function getAuthMode(db) {
  try { const row = await db.prepare("SELECT auth_mode FROM config WHERE id = 1").first(); return row?.auth_mode || 'puter-signin' } catch { return 'puter-signin' }
}

export async function setAuthMode(db, mode) {
  if (!['puter-signin', 'manual-verify', 'key-pool'].includes(mode)) mode = 'puter-signin'
  await db.prepare("UPDATE config SET auth_mode = ? WHERE id = 1").bind(mode).run()
}

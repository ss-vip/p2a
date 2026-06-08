/**
 * D1 資料庫操作模組
 * 採用 ensureSchema 模式，支援增量 migration
 */

let schemaReady = false

// DDL 定義（單行以確保相容性）
const TOKENS_DDL = `CREATE TABLE IF NOT EXISTS tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token       TEXT    NOT NULL,
  token_masked TEXT   NOT NULL,
  user_info   TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
)`

const CONFIG_DDL = `CREATE TABLE IF NOT EXISTS config (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  client_token    TEXT NOT NULL DEFAULT '',
  dashboard_password_hash TEXT NOT NULL DEFAULT ''
)`

const MODELS_DDL = `CREATE TABLE IF NOT EXISTS models (
  id        TEXT    PRIMARY KEY,
  provider  TEXT    NOT NULL DEFAULT '',
  context   INTEGER NOT NULL DEFAULT 0,
  details   TEXT,
  created_at TEXT   NOT NULL DEFAULT (datetime('now'))
)`

const SCHEMA_META_DDL = `CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
)`

const ALL_DDLS = [TOKENS_DDL, CONFIG_DDL, MODELS_DDL, SCHEMA_META_DDL]

export async function initDB(db) {
  if (schemaReady) return
  let ok = 0
  for (const ddl of ALL_DDLS) {
    try {
      await db.prepare(ddl).run()
      ok++
    } catch (e) {
      console.error('[db] DDL failed:', e.message)
    }
  }

  // 檢查 schema 版本，執行增量 migration
  let ver = '0'
  try {
    const meta = await db.prepare("SELECT value FROM schema_meta WHERE key='schema_ver'").first()
    ver = meta?.value || '0'
  } catch (_) { /* schema_meta 尚未就緒 */ }

  // migration：v2 新增 config + models 表格
  if (parseInt(ver, 10) < 2) {
    // 自動產生 client_token
    const token = generateToken()
    try {
      await db.prepare(
        "INSERT OR IGNORE INTO config (id, client_token) VALUES (1, ?)"
      ).bind(token).run()
    } catch (_) {}
  }

  // 確保 config row 存在且有 token
  try {
    const row = await db.prepare("SELECT client_token FROM config WHERE id = 1").first()
    if (!row || !row.client_token) {
      const token = generateToken()
      await db.prepare(
        "INSERT OR REPLACE INTO config (id, client_token) VALUES (1, ?)"
      ).bind(token).run()
    }
  } catch (_) {}

  // migration v3: dashboard_password_hash
  if (parseInt(ver, 10) < 3) {
    try {
      await db.prepare("ALTER TABLE config ADD COLUMN dashboard_password_hash TEXT NOT NULL DEFAULT ''").run()
    } catch (_) { /* 可能已存在 */ }
  }

  await db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('schema_ver', '3')").run()
  schemaReady = true
  console.log(`[db] ${ok}/${ALL_DDLS.length} tables ready, schema_ver=3`)
}

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const rand = new Uint32Array(30)
  crypto.getRandomValues(rand)
  let t = 'sk-'
  for (let i = 0; i < 30; i++) t += chars[rand[i] % chars.length]
  return t
}

// ─── Token 操作 ──────────────────────────────────────────────

export async function getActiveToken(db) {
  const row = await db.prepare(
    'SELECT * FROM tokens WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1'
  ).first()
  return row || null
}

export async function saveToken(db, token, userInfo) {
  await db.prepare('UPDATE tokens SET is_active = 0').run()
  const masked = token.length > 10
    ? token.slice(0, 4) + '...' + token.slice(-4)
    : '***'
  await db.prepare(
    `INSERT INTO tokens (token, token_masked, user_info, is_active) VALUES (?, ?, ?, 1)`
  ).bind(token, masked, JSON.stringify(userInfo)).run()
}

export async function deleteActiveToken(db) {
  await db.prepare('UPDATE tokens SET is_active = 0').run()
}

// ─── Client API Token 操作 ──────────────────────────────────

export async function getClientToken(db) {
  try {
    const row = await db.prepare("SELECT client_token FROM config WHERE id = 1").first()
    return row?.client_token || null
  } catch { return null }
}

export async function rotateClientToken(db) {
  const token = generateToken()
  await db.prepare("UPDATE config SET client_token = ? WHERE id = 1").bind(token).run()
  return token
}

// ─── Models 操作 ─────────────────────────────────────────────

export async function saveModels(db, models) {
  await db.prepare("DELETE FROM models").run()
  const stmt = db.prepare("INSERT OR REPLACE INTO models (id, provider, context, details) VALUES (?, ?, ?, ?)")
  for (const m of models) {
    await stmt.bind(
      m.id || m.model_id || '',
      m.provider || '',
      m.context || 0,
      JSON.stringify(m)
    ).run()
  }
}

export async function getModels(db) {
  const { results } = await db.prepare("SELECT * FROM models ORDER BY provider, id").all()
  return results || []
}

// ─── Dashboard 密碼操作 ──────────────────────────────────────

export async function getDashboardPasswordHash(db) {
  try {
    const row = await db.prepare("SELECT dashboard_password_hash FROM config WHERE id = 1").first()
    return row?.dashboard_password_hash || ''
  } catch { return '' }
}

export async function setDashboardPassword(db, hash) {
  await db.prepare("UPDATE config SET dashboard_password_hash = ? WHERE id = 1").bind(hash).run()
}

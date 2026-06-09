import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getDriver, callDriver, verifyPuterToken, fetchModels, puterToOpenAIStream, collectPuterText, openaiChatResponse } from './lib/puter.js'
import { initDB, getActiveToken, saveToken, deleteActiveToken, getClientToken, rotateClientToken, saveModels, getModels, getDashboardPasswordHash, setDashboardPassword, getKeyPool, saveKeyPool, getAuthMode, setAuthMode } from './lib/db.js'
import { dashboardHtml } from './html.js'

const app = new Hono()
let dbReady = false

const _cache = new Map()
const CACHE_TTL = 5 * 60 * 1000
function cacheGet(key) { const e = _cache.get(key); if (!e) return null; if (Date.now() > e.ttl) { _cache.delete(key); return null }; return e.value }
function cacheSet(key, value) { _cache.set(key, { value, ttl: Date.now() + CACHE_TTL }) }
function cacheDelete(key) { _cache.delete(key) }

const CORS_OPEN = { origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'], allowHeaders: ['*'], exposeHeaders: ['*'], maxAge: 86400 }
app.use('/v1/*', cors(CORS_OPEN))
app.use('/api/*', cors(CORS_OPEN))

app.use('*', async (c, next) => {
  if (!dbReady && c.env?.DB) { try { await initDB(c.env.DB); dbReady = true } catch (e) { console.error('DB init failed:', e) } }
  await next()
})

app.use('/v1/*', async (c, next) => {
  const db = c.env?.DB
  if (!db) return c.json({ error: { message: 'DB not configured' } }, 500)
  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) return c.json({ error: { message: '需要 Authorization: Bearer <client_token>' } }, 401)
  const stored = await getClientToken(db)
  if (!stored || auth.slice(7) !== stored) return c.json({ error: { message: '無效的 Client API Token' } }, 401)
  await next()
})

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function resolveToken(c) {
  const db = c.env?.DB
  if (!db) return null
  const cached = cacheGet('active_token')
  if (cached) return cached
  const row = await getActiveToken(db)
  if (row) { cacheSet('active_token', row); return row }
  return null
}

async function getEffectiveToken(c) {
  const db = c.env?.DB
  if (!db) return null
  const mode = await getAuthMode(db)
  if (mode === 'key-pool') {
    const poolStr = await getKeyPool(db)
    if (poolStr) {
      const tokens = poolStr.split(',').map(t => t.trim()).filter(Boolean)
      if (tokens.length > 0) return { token: tokens[Math.floor(Math.random() * tokens.length)], source: 'key-pool' }
    }
    return null
  }
  const row = await resolveToken(c)
  return row ? { token: row.token, source: mode } : null
}

function uuid() { return crypto.randomUUID() }

app.get('/api/auth/status', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ passwordSet: false })
  return c.json({ passwordSet: !!(await getDashboardPasswordHash(db)) })
})

app.post('/api/auth/login', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ error: 'D1 not set' }, 500)
  const { password } = await c.req.json()
  if (!password) return c.json({ ok: false, error: '請輸入密碼' }, 400)
  const hash = await getDashboardPasswordHash(db)
  if (!hash) return c.json({ ok: false, error: '未設定登入密碼' }, 400)
  return c.json({ ok: (await sha256(password)) === hash })
})

app.post('/api/auth/password', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ error: 'D1 not set' }, 500)
  const { currentPassword, newPassword } = await c.req.json()
  const hash = await getDashboardPasswordHash(db)
  if (hash) {
    if (!currentPassword) return c.json({ error: '需要目前密碼' }, 400)
    if ((await sha256(currentPassword)) !== hash) return c.json({ error: '目前密碼錯誤' }, 401)
  }
  if (!newPassword) { await setDashboardPassword(db, ''); return c.json({ ok: true, cleared: true }) }
  if (newPassword.length < 4) return c.json({ error: '密碼至少 4 個字元' }, 400)
  await setDashboardPassword(db, await sha256(newPassword))
  return c.json({ ok: true })
})

app.get('/api/auth-mode', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ mode: 'puter-signin' })
  return c.json({ mode: await getAuthMode(db) })
})

app.post('/api/auth-mode', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ error: 'D1 not set' }, 500)
  const { mode } = await c.req.json(); await setAuthMode(db, mode); return c.json({ ok: true })
})

app.get('/api/key-pool', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ pool: '' })
  const pool = await getKeyPool(db)
  const tokens = pool ? pool.split(',').map(t => t.trim()).filter(Boolean) : []
  return c.json({ pool, count: tokens.length, masked: tokens.map(t => t.length > 10 ? t.slice(0, 4) + '...' + t.slice(-4) : '***') })
})

app.post('/api/key-pool', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ error: 'D1 not set' }, 500)
  const { pool } = await c.req.json(); await saveKeyPool(db, pool || ''); return c.json({ ok: true })
})

app.get('/', (c) => c.html(dashboardHtml(new URL(c.req.url).origin)))

app.post('/api/token/verify', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ error: 'D1 not set' }, 500)
  const { token, username } = await c.req.json()
  if (!token || token.length < 10) return c.json({ valid: false, error: 'Token 格式不正確' }, 400)
  const result = await verifyPuterToken(token)
  if (!result.valid) return c.json({ valid: false, error: result.error || `API error ${result.status}` }, 400)
  try {
    await saveToken(db, token, { verified_at: new Date().toISOString(), username: username || '' })
    cacheDelete('active_token')
    const saved = await getActiveToken(db)
    if (saved) cacheSet('active_token', saved)
  } catch (e) { return c.json({ valid: false, error: 'DB write failed: ' + e.message }, 500) }
  return c.json({ valid: true, masked: token.length > 10 ? token.slice(0, 4) + '...' + token.slice(-4) : '***' })
})

app.get('/api/token/info', async (c) => {
  const row = await resolveToken(c)
  if (!row) return c.json({ token: null })
  return c.json({ token: row.token, masked: row.token_masked, userInfo: row.user_info })
})

app.delete('/api/token', async (c) => {
  const db = c.env?.DB; if (db) { await deleteActiveToken(db); cacheDelete('active_token') }
  return c.json({ ok: true })
})

app.post('/api/token/save', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ error: 'D1 not set' }, 500)
  const { token, username } = await c.req.json()
  if (!token || token.length < 10) return c.json({ error: 'Token 格式不正確' }, 400)
  try {
    await saveToken(db, token, { saved_at: new Date().toISOString(), username: username || '' })
    cacheDelete('active_token')
    const saved = await getActiveToken(db)
    if (saved) cacheSet('active_token', saved)
  } catch (e) { return c.json({ error: 'DB write failed: ' + e.message }, 500) }
  return c.json({ ok: true, masked: token.length > 10 ? token.slice(0, 4) + '...' + token.slice(-4) : '***' })
})

app.get('/api/client-token', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ error: 'D1 not set' }, 500)
  return c.json({ token: await getClientToken(db) })
})

app.post('/api/client-token/rotate', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ error: 'D1 not set' }, 500)
  return c.json({ token: await rotateClientToken(db) })
})

app.get('/api/models', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ models: [] })
  return c.json({ models: await getModels(db) })
})

app.post('/api/models/fetch', async (c) => {
  const db = c.env?.DB; if (!db) return c.json({ error: 'D1 not set' }, 500)
  const auth = await getEffectiveToken(c)
  if (!auth) return c.json({ error: '請先設定 Puter Token 或填入 Key Pool' }, 401)
  try {
    const puterModels = await fetchModels(auth.token)
    const normalized = Array.isArray(puterModels) ? puterModels : (puterModels?.models || puterModels?.data || [])
    await saveModels(db, normalized)
    return c.json({ ok: true, count: normalized.length })
  } catch (e) { return c.json({ error: e.message }, 502) }
})

app.post('/api/playground/chat', async (c) => {
  const auth = await getEffectiveToken(c)
  if (!auth) return c.json({ error: '請先設定 Puter Token 或填入 Key Pool' }, 401)
  const body = await c.req.json()
  const { model = 'gpt-4o-mini', messages, stream: clientStream = false } = body
  if (!messages?.length) return c.json({ error: 'messages 為必填' }, 400)
  const requestId = uuid()
  const args = { messages, model, stream: true }
  if (body.max_tokens) args.max_tokens = body.max_tokens
  if (body.temperature !== undefined) args.temperature = body.temperature
  if (body.tools) args.tools = body.tools
  if (body.tool_choice) args.tool_choice = body.tool_choice
  try {
    const upstream = await callDriver(auth.token, { interface: 'puter-chat-completion', driver: getDriver(model), test_mode: false, method: 'complete', args })
    if (!upstream.ok) return c.json({ error: `Puter error (${upstream.status}): ${(await upstream.text()).slice(0, 500)}` }, 502)
    if (clientStream) {
      c.header('Content-Type', 'text/event-stream; charset=utf-8'); c.header('Cache-Control', 'no-cache'); c.header('Connection', 'keep-alive'); c.header('X-Accel-Buffering', 'no')
      return c.body(upstream.body.pipeThrough(puterToOpenAIStream(requestId, model)))
    }
    return c.json(openaiChatResponse(requestId, model, await collectPuterText(upstream)))
  } catch (e) { return c.json({ error: e.message }, 502) }
})

app.get('/v1/models', async (c) => {
  const db = c.env?.DB
  if (db) {
    const saved = await getModels(db)
    if (saved.length > 0) return c.json({ object: 'list', data: saved.map(m => ({ id: m.id, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: m.provider || 'puter' })) })
  }
  const fallback = ['gpt-4o-mini', 'gpt-4o', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o1', 'o1-mini', 'o3-mini', 'o4-mini', 'claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4-5', 'claude-sonnet-4-5', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3-pro-preview', 'grok-3', 'grok-3-fast', 'grok-3-mini', 'grok-3-mini-fast', 'deepseek-chat', 'deepseek-reasoner', 'mistral-large-latest', 'mistral-small-latest']
  return c.json({ object: 'list', data: fallback.map(id => ({ id, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'puter-2api' })) })
})

app.post('/v1/chat/completions', async (c) => {
  const auth = await getEffectiveToken(c)
  if (!auth) return c.json({ error: { message: 'Puter Token 未設定，請先至 Dashboard 設定或填入 Key Pool' } }, 401)
  const body = await c.req.json()
  const { model = 'gpt-4o-mini', messages, stream = false } = body
  if (!messages?.length) return c.json({ error: { message: 'messages 為必填' } }, 400)
  const requestId = 'chatcmpl-' + uuid().replace(/-/g, '').slice(0, 20)
  const args = { messages, model, stream: true }
  if (body.max_tokens) args.max_tokens = body.max_tokens
  if (body.temperature !== undefined) args.temperature = body.temperature
  if (body.top_p !== undefined) args.top_p = body.top_p
  if (body.tools) args.tools = body.tools
  if (body.tool_choice) args.tool_choice = body.tool_choice
  try {
    const upstream = await callDriver(auth.token, { interface: 'puter-chat-completion', driver: getDriver(model), test_mode: false, method: 'complete', args })
    if (!upstream.ok) return c.json({ error: { message: `Puter 錯誤 (${upstream.status})`, code: 'upstream_error' } }, 502)
    if (stream) {
      c.header('Content-Type', 'text/event-stream; charset=utf-8'); c.header('Cache-Control', 'no-cache'); c.header('Connection', 'keep-alive'); c.header('X-Accel-Buffering', 'no')
      return c.body(upstream.body.pipeThrough(puterToOpenAIStream(requestId, model)))
    }
    return c.json(openaiChatResponse(requestId, model, await collectPuterText(upstream)))
  } catch (e) { return c.json({ error: { message: e.message, code: 'internal_error' } }, 502) }
})

export default app

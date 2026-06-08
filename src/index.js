/**
 * Puter2API — OpenAI 相容 API 服務，基於 Hono + Cloudflare Workers
 *
 * 核心流程：
 *   Dashboard → 輸入 Puter Token → 驗證 → 存入 D1 → API proxies to Puter
 *
 * 依賴：
 *   - hono ^4.x
 *   - D1 資料庫 (binding: DB)
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getDriver, callDriver, verifyPuterToken, fetchModels } from './lib/puter.js'
import { initDB, getActiveToken, saveToken, deleteActiveToken, getClientToken, rotateClientToken, saveModels, getModels, getDashboardPasswordHash, setDashboardPassword } from './lib/db.js'
import { cacheGet, cacheSet, cacheDelete } from './lib/cache.js'
import { dashboardHtml } from './html.js'

const app = new Hono()
let dbReady = false

// ─── Middleware ────────────────────────────────────────────────

app.use('/v1/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] }))
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowHeaders: ['Content-Type', 'Authorization'] }))

app.use('*', async (c, next) => {
  if (!dbReady && c.env?.DB) {
    try {
      await initDB(c.env.DB)
      dbReady = true
    } catch (e) {
      console.error('DB init failed:', e)
    }
  }
  await next()
})

// API 認證中介層（/v1/* 需要 client_token）
app.use('/v1/*', async (c, next) => {
  const db = c.env?.DB
  if (!db) return c.json({ error: { message: '伺服器設定錯誤' } }, 500)

  const auth = c.req.header('Authorization')
  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: { message: '需要 Authorization: Bearer <client_token>' } }, 401)
  }

  const clientToken = auth.slice(7)
  const stored = await getClientToken(db)
  if (!stored || clientToken !== stored) {
    return c.json({ error: { message: '無效的 Client API Token' } }, 401)
  }

  await next()
})

// ─── Helper ───────────────────────────────────────────────────

async function sha256(text) {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text))
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  return hex
}

// ─── 路由: Dashboard 登入驗證 ───────────────────────────────

app.get('/api/auth/status', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ passwordSet: false })
  const hash = await getDashboardPasswordHash(db)
  return c.json({ passwordSet: !!hash })
})

app.post('/api/auth/login', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ error: 'D1 未設定' }, 500)
  const { password } = await c.req.json()
  if (!password) return c.json({ ok: false, error: '請輸入密碼' }, 400)

  const hash = await getDashboardPasswordHash(db)
  if (!hash) return c.json({ ok: false, error: '未設定登入密碼' }, 400)

  const inputHash = await sha256(password)
  if (inputHash !== hash) return c.json({ ok: false, error: '密碼錯誤' }, 401)

  return c.json({ ok: true })
})

app.post('/api/auth/password', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ error: 'D1 未設定' }, 500)
  const { currentPassword, newPassword } = await c.req.json()

  const hash = await getDashboardPasswordHash(db)
  if (hash) {
    if (!currentPassword) return c.json({ error: '需要目前密碼' }, 400)
    const currentHash = await sha256(currentPassword)
    if (currentHash !== hash) return c.json({ error: '目前密碼錯誤' }, 401)
  }

  // newPassword 為空字串 → 清除密碼
  if (!newPassword) {
    await setDashboardPassword(db, '')
    return c.json({ ok: true, cleared: true })
  }

  if (newPassword.length < 4) {
    return c.json({ error: '密碼至少 4 個字元' }, 400)
  }

  const newHash = await sha256(newPassword)
  await setDashboardPassword(db, newHash)
  return c.json({ ok: true })
})

async function resolveToken(c) {
  const db = c.env?.DB
  if (!db) return null

  const cached = cacheGet('active_token')
  if (cached) return cached

  const row = await getActiveToken(db)
  if (row) {
    cacheSet('active_token', row)
    return row
  }
  return null
}

function uuid() {
  return crypto.randomUUID()
}

function puterToOpenAIStream(requestId, model) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let buf = ''

  return new TransformStream({
    transform(chunk, controller) {
      buf += decoder.decode(chunk, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const data = JSON.parse(trimmed)
          if (data.type === 'text' && typeof data.text === 'string') {
            const delta = data.delta ?? data.text
            const openai = {
              id: requestId,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(openai)}\n\n`))
          }
        } catch (_) { /* skip */ }
      }
    },
    flush(controller) {
      const done = {
        id: requestId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    },
  })
}

async function collectPuterText(response) {
  const decoder = new TextDecoder()
  let buf = ''
  let fullText = ''
  const reader = response.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const data = JSON.parse(trimmed)
        if (data.type === 'text' && typeof data.text === 'string') {
          fullText += data.text
        }
      } catch (_) {}
    }
  }
  return fullText
}

async function collectPuterMedia(response) {
  const decoder = new TextDecoder()
  let buf = ''
  let fullText = ''
  const images = []
  const reader = response.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const data = JSON.parse(trimmed)
        if (data.type === 'text' && typeof data.text === 'string') {
          fullText += data.text
        } else if (data.type === 'image' && data.image?.image_url?.url) {
          images.push(data.image.image_url.url)
        }
      } catch (_) {}
    }
  }
  return { text: fullText, images }
}

function openaiChatResponse(requestId, model, content, usage) {
  return {
    id: requestId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

// ─── 路由: Dashboard ─────────────────────────────────────────

app.get('/', (c) => {
  const origin = new URL(c.req.url).origin
  return c.html(dashboardHtml(origin))
})

// ─── 路由: Token 管理 API ────────────────────────────────────

app.post('/api/token/verify', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ error: 'D1 資料庫未設定' }, 500)

  const { token, username } = await c.req.json()
  if (!token || token.length < 10) {
    return c.json({ valid: false, error: 'Token 格式不正確' }, 400)
  }

  const result = await verifyPuterToken(token)
  if (!result.valid) {
    return c.json({ valid: false, error: result.error || `API 回應 ${result.status}` }, 400)
  }

  const userInfo = { verified_at: new Date().toISOString(), username: username || '' }
  try {
    await saveToken(db, token, userInfo)
    cacheDelete('active_token')
    const saved = await getActiveToken(db)
    if (saved) cacheSet('active_token', saved)
  } catch (e) {
    return c.json({ valid: false, error: '寫入資料庫失敗: ' + e.message }, 500)
  }

  const masked = token.length > 10 ? token.slice(0, 4) + '...' + token.slice(-4) : '***'
  return c.json({ valid: true, masked })
})

app.get('/api/token/info', async (c) => {
  const row = await resolveToken(c)
  if (!row) return c.json({ token: null })
  return c.json({ token: row.token, masked: row.token_masked, userInfo: row.user_info })
})

app.delete('/api/token', async (c) => {
  const db = c.env?.DB
  if (db) {
    await deleteActiveToken(db)
    cacheDelete('active_token')
  }
  return c.json({ ok: true })
})

// Puter SDK signIn 後直接儲存 token（不另做驗證，SDK 已保證有效）
app.post('/api/token/save', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ error: 'D1 資料庫未設定' }, 500)

  const { token, username } = await c.req.json()
  if (!token || token.length < 10) {
    return c.json({ error: 'Token 格式不正確' }, 400)
  }

  const userInfo = { saved_at: new Date().toISOString(), username: username || '' }
  try {
    await saveToken(db, token, userInfo)
    cacheDelete('active_token')
    const saved = await getActiveToken(db)
    if (saved) cacheSet('active_token', saved)
  } catch (e) {
    return c.json({ error: '寫入資料庫失敗: ' + e.message }, 500)
  }

  const masked = token.length > 10 ? token.slice(0, 4) + '...' + token.slice(-4) : '***'
  return c.json({ ok: true, masked })
})

// ─── 路由: Client API Token ─────────────────────────────────

app.get('/api/client-token', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ error: 'D1 未設定' }, 500)
  const token = await getClientToken(db)
  return c.json({ token })
})

app.post('/api/client-token/rotate', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ error: 'D1 未設定' }, 500)
  const token = await rotateClientToken(db)
  return c.json({ token })
})

// ─── 路由: Models ──────────────────────────────────────────

app.get('/api/models', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ models: [] })
  const models = await getModels(db)
  return c.json({ models })
})

app.post('/api/models/fetch', async (c) => {
  const db = c.env?.DB
  if (!db) return c.json({ error: 'D1 未設定' }, 500)

  const tokenRow = await resolveToken(c)
  if (!tokenRow) return c.json({ error: '請先設定 Puter Token' }, 401)

  try {
    const puterModels = await fetchModels(tokenRow.token)
    const normalized = Array.isArray(puterModels) ? puterModels : (puterModels?.models || puterModels?.data || [])
    await saveModels(db, normalized)
    return c.json({ ok: true, count: normalized.length })
  } catch (e) {
    return c.json({ error: e.message }, 502)
  }
})

// ─── 路由: Playground ──────────────────────────────────────

app.post('/api/playground/chat', async (c) => {
  const tokenRow = await resolveToken(c)
  if (!tokenRow) return c.json({ error: '請先設定 Puter Token' }, 401)

  const body = await c.req.json()
  const { model = 'gpt-4o-mini', messages, stream: clientStream = false } = body
  if (!messages?.length) return c.json({ error: 'messages 為必填' }, 400)

  const requestId = uuid()
  const args = { messages, model, stream: true }
  if (body.max_tokens) args.max_tokens = body.max_tokens
  if (body.temperature !== undefined) args.temperature = body.temperature

  const payload = {
    interface: 'puter-chat-completion',
    driver: getDriver(model),
    test_mode: false,
    method: 'complete',
    args,
  }

  try {
    const upstream = await callDriver(tokenRow.token, payload)
    if (!upstream.ok) {
      const err = await upstream.text()
      return c.json({ error: `Puter API 錯誤 (${upstream.status}): ${err.slice(0, 500)}` }, 502)
    }

    if (clientStream) {
      const transformed = upstream.body.pipeThrough(puterToOpenAIStream(requestId, model))
      return c.newResponse(transformed, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    }

    const fullText = await collectPuterText(upstream)
    return c.json(openaiChatResponse(requestId, model, fullText))
  } catch (e) {
    return c.json({ error: e.message }, 502)
  }
})

// ─── 路由: Playground Image Generation ─────────────────────

app.post('/api/playground/image', async (c) => {
  const tokenRow = await resolveToken(c)
  if (!tokenRow) return c.json({ error: '請先設定 Puter Token' }, 401)

  const body = await c.req.json()
  const { model = 'gemini-2.5-flash-image', prompt } = body
  if (!prompt) return c.json({ error: 'prompt 為必填' }, 400)

  const args = { messages: [{ role: 'user', content: prompt }], model, stream: true }
  const payload = {
    interface: 'puter-chat-completion',
    driver: 'ai-chat',
    test_mode: false,
    method: 'complete',
    args,
  }

  try {
    const upstream = await callDriver(tokenRow.token, payload)
    if (!upstream.ok) {
      const err = await upstream.text()
      return c.json({ error: `Puter API 錯誤 (${upstream.status}): ${err.slice(0, 500)}` }, 502)
    }

    const result = await collectPuterMedia(upstream)
    if (result.images.length > 0) {
      return c.json({ data: result.images.map(url => ({ url })), content: result.text })
    }
    if (result.text) {
      return c.json({ content: result.text })
    }

    return c.json({ error: '無回應內容' }, 502)
  } catch (e) {
    return c.json({ error: e.message }, 502)
  }
})

// ─── 路由: Playground Image Edit (img2img) ────────────────

app.post('/api/playground/image-edit', async (c) => {
  const tokenRow = await resolveToken(c)
  if (!tokenRow) return c.json({ error: '請先設定 Puter Token' }, 401)

  const body = await c.req.json()
  const { model = 'gemini-2.5-flash-image', prompt, image: inputImage, image_mime_type = 'image/png' } = body
  if (!prompt) return c.json({ error: 'prompt 為必填' }, 400)

  let args
  if (inputImage) {
    // 透過 vision 格式傳送圖片
    args = {
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${image_mime_type};base64,${inputImage}` } },
      ] }],
      model,
      stream: true,
    }
  } else {
    args = { messages: [{ role: 'user', content: prompt }], model, stream: true }
  }

  const payload = {
    interface: 'puter-chat-completion',
    driver: 'ai-chat',
    test_mode: false,
    method: 'complete',
    args,
  }

  try {
    const upstream = await callDriver(tokenRow.token, payload)
    if (!upstream.ok) {
      const err = await upstream.text()
      return c.json({ error: `Puter API 錯誤 (${upstream.status}): ${err.slice(0, 500)}` }, 502)
    }

    const result = await collectPuterMedia(upstream)
    if (result.images.length > 0) {
      return c.json({ data: result.images.map(url => ({ url })), content: result.text })
    }
    if (result.text) {
      return c.json({ content: result.text })
    }

    return c.json({ error: '無回應內容' }, 502)
  } catch (e) {
    return c.json({ error: e.message }, 502)
  }
})

// ─── 路由: OpenAI 相容 API ──────────────────────────────────

app.get('/v1/models', async (c) => {
  // 先從 DB 讀取已儲存的模型
  const db = c.env?.DB
  let models = []
  if (db) {
    const saved = await getModels(db)
    if (saved.length > 0) {
      models = saved.map(m => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.provider || 'puter',
      }))
      return c.json({ object: 'list', data: models })
    }
  }

  // 無儲存模型時回傳精選列表
  const fallback = [
    'gpt-4o-mini', 'gpt-4o', 'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
    'o1', 'o1-mini', 'o3-mini', 'o4-mini',
    'claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4-5', 'claude-sonnet-4-5',
    'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-3-pro-preview',
    'grok-3', 'grok-3-fast', 'grok-3-mini', 'grok-3-mini-fast',
    'deepseek-chat', 'deepseek-reasoner',
    'mistral-large-latest', 'mistral-small-latest',
  ]
  const data = fallback.map(id => ({
    id, object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'puter-2api',
  }))
  return c.json({ object: 'list', data })
})

app.post('/v1/chat/completions', async (c) => {
  const tokenRow = await resolveToken(c)
  if (!tokenRow) return c.json({ error: { message: 'Puter Token 未設定，請先至 Dashboard 設定' } }, 401)

  const body = await c.req.json()
  const { model = 'gpt-4o-mini', messages, stream = false } = body
  if (!messages?.length) return c.json({ error: { message: 'messages 為必填' } }, 400)

  const requestId = 'chatcmpl-' + uuid().replace(/-/g, '').slice(0, 20)

  const args = { messages, model, stream: true }
  if (body.max_tokens) args.max_tokens = body.max_tokens
  if (body.temperature !== undefined) args.temperature = body.temperature
  if (body.top_p !== undefined) args.top_p = body.top_p

  const payload = {
    interface: 'puter-chat-completion',
    driver: getDriver(model),
    test_mode: false,
    method: 'complete',
    args,
  }

  try {
    const upstream = await callDriver(tokenRow.token, payload)
    if (!upstream.ok) {
      const err = await upstream.text()
      return c.json({
        error: { message: `Puter API 錯誤 (${upstream.status})`, code: 'upstream_error' },
      }, 502)
    }

    if (stream) {
      const transformed = upstream.body.pipeThrough(puterToOpenAIStream(requestId, model))
      return c.newResponse(transformed, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    }

    const fullText = await collectPuterText(upstream)
    return c.json(openaiChatResponse(requestId, model, fullText))
  } catch (e) {
    return c.json({ error: { message: e.message, code: 'internal_error' } }, 502)
  }
})

app.post('/v1/images/generations', async (c) => {
  const tokenRow = await resolveToken(c)
  if (!tokenRow) return c.json({
    error: { message: 'Puter Token 未設定，請先至 Dashboard 設定', code: 'auth_required' },
  }, 401)

  const body = await c.req.json()
  const { prompt, model = 'gemini-2.5-flash-image', n = 1 } = body
  if (!prompt) return c.json({
    error: { message: 'prompt 為必填', code: 'missing_field' },
  }, 400)

  const args = { messages: [{ role: 'user', content: prompt }], model, stream: true }
  const payload = {
    interface: 'puter-chat-completion',
    driver: 'ai-chat',
    test_mode: false,
    method: 'complete',
    args,
  }

  try {
    const upstream = await callDriver(tokenRow.token, payload)
    if (!upstream.ok) {
      const err = await upstream.text()
      return c.json({
        error: { message: `Puter API 錯誤 (${upstream.status})`, code: 'upstream_error' },
      }, 502)
    }

    const result = await collectPuterMedia(upstream)

    if (result.images.length > 0) {
      return c.json({
        created: Math.floor(Date.now() / 1000),
        data: result.images.map(url => ({ url })),
      })
    }

    return c.json({
      created: Math.floor(Date.now() / 1000),
      data: [],
      note: result.text,
    })
  } catch (e) {
    return c.json({
      error: { message: e.message, code: 'internal_error' },
    }, 502)
  }
})

app.post('/v1/images/edits', async (c) => {
  const tokenRow = await resolveToken(c)
  if (!tokenRow) return c.json({
    error: { message: 'Puter Token 未設定，請先至 Dashboard 設定', code: 'auth_required' },
  }, 401)

  const ct = c.req.header('content-type') || ''
  let prompt = '', imageBase64 = '', editModel = 'gemini-2.5-flash-image'
  if (ct.includes('multipart/form-data')) {
    const form = await c.req.parseBody()
    prompt = (form.prompt || '')
    editModel = (form.model || 'gemini-2.5-flash-image')
    const imgFile = form.image
    if (imgFile && typeof imgFile === 'object' && imgFile.arrayBuffer) {
      const buf = await imgFile.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let bin = ''
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      imageBase64 = btoa(bin)
    } else if (typeof imgFile === 'string') {
      imageBase64 = imgFile
    }
  } else {
    const body = await c.req.json()
    prompt = body.prompt || ''
    imageBase64 = body.image || body.image_data || ''
    editModel = body.model || 'gemini-2.5-flash-image'
  }
  if (!prompt) return c.json({
    error: { message: 'prompt 為必填', code: 'missing_field' },
  }, 400)

  let args
  let mimeType = 'image/png'

  if (imageBase64) {
    if (imageBase64.includes(',')) {
      const parts = imageBase64.split(',')
      const mimeMatch = parts[0].match(/data:(image\/\w+);/)
      if (mimeMatch) mimeType = mimeMatch[1]
      imageBase64 = parts[1]
    }
      args = {
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
        ] }],
        model: editModel,
        stream: true,
      }
    } else {
      args = {
        messages: [{ role: 'user', content: prompt }],
        model: editModel,
        stream: true,
      }
    }

  const payload = {
    interface: 'puter-chat-completion',
    driver: 'ai-chat',
    test_mode: false,
    method: 'complete',
    args,
  }

  try {
    const upstream = await callDriver(tokenRow.token, payload)
    if (!upstream.ok) {
      const err = await upstream.text()
      return c.json({
        error: { message: `Puter API 錯誤 (${upstream.status})`, code: 'upstream_error' },
      }, 502)
    }

    const result = await collectPuterMedia(upstream)

    if (result.images.length > 0) {
      return c.json({
        created: Math.floor(Date.now() / 1000),
        data: result.images.map(url => ({ url })),
      })
    }

    return c.json({
      created: Math.floor(Date.now() / 1000),
      data: [],
      note: result.text,
    })
  } catch (e) {
    return c.json({
      error: { message: e.message, code: 'internal_error' },
    }, 502)
  }
})

// ─── Export ───────────────────────────────────────────────────

export default app

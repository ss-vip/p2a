/**
 * Puter Driver API 代理模組
 * 封裝對 Puter.com 後端 API 的直接 HTTP 呼叫
 */

const PUTER_API = 'https://api.puter.com/drivers/call'
const PUTER_MODELS_API = 'https://api.puter.com/puterai/chat/models/details'

const DEFAULT_HEADERS = {
  'Content-Type': 'text/plain;actually=json',
  'Accept': '*/*',
  'Origin': 'https://docs.puter.com',
  'Referer': 'https://docs.puter.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

export async function callDriver(token, payload) {
  const body = JSON.stringify({ ...payload, auth_token: token })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const res = await fetch(PUTER_API, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body,
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timer)
  }
}

export function getDriver(_model) {
  return 'ai-chat'
}

/**
 * 呼叫 Puter txt2img 驅動程式（圖片生成）
 * 使用 puter-image-generation 介面，回傳圖片的 base64 資料 URL
 */
export async function callTxt2ImgDriver(token, model, prompt) {
  const payload = {
    interface: 'puter-image-generation',
    driver: 'ai-image',
    test_mode: false,
    method: 'generate',
    args: { prompt, model, responseType: 'blob' },
  }

  const body = JSON.stringify({ ...payload, auth_token: token })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const res = await fetch(PUTER_API, {
      method: 'POST',
      headers: DEFAULT_HEADERS,
      body,
      signal: controller.signal,
    })
    return res
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 從 Puter API 回應中提取圖片 base64 資料
 * 支援多種回應格式：
 * 1. NDJSON 含 type: image (聊天介面)
 * 2. JSON blob 封裝
 * 3. 原始二進位回應
 */
export async function extractImageFromResponse(response) {
  const ct = (response.headers.get('content-type') || '').toLowerCase()

  // === 嘗試 JSON/NDJSON 格式 ===
  const text = await response.clone().text()
  const trimmed = text.trim()

  // 嘗試解析為單一 JSON 物件
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed)
      // 格式 1: { type: "blob", data: "<base64>" }
      if (json.type === 'blob' && json.data) {
        return { url: json.url || null, base64: json.data }
      }
      // 格式 2: { data: [{ url: "..." }] }
      if (json.data && Array.isArray(json.data) && json.data[0]?.url) {
        return { url: json.data[0].url, base64: null }
      }
      // 格式 3: { url: "..." }
      if (json.url) {
        return { url: json.url, base64: null }
      }
      // 格式 4: IMAGE gen returns array of objects with url directly
      if (Array.isArray(json)) {
        for (const item of json) {
          if (item.url) return { url: item.url, base64: null }
        }
      }
    } catch (_) { /* 非 JSON */ }
  }

  // === 嘗試 NDJSON（逐行解析） ===
  if (trimmed.includes('\n')) {
    let url = null, base64 = null
    for (const line of trimmed.split('\n')) {
      const l = line.trim()
      if (!l) continue
      try {
        const data = JSON.parse(l)
        if (data.type === 'image' && data.image?.image_url?.url) {
          url = data.image.image_url.url
        }
        if (data.type === 'text' && typeof data.text === 'string') {
          // 可能包含 base64 圖片資料
          if (data.text.startsWith('data:image')) {
            url = data.text
          }
        }
      } catch (_) {}
    }
    if (url) return { url, base64: null }
  }

  // === 原始二進位回應（直接轉 base64） ===
  if (ct.includes('image') || ct.includes('octet-stream') || ct.includes('application/zip')) {
    const cloned = await response.clone()
    const buf = await cloned.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = btoa(binary)
    return { url: null, base64: b64 }
  }

  // === 如果以上都不是，將整個回應文字視為有可能包含 base64 字串 ===
  const possibleB64 = trimmed.replace(/\s/g, '')
  if (possibleB64.length > 100 && /^[A-Za-z0-9+/=]+$/.test(possibleB64)) {
    return { url: null, base64: possibleB64 }
  }

  return null
}

export async function verifyPuterToken(token) {
  const payload = {
    interface: 'puter-chat-completion',
    driver: 'ai-chat',
    test_mode: true,
    method: 'complete',
    args: {
      messages: [{ role: 'user', content: 'ok' }],
      model: 'gpt-4o-mini',
      stream: false,
      max_tokens: 1,
    },
  }

  try {
    const res = await callDriver(token, payload)
    if (!res.ok) {
      const text = await res.text()
      return { valid: false, status: res.status, error: text.slice(0, 300) }
    }
    const raw = await res.text()
    return { valid: true, raw }
  } catch (err) {
    return { valid: false, error: err.message }
  }
}

/**
 * 從 Puter 取得可用模型列表
 * 使用公開端點 /puterai/chat/models/details
 */
export async function fetchModels(token) {
  const res = await fetch(PUTER_MODELS_API, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Origin: 'https://puter.com',
      'User-Agent': 'puter-2api-worker/1.0',
    },
  })
  if (!res.ok) {
    throw new Error(`Puter models API 錯誤 (${res.status})`)
  }
  return res.json()
}

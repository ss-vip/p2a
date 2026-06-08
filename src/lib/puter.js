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

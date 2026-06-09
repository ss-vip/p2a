const PUTER_API = 'https://api.puter.com/drivers/call'
const PUTER_MODELS_API = 'https://api.puter.com/puterai/chat/models/details'
const HEADERS = {
  'Content-Type': 'text/plain;actually=json',
  'Accept': '*/*',
  'Origin': 'https://docs.puter.com',
  'Referer': 'https://docs.puter.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

export async function callDriver(token, payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    return await fetch(PUTER_API, {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ ...payload, auth_token: token }),
      signal: controller.signal,
    })
  } finally { clearTimeout(timer) }
}

export function getDriver(_model) { return 'ai-chat' }

export async function verifyPuterToken(token) {
  const payload = {
    interface: 'puter-chat-completion', driver: 'ai-chat',
    test_mode: true, method: 'complete',
    args: { messages: [{ role: 'user', content: 'ok' }], model: 'gpt-4o-mini', stream: false, max_tokens: 1 },
  }
  try {
    const res = await callDriver(token, payload)
    if (!res.ok) {
      const text = await res.text()
      return { valid: false, status: res.status, error: text.slice(0, 300) }
    }
    await res.text()
    return { valid: true }
  } catch (err) { return { valid: false, error: err.message } }
}

export async function fetchModels(token) {
  const res = await fetch(PUTER_MODELS_API, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', Origin: 'https://puter.com', 'User-Agent': 'puter-2api-worker/1.0' },
  })
  if (!res.ok) throw new Error(`Puter models API error (${res.status})`)
  return res.json()
}

export function puterToOpenAIStream(requestId, model) {
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
              id: requestId, object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000), model,
              choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(openai)}\n\n`))
          }
        } catch (_) {}
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: requestId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`))
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
    },
  })
}

export async function collectPuterText(response) {
  const decoder = new TextDecoder()
  let buf = '', fullText = ''
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
        if (data.type === 'text' && typeof data.text === 'string') fullText += data.text
      } catch (_) {}
    }
  }
  return fullText
}

export function openaiChatResponse(requestId, model, content, usage) {
  return {
    id: requestId, object: 'chat.completion',
    created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

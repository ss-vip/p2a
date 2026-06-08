export function dashboardHtml(origin) {
  return `<!DOCTYPE html>
<html lang="zh-TW" data-bs-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Puter2API · Dashboard</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://js.puter.com/v2/"></script>
<style>
  body { overflow: hidden; }
  .sidebar { height: 100vh; overflow-y: auto; }
  .main { height: 100vh; overflow-y: auto; display: flex; flex-direction: column; }
  .playground-card { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .playground-card .card-body { flex:1; display:flex; flex-direction:column; min-height:0; }
  .chat-output { flex: 1; overflow-y: auto; min-height: 120px; }
  .chat-output .msg-user { text-align: right; margin-bottom: 8px; }
  .chat-output .msg-user .bubble { display:inline-block; background:var(--bs-primary); color:#fff; padding:8px 12px; border-radius:12px 12px 4px 12px; max-width:80%; }
  .chat-output .msg-assistant { text-align: left; margin-bottom: 8px; }
  .chat-output .msg-assistant .bubble { display:inline-block; background:var(--bs-tertiary-bg); color:var(--bs-body-color); padding:8px 12px; border-radius:12px 12px 12px 4px; max-width:80%; white-space:pre-wrap; }
  .input-row { align-items:flex-end; flex-shrink:0; }
  .loading-dots { display:inline; }
  #image-preview { max-width:120px; max-height:120px; border-radius:8px; object-fit:cover; }
  details summary { cursor: pointer; }
  .model-item { padding: 4px 10px; border: 1px solid var(--bs-border-color); border-radius: 4px; cursor: pointer; transition: background .15s; }
  .model-item:hover { background: var(--bs-tertiary-bg); }
  #login-overlay { z-index: 1055; }
  .model-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 4px; max-height: 300px; overflow-y: auto; }
  @media (max-width: 767.98px) {
    body { overflow: auto; }
    .sidebar { height: auto; max-height: 50vh; }
    .main { height: auto; }
  }
</style>
</head>
<body>

<div class="app d-none" id="app">
  <div class="row g-0">
    <!-- Sidebar -->
    <aside class="sidebar col-12 col-md-4 col-lg-3 bg-body-tertiary border-end p-3 d-flex flex-column gap-3">

      <!-- Header -->
      <div class="d-flex align-items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 28 28" fill="none"><rect x="2" y="2" width="24" height="24" rx="6" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="currentColor"/></svg>
        <span class="fw-semibold">Puter2API</span>
        <div class="ms-auto d-flex gap-1">
          <button class="btn btn-sm btn-outline-secondary" id="theme-toggle" title="切換明暗">🌙</button>
          <button class="btn btn-sm btn-outline-secondary d-none" id="logout-btn" title="登出">⏏️</button>
        </div>
      </div>

      <!-- Dashboard Password -->
      <div class="card">
        <div class="card-body py-3">
          <h6 class="card-title text-body-tertiary text-uppercase small d-flex align-items-center gap-1 mb-2">
            🔒 Dashboard 密碼
            <span class="ms-auto" id="dash-pw-indicator"><span class="badge bg-secondary">未設定</span></span>
          </h6>
          <div class="input-group input-group-sm mb-2">
            <input type="password" class="form-control" id="dash-password-input" placeholder="設定登入密碼" maxlength="128" autocomplete="new-password">
            <button class="btn btn-outline-secondary" id="toggle-dash-pw">👁</button>
          </div>
          <div id="dash-current-pw-group" class="mb-2 d-none">
            <input type="password" class="form-control form-control-sm" id="dash-current-pw" placeholder="目前密碼（變更時需要）" maxlength="128">
          </div>
          <div class="d-flex gap-2 mb-2">
            <button class="btn btn-sm btn-outline-primary flex-fill" id="save-dash-password-btn">儲存密碼</button>
            <button class="btn btn-sm btn-outline-danger d-none" id="clear-dash-password-btn" title="移除密碼">🗑</button>
          </div>
          <div id="dash-pw-status" class="small d-none"></div>
        </div>
      </div>

      <!-- Client API Token -->
      <div class="card">
        <div class="card-body py-3">
          <h6 class="card-title text-body-tertiary text-uppercase small d-flex align-items-center gap-1 mb-2">
            🔑 Client API Token
            <button class="btn btn-sm btn-outline-secondary ms-auto" id="rotate-client-token" title="重新產生">🔄</button>
          </h6>
          <div class="input-group input-group-sm">
            <input type="text" class="form-control font-monospace small" id="client-token-value" readonly value="載入中...">
            <button class="btn btn-outline-secondary" id="copy-client-token">複製</button>
          </div>
        </div>
      </div>

      <!-- Puter Token -->
      <div class="card">
        <div class="card-body py-3">
          <h6 class="card-title text-body-tertiary text-uppercase small d-flex align-items-center gap-1 mb-2">☁️ Puter 授權</h6>
          <button class="btn btn-info w-100 mb-2" id="signin-puter-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="me-1"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            使用 Puter 帳號登入
          </button>
          <details class="small text-body-tertiary">
            <summary>手動輸入 Token（進階）</summary>
            <div class="mt-2">
              <div class="input-group input-group-sm mb-2">
                <input type="password" class="form-control" id="token-input" placeholder="eyJhbGciOiJIUzI1NiI..." minlength="10" maxlength="2048" spellcheck="false">
                <button class="btn btn-outline-secondary" id="toggle-token-vis">👁</button>
              </div>
              <button class="btn btn-sm btn-outline-primary w-100" id="verify-btn" disabled>驗證並儲存</button>
            </div>
          </details>
          <div id="token-status" class="small mt-2 d-none"></div>
          <div id="token-info" class="mt-2 d-none">
            <div class="d-flex justify-content-between small mb-1"><span class="text-body-tertiary">狀態</span><span id="ti-status">—</span></div>
            <div class="d-flex justify-content-between small mb-1 align-items-center"><span class="text-body-tertiary">帳號</span><input class="form-control form-control-sm font-monospace text-end" id="ti-username" readonly value="—" style="font-size:11px;width:auto;flex:1;margin-left:8px;background:transparent;border:none;padding:0 4px;text-align:right"></div>
            <div class="d-flex justify-content-between small mb-1"><span class="text-body-tertiary">Token</span><span id="ti-masked">—</span></div>
            <button class="btn btn-sm btn-outline-danger w-100 mt-1" id="delete-token-btn">移除 Token</button>
          </div>
        </div>
      </div>

      <!-- Models -->
      <div class="card">
        <div class="card-body py-3">
          <h6 class="card-title text-body-tertiary text-uppercase small d-flex align-items-center gap-1 mb-2">
            🧠 模型列表
            <button class="btn btn-sm btn-outline-warning ms-auto" id="fetch-models-btn">取得</button>
          </h6>
          <div id="models-container" class="small text-body-tertiary"><i>尚未載入</i></div>
          <div class="model-grid d-none" id="model-grid"></div>
        </div>
      </div>

      <!-- API Info -->
      <div class="card">
        <div class="card-body py-3">
          <h6 class="card-title text-body-tertiary text-uppercase small d-flex align-items-center gap-1 mb-2">
            📡 API 端點
          </h6>
          <div class="mb-2">
            <div class="input-group input-group-sm">
              <input type="text" class="form-control font-monospace small" id="api-base-url" readonly value="${origin}/v1">
              <button class="btn btn-outline-secondary" id="copy-base-url">複製</button>
            </div>
          </div>
          <h6 class="card-title text-body-tertiary text-uppercase small d-flex align-items-center gap-1 mb-2">
            cURL 範例
            <button class="btn btn-sm btn-outline-secondary ms-auto" id="copy-curl-example" title="複製 cURL">📋</button>
          </h6>
          <textarea class="form-control form-control-sm font-monospace" rows="4" readonly style="font-size:11px;resize:none">curl ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer &lt;client_token&gt;" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}],"stream":true}'</textarea>
        </div>
      </div>
    </aside>

    <!-- Main -->
    <main class="main col-12 col-md-8 col-lg-9 p-3">
      <div class="d-flex align-items-center gap-2 mb-3">
        <div class="d-flex align-items-center gap-1" id="puter-status-display">
          <span id="puter-status-icon">❌</span>
          <span class="small text-body-tertiary" id="puter-status-text">Puter token 未授權</span>
        </div>
        <span class="ms-auto small text-body-tertiary d-none" id="sys-status">
          <span class="badge bg-secondary" id="sys-dot">●</span>
          <span id="sys-text">系統就緒</span>
        </span>
      </div>

      <div class="card playground-card">
        <div class="card-body d-flex flex-column p-3">
          <div class="d-flex gap-2 mb-3 flex-shrink-0 align-items-center">
            <select id="func-select" class="form-select form-select-sm" style="max-width:180px">
              <option value="chat">💬 Chat</option>
              <option value="image">🖼 Image Gen</option>
              <option value="image-edit">🎨 Image Edit</option>
              <option value="tts" disabled>🔊 TTS</option>
              <option value="stt" disabled>🎤 STT</option>
              <option value="embedding" disabled>📊 Embedding</option>
            </select>
            <select id="model-select" class="form-select form-select-sm" style="max-width:220px">
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="claude-sonnet-4">claude-sonnet-4</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash</option>
              <option value="deepseek-chat">deepseek-chat</option>
            </select>
            <div class="form-check form-switch mb-0">
              <input class="form-check-input" type="checkbox" id="stream-toggle" checked>
              <label class="form-check-label small" for="stream-toggle">Stream</label>
            </div>
            <button class="btn btn-sm btn-outline-secondary ms-auto" id="clear-chat-btn" title="清空對話">🗑</button>
          </div>

          <div id="chat-output" class="chat-output bg-dark bg-opacity-10 rounded p-3 mb-3 border">
            <div class="text-body-tertiary fst-italic">請先在左側設定 Puter Token</div>
          </div>

          <div class="d-flex gap-2 input-row" id="chat-input-row">
            <textarea id="chat-input" class="form-control" rows="2" placeholder="輸入訊息..." maxlength="32768" style="min-height:44px;resize:vertical" disabled></textarea>
            <button class="btn btn-primary flex-shrink-0" id="send-btn" style="height:44px" disabled>SEND</button>
            <button class="btn btn-outline-secondary d-none flex-shrink-0" id="stop-btn" style="height:44px">停止</button>
          </div>

          <!-- Image generation input (hidden by default) -->
          <div class="d-flex gap-2 input-row d-none" id="image-input-row">
            <textarea class="form-control" id="image-prompt-input" placeholder="輸入圖片描述..." maxlength="1024" rows="2" style="min-height:44px;resize:vertical"></textarea>
            <button class="btn btn-primary flex-shrink-0" id="gen-image-btn" style="height:44px" disabled>SEND</button>
          </div>

          <!-- Image edit input (hidden by default) -->
          <div class="d-flex gap-2 input-row d-none" id="image-edit-input-row">
            <div class="d-flex flex-column gap-1 flex-fill">
              <textarea class="form-control" id="edit-prompt-input" placeholder="編輯描述..." maxlength="1024" rows="2" style="min-height:44px;resize:vertical"></textarea>
              <div class="d-flex align-items-center gap-2">
                <input type="file" class="form-control form-control-sm" id="edit-image-file" accept="image/*" style="max-width:200px">
                <img id="image-preview" class="d-none">
                <small class="text-body-tertiary" id="edit-image-status">尚未選擇圖片</small>
              </div>
            </div>
            <button class="btn btn-primary flex-shrink-0" id="edit-send-btn" style="height:44px" disabled>SEND</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>

<!-- Login Overlay -->
<div id="login-overlay" class="d-none" style="position:fixed;inset:0;background:var(--bs-body-bg);align-items:center;justify-content:center">
  <div class="card" style="width:360px;max-width:90vw">
    <div class="card-body p-4 text-center">
      <div class="d-flex align-items-center justify-content-center gap-2 mb-3">
        <svg width="24" height="24" viewBox="0 0 28 28" fill="none"><rect x="2" y="2" width="24" height="24" rx="6" stroke="currentColor" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="currentColor"/></svg>
        <span class="fw-semibold">Puter2API</span>
      </div>
      <h5 class="mb-3">Dashboard 登入</h5>
      <div class="mb-3">
        <input type="password" class="form-control" id="login-password-input" placeholder="請輸入登入密碼" maxlength="128" autocomplete="current-password">
      </div>
      <button class="btn btn-primary w-100 mb-2" id="login-btn">登入</button>
      <div id="login-error" class="small text-danger d-none"></div>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
const API = ''
const REQUEST_TIMEOUT = 60000
let puterToken = null
let clientToken = null
let abortCtrl = null
let streaming = false

const $ = id => document.getElementById(id)
const loginOverlay = $('login-overlay')
const loginPwInput = $('login-password-input')
const loginBtn = $('login-btn')
const loginError = $('login-error')
const dashPwInput = $('dash-password-input')
const dashCurrentPw = $('dash-current-pw')
const dashCurrentPwGroup = $('dash-current-pw-group')
const saveDashPwBtn = $('save-dash-password-btn')
const clearDashPwBtn = $('clear-dash-password-btn')
const dashPwStatus = $('dash-pw-status')
const dashPwIndicator = $('dash-pw-indicator')
const toggleDashPw = $('toggle-dash-pw')
const tokenInput = $('token-input')
const verifyBtn = $('verify-btn')
const tokenStatus = $('token-status')
const tokenInfo = $('token-info')
const deleteBtn = $('delete-token-btn')
const chatOutput = $('chat-output')
const chatInput = $('chat-input')
const sendBtn = $('send-btn')
const stopBtn = $('stop-btn')
const modelSelect = $('model-select')
const funcSelect = $('func-select')
const streamToggle = $('stream-toggle')
const sysDot = $('sys-dot')
const sysText = $('sys-text')
const toggleVis = $('toggle-token-vis')
const signinPuterBtn = $('signin-puter-btn')
const fetchModelsBtn = $('fetch-models-btn')
const modelGrid = $('model-grid')
const modelsContainer = $('models-container')
const clientTokenValue = $('client-token-value')
const copyClientToken = $('copy-client-token')
const rotateBtn = $('rotate-client-token')
const puterStatusIcon = $('puter-status-icon')
const puterStatusText = $('puter-status-text')
const clearChatBtn = $('clear-chat-btn')
const chatInputRow = $('chat-input-row')
const imageInputRow = $('image-input-row')
const imagePromptInput = $('image-prompt-input')
const genImageBtn = $('gen-image-btn')
const imageEditInputRow = $('image-edit-input-row')
const editPromptInput = $('edit-prompt-input')
const editImageFile = $('edit-image-file')
const imagePreview = $('image-preview')
const editImageStatus = $('edit-image-status')
const editSendBtn = $('edit-send-btn')
const themeToggle = $('theme-toggle')
let editImageBase64 = null
const logoutBtn = $('logout-btn')

// ─── 主題切換 ────────────────────────────────────────────────

function applyTheme(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme)
  themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️'
  localStorage.setItem('puter2api_theme', theme)
}
const savedTheme = localStorage.getItem('puter2api_theme') || 'dark'
applyTheme(savedTheme)
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-bs-theme')
  applyTheme(current === 'dark' ? 'light' : 'dark')
})

// ─── 登出 ────────────────────────────────────────────────────

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('dash_logged_in')
  location.reload()
})

// ─── 功能切換 ────────────────────────────────────────────────

funcSelect.addEventListener('change', async () => {
  const mode = funcSelect.value
  const isChat = mode === 'chat'
  const isImage = mode === 'image'
  const isEdit = mode === 'image-edit'
  chatInputRow.classList.toggle('d-none', !isChat)
  imageInputRow.classList.toggle('d-none', !isImage)
  imageEditInputRow.classList.toggle('d-none', !isEdit)
  streamToggle.closest('.form-check').classList.toggle('d-none', !isChat)
  clearChatBtn.classList.toggle('d-none', !(isChat || isImage || isEdit))
  if (isChat) chatInput.focus()
  else if (isImage) imagePromptInput.focus()
  else if (isEdit) editPromptInput.focus()
  // 根據功能篩選模型
  try {
    const res = await fetch(API + '/api/models')
    const data = await res.json()
    const models = data.models || []
    populateModelSelect(models, mode)
  } catch (_) {
    populateModelSelect([], mode)
  }
})

// Toggle token visibility
toggleVis.addEventListener('click', () => {
  const t = tokenInput
  if (t.type === 'password') { t.type = 'text'; toggleVis.textContent = '🙈' }
  else { t.type = 'password'; toggleVis.textContent = '👁' }
})

tokenInput.addEventListener('input', () => {
  verifyBtn.disabled = tokenInput.value.trim().length < 10
})

// Sign in with Puter — 使用 Puter SDK browser-based auth (官方推薦方式)
signinPuterBtn.addEventListener('click', async () => {
  try {
    signinPuterBtn.disabled = true
    signinPuterBtn.textContent = '授權中...'
    const result = await puter.auth.signIn()
    if (result?.success && result?.token) {
      const res = await fetch(API + '/api/token/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token, username: result.username || '' }),
      })
      const data = await res.json()
      if (res.ok) {
        setTokenStatus('success', '已透過 Puter 登入！', 'success')
        await loadTokenInfo()
      } else {
        setTokenStatus('error', '✗ 授權失敗: ' + (data.error || '伺服器錯誤'), 'danger')
      }
    } else {
      setTokenStatus('error', '✗ 授權失敗或使用者取消', 'danger')
    }
  } catch (e) {
    setTokenStatus('error', '✗ 授權異常: ' + e.message, 'danger')
  }
  signinPuterBtn.disabled = false
  signinPuterBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="me-1"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> 使用 Puter 帳號登入'
})

// 手動輸入 Token — 直接調用 Puter driver API 驗證（不經 SDK）
verifyBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim()
  if (!token) return
  setTokenStatus('verifying', '驗證中...', 'warning')
  verifyBtn.disabled = true
  try {
    const res = await fetch(API + '/api/token/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json()
    if (res.ok && data.valid) {
      setTokenStatus('success', '驗證成功，Token 已儲存！', 'success')
      await loadTokenInfo()
    } else {
      setTokenStatus('error', '✗ ' + (data.error || 'Token 無效'), 'danger')
    }
  } catch (e) {
    setTokenStatus('error', '✗ 請求失敗: ' + e.message, 'danger')
  }
  verifyBtn.disabled = false
})

deleteBtn.addEventListener('click', async () => {
  if (!confirm('確定要移除 Token 嗎？')) return
  await fetch(API + '/api/token', { method: 'DELETE' })
  puterToken = null
  tokenInfo.classList.add('d-none')
  tokenStatus.classList.add('d-none')
  updatePuterStatus()
  updatePlaygroundState()
  setSysStatus('idle', 'Token 已移除')
})

// Client API Token
async function loadClientToken() {
  try {
    const res = await fetch(API + '/api/client-token')
    const data = await res.json()
    if (data.token) {
      clientToken = data.token
      clientTokenValue.value = data.token
    }
  } catch (_) {}
}

copyClientToken.addEventListener('click', () => {
  if (clientToken) {
    navigator.clipboard.writeText(clientToken)
    copyClientToken.textContent = '已複製'
    setTimeout(() => { copyClientToken.textContent = '複製' }, 2000)
  }
})

rotateBtn.addEventListener('click', async () => {
  if (!confirm('重新產生 Client API Token 後，使用舊 Token 的請求將立即失效。確定繼續？')) return
  try {
    const res = await fetch(API + '/api/client-token/rotate', { method: 'POST' })
    const data = await res.json()
    if (data.token) {
      clientToken = data.token
      clientTokenValue.value = data.token
      setSysStatus('ok', 'Client Token 已更新')
    }
  } catch (e) {
    setSysStatus('error', '更新失敗')
  }
})

// Load token info
async function loadTokenInfo() {
  try {
    const res = await fetch(API + '/api/token/info')
    if (!res.ok) return
    const data = await res.json()
    if (data.token) {
      puterToken = data.token
      $('ti-status').textContent = '已啟用'
      $('ti-masked').textContent = data.masked
      const tiUser = $('ti-username')
      try {
        const ui = JSON.parse(data.userInfo || '{}')
        tiUser.value = ui.username || '—'
      } catch (_) { tiUser.value = '—' }
      tokenInfo.classList.remove('d-none')
      tokenInput.value = ''
      updatePuterStatus()
      updatePlaygroundState()
    } else {
      updatePuterStatus()
    }
  } catch (_) {
    updatePuterStatus()
  }
}

function updatePuterStatus() {
  if (puterToken) {
    puterStatusIcon.textContent = '✅'
    puterStatusText.textContent = 'Puter token 已就緒'
  } else {
    puterStatusIcon.textContent = '❌'
    puterStatusText.textContent = 'Puter token 未授權'
  }
}

// Fetch models from Puter
fetchModelsBtn.addEventListener('click', async () => {
  if (!puterToken) {
    setSysStatus('error', '請先設定 Puter Token')
    return
  }
  fetchModelsBtn.disabled = true
  fetchModelsBtn.textContent = '⋯'
  try {
    const res = await fetch(API + '/api/models/fetch', { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      setSysStatus('ok', '已取得 ' + data.count + ' 個模型')
      await renderModels()
    } else {
      setSysStatus('error', data.error || '取得失敗')
    }
  } catch (e) {
    setSysStatus('error', e.message)
  }
  fetchModelsBtn.disabled = false
  fetchModelsBtn.textContent = '取得'
})

async function renderModels() {
  try {
    const res = await fetch(API + '/api/models')
    const data = await res.json()
    const models = data.models || []
    if (models.length === 0) {
      modelsContainer.innerHTML = '<i>暫無模型資料</i>'
      modelGrid.classList.add('d-none')
      modelsContainer.classList.remove('d-none')
      return
    }
    modelsContainer.classList.add('d-none')
    modelGrid.classList.remove('d-none')
    modelGrid.innerHTML = models.map(m => {
      const ctx = m.context ? '<span class="badge bg-info" title="Max Token: ' + m.context + '" style="font-size:9px;padding:1px 5px">' + m.context + '</span>' : ''
      let typeLabel = ''
      try {
        const det = JSON.parse(m.details || '{}')
        const t = det.type || det.model_type || det.capabilities?.type || ''
        if (t) typeLabel = ' <span class="badge ' + (t === 'image' ? 'bg-warning text-dark' : t === 'text' || t === 'chat' ? 'bg-primary' : 'bg-secondary') + '" style="font-size:8px;padding:1px 4px">' + t + '</span>'
      } catch (_) {}
      return '<div class="model-item" style="cursor:pointer" data-copy="' + m.id + '"><div class="font-monospace" style="font-size:11px">' + m.id + typeLabel + ' ' + ctx + '</div><div class="text-body-tertiary" style="font-size:9px">' + (m.provider || '—') + '</div></div>'
    }).join('')
    populateModelSelect(models, funcSelect.value)
  } catch (_) {}
}

function getModelType(m) {
  try {
    const det = JSON.parse(m.details || '{}')
    return (det.type || det.model_type || det.capabilities?.type || '').toLowerCase()
  } catch (_) { return '' }
}

function filterModelsByFunc(models, func) {
  const typeMap = {
    chat: ['text', 'chat', 'vision', ''],
    'image': ['image'],
    'image-edit': ['image', 'vision', 'text', 'chat'],
    tts: ['audio'],
    stt: ['audio'],
    embedding: ['embedding'],
  }
  const allowed = typeMap[func] || ['text', 'chat', '']
  return models.filter(m => allowed.includes(getModelType(m)))
}

function populateModelSelect(models, filterFunc) {
  const current = modelSelect.value
  const func = filterFunc || funcSelect.value
  let filtered = filterModelsByFunc(models, func)
  // 如果有 image-edit 但找不到 image 模型，保留全部以利使用
  if (func === 'image-edit' && filtered.length === 0 && models.length > 0) {
    filtered = models
  }
  modelSelect.innerHTML = ''
  if (filtered.length > 0) {
    filtered.forEach(m => {
      const opt = document.createElement('option')
      opt.value = m.id
      opt.textContent = m.id + ' (' + (getModelType(m) || 'text') + ')'
      if (m.id === current) opt.selected = true
      modelSelect.appendChild(opt)
    })
  } else {
    const defaults = {
      chat: ['gpt-4o-mini','gpt-4o','claude-sonnet-4','gemini-2.5-flash','deepseek-chat','grok-3'],
      'image': ['gemini-2.5-flash-image','gpt-image-1.5','dall-e-3'],
      'image-edit': ['gemini-2.5-flash-image','gpt-4o','gpt-4o-mini'],
      tts: ['tts-1'],
      stt: ['whisper-1'],
      embedding: ['text-embedding-3-small'],
    }
    const ids = defaults[func] || defaults.chat
    ids.forEach(id => {
      const opt = document.createElement('option')
      opt.value = id; opt.textContent = id
      modelSelect.appendChild(opt)
    })
  }
}

// ─── Playground ──────────────────────────────────────────────

clearChatBtn.addEventListener('click', () => {
  chatOutput.innerHTML = '<div class="text-body-tertiary fst-italic">對話已清空</div>'
})

let loadingInterval = null

function showLoading(bubble) {
  bubble.textContent = ''
  bubble.classList.add('loading-dots')
  let dots = 0
  loadingInterval = setInterval(() => {
    dots = (dots + 1) % 4
    bubble.textContent = '.'.repeat(dots)
  }, 400)
}

function hideLoading(bubble) {
  bubble.classList.remove('loading-dots')
  if (loadingInterval) {
    clearInterval(loadingInterval)
    loadingInterval = null
  }
  bubble.textContent = ''
}

function createAbortWithTimeout(ms) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  const origAbort = ctrl.abort.bind(ctrl)
  ctrl.abort = () => { clearTimeout(timer); origAbort() }
  return ctrl
}

async function sendMessage() {
  const text = chatInput.value.trim()
  if (!text || streaming) return

  const model = modelSelect.value
  const stream = streamToggle.checked

  const userDiv = document.createElement('div')
  userDiv.className = 'msg-user'
  const userBubble = document.createElement('div')
  userBubble.className = 'bubble'
  userBubble.textContent = text
  userDiv.appendChild(userBubble)
  chatOutput.appendChild(userDiv)

  const assistantDiv = document.createElement('div')
  assistantDiv.className = 'msg-assistant'
  const assistantBubble = document.createElement('div')
  assistantBubble.className = 'bubble'
  assistantDiv.appendChild(assistantBubble)
  chatOutput.appendChild(assistantDiv)
  chatOutput.scrollTop = chatOutput.scrollHeight

  chatInput.value = ''
  chatInput.disabled = true
  sendBtn.classList.add('d-none')
  stopBtn.classList.remove('d-none')
  streaming = true
  abortCtrl = createAbortWithTimeout(REQUEST_TIMEOUT)

  showLoading(assistantBubble)

  try {
    const res = await fetch(API + '/api/playground/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: text }], stream }),
      signal: abortCtrl.signal,
    })
    if (!res.ok) throw new Error(await res.text())

    hideLoading(assistantBubble)

    if (stream) {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\\n')
        buf = lines.pop()
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6)
            if (payload === '[DONE]') continue
            try {
              const chunk = JSON.parse(payload)
              const content = chunk?.choices?.[0]?.delta?.content || ''
              if (content) {
                assistantBubble.textContent += content
                chatOutput.scrollTop = chatOutput.scrollHeight
              }
            } catch (_) {}
          }
        }
      }
    } else {
      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content || ''
      assistantBubble.textContent = content || '(empty)'
    }
  } catch (e) {
    hideLoading(assistantBubble)
    if (e.name === 'AbortError') {
      assistantBubble.textContent = assistantBubble.textContent
        ? assistantBubble.textContent + '\\n[已逾時或中斷]'
        : '[已逾時或中斷]'
    } else {
      assistantBubble.textContent = (assistantBubble.textContent || '') + '\\n[錯誤: ' + e.message + ']'
    }
    assistantDiv.className += ' text-danger'
  }

  streaming = false
  chatInput.disabled = !puterToken
  sendBtn.classList.remove('d-none')
  stopBtn.classList.add('d-none')
  chatOutput.scrollTop = chatOutput.scrollHeight
}

stopBtn.addEventListener('click', () => {
  if (abortCtrl) { abortCtrl.abort(); abortCtrl = null }
})

sendBtn.addEventListener('click', sendMessage)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
})

let imageAbortCtrl = null

// Image Generation
genImageBtn.addEventListener('click', async () => {
  const prompt = imagePromptInput.value.trim()
  if (!prompt) return

  const model = modelSelect.value
  genImageBtn.disabled = true
  genImageBtn.textContent = 'SEND'

  const resultDiv = document.createElement('div')
  resultDiv.className = 'msg-assistant'
  const resultBubble = document.createElement('div')
  resultBubble.className = 'bubble'
  resultDiv.appendChild(resultBubble)
  chatOutput.appendChild(resultDiv)
  chatOutput.scrollTop = chatOutput.scrollHeight

  showLoading(resultBubble)
  imageAbortCtrl = createAbortWithTimeout(REQUEST_TIMEOUT)

  try {
    const res = await fetch(API + '/api/playground/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt }),
      signal: imageAbortCtrl.signal,
    })
    if (!res.ok) throw new Error(await res.text())
    hideLoading(resultBubble)
    const data = await res.json()
    if (data.data?.[0]?.url) {
      resultBubble.innerHTML = '<img src="' + data.data[0].url + '" style="max-width:100%;border-radius:8px" alt="' + prompt.replace(/"/g,'&quot;') + '">'
    } else {
      resultBubble.textContent = data.content || '(empty response)'
    }
  } catch (e) {
    hideLoading(resultBubble)
    if (e.name === 'AbortError') {
      resultBubble.textContent = '[已逾時或中斷]'
    } else {
      resultBubble.textContent = '[錯誤: ' + e.message + ']'
    }
    resultDiv.className += ' text-danger'
  }

  imageAbortCtrl = null
  imagePromptInput.value = ''
  genImageBtn.disabled = true
  chatOutput.scrollTop = chatOutput.scrollHeight
})

imagePromptInput.addEventListener('input', () => {
  genImageBtn.disabled = !puterToken || !imagePromptInput.value.trim()
})
imagePromptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); genImageBtn.click() }
})

// Image Edit (img2img)
editImageFile.addEventListener('change', (e) => {
  const file = e.target.files?.[0]
  if (!file) {
    editImageBase64 = null
    imagePreview.classList.add('d-none')
    editImageStatus.textContent = '尚未選擇圖片'
    editSendBtn.disabled = true
    return
  }
  editImageStatus.textContent = '讀取中...'
  const reader = new FileReader()
  reader.onload = (ev) => {
    editImageBase64 = ev.target.result.split(',')[1]
    imagePreview.src = ev.target.result
    imagePreview.classList.remove('d-none')
    editImageStatus.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' KB)'
    editSendBtn.disabled = !puterToken || !editPromptInput.value.trim()
  }
  reader.readAsDataURL(file)
})

editPromptInput.addEventListener('input', () => {
  editSendBtn.disabled = !puterToken || !editPromptInput.value.trim() || !editImageBase64
})

let editAbortCtrl = null

editSendBtn.addEventListener('click', async () => {
  const prompt = editPromptInput.value.trim()
  if (!prompt || !editImageBase64) return

  const model = modelSelect.value
  editSendBtn.disabled = true
  editSendBtn.textContent = 'SEND'

  const resultDiv = document.createElement('div')
  resultDiv.className = 'msg-assistant'
  const resultBubble = document.createElement('div')
  resultBubble.className = 'bubble'
  resultDiv.appendChild(resultBubble)
  chatOutput.appendChild(resultDiv)
  chatOutput.scrollTop = chatOutput.scrollHeight

  showLoading(resultBubble)
  editAbortCtrl = createAbortWithTimeout(REQUEST_TIMEOUT)

  try {
    const res = await fetch(API + '/api/playground/image-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, image: editImageBase64 }),
      signal: editAbortCtrl.signal,
    })
    if (!res.ok) throw new Error(await res.text())
    hideLoading(resultBubble)
    const data = await res.json()
    if (data.data?.[0]?.url) {
      resultBubble.innerHTML = '<img src="' + data.data[0].url + '" style="max-width:100%;border-radius:8px" alt="' + prompt.replace(/"/g,'&quot;') + '">'
    } else {
      resultBubble.textContent = data.content || '(empty response)'
    }
  } catch (e) {
    hideLoading(resultBubble)
    if (e.name === 'AbortError') {
      resultBubble.textContent = '[已逾時或中斷]'
    } else {
      resultBubble.textContent = '[錯誤: ' + e.message + ']'
    }
    resultDiv.className += ' text-danger'
  }

  editAbortCtrl = null
  editPromptInput.value = ''
  editSendBtn.disabled = true
  chatOutput.scrollTop = chatOutput.scrollHeight
})

editPromptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editSendBtn.click() }
})

function setTokenStatus(type, msg, bsColor) {
  tokenStatus.classList.remove('d-none')
  tokenStatus.innerHTML = '<span class="badge bg-' + bsColor + ' me-1">' + (type === 'verifying' ? '⋯' : type === 'success' ? '✓' : '✗') + '</span>' + msg
}

function updatePlaygroundState() {
  const hasToken = !!puterToken
  chatInput.disabled = !hasToken
  sendBtn.disabled = !hasToken
  chatInput.placeholder = hasToken ? '輸入訊息...' : '請先在左側設定 Puter Token'
  genImageBtn.disabled = !hasToken || !imagePromptInput.value.trim()
  editSendBtn.disabled = !hasToken || !editPromptInput.value.trim() || !editImageBase64
  if (hasToken) {
    const ph = chatOutput.querySelector('.text-body-tertiary.fst-italic')
    if (ph) ph.remove()
  }
}

function setSysStatus(state, text) {
  const map = { idle: 'secondary', ok: 'success', error: 'danger', verifying: 'warning' }
  sysDot.className = 'badge bg-' + (map[state] || 'secondary')
  sysDot.textContent = '●'
  sysText.textContent = text
}

// Clipboard copy - Base URL
const baseUrlInput = $('api-base-url')
const baseUrlCopyBtn = $('copy-base-url')
if (baseUrlCopyBtn && baseUrlInput) {
  baseUrlCopyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(baseUrlInput.value)
    const orig = baseUrlCopyBtn.textContent
    baseUrlCopyBtn.textContent = '✓'
    setTimeout(() => { baseUrlCopyBtn.textContent = orig }, 2000)
  })
}

// Clipboard copy - 模型名稱點選複製
document.addEventListener('click', (e) => {
  const item = e.target.closest('.model-item[data-copy]')
  if (!item) return
  const name = item.dataset.copy
  navigator.clipboard.writeText(name)
  const orig = item.innerHTML
  item.innerHTML = '<div class="font-monospace" style="font-size:11px;color:var(--bs-success)">已複製</div>'
  item.style.transition = 'opacity 1.5s'
  setTimeout(() => { item.innerHTML = orig; item.style.opacity = '1' }, 1200)
})

// Clipboard copy - cURL
$('copy-curl-example')?.addEventListener('click', () => {
  const ta = document.querySelector('textarea[readonly]')
  if (!ta) return
  navigator.clipboard.writeText(ta.value)
  const btn = $('copy-curl-example')
  const orig = btn.textContent
  btn.textContent = '✓'
  setTimeout(() => { btn.textContent = orig }, 2000)
})

// ─── Login / 密碼管理 ─────────────────────────────────────

async function checkAuth() {
  try {
    const res = await fetch(API + '/api/auth/status')
    const data = await res.json()
    if (data.passwordSet) {
      if (sessionStorage.getItem('dash_logged_in')) {
        loginOverlay.classList.add('d-none')
        document.getElementById('app').classList.remove('d-none')
        logoutBtn.classList.remove('d-none')
        await init()
      } else {
        document.getElementById('app').classList.add('d-none')
        loginOverlay.classList.remove('d-none')
        loginOverlay.style.display = 'flex'
        loginPwInput.focus()
      }
    } else {
      loginOverlay.classList.add('d-none')
      document.getElementById('app').classList.remove('d-none')
      await init()
    }
    updatePwIndicator(data.passwordSet)
  } catch (_) {
    loginOverlay.classList.add('d-none')
    document.getElementById('app').classList.remove('d-none')
    await init()
  }
}

loginBtn.addEventListener('click', async () => {
  const pw = loginPwInput.value.trim()
  if (!pw) return
  loginBtn.disabled = true
  loginBtn.textContent = '驗證中...'
  loginError.classList.add('d-none')
  try {
    const res = await fetch(API + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    const data = await res.json()
    if (res.ok && data.ok) {
      sessionStorage.setItem('dash_logged_in', '1')
      loginOverlay.classList.add('d-none')
      document.getElementById('app').classList.remove('d-none')
      logoutBtn.classList.remove('d-none')
      await init()
    } else {
      loginError.textContent = data.error || '登入失敗'
      loginError.classList.remove('d-none')
    }
  } catch (e) {
    loginError.textContent = '請求失敗: ' + e.message
    loginError.classList.remove('d-none')
  }
  loginBtn.disabled = false
  loginBtn.textContent = '登入'
})

loginPwInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); loginBtn.click() }
})

// Password management
toggleDashPw.addEventListener('click', () => {
  const t = dashPwInput
  if (t.type === 'password') { t.type = 'text'; toggleDashPw.textContent = '🙈' }
  else { t.type = 'password'; toggleDashPw.textContent = '👁' }
})

function updatePwIndicator(isSet) {
  if (isSet) {
    dashPwIndicator.innerHTML = '<span class="badge bg-success">已設定</span>'
    clearDashPwBtn.classList.remove('d-none')
  } else {
    dashPwIndicator.innerHTML = '<span class="badge bg-secondary">未設定</span>'
    clearDashPwBtn.classList.add('d-none')
  }
}

function setDashPwStatus(type, msg) {
  dashPwStatus.classList.remove('d-none')
  const colors = { green: 'success', red: 'danger', yellow: 'warning' }
  dashPwStatus.className = 'small text-' + (colors[type] || 'body-tertiary')
  dashPwStatus.textContent = msg
  if (type === 'red') {
    setTimeout(() => { dashPwStatus.classList.add('d-none') }, 4000)
  }
}

saveDashPwBtn.addEventListener('click', async () => {
  const newPw = dashPwInput.value.trim()
  if (newPw && newPw.length < 4) {
    setDashPwStatus('red', '密碼至少 4 個字元')
    return
  }
  const currentPw = dashCurrentPw.value.trim()

  saveDashPwBtn.disabled = true
  saveDashPwBtn.textContent = '儲存中...'
  try {
    const res = await fetch(API + '/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPw || undefined, newPassword: newPw }),
    })
    const data = await res.json()
    if (res.ok && data.ok) {
      setDashPwStatus('green', '密碼已儲存')
      dashPwInput.value = ''
      dashCurrentPw.value = ''
      updatePwIndicator(true)
      dashCurrentPwGroup.classList.add('d-none')
    } else {
      setDashPwStatus('red', '✗ ' + (data.error || '儲存失敗'))
    }
  } catch (e) {
    setDashPwStatus('red', '✗ ' + e.message)
  }
  saveDashPwBtn.disabled = false
  saveDashPwBtn.textContent = '儲存密碼'
})

clearDashPwBtn.addEventListener('click', async () => {
  const cpw = dashCurrentPw.value.trim() || prompt('請輸入目前密碼以移除：')
  if (!cpw) return
  if (!confirm('確定要移除 Dashboard 登入密碼嗎？')) return
  try {
    const res = await fetch(API + '/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: cpw, newPassword: '' }),
    })
    if (res.ok) {
      setDashPwStatus('green', '密碼已移除')
      updatePwIndicator(false)
      dashCurrentPw.value = ''
      dashCurrentPwGroup.classList.add('d-none')
    } else {
      const data = await res.json()
      setDashPwStatus('red', '✗ ' + (data.error || '移除失敗'))
    }
  } catch (e) {
    setDashPwStatus('red', '✗ ' + e.message)
  }
})

dashPwInput.addEventListener('focus', () => {
  dashCurrentPwGroup.classList.remove('d-none')
})

async function init() {
  await Promise.all([loadClientToken(), loadTokenInfo(), renderModels()])
  updatePuterStatus()
  updatePlaygroundState()
  if (modelSelect.options.length === 0) populateModelSelect([])
  chatInput.focus()
}
checkAuth()
<\/script>
</body>
</html>`
}

/**
 * 記憶體快取模組 (module-level Map)
 * 用於避免頻繁讀寫 D1，提升 API 回應速度
 */

const store = new Map()
const CACHE_DEFAULT_TTL = 5 * 60 * 1000 // 5 分鐘

export function cacheGet(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (entry.ttl && Date.now() > entry.ttl) {
    store.delete(key)
    return null
  }
  return entry.value
}

export function cacheSet(key, value, ttlMs = CACHE_DEFAULT_TTL) {
  store.set(key, { value, ttl: Date.now() + ttlMs })
}

export function cacheDelete(key) {
  store.delete(key)
}

export function cacheClear() {
  store.clear()
}

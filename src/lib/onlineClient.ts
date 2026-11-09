/**
 * Client-side helper for the Phase 4 online lookup.
 * Calls /api/identify (all external retrieval is server-side) and keeps a
 * small localStorage cache so repeat scans of the same strip work offline.
 */
import type { OnlineResult, OnlineCapability } from '@/lib/onlineTypes'

const CACHE_KEY = 'medivision_online_cache'
const TTL = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAX_ENTRIES = 30

interface CacheShape {
  v: 1
  entries: Record<string, { ts: number; result: OnlineResult }>
}

function loadCache(): CacheShape {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return { v: 1, entries: {} }
    const parsed = JSON.parse(raw) as CacheShape
    if (parsed?.v !== 1 || typeof parsed.entries !== 'object') return { v: 1, entries: {} }
    return parsed
  } catch {
    return { v: 1, entries: {} }
  }
}

function saveCache(cache: CacheShape): void {
  try {
    const now = Date.now()
    const fresh = Object.entries(cache.entries)
      .filter(([, e]) => now - e.ts < TTL)
      .sort((a, b) => b[1].ts - a[1].ts)
      .slice(0, MAX_ENTRIES)
    const out: CacheShape = { v: 1, entries: Object.fromEntries(fresh) }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(out))
  } catch {
    /* storage full / private mode — cache is optional */
  }
}

function cacheKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200)
}

export async function lookupOnline(
  ocrText: string,
  image?: string,
  forceVision = false,
): Promise<{ result: OnlineResult; cached: boolean } | { error: string }> {
  const key = cacheKey(ocrText) + (forceVision ? ' fv' : '')
  const cache = loadCache()
  if (!image && cache.entries[key] && Date.now() - cache.entries[key].ts < TTL) {
    return { result: cache.entries[key].result, cached: true }
  }
  try {
    // /api/ai/identify tries the Phase 4 backend (FastAPI + trained NER model)
    // first and falls back to the built-in retriever server-side when the
    // backend is not running — the client always gets a usable result.
    const res = await fetch('/api/ai/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ocrText, image, forceVision }),
    })
    if (!res.ok) {
      if (res.status === 429) return { error: 'rate_limited' }
      return { error: 'server_error' }
    }
    const result = (await res.json()) as OnlineResult
    cache.entries[key] = { ts: Date.now(), result }
    saveCache(cache)
    return { result, cached: false }
  } catch {
    return { error: 'network' }
  }
}

export async function checkCapability(): Promise<OnlineCapability> {
  try {
    const res = await fetch('/api/identify')
    if (res.ok) return (await res.json()) as OnlineCapability
  } catch {
    /* offline */
  }
  return { online: false, geminiEnabled: false }
}

export interface BackendInfo {
  connected: boolean
  ner?: string
  gemini?: boolean
  geminiModel?: string | null
}

/** Is the Phase 4 backend (medivision-backend FastAPI) running? */
export async function checkBackend(): Promise<BackendInfo> {
  try {
    const res = await fetch('/api/ai/health')
    if (res.ok) return (await res.json()) as BackendInfo
  } catch {
    /* backend not configured / offline */
  }
  return { connected: false }
}

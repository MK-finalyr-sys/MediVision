import { NextResponse } from 'next/server'

/**
 * GET /api/ai/health
 * Capability probe for the Phase 4 backend (medivision-backend FastAPI).
 * The ScanView uses this to show the "AI model backend connected" badge.
 * Short timeout + tiny cache so a stopped backend never slows the UI.
 */
export const dynamic = 'force-dynamic'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/+$/, '')

export interface BackendHealth {
  connected: boolean
  ner?: string
  gemini?: boolean
  geminiModel?: string | null
}

let cache: { at: number; data: BackendHealth } | null = null
const TTL_MS = 30_000

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return NextResponse.json(cache.data)

  let data: BackendHealth = { connected: false }
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    })
    if (res.ok) {
      const j = (await res.json()) as { status?: string; ner?: string; gemini?: boolean; geminiModel?: string | null }
      data = { connected: j.status === 'ok', ner: j.ner, gemini: j.gemini, geminiModel: j.geminiModel }
    }
  } catch {
    data = { connected: false }
  }
  cache = { at: Date.now(), data }
  return NextResponse.json(data)
}

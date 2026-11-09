import { NextRequest, NextResponse } from 'next/server'
import { identifyFromText } from '@/lib/retriever'
import type { OnlineResult } from '@/lib/onlineTypes'

/**
 * POST /api/ai/identify  { ocrText: string, image?: dataUrl, forceVision?: boolean }
 *
 * The Phase 4 brain sits in `medivision-backend/` (FastAPI + your trained CRF
 * NER model). This proxy keeps the browser same-origin — the backend URL never
 * reaches the client — and falls back to the built-in retriever when the
 * backend is not running, so the app degrades gracefully, never breaks.
 *
 *   forceVision === true  -> built-in tier directly (it owns the AI-vision
 *                            rescue path for heavily damaged strips)
 *   otherwise             -> backend first (NER + RxNorm/openFDA/DailyMed +
 *                            web fallback + Gemini card); built-in on failure.
 *
 * Every response is tagged with `engine` so the UI can show which brain
 * produced the result.
 */
export const dynamic = 'force-dynamic'

const BACKEND_URL = (process.env.BACKEND_URL ?? 'http://localhost:8000').replace(/\/+$/, '')

/* per-IP throttle: 12 requests / minute (demo-appropriate, in-memory) */
const hits = new Map<string, { n: number; ts: number }>()
const LIMIT = 12
const WINDOW_MS = 60_000

function throttled(ip: string): boolean {
  const now = Date.now()
  const cur = hits.get(ip)
  if (!cur || now - cur.ts > WINDOW_MS) {
    hits.set(ip, { n: 1, ts: now })
    return false
  }
  cur.n += 1
  return cur.n > LIMIT
}

async function viaBackend(ocrText: string, image?: string): Promise<OnlineResult> {
  const res = await fetch(`${BACKEND_URL}/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ocrText, imageB64: image ?? null }),
    signal: AbortSignal.timeout(60_000), // backend may do web search + Gemini
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`backend_${res.status}`)
  const result = (await res.json()) as OnlineResult
  return { ...result, engine: 'backend-ner' }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  if (throttled(ip)) {
    return NextResponse.json({ error: 'rate_limited', note: 'Too many searches — wait a minute.' }, { status: 429 })
  }

  let body: { ocrText?: unknown; image?: unknown; forceVision?: unknown } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const ocrText = typeof body.ocrText === 'string' ? body.ocrText.slice(0, 2000) : ''
  const image =
    typeof body.image === 'string' && body.image.startsWith('data:image/') && body.image.length < 3_500_000
      ? body.image.split(',')[1]
      : undefined
  const forceVision = body.forceVision === true

  if (ocrText.replace(/[^a-zA-Z]/g, '').length < 3 && !image) {
    return NextResponse.json({ error: 'empty_text' }, { status: 400 })
  }

  // Force-vision retry: the built-in tier owns Gemini vision of the strip photo.
  if (!forceVision) {
    try {
      return NextResponse.json(await viaBackend(ocrText, image))
    } catch {
      /* backend down / slow / errored — fall through to the built-in tier */
    }
  }

  const result = await identifyFromText(ocrText, image, { forceVision })
  return NextResponse.json({ ...result, engine: 'builtin' })
}

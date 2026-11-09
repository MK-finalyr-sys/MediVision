import { NextRequest, NextResponse } from 'next/server'
import { identifyFromText, GEMINI_ENABLED } from '@/lib/retriever'

/**
 * POST /api/identify  { ocrText: string, image?: dataUrl, forceVision?: boolean }
 * Phase 4 online retrieval: RxNorm + openFDA + DailyMed (keyless),
 * live web-search tier for medicines the US sources miss,
 * grounded AI card when GEMINI_API_KEY is configured.
 */
export const dynamic = 'force-dynamic'

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

  if (ocrText.replace(/[^a-zA-Z]/g, '').length < 3 && !image) {
    return NextResponse.json({ error: 'empty_text' }, { status: 400 })
  }

  const result = await identifyFromText(ocrText, image, { forceVision: body.forceVision === true })
  return NextResponse.json(result)
}

/** Capability probe — client checks whether the AI tier is configured. */
export async function GET() {
  return NextResponse.json({ online: true, geminiEnabled: GEMINI_ENABLED })
}

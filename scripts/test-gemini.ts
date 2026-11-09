/**
 * Phase 4 Tier-3 test — Gemini grounded card + vision fallback.
 * Prints only pass/fail summaries; never prints the key.
 * Run: bun scripts/test-gemini.ts
 */
import sharp from 'sharp'

const BASE = 'http://localhost:3000'

interface OnlineResult {
  found: boolean
  salt?: string
  mappingBasis: string
  visionUsed?: boolean
  rxnormId?: string
  label?: { uses?: string }
  card?: {
    en?: { uses: string; beforeYouTake: string[]; sideEffects: string; stopAndGetHelp: string[] }
    ta?: { uses: string }
    hi?: { uses: string }
    caveats?: string[]
    model?: string
  }
  sources: Array<{ title: string; url: string }>
}

async function identify(body: Record<string, unknown>): Promise<OnlineResult> {
  const res = await fetch(`${BASE}/api/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as OnlineResult
}

/* ---------- T1: grounded card from brand-hint text ---------- */
console.log('T1 — brand hint "DOLO 650" → grounded AI card')
const t1 = await identify({ ocrText: 'DOLO 650 tablets' })
const card = t1.card
console.log(`  found=${t1.found} salt=${t1.salt} basis=${t1.mappingBasis} rxnorm=${t1.rxnormId}`)
if (!card) {
  console.log('  ✗ NO CARD — Gemini compose failed')
} else {
  console.log(`  ✓ card model=${card.model}`)
  console.log(`  ✓ EN uses: ${card.en?.uses.slice(0, 90)}`)
  console.log(`  ✓ EN stopSigns: ${card.en?.stopAndGetHelp.length} items, beforeYouTake: ${card.en?.beforeYouTake.length} items`)
  console.log(`  ✓ TA: ${card.ta ? card.ta.uses.slice(0, 60) : 'MISSING'}`)
  console.log(`  ✓ HI: ${card.hi ? card.hi.uses.slice(0, 60) : 'MISSING'}`)
  console.log(`  ✓ caveats: ${JSON.stringify(card.caveats ?? []).slice(0, 120)}`)
}

/* ---------- T2: vision fallback on a simulated blurry strip ---------- */
console.log('\nT2 — vision fallback (weak OCR text + strip image)')
const svg = `<svg width="640" height="400" xmlns="http://www.w3.org/2000/svg">
  <rect width="640" height="400" fill="#7f1d1d"/>
  <rect width="640" height="110" fill="#ffffff"/>
  <text x="320" y="62" font-size="46" font-family="DejaVu Sans" font-weight="bold" text-anchor="middle" fill="#0f172a">CEFIXIME 200</text>
  <text x="320" y="96" font-size="20" font-family="DejaVu Sans" text-anchor="middle" fill="#334155">Cefixime Dispersible Tablets 200 mg</text>
</svg>`
const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer()
const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`
const t2 = await identify({ ocrText: 'blur', image: dataUrl }) // <8 alpha chars → vision triggers
console.log(`  visionUsed=${t2.visionUsed} found=${t2.found} salt=${t2.salt} rxnorm=${t2.rxnormId}`)
if (t2.card) console.log(`  ✓ card EN uses: ${t2.card.en?.uses.slice(0, 90)}`)
console.log(`  ✓ sources: ${t2.sources.map((s) => s.title.split(' ')[0]).join(' · ')}`)

/* ---------- T3: no-match still fails safe ---------- */
console.log('\nT3 — garbage text still fails safe')
const t3 = await identify({ ocrText: 'qwzzx blorp vvq' })
console.log(`  found=${t3.found} note=${t3.note ?? '-'} (expect found=false)`)
console.log('\nDONE')

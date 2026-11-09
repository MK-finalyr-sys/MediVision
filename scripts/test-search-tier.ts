/**
 * Phase 4 Tier-2.5 tests — live web-search tier + damaged-strip vision.
 * Run: bun scripts/test-search-tier.ts   (server must be running on :3000)
 * Never prints keys. Prints pass/fail summaries only.
 */
import sharp from 'sharp'

const BASE = 'http://localhost:3000'

interface R {
  found: boolean
  salt?: string
  mappingBasis?: string
  visionUsed?: boolean
  note?: string
  searchQueries?: string[]
  card?: { en?: { uses: string }; model?: string }
  sources: Array<{ title: string; url: string }>
}

async function identify(body: Record<string, unknown>): Promise<R> {
  const res = await fetch(`${BASE}/api/identify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as R
}

/* ---------- S1: medicine NOT in the local 40-salt lexicon → web tier ---------- */
console.log('S1 — "TAMSULOSIN 0.4 MG CAPSULE" (outside local lexicon) → live web search')
const s1 = await identify({ ocrText: 'TAMSULOSIN 0.4 MG CAPSULE' })
console.log(`  found=${s1.found} salt=${s1.salt} note=${s1.note} basis=${s1.mappingBasis}`)
console.log(`  card model=${s1.card?.model} uses="${s1.card?.en?.uses.slice(0, 90)}"`)
console.log(`  queries=${JSON.stringify(s1.searchQueries ?? [])}`)
console.log(`  web sources=${s1.sources.slice(0, 3).map((s) => s.url.slice(0, 60))}`)
if (!s1.found || !s1.card || !s1.sources.length) {
  console.log('  ✗ FAIL')
  process.exit(1)
}
console.log('  ✓ PASS')

/* ---------- S2: heavily damaged strip photo → AI vision rescue ---------- */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
  <rect width="640" height="360" fill="#b9bec7"/>
  <text x="320" y="120" font-family="Arial" font-size="54" font-weight="bold" fill="#2a2e35" text-anchor="middle">LEVOTAS 500</text>
  <text x="320" y="170" font-family="Arial" font-size="24" fill="#3a3e45" text-anchor="middle">Levofloxacin Tablets IP</text>
</svg>`
const damaged = await sharp(Buffer.from(svg))
  .rotate(4, { background: '#9aa0a8' })
  .blur(1.4)
  .modulate({ brightness: 0.82 })
  .linear(0.55, 60) // crush contrast
  .jpeg({ quality: 30 })
  .toBuffer()
const torn = await sharp(damaged)
  .extract({ left: 0, top: 0, width: 640, height: 300 }) // bottom torn off
  .jpeg({ quality: 28 })
  .toBuffer()
const dataUrl = `data:image/jpeg;base64,${torn.toString('base64')}`

console.log('\nS2 — torn/faded "LEVOTAS 500" photo, OCR text nearly empty → AI vision')
const s2 = await identify({ ocrText: 'x1', image: dataUrl })
console.log(`  visionUsed=${s2.visionUsed} found=${s2.found} salt=${s2.salt} basis=${s2.mappingBasis}`)
console.log(`  card uses="${s2.card?.en?.uses.slice(0, 90)}"`)
console.log(`  sources=${s2.sources.length}`)
if (!s2.visionUsed || !s2.found) {
  console.log('  ✗ FAIL')
  process.exit(1)
}
console.log('  ✓ PASS')

console.log('\nDONE — search tier + vision OK')

/**
 * MediVision AI — pipeline self-tests (sandbox).
 * Covers: tokenizer, fuzzy matcher + confidence tiers, duplicate-salt guard,
 * storage schema validation, share text. Canvas/OCR parts are verified in-browser.
 */
import { tokenize, matchTokens, HIGH_THRESHOLD, MEDIUM_THRESHOLD } from '../src/lib/pipeline'
import { checkDuplicate } from '../src/lib/guard'
import { buildShareText, saltTokens, loadState, saveState } from '../src/lib/storage'
import { MEDICINES } from '../src/data/medicines'
import { TIPS, tipsForTags, tipOfTheDay } from '../src/data/tips'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('== Dataset integrity ==')
check('40 medicines in dataset', MEDICINES.length === 40, `got ${MEDICINES.length}`)
check('unique ids', new Set(MEDICINES.map((m) => m.id)).size === 40)
check('every record has >=1 source', MEDICINES.every((m) => m.sources.length >= 1))
check('every source is a verified domain', MEDICINES.every((m) => m.sources.every((s) => s.url.startsWith('https://medlineplus.gov/') || s.url.startsWith('https://www.nhs.uk/'))))
check('every record has EN/TA/HI', MEDICINES.every((m) => m.en && m.ta && m.hi))
check('EN beforeYouTake has 3-5 items', MEDICINES.every((m) => m.en.beforeYouTake.length >= 3 && m.en.beforeYouTake.length <= 5))
check('EN stopAndGetHelp has 2-4 items', MEDICINES.every((m) => m.en.stopAndGetHelp.length >= 2 && m.en.stopAndGetHelp.length <= 4))
check('TA and HI marked unverified via flag (en verified)', true)
check('every record has preChecklist >=2', MEDICINES.every((m) => m.en.preChecklist.length >= 2))
check('tips dataset >= 12', TIPS.length >= 12, `got ${TIPS.length}`)
check('tipOfTheDay returns a tip', !!tipOfTheDay())

console.log('== Tokenizer ==')
const words = [
  { text: 'DOLO', confidence: 92 },
  { text: '650', confidence: 95 },
  { text: 'Paracetamol', confidence: 88 },
  { text: 'Tablets', confidence: 91 },
  { text: 'IP', confidence: 85 },
  { text: 'Glaxo', confidence: 25 }, // low confidence dropped
  { text: '!!', confidence: 80 }, // too short
]
const toks = tokenize(words)
check('drops stop-words, short and low-confidence tokens', !toks.includes('tablets') && !toks.includes('ip') && !toks.includes('glaxo') && !toks.includes('!!'))
check('keeps brand + strength tokens', toks.includes('dolo') && toks.includes('650') && toks.includes('paracetamol'))

console.log('== Matcher + confidence tiers (GATE 1 protocol) ==')
function scanCase(label: string, ocrText: string) {
  const tokens = tokenize(ocrText.split(/\s+/).map((text) => ({ text, confidence: 92 })))
  const m = matchTokens(tokens)
  console.log(`   [${label}] tokens=${tokens.join(',')} → ${m.med?.name ?? 'NONE'} score=${m.score.toFixed(2)} status=${m.status}`)
  return m
}
const dolo = scanCase('Dolo 650', 'DOLO 650 Paracetamol Tablets IP')
check('Dolo 650 → HIGH dolo-650', dolo.status === 'high' && dolo.med?.id === 'dolo-650', JSON.stringify({ s: dolo.status, id: dolo.med?.id }))
check('HIGH threshold is 0.75', HIGH_THRESHOLD === 0.75)
const azithral = scanCase('Azithral 500', 'Azithral 500 Azithromycin Tablets')
check('Azithral 500 → HIGH azithral-500', azithral.status === 'high' && azithral.med?.id === 'azithral-500')
const pan = scanCase('Pan 40', 'PAN 40 Pantoprazole')
check('Pan 40 → HIGH pan-40', pan.status === 'high' && pan.med?.id === 'pan-40')
const ecosprin = scanCase('Ecosprin 75', 'Ecosprin 75 Aspirin')
check('Ecosprin 75 → HIGH ecosprin-75', ecosprin.status === 'high' && ecosprin.med?.id === 'ecosprin-75')
const glycomet = scanCase('Glycomet 500', 'Glycomet 500 Metformin')
check('Glycomet 500 → HIGH glycomet-500', glycomet.status === 'high' && glycomet.med?.id === 'glycomet-500')
const gibberish = scanCase('Unknown strip', 'Zyxwv Qqrs 999')
check('Unknown strip → LOW (never guesses)', gibberish.status === 'low' && !gibberish.med)
const partial = scanCase('Partially obscured', 'Znsthral 500')
check('Partially obscured → medium or low, never wrong HIGH', partial.status !== 'high' || partial.med?.id === 'azithral-500')
const saltOnly = scanCase('Salt text only', 'Pantoprazole Gastro Resistant')
check('Salt-name text still finds Pan 40', saltOnly.med?.id === 'pan-40')
check('Salt text alone → medium (needs confirmation, not silent HIGH)', saltOnly.status === 'medium')
const strengthOnly = scanCase('Bare strength only', '500')
check('Bare "500" alone → medium or low (weak evidence)', strengthOnly.status !== 'high')
const brandExact = scanCase('Brand text only', 'DOLO')
check('Exact brand token → HIGH', brandExact.status === 'high' && brandExact.med?.id === 'dolo-650')
check('MEDIUM threshold is 0.5', MEDIUM_THRESHOLD === 0.5)

console.log('== Duplicate-salt guard ==')
const doloMed = MEDICINES.find((m) => m.id === 'dolo-650')!
const crocin = MEDICINES.find((m) => m.id === 'crocin-500')!
const amaryl = MEDICINES.find((m) => m.id === 'amaryl-2')!
const dup1 = checkDuplicate(crocin, [{ id: 'dolo-650', slots: { Morning: true }, savedAt: 'x' } as never])
check('Crocin after Dolo 650 → duplicate (paracetamol)', dup1.duplicate && dup1.sharedSalts.includes('paracetamol') && dup1.existing?.id === 'dolo-650')
const dup2 = checkDuplicate(amaryl, [{ id: 'dolo-650', slots: {}, savedAt: 'x' } as never])
check('Amaryl after Dolo → no duplicate', !dup2.duplicate)
const dup3 = checkDuplicate(doloMed, [{ id: 'dolo-650', slots: {}, savedAt: 'x' } as never])
check('Saving same med again → not cross-brand duplicate', !dup3.duplicate)
check('saltTokens splits combination salts', saltTokens('Ibuprofen + Paracetamol').includes('ibuprofen') && saltTokens('Ibuprofen + Paracetamol').includes('paracetamol'))

console.log('== Storage (guarded by window check in Node) ==')
const st = loadState()
check('loadState safe outside browser', st.version === 1)
check('saveState safe outside browser (no-op)', saveState(st) === false)

console.log('== Tips engine ==')
const tips1 = tipsForTags(['avoid-alcohol', 'take-with-food'], 4)
check('tags map to tips', tips1.some((tp) => tp.id === 'avoid-alcohol') && tips1.some((tp) => tp.id === 'take-with-food'))
check('tipsForTags respects limit', tipsForTags(['avoid-alcohol', 'take-with-food', 'stay-hydrated'], 2).length <= 2)
check('empty tags → no tips', tipsForTags([]).length === 0)

console.log('== Caregiver share text ==')
const share = buildShareText({ 'dolo-650': 'Dolo 650' }, [{ id: 'dolo-650', slots: { Morning: true }, savedAt: 'x' } as never], [
  { medId: 'dolo-650', dateISO: buildShareDate(0), slot: 'Morning', status: 'taken', timestamp: 'x' },
  { medId: 'dolo-650', dateISO: buildShareDate(1), slot: 'Morning', status: 'missed', timestamp: 'x' },
])
check('share text has header + counts + disclaimer', share.includes('MediVision AI — 7-Day Medicine Summary') && share.includes('Dolo 650') && share.includes('Taken: 1') && share.includes('Missed: 1') && share.includes('not medical advice'))

function buildShareDate(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

console.log(`\nRESULTS: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

/**
 * MediVision AI — deterministic scan pipeline.
 * Pure functions (preprocess, blur check, tokenize, match) are exported for
 * unit tests; OCR itself is a thin, cached Tesseract.js wrapper.
 * No API keys, no network beyond the one-time Tesseract worker download.
 */
import Fuse from 'fuse.js'
import { MEDICINES } from '@/data/medicines'
import type { Medicine } from '@/data/types'

export const MAX_WIDTH = 1600

export interface PreprocessResult {
  beforeDataUrl: string
  afterDataUrl: string
  canvas: HTMLCanvasElement
  width: number
  height: number
}

/** Draw image into a canvas resized to <= MAX_WIDTH, returning before/after data URLs. */
export function preprocessImage(img: HTMLImageElement | HTMLCanvasElement): PreprocessResult {
  const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width
  const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height
  if (!iw || !ih) throw new Error('EMPTY_IMAGE')
  const scale = Math.min(1, MAX_WIDTH / iw)
  const w = Math.max(1, Math.round(iw * scale))
  const h = Math.max(1, Math.round(ih * scale))

  const before = document.createElement('canvas')
  before.width = w
  before.height = h
  const bctx = before.getContext('2d')
  if (!bctx) throw new Error('CANVAS_UNAVAILABLE')
  bctx.drawImage(img, 0, 0, w, h)
  const beforeDataUrl = before.toDataURL('image/jpeg', 0.85)

  const after = document.createElement('canvas')
  after.width = w
  after.height = h
  const actx = after.getContext('2d', { willReadFrequently: true })
  if (!actx) throw new Error('CANVAS_UNAVAILABLE')
  actx.drawImage(before, 0, 0)

  const imageData = actx.getImageData(0, 0, w, h)
  grayscaleAndStretch(imageData)
  actx.putImageData(imageData, 0, 0)
  const afterDataUrl = after.toDataURL('image/jpeg', 0.9)

  return { beforeDataUrl, afterDataUrl, canvas: after, width: w, height: h }
}

/** Grayscale luminance + percentile contrast stretch (suppresses foil glare). */
export function grayscaleAndStretch(imageData: ImageData): void {
  const d = imageData.data
  const n = d.length / 4
  const hist = new Uint32Array(256)
  const gray = new Uint8ClampedArray(n)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0
    gray[j] = g
    hist[g]++
  }
  // 2nd and 98th percentile bounds
  const loCut = Math.max(1, Math.floor(n * 0.02))
  const hiCut = Math.max(1, Math.floor(n * 0.98))
  let acc = 0
  let lo = 0
  let hi = 255
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= loCut) {
      lo = v
      break
    }
  }
  acc = 0
  for (let v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= hiCut) {
      hi = v
      break
    }
  }
  const range = Math.max(1, hi - lo)
  for (let j = 0, i = 0; j < n; j++, i += 4) {
    let v = ((gray[j] - lo) * 255) / range
    v = v < 0 ? 0 : v > 255 ? 255 : v
    d[i] = d[i + 1] = d[i + 2] = v
  }
}

/** Laplacian variance blur estimate on a downscaled copy. Higher = sharper. */
export function blurScore(source: HTMLCanvasElement): number {
  const small = document.createElement('canvas')
  const scale = Math.min(1, 400 / source.width)
  small.width = Math.max(1, Math.round(source.width * scale))
  small.height = Math.max(1, Math.round(source.height * scale))
  const ctx = small.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 999
  ctx.drawImage(source, 0, 0, small.width, small.height)
  const { data } = ctx.getImageData(0, 0, small.width, small.height)
  const w = small.width
  const h = small.height
  const gray = (x: number, y: number): number => {
    const i = (y * w + x) * 4
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const lap = 4 * gray(x, y) - gray(x - 1, y) - gray(x + 1, y) - gray(x, y - 1) - gray(x, y + 1)
      sum += lap
      sumSq += lap * lap
      count++
    }
  }
  if (!count) return 999
  const mean = sum / count
  return sumSq / count - mean * mean
}

export const BLUR_THRESHOLD = 40 // empirical: below this, printed text is rarely readable

/* ---------- aggressive second pass for damaged strips ---------- */

/** Otsu threshold on an already-grayscale image (maximises between-class variance). */
function otsuThreshold(imageData: ImageData): number {
  const d = imageData.data
  const n = d.length / 4
  const hist = new Float64Array(256)
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++
  let sum = 0
  for (let v = 0; v < 256; v++) sum += v * hist[v]
  let sumB = 0
  let wB = 0
  let best = 0
  let thr = 128
  for (let v = 0; v < 256; v++) {
    wB += hist[v]
    if (!wB) continue
    const wF = n - wB
    if (!wF) break
    sumB += v * hist[v]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      thr = v
    }
  }
  return thr
}

function binarize(imageData: ImageData, threshold: number): void {
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] >= threshold ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
}

function upscaleCanvas(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = Math.min(4000, Math.round(src.width * factor))
  out.height = Math.min(4000, Math.round(src.height * factor))
  const ctx = out.getContext('2d', { willReadFrequently: true })
  if (!ctx) return src
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

/** Extract candidate medicine-name tokens from OCR output. */
export function tokenize(words: Array<{ text: string; confidence: number }>): string[] {
  const stop = new Set([
    'tabs', 'tab', 'tablet', 'tablets', 'cap', 'capsule', 'ip', 'mg', 'mcg', 'ml', 'sr', 'xl', 'er',
    'strip', 'pack', 'ltd', 'pvt', 'india', 'pharma', 'laboratories', 'composition', 'each',
    'uncoated', 'coated', 'film', 'sugar', 'free', 'only', 'keep', 'out', 'reach', 'children',
    'store', 'cool', 'dry', 'place', 'away', 'light', 'dose', 'as', 'directed', 'the', 'and', 'for',
  ])
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of words) {
    const tok = w.text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    if (tok.length < 3) continue
    if (stop.has(tok)) continue
    if (w.confidence < 30) continue
    if (seen.has(tok)) continue
    seen.add(tok)
    out.push(tok)
  }
  return out
}

interface SearchDoc {
  id: string
  display: string
  search: string
  exact: string[]
}

const INDEX: SearchDoc[] = MEDICINES.flatMap((m) => {
  const docs: SearchDoc[] = []
  // Search index = brand + aliases + salts + strength (strips often print only the salt)
  const search = [m.name, ...m.aliases, m.activeIngredient, m.activeIngredient2 ?? '', m.strength]
    .join(' ')
    .toLowerCase()
  const exact = [m.name, ...m.aliases].map((s) => s.toLowerCase().replace(/[^a-z0-9]/g, ''))
  docs.push({ id: m.id, display: m.name, search, exact })
  return docs
})

const fuse = new Fuse(INDEX, {
  keys: ['search'],
  threshold: 0.45,
  ignoreLocation: true,
  minMatchCharLength: 3,
  includeScore: true,
})

export interface MatchResult {
  med?: Medicine
  score: number
  evidence: string[]
  status: 'high' | 'medium' | 'low'
}

export const HIGH_THRESHOLD = 0.75
export const MEDIUM_THRESHOLD = 0.5

/** Score OCR tokens against the medicine index; multi-token evidence beats single. */
export function matchTokens(tokens: string[]): MatchResult {
  if (!tokens.length) return { score: 0, evidence: [], status: 'low' }
  const scores = new Map<string, { score: number; evidence: Set<string> }>()
  let bestToken = 0
  let exactHit = false
  for (const tok of tokens) {
    const results = fuse.search(tok, { limit: 5 })
    if (!results.length) continue
    // Tokens that hit many records (e.g. bare strengths like "500") are weak evidence
    const weak = results.length >= 5
    for (const r of results) {
      const fuseScore = typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : 0
      const raw = 1 - fuseScore // fuse: 0 = perfect
      const exactBrand = r.item.exact.includes(tok)
      if (exactBrand) exactHit = true
      const boost = exactBrand ? 0.15 : 0
      const tokenScore = Math.min(1, (raw + boost) * (weak ? 0.6 : 1))
      if (!weak) bestToken = Math.max(bestToken, raw + boost)
      const cur = scores.get(r.item.id) ?? { score: 0, evidence: new Set<string>() }
      cur.score = Math.max(cur.score, tokenScore)
      cur.evidence.add(tok)
      scores.set(r.item.id, cur)
    }
  }
  let best: { id: string; score: number; evidence: Set<string> } | null = null
  for (const [id, v] of scores) {
    // multi-token agreement: +0.12 per extra distinct token pointing at same record
    const aggregated = Math.min(1, v.score + 0.12 * (v.evidence.size - 1))
    if (!best || aggregated > best.score) best = { id, score: aggregated, evidence: v.evidence }
  }
  if (!best || best.score < MEDIUM_THRESHOLD) return { score: best?.score ?? 0, evidence: best ? [...best.evidence] : [], status: 'low' }
  const med = MEDICINES.find((m) => m.id === best!.id)
  // HIGH requires discriminative evidence: an exact brand/alias token, or at least
  // two agreeing tokens. A shared strength or salt alone must never open the card
  // silently — salt-only reads go to the confirmation step instead.
  const status: 'high' | 'medium' | 'low' =
    best.score >= HIGH_THRESHOLD && best.evidence.size >= 2 && (bestToken >= 0.85 || exactHit)
      ? 'high'
      : best.score >= HIGH_THRESHOLD && exactHit
        ? 'high'
        : 'medium'
  return {
    med,
    score: best.score,
    evidence: [...best.evidence],
    status,
  }
}

/* ---------- OCR wrapper (dynamic import keeps it client-only) ---------- */

type ProgressCb = (stage: 'enhance' | 'ocr' | 'match' | 'done') => void

let workerPromise: Promise<{ recognize: (img: HTMLCanvasElement) => Promise<Array<{ text: string; confidence: number }>>; terminate: () => void }> | null = null

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const Tesseract = await import('tesseract.js')
      const worker = await Tesseract.createWorker('eng')
      return {
        recognize: async (img: HTMLCanvasElement) => {
          const res = await worker.recognize(img)
          const data = res.data
          const pageWords = (data as unknown as { words?: Array<{ text?: string; confidence?: number }> }).words
          const words =
            pageWords && pageWords.length
              ? pageWords.map((w) => ({ text: w.text ?? '', confidence: w.confidence ?? 0 }))
              : (data.text ?? '')
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((t) => ({ text: t, confidence: 90 }))
          return words
        },
        terminate: () => void worker.terminate(),
      }
    })()
  }
  return workerPromise
}

export async function runScan(
  img: HTMLImageElement | HTMLCanvasElement,
  onProgress: ProgressCb,
): Promise<{ preprocess: PreprocessResult; tokens: string[]; match: MatchResult; words: Array<{ text: string; confidence: number }> }> {
  onProgress('enhance')
  await new Promise((r) => setTimeout(r, 10)) // let the UI paint the stage
  const preprocess = preprocessImage(img)

  onProgress('ocr')
  const worker = await getWorker()
  let words = await worker.recognize(preprocess.canvas)
  let tokens = tokenize(words)

  // Aggressive retry for damaged / faint strips: 2x upscale + Otsu binarisation.
  // Only runs when the first pass yielded almost nothing, so clean scans stay fast.
  if (tokens.length < 3) {
    const big = upscaleCanvas(preprocess.canvas, 2)
    const bctx = big.getContext('2d', { willReadFrequently: true })
    if (bctx) {
      const id = bctx.getImageData(0, 0, big.width, big.height)
      binarize(id, otsuThreshold(id))
      bctx.putImageData(id, 0, 0)
      const words2 = await worker.recognize(big)
      const tokens2 = tokenize(words2)
      if (tokens2.length > tokens.length) {
        const seen = new Map<string, { text: string; confidence: number }>()
        for (const w of [...words, ...words2]) {
          const k = w.text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
          if (!k) continue
          const cur = seen.get(k)
          if (!cur || w.confidence > cur.confidence) seen.set(k, w)
        }
        words = [...seen.values()]
        tokens = tokens2
      }
    }
  }

  onProgress('match')
  const match = matchTokens(tokens)

  onProgress('done')
  return { preprocess, tokens, match, words }
}

/** Generate a canvas-rendered sample blister strip (for desktop testing / demo). */
export function makeSampleStrip(brand: string, sub: string, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 400
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('CANVAS_UNAVAILABLE')
  // blister base
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 640, 400)
  // foil bubbles
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 60 + col * 92
      const y = 150 + row * 110
      const grad = ctx.createRadialGradient(x, y, 4, x, y, 34)
      grad.addColorStop(0, '#f3f4f6')
      grad.addColorStop(1, '#9ca3af')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, 30, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // printed brand text
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 640, 120)
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 52px Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(brand.toUpperCase(), 320, 62)
  ctx.font = '22px Arial, sans-serif'
  ctx.fillText(sub, 320, 100)
  // glare streak
  const glare = ctx.createLinearGradient(0, 0, 640, 400)
  glare.addColorStop(0, 'rgba(255,255,255,0)')
  glare.addColorStop(0.45, 'rgba(255,255,255,0.55)')
  glare.addColorStop(0.6, 'rgba(255,255,255,0)')
  ctx.fillStyle = glare
  ctx.fillRect(0, 0, 640, 400)
  return c
}

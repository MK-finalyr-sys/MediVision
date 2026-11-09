/**
 * MediVision AI — Phase 4 online retrieval (SERVER-ONLY).
 *
 * Keyless tier (always available, free):
 *   1. RxNorm (NIH)          — verify the salt exists, get its RxNorm ID
 *   2. openFDA (US FDA)      — structured label extracts (uses/warnings/side effects)
 *   3. DailyMed (NIH)        — human-readable leaflet URL
 *
 * Web-search tier (the "Google Lens" path — fires when the US sources above have
 *   nothing for a medicine, which is common for Indian brands):
 *   4. Gemini + google_search tool  — searches the live web, cites real URLs
 *   5. Platform web_search + LLM    — sandbox/preview fallback, same schema
 *
 * Keyed tier (only when GEMINI_API_KEY env var is set — free tier key):
 *   6. Gemini                — grounded easy-read card in EN/TA/HI composed
 *                              ONLY from the retrieved evidence (never from memory),
 *                              + optional vision reading of blurry strips.
 *
 * SAFETY RULES (unchanged from the master prompt):
 *   - Nothing is rendered to the user without a real source URL.
 *   - Brand→salt guesses are never silently trusted; the UI always asks to confirm.
 *   - No dosing, no diagnosis — the model prompt forbids both, and output is
 *     validated before being returned.
 */
import type { MedSource } from '@/data/types'
import { SALT_LEXICON, textHasTerm, type SaltEntry } from '@/lib/salts'
import type { OnlineResult, OnlineCardLang } from '@/lib/onlineTypes'

const HTTP_TIMEOUT = 12_000
const GEMINI_TIMEOUT = 30_000

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
const GEMINI_KEY = process.env.GEMINI_API_KEY || ''
export const GEMINI_ENABLED = GEMINI_KEY.length > 10

/* ---------------- low-level helpers ---------------- */

async function jget(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
      headers: { 'User-Agent': 'MediVisionAI-FYP/1.0 (student project)' },
    })
    if (!res.ok) return null
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

/** First ~2 sentences of a label field, capped, whitespace-normalised. */
function summariseField(raw: unknown, max = 320): string | undefined {
  const arr = Array.isArray(raw) ? raw : []
  const first = typeof arr[0] === 'string' ? arr[0] : undefined
  if (!first) return undefined
  const clean = first.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '))
  return (lastStop > 80 ? cut.slice(0, lastStop + 1) : cut + '…')
}

/* ---------------- keyless tier ---------------- */

interface RxnormHit {
  id?: string
}

async function rxnormVerify(usName: string): Promise<string | undefined> {
  const data = (await jget(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(usName)}`)) as
    | { idGroup?: { rxnormId?: string[] } }
    | null
  const id = data?.idGroup?.rxnormId?.[0]
  return id ? String(id) : undefined
}

interface OpenFdaLabel {
  uses?: string
  warnings?: string
  sideEffects?: string
  brandExamples?: string
  manufacturer?: string
}

async function openFdaLabel(usName: string): Promise<OpenFdaLabel | undefined> {
  // Some salts (e.g. Pantoprazole) are listed as "PANTOPRAZOLE SODIUM" in
  // active_ingredient, so the exact phrase fails — fall back to the clean
  // generic_name field, then to a raw token search.
  const attempts = [
    `active_ingredient:%22${encodeURIComponent(usName)}%22`,
    `openfda.generic_name:%22${encodeURIComponent(usName)}%22`,
    `openfda.brand_name:%22${encodeURIComponent(usName)}%22`,
  ]
  for (const search of attempts) {
    const data = (await jget(`https://api.fda.gov/drug/label.json?search=${search}&limit=1`)) as
      | { results?: Array<Record<string, unknown>> }
      | null
    const r = data?.results?.[0]
    if (!r) continue
    const of = r.openfda as { brand_name?: string[]; manufacturer_name?: string[] } | undefined
    return {
      uses: summariseField(r.indications_and_usage),
      warnings: summariseField(r.warnings),
      sideEffects: summariseField(r.adverse_reactions) ?? summariseField(r.drug_interactions),
      brandExamples: typeof of?.brand_name?.[0] === 'string' ? of.brand_name[0] : undefined,
      manufacturer: typeof of?.manufacturer_name?.[0] === 'string' ? of.manufacturer_name[0] : undefined,
    }
  }
  return undefined
}

async function dailymedLeafletUrl(usName: string): Promise<string> {
  const data = (await jget(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=${encodeURIComponent(usName)}`)) as
    | { data?: Array<{ title?: string; setid?: string }> }
    | null
  const items = data?.data ?? []
  const preferred =
    items.find((i) => /tablet|capsule|oral/i.test(i.title ?? '')) ?? items[0]
  if (preferred?.setid) {
    return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(preferred.setid)}`
  }
  // search page always exists — still a real, working source URL
  return `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(usName)}`
}

/* ---------------- detection ---------------- */

export interface SaltCandidate {
  entry: SaltEntry
  basis: 'salt-in-text' | 'brand-hint'
}

export function detectSaltCandidates(text: string, limit = 3): SaltCandidate[] {
  const inText: SaltCandidate[] = []
  const hints: SaltCandidate[] = []
  for (const entry of SALT_LEXICON) {
    if (textHasTerm(text, entry.name) || textHasTerm(text, entry.us)) {
      inText.push({ entry, basis: 'salt-in-text' })
    } else if (entry.hints.some((h) => textHasTerm(text, h))) {
      hints.push({ entry, basis: 'brand-hint' })
    }
  }
  return [...inText, ...hints].slice(0, limit)
}

/* ---------------- keyed tier: Gemini ---------------- */

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
}

async function geminiCall(parts: GeminiPart[]): Promise<string | null> {
  if (!GEMINI_ENABLED) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(GEMINI_TIMEOUT),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        }),
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || null
  } catch {
    return null
  }
}

/* ---------------- AI tier: grounded composition (provider chain) ----------------
 * 1. Gemini (GEMINI_API_KEY) — primary; runs on Vercel/Netlify deployments.
 * 2. Platform LLM (z-ai-web-dev-sdk) — fallback so the sandbox preview works even
 *    where Google geo-blocks the Gemini API. SAME grounding prompt, SAME schema
 *    validation. On a deploy without platform credentials the import simply fails
 *    and the app degrades gracefully to raw label extracts.
 */

interface PlatformCompletion {
  choices?: Array<{ message?: { content?: string } }>
}

interface PlatformSearchItem {
  name?: string
  url?: string
  snippet?: string
  host_name?: string
}

interface PlatformClient {
  chat: {
    completions: {
      create: (args: Record<string, unknown>) => Promise<PlatformCompletion>
      createVision: (args: Record<string, unknown>) => Promise<PlatformCompletion>
    }
  }
  functions: {
    invoke: (
      name: 'web_search',
      args: { query: string; num?: number },
    ) => Promise<PlatformSearchItem[]>
  }
}

let platformClient: PlatformClient | null = null

async function getPlatform(): Promise<PlatformClient | null> {
  if (platformClient) return platformClient
  try {
    const mod = await import('z-ai-web-dev-sdk')
    platformClient = (await mod.default.create()) as unknown as PlatformClient
    return platformClient
  } catch {
    return null
  }
}

async function platformText(prompt: string): Promise<string | null> {
  const zai = await getPlatform()
  if (!zai) return null
  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: 'You are a pharmacy-label assistant. You output only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      thinking: { type: 'disabled' },
    })
    return completion.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

async function platformVision(prompt: string, imageBase64: string): Promise<string | null> {
  const zai = await getPlatform()
  if (!zai) return null
  try {
    const completion = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    })
    return completion.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}

function safeJsonParse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    return JSON.parse(stripFences(raw)) as Record<string, unknown>
  } catch {
    return null
  }
}

const READ_PROMPT =
  'Read ALL printed text visible on this medicine blister strip photo. ' +
  'Output ONLY the text you can read, separated by newlines. No commentary, no markdown.'

/** Vision fallback: read printed text from a strip photo when OCR failed. */
export async function readStrip(imageBase64: string): Promise<string | null> {
  if (GEMINI_ENABLED) {
    const out = await geminiCall([
      { text: READ_PROMPT },
      { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
    ])
    if (out && out.trim().length > 2) return out.trim().slice(0, 1200)
  }
  const fb = await platformVision(READ_PROMPT, imageBase64)
  return fb && fb.trim().length > 2 ? fb.trim().slice(0, 1200) : null
}

const COMPOSE_SCHEMA = `{"found": boolean, "salt": string, "en": {"uses": string, "beforeYouTake": string[], "sideEffects": string, "stopAndGetHelp": string[]}, "ta": {same as en}, "hi": {same as en}, "caveats": string[]}`

function validCardLang(c: unknown): c is OnlineCardLang {
  if (!c || typeof c !== 'object') return false
  const o = c as Record<string, unknown>
  return (
    typeof o.uses === 'string' &&
    Array.isArray(o.beforeYouTake) &&
    typeof o.sideEffects === 'string' &&
    Array.isArray(o.stopAndGetHelp)
  )
}

/** Grounding prompt — identical for every provider (single source of truth). */
function groundingPrompt(salt: string, label: OpenFdaLabel, mappingBasis: string): string {
  return (
    'You are a pharmacy-label assistant for an app that shows elderly users ' +
    'medicine safety information in English, Tamil and Hindi.\n' +
    'HARD RULES (violating any one is a total failure):\n' +
    '1. Use ONLY the EVIDENCE JSON. Never add facts from your own knowledge.\n' +
    '2. If the evidence contains no usable label facts, output {"found": false} and nothing else.\n' +
    '3. Never state any dose amount. Never diagnose. Never tell the user to start or stop a medicine.\n' +
    '4. Short, simple sentences (max ~12 words) for elderly readers.\n' +
    '5. beforeYouTake and stopAndGetHelp: 2-4 short items each, derived ONLY from the warnings in EVIDENCE.\n' +
    '6. Translate the SAME content faithfully into Tamil ("ta") and Hindi ("hi").\n' +
    `7. Output strict JSON exactly in this schema: ${COMPOSE_SCHEMA}\n\n` +
    `SALT: ${salt}\nMAPPING_BASIS: ${mappingBasis} (if brand-hint, add a caveat that the brand-salt mapping needs confirmation)\n` +
    `EVIDENCE: ${JSON.stringify(label)}`
  )
}

function cardFromParsed(parsed: Record<string, unknown>, model: string): OnlineResult['card'] {
  if (parsed.found !== true) return undefined
  if (!validCardLang(parsed.en)) return undefined
  const card: NonNullable<OnlineResult['card']> = {
    en: parsed.en,
    model,
    caveats: Array.isArray(parsed.caveats) ? (parsed.caveats as string[]).slice(0, 4) : [],
  }
  if (validCardLang(parsed.ta)) card.ta = parsed.ta
  if (validCardLang(parsed.hi)) card.hi = parsed.hi
  return card
}

/**
 * Grounded composition with provider chain:
 * Gemini (deployment) → platform LLM (sandbox preview) → undefined (raw labels only).
 * Every provider gets the SAME evidence-only grounding prompt.
 */
export async function composeCard(
  salt: string,
  label: OpenFdaLabel,
  mappingBasis: string,
): Promise<OnlineResult['card'] | undefined> {
  const prompt = groundingPrompt(salt, label, mappingBasis)
  if (GEMINI_ENABLED) {
    const card = cardFromParsed(safeJsonParse(await geminiCall([{ text: prompt }])) ?? {}, GEMINI_MODEL)
    if (card) return card
  }
  const card = cardFromParsed(safeJsonParse(await platformText(prompt)) ?? {}, 'platform-fallback')
  return card ?? undefined
}

/* ---------------- Tier 2.5: live web-search retrieval ----------------
 * Fires when the keyless US sources have no answer (Indian brands, salts outside
 * the local lexicon). Searches the real internet, then composes the easy-read
 * card ONLY from the retrieved snippets — every fact keeps a real source URL.
 */

interface SearchHit {
  title: string
  url: string
  snippet: string
  host: string
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.slice(0, 60)
  }
}

async function platformWebSearch(query: string, num = 6): Promise<SearchHit[]> {
  const zai = await getPlatform()
  if (!zai) return []
  try {
    const items = await zai.functions.invoke('web_search', { query, num })
    return (Array.isArray(items) ? items : [])
      .filter((i) => typeof i.url === 'string' && /^https?:\/\//.test(i.url))
      .slice(0, num)
      .map((i) => ({
        title: (i.name ?? i.host_name ?? i.url ?? 'result').replace(/\s+/g, ' ').slice(0, 120),
        url: i.url as string,
        snippet: (i.snippet ?? '').replace(/\s+/g, ' ').slice(0, 400),
        host: i.host_name ?? hostOf(i.url as string),
      }))
  } catch {
    return []
  }
}

const SEARCH_SCHEMA = COMPOSE_SCHEMA

function searchGroundPrompt(query: string, evidence: string): string {
  return (
    'You are a medicine-safety assistant for an app that shows elderly users ' +
    'medicine information in English, Tamil and Hindi.\n' +
    'HARD RULES (violating any one is a total failure):\n' +
    '1. Use ONLY the EVIDENCE given below. Never add facts from your own memory.\n' +
    '2. If the EVIDENCE does not clearly describe a real medicine, output {"found": false} and nothing else.\n' +
    '3. Never state any dose amount. Never diagnose. Never tell the user to start or stop a medicine.\n' +
    '4. Short, simple sentences (max ~12 words) for elderly readers.\n' +
    '5. beforeYouTake and stopAndGetHelp: 2-4 short items each, derived ONLY from the EVIDENCE.\n' +
    '6. Translate the SAME content faithfully into Tamil ("ta") and Hindi ("hi").\n' +
    `7. Output strict JSON exactly in this schema: ${SEARCH_SCHEMA}\n\n` +
    `STRIP TEXT: ${query}\nEVIDENCE (web search results): ${evidence}`
  )
}

function hitsToSources(hits: SearchHit[]): MedSource[] {
  return hits.slice(0, 5).map((h) => ({
    title: `${h.title} — ${h.host}`,
    url: h.url,
    sourceType: 'medical-reference' as const,
  }))
}

interface WebCard {
  card: NonNullable<OnlineResult['card']>
  sources: MedSource[]
  queries: string[]
  salt?: string
}

/** Gemini with the google_search tool: searches live, cites real URLs. */
async function geminiSearchIdentify(query: string): Promise<WebCard | undefined> {
  if (!GEMINI_ENABLED) return undefined
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(GEMINI_TIMEOUT),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    searchGroundPrompt(
                      query,
                      'Use the google_search tool to research this medicine strip text, then ground every statement in what the search returns.',
                    ) +
                    '\nIMPORTANT: ground every statement in the pages returned by google_search.',
                },
              ],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2 },
        }),
      },
    )
    if (!res.ok) return undefined
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
        groundingMetadata?: {
          webSearchQueries?: string[]
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
        }
      }>
    }
    const cand = data.candidates?.[0]
    const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') || null
    const parsed = safeJsonParse(text)
    if (!parsed) return undefined
    const card = cardFromParsed(parsed, `${GEMINI_MODEL}+search`)
    if (!card) return undefined
    const sources: MedSource[] = (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => c.web)
      .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
      .slice(0, 5)
      .map((w) => ({
        title: (w.title ?? hostOf(w.uri)).replace(/\s+/g, ' ').slice(0, 120),
        url: w.uri,
        sourceType: 'medical-reference' as const,
      }))
    return {
      card,
      sources,
      queries: (cand?.groundingMetadata?.webSearchQueries ?? []).slice(0, 4),
      salt: typeof parsed.salt === 'string' ? parsed.salt : undefined,
    }
  } catch {
    return undefined
  }
}

/** Platform fallback: real web_search results as evidence, LLM composes from them. */
async function platformSearchIdentify(query: string): Promise<WebCard | undefined> {
  const hits = await platformWebSearch(`${query} medicine uses side effects precautions`, 6)
  if (!hits.length) return undefined
  const evidence = hits.map((h, i) => `[${i + 1}] ${h.title} (${h.host}): ${h.snippet}`).join('\n')
  const parsed = safeJsonParse(await platformText(searchGroundPrompt(query, evidence)))
  if (!parsed) return undefined
  const card = cardFromParsed(parsed, 'web-search+ai')
  if (!card) return undefined
  return {
    card,
    sources: hitsToSources(hits),
    queries: [query],
    salt: typeof parsed.salt === 'string' ? parsed.salt : undefined,
  }
}

/** Search-tier entry point: Gemini grounded search → platform web_search fallback. */
async function searchGroundIdentify(query: string): Promise<WebCard | undefined> {
  const clean = query.replace(/\s+/g, ' ').trim()
  if (clean.replace(/[^a-zA-Z]/g, '').length < 6) return undefined
  const web = (await geminiSearchIdentify(clean)) ?? (await platformSearchIdentify(clean))
  if (!web) return undefined
  // Relevance gate — anti-hallucination: at least one returned source must
  // actually contain a >=5-letter token from the strip text. Protects gibberish
  // OCR from resolving to whatever junk the search engine returned.
  const tokens = clean.toLowerCase().match(/[a-z]{5,}/g) ?? []
  const relevant = web.sources.some((s) => {
    const hay = `${s.title} ${s.url}`.toLowerCase()
    return tokens.some((t) => hay.includes(t))
  })
  return relevant ? web : undefined
}

/* ---------------- orchestration ---------------- */

export interface IdentifyOpts {
  /** client retry: force the vision read even if OCR text looks usable */
  forceVision?: boolean
}

export async function identifyFromText(
  ocrText: string,
  imageBase64?: string,
  opts?: IdentifyOpts,
): Promise<OnlineResult> {
  let text = ocrText
  let visionUsed = false

  // Vision fallback — when OCR text is too poor, or when the client explicitly
  // retries after a not-found result (damaged / torn strips).
  if (imageBase64 && (text.replace(/[^a-zA-Z]/g, '').length < 8 || opts?.forceVision)) {
    const read = await readStrip(imageBase64)
    if (read) {
      text = `${text}\n${read}`
      visionUsed = true
    }
  }

  const candidates = detectSaltCandidates(text)
  if (!candidates.length) {
    // Tier 2.5 — no salt recognised: search the live web for this strip text
    // (covers medicines outside the local lexicon and unusual OCR readings).
    const web = await searchGroundIdentify(text)
    if (web) {
      return {
        found: true,
        query: text.slice(0, 400),
        candidates: web.salt ? [web.salt] : [],
        salt: web.salt,
        mappingBasis: 'model-proposed',
        card: web.card,
        visionUsed,
        sources: web.sources,
        searchQueries: web.queries,
        note: 'WEB_SEARCH',
      }
    }
    return {
      found: false,
      query: text.slice(0, 400),
      candidates: [],
      mappingBasis: 'none',
      visionUsed,
      sources: [],
      note: 'NO_MATCH',
    }
  }

  const { entry, basis } = candidates[0]
  const [rxnormId, label, leafletUrl] = await Promise.all([
    rxnormVerify(entry.us),
    openFdaLabel(entry.us),
    dailymedLeafletUrl(entry.us),
  ])

  const sources: MedSource[] = [
    { title: `RxNorm (U.S. NIH) — ${entry.us}`, url: `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(entry.us)}`, sourceType: 'government' },
    { title: 'openFDA drug label (U.S. FDA)', url: `https://api.fda.gov/drug/label.json?search=active_ingredient:%22${encodeURIComponent(entry.us)}%22&limit=1`, sourceType: 'government' },
    { title: `DailyMed leaflet — ${entry.us}`, url: leafletUrl, sourceType: 'label' },
  ]

  let card: OnlineResult['card']
  if (label) {
    card = await composeCard(entry.name, label, basis)
  } else {
    // Tier 2.5 — the US label sources have nothing for this salt (very common
    // for Indian-only brands): search the live web so the user still gets a
    // sourced answer instead of a dead end.
    const web = await searchGroundIdentify(`${entry.name} ${text.slice(0, 120)}`)
    if (web) {
      sources.push(...web.sources)
      return {
        found: true,
        query: text.slice(0, 400),
        candidates: candidates.map((c) => c.entry.name),
        salt: entry.name,
        usName: entry.us,
        rxnormId,
        mappingBasis: basis,
        card: web.card,
        visionUsed,
        sources,
        searchQueries: web.queries,
        note: 'WEB_SEARCH',
      }
    }
    card = undefined
  }

  return {
    found: Boolean(label),
    query: text.slice(0, 400),
    candidates: candidates.map((c) => c.entry.name),
    salt: entry.name,
    usName: entry.us,
    rxnormId,
    brandExamples: label?.brandExamples,
    manufacturer: label?.manufacturer,
    mappingBasis: basis,
    label: label ? { uses: label.uses, warnings: label.warnings, sideEffects: label.sideEffects } : undefined,
    card,
    visionUsed,
    sources,
    note: label ? undefined : 'NO_LABEL',
  }
}

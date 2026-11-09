import type { MedSource } from '@/data/types'

/**
 * Shared types for the Phase 4 online-retrieval layer.
 * Imported by both the server retriever and the client — type-only, no runtime code.
 */

export type MappingBasis =
  | 'salt-in-text' // salt/US name read directly on the strip (strongest)
  | 'brand-hint' // brand name on strip hints a salt (needs user confirmation)
  | 'model-proposed' // Gemini proposed the brand→salt map (needs confirmation)
  | 'none'

export interface OnlineCardLang {
  uses: string
  beforeYouTake: string[]
  sideEffects: string
  stopAndGetHelp: string[]
}

/** Entity extracted by the backend's trained CRF NER model */
export interface NerEntity {
  label: string // BRAND | SALT | STRENGTH | FORM | MFR
  text: string
  start: number
  end: number
}

/** Raw web-search hit kept as evidence (backend web fallback tier) */
export interface WebEvidence {
  title: string
  url: string
  snippet?: string
}

export interface OnlineResult {
  found: boolean
  query: string
  /** Salt candidates detected in the strip text */
  candidates: string[]
  salt?: string // display name, e.g. "Paracetamol"
  usName?: string // US naming used for lookup, e.g. "Acetaminophen"
  rxnormId?: string
  brandExamples?: string
  manufacturer?: string
  mappingBasis: MappingBasis
  /** raw label extracts (always in English, straight from openFDA) */
  label?: {
    uses?: string
    warnings?: string
    sideEffects?: string
  }
  /** Gemini-composed easy-read card (only when GEMINI_API_KEY is configured) */
  card?: {
    en?: OnlineCardLang
    ta?: OnlineCardLang
    hi?: OnlineCardLang
    caveats?: string[]
    model?: string
  }
  /** true when Gemini vision was used to read the strip photo */
  visionUsed?: boolean
  /** query strings actually issued to live web search (when the search tier ran) */
  searchQueries?: string[]
  /** Phase 4 backend additions — present when engine = 'backend-ner' */
  entities?: NerEntity[]
  nerModel?: string
  webEvidence?: WebEvidence[]
  /** which brain produced this result: the FastAPI backend or the built-in tier */
  engine?: 'backend-ner' | 'builtin'
  sources: MedSource[]
  note?: string
}

export interface OnlineCapability {
  online: boolean
  geminiEnabled: boolean
}

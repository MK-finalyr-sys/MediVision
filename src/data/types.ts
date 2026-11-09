export type SourceType = 'government' | 'medical-reference' | 'label'

export interface MedSource {
  title: string
  url: string
  sourceType: SourceType
}

export interface LocalizedMed {
  uses: string
  beforeYouTake: string[]
  sideEffects: string
  stopAndGetHelp: string[]
  preChecklist: string[]
}

export interface Medicine {
  id: string
  name: string
  aliases: string[]
  activeIngredient: string
  activeIngredient2: string | null
  strength: string
  form: string
  category: string
  tags: string[]
  sources: MedSource[]
  verified: false
  en: LocalizedMed
  ta: LocalizedMed
  hi: LocalizedMed
}

export interface Tip {
  id: string
  linkedTags: string[]
  priority: number
  en: { title: string; advice: string }
  ta: { title: string; advice: string }
  hi: { title: string; advice: string }
}

export type Lang = 'en' | 'ta' | 'hi'

export type Slot = 'Morning' | 'Afternoon' | 'Evening' | 'Night'

export interface SavedMed {
  id: string
  slots: Partial<Record<Slot, boolean>>
  savedAt: string
}

export interface DoseLog {
  medId: string
  dateISO: string
  slot: Slot
  status: 'taken' | 'missed'
  timestamp: string
}

export interface RecentScan {
  medId: string
  timestamp: string
}

export interface SavedMedsSchema {
  version: 1
  meds: SavedMed[]
  doseLogs: DoseLog[]
  recentScans: RecentScan[]
  lang: Lang
}

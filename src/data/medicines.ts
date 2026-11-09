import { MEDICINES_1 } from './medicines-1'
import { MEDICINES_2 } from './medicines-2'
import type { Medicine, Lang, LocalizedMed } from './types'

export const MEDICINES: Medicine[] = [...MEDICINES_1, ...MEDICINES_2]

/**
 * Clinical review status of localisations.
 * All Tamil and Hindi strings in this dataset are machine-drafted and marked
 * UNVERIFIED. The UI shows a visible "translation pending review" badge whenever
 * ta/hi content is displayed. English content follows public label-style
 * references (MedlinePlus / NHS) listed per record in `sources`.
 */
export const TRANSLATIONS_VERIFIED: Record<Lang, boolean> = { en: true, ta: false, hi: false }

export function localized(med: Medicine, lang: Lang): LocalizedMed {
  return med[lang] ?? med.en
}

export function findMed(id: string): Medicine | undefined {
  return MEDICINES.find((m) => m.id === id)
}

export function medSourcesText(med: Medicine, lang: Lang): string {
  const t = localized(med, lang)
  return `Uses: ${t.uses} | Before you take: ${t.beforeYouTake.join(' ')} | Side effects: ${t.sideEffects} | Stop and get help: ${t.stopAndGetHelp.join(' ')}`
}

// Unique tag vocabulary across the dataset (used by the tips engine)
export const ALL_TAGS: string[] = Array.from(new Set(MEDICINES.flatMap((m) => m.tags))).sort()

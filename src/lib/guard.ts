import { MEDICINES } from '@/data/medicines'
import type { Medicine, SavedMed } from '@/data/types'
import { saltTokens } from './storage'

export interface DupCheck {
  duplicate: boolean
  sharedSalts: string[]
  existing?: Medicine
}

/**
 * Duplicate-ingredient guard: compare the salts of the medicine being saved
 * against every saved medicine's salts. Overlap = possible double dose.
 */
export function checkDuplicate(med: Medicine, savedMeds: SavedMed[]): DupCheck {
  const newSalts = new Set([...saltTokens(med.activeIngredient), ...(med.activeIngredient2 ? saltTokens(med.activeIngredient2) : [])])
  for (const s of savedMeds) {
    if (s.id === med.id) continue // same medicine — not a cross-brand duplicate
    const other = MEDICINES.find((m) => m.id === s.id)
    if (!other) continue
    const otherSalts = new Set([...saltTokens(other.activeIngredient), ...(other.activeIngredient2 ? saltTokens(other.activeIngredient2) : [])])
    const shared = [...newSalts].filter((n) => otherSalts.has(n))
    if (shared.length > 0) {
      return { duplicate: true, sharedSalts: shared, existing: other }
    }
  }
  return { duplicate: false, sharedSalts: [] }
}

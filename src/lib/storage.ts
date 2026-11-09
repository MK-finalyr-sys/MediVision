import type { DoseLog, Lang, SavedMed, SavedMedsSchema, Slot } from '@/data/types'

const KEY = 'medivision_state_v1'

const SLOTS: Slot[] = ['Morning', 'Afternoon', 'Evening', 'Night']

function defaultState(): SavedMedsSchema {
  return { version: 1, meds: [], doseLogs: [], recentScans: [], lang: 'en' }
}

/** Defensive schema validation — corrupted or stale data resets to defaults. */
function validate(raw: unknown): SavedMedsSchema {
  const base = defaultState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return base
  const out: SavedMedsSchema = { ...base }

  if (Array.isArray(r.meds)) {
    out.meds = r.meds.filter(
      (m): m is SavedMed => !!m && typeof (m as SavedMed).id === 'string' && !!(m as SavedMed).slots && typeof (m as SavedMed).slots === 'object',
    )
  }
  if (Array.isArray(r.doseLogs)) {
    out.doseLogs = r.doseLogs.filter(
      (d): d is DoseLog =>
        !!d &&
        typeof (d as DoseLog).medId === 'string' &&
        typeof (d as DoseLog).dateISO === 'string' &&
        typeof (d as DoseLog).timestamp === 'string' &&
        SLOTS.includes((d as DoseLog).slot) &&
        ((d as DoseLog).status === 'taken' || (d as DoseLog).status === 'missed'),
    )
  }
  if (Array.isArray(r.recentScans)) {
    out.recentScans = r.recentScans.filter(
      (s): s is { medId: string; timestamp: string } => !!s && typeof (s as { medId?: string }).medId === 'string',
    )
  }
  if (r.lang === 'en' || r.lang === 'ta' || r.lang === 'hi') out.lang = r.lang as Lang
  return out
}

export function loadState(): SavedMedsSchema {
  if (typeof window === 'undefined') return defaultState()
  try {
    const raw = window.localStorage.getItem(KEY)
    return validate(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultState()
  }
}

export function saveState(state: SavedMedsSchema): boolean {
  if (typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export function todayISO(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function lastNDays(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const m = `${d.getMonth() + 1}`.padStart(2, '0')
    const day = `${d.getDate()}`.padStart(2, '0')
    out.push(`${d.getFullYear()}-${m}-${day}`)
  }
  return out
}

export function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Normalise a salt string like "Ibuprofen + Paracetamol" into lowercase salt tokens. */
export function saltTokens(salt: string): string[] {
  return salt
    .split(/[+&,/]| and /i)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 2)
}

export function buildShareText(
  medNames: Record<string, string>,
  meds: SavedMed[],
  logs: DoseLog[],
  days = 7,
): string {
  const dates = lastNDays(days)
  const lines: string[] = []
  lines.push('MediVision AI — 7-Day Medicine Summary')
  lines.push(`Period: ${dates[0]} to ${dates[dates.length - 1]}`)
  lines.push('')
  for (const m of meds) {
    const name = medNames[m.id] ?? m.id
    const relevant = logs.filter((l) => l.medId === m.id && dates.includes(l.dateISO))
    const taken = relevant.filter((l) => l.status === 'taken').length
    const missed = relevant.filter((l) => l.status === 'missed').length
    const activeSlots = SLOTS.filter((s) => m.slots[s])
    lines.push(`• ${name}`)
    if (activeSlots.length) lines.push(`  Slots: ${activeSlots.join(', ')}`)
    lines.push(`  Taken: ${taken}   Missed: ${missed}`)
  }
  if (!meds.length) lines.push('No medicines saved.')
  lines.push('')
  lines.push('Generated on-device by MediVision AI. Information only — not medical advice.')
  return lines.join('\n')
}

export const ALL_SLOTS = SLOTS

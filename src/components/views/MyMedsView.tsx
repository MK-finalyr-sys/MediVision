'use client'

import { useMemo, useState } from 'react'
import type { DoseLog, Lang, SavedMed, Slot } from '@/data/types'
import { findMed, localized } from '@/data/medicines'
import { t } from '@/lib/i18n'
import { ALL_SLOTS, buildShareText, dayLabel, lastNDays, todayISO } from '@/lib/storage'

export default function MyMedsView({
  lang,
  meds,
  doseLogs,
  onOpenMed,
  onToggleSlot,
  onSetDose,
  onRemove,
}: {
  lang: Lang
  meds: SavedMed[]
  doseLogs: DoseLog[]
  onOpenMed: (id: string) => void
  onToggleSlot: (medId: string, slot: Slot, on: boolean) => void
  onSetDose: (medId: string, slot: Slot, status: 'taken' | 'missed' | null) => void
  onRemove: (id: string) => void
}) {
  const today = todayISO()
  const days = useMemo(() => lastNDays(7), [])
  const [copied, setCopied] = useState(false)

  const doseFor = (medId: string, slot: Slot): 'taken' | 'missed' | null => {
    const log = doseLogs.find((l) => l.medId === medId && l.dateISO === today && l.slot === slot)
    return log?.status ?? null
  }

  const weekStats = (medId: string) => {
    const relevant = doseLogs.filter((l) => l.medId === medId && days.includes(l.dateISO))
    return { taken: relevant.filter((l) => l.status === 'taken').length, missed: relevant.filter((l) => l.status === 'missed').length }
  }

  const dailyRate = (iso: string): number => {
    const dayLogs = doseLogs.filter((l) => l.dateISO === iso)
    if (!dayLogs.length) return 0
    return dayLogs.filter((l) => l.status === 'taken').length / dayLogs.length
  }

  const share = async () => {
    const names: Record<string, string> = {}
    for (const m of meds) names[m.id] = findMed(m.id)?.name ?? m.id
    const text = buildShareText(names, meds, doseLogs, 7)
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }
    if (nav.share) {
      try {
        await nav.share({ text })
        return
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display font-extrabold text-2xl">{t(lang, 'medsTitle')}</h2>
        {meds.length > 0 && (
          <button onClick={share} className="min-h-[48px] px-4 rounded-xl bg-blue-700 text-white font-bold text-sm">
            📋 {t(lang, 'shareSummary')}
          </button>
        )}
      </div>
      {copied && (
        <p role="status" className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {t(lang, 'copied')}
        </p>
      )}

      {meds.length === 0 ? (
        <p className="bg-white rounded-2xl border border-slate-200 p-5 text-slate-600">{t(lang, 'medsEmpty')}</p>
      ) : (
        <>
          <section aria-labelledby="today-doses">
            <h3 id="today-doses" className="font-display font-bold text-lg mb-2">
              {t(lang, 'todayDoses')}
            </h3>
            <div className="space-y-3">
              {meds.map((m) => {
                const med = findMed(m.id)
                if (!med) return null
                const activeSlots = ALL_SLOTS.filter((s) => m.slots[s])
                return (
                  <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <button onClick={() => onOpenMed(m.id)} className="text-left min-w-0">
                        <span className="font-bold text-lg">{med.name}</span>
                        <span className="block text-sm text-slate-600 truncate">
                          {med.activeIngredient} · <span className="font-nums">{med.strength}</span>
                        </span>
                      </button>
                      <button
                        onClick={() => onRemove(m.id)}
                        aria-label={`${t(lang, 'remove')} ${med.name}`}
                        className="min-h-[44px] min-w-[44px] rounded-lg bg-slate-100 text-slate-600 font-bold"
                      >
                        🗑
                      </button>
                    </div>
                    {activeSlots.length === 0 ? (
                      <p className="text-sm text-slate-500 mt-2">{t(lang, 'noSlots')}</p>
                    ) : (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {activeSlots.map((s) => {
                          const status = doseFor(m.id, s)
                          return (
                            <div key={s} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                              <span className="font-semibold text-sm">{s}</span>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => onSetDose(m.id, s, status === 'taken' ? null : 'taken')}
                                  aria-pressed={status === 'taken'}
                                  className={`min-h-[44px] px-3 rounded-lg font-bold text-sm ${status === 'taken' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                                >
                                  ✓ {t(lang, 'taken')}
                                </button>
                                <button
                                  onClick={() => onSetDose(m.id, s, status === 'missed' ? null : 'missed')}
                                  aria-pressed={status === 'missed'}
                                  className={`min-h-[44px] px-3 rounded-lg font-bold text-sm ${status === 'missed' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                                >
                                  ✕ {t(lang, 'missed')}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section aria-labelledby="week-title" className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 id="week-title" className="font-display font-bold text-lg">
              {t(lang, 'weekTitle')}
            </h3>
            <div className="mt-3 flex items-end gap-2 h-28" role="img" aria-label="7 day adherence bar chart">
              {days.map((iso) => {
                const rate = dailyRate(iso)
                const h = Math.max(6, Math.round(rate * 100))
                const isToday = iso === today
                return (
                  <div key={iso} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-slate-100 rounded-t-lg relative" style={{ height: '72px' }}>
                      <div
                        className={`absolute bottom-0 w-full rounded-t-lg ${rate >= 0.8 ? 'bg-emerald-500' : rate > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
                        style={{ height: `${h}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-nums ${isToday ? 'text-blue-700 font-bold' : 'text-slate-500'}`}>{dayLabel(iso)}</span>
                  </div>
                )
              })}
            </div>
            {meds.map((m) => {
              const st = weekStats(m.id)
              const med = findMed(m.id)
              if (!med || (!st.taken && !st.missed)) return null
              return (
                <p key={m.id} className="mt-1 text-sm text-slate-600">
                  {med.name}: <span className="font-nums font-bold text-emerald-700">{st.taken}</span> {t(lang, 'taken')} ·{' '}
                  <span className="font-nums font-bold text-red-700">{st.missed}</span> {t(lang, 'missed')}
                </p>
              )
            })}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="font-display font-bold text-lg mb-2">{t(lang, 'slotsLabel')}</h3>
            <div className="space-y-3">
              {meds.map((m) => {
                const med = findMed(m.id)
                if (!med) return null
                return (
                  <div key={m.id}>
                    <p className="font-semibold text-sm mb-1">{med.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_SLOTS.map((s) => (
                        <button
                          key={s}
                          onClick={() => onToggleSlot(m.id, s, !m.slots[s])}
                          aria-pressed={!!m.slots[s]}
                          className={`min-h-[44px] px-3 rounded-lg text-sm font-bold border ${m.slots[s] ? 'bg-blue-700 text-white border-blue-700' : 'bg-slate-50 text-slate-700 border-slate-300'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

'use client'

import { useMemo } from 'react'
import type { Lang, RecentScan, SavedMed } from '@/data/types'
import { findMed } from '@/data/medicines'
import { TIPS, tipOfTheDay } from '@/data/tips'
import { t } from '@/lib/i18n'

export default function TipsView({
  lang,
  meds,
  recentScans,
  onOpenMed,
}: {
  lang: Lang
  meds: SavedMed[]
  recentScans: RecentScan[]
  onOpenMed: (id: string) => void
}) {
  const daily = useMemo(() => tipOfTheDay(), [])

  const myTags = useMemo(() => {
    const tags = new Set<string>()
    for (const m of meds) {
      const med = findMed(m.id)
      med?.tags.forEach((tg) => tags.add(tg))
    }
    for (const s of recentScans.slice(0, 5)) {
      const med = findMed(s.medId)
      med?.tags.forEach((tg) => tags.add(tg))
    }
    return [...tags]
  }, [meds, recentScans])

  const myTips = useMemo(
    () =>
      TIPS.filter((tip) => tip.linkedTags.some((tag) => myTags.includes(tag))).sort((a, b) => a.priority - b.priority),
    [myTags],
  )

  const taggedMeds = useMemo(() => {
    const byTag: Record<string, SavedMed[]> = {}
    for (const m of meds) {
      const med = findMed(m.id)
      if (!med) continue
      for (const tag of med.tags) {
        byTag[tag] = byTag[tag] ?? []
        byTag[tag].push(m)
      }
    }
    return byTag
  }, [meds])

  return (
    <div className="space-y-5">
      <h2 className="font-display font-extrabold text-2xl">{t(lang, 'tipsTitle')}</h2>

      <section aria-labelledby="tip-day" className="bg-blue-700 text-white rounded-2xl p-5">
        <p id="tip-day" className="text-xs font-bold uppercase tracking-wide text-blue-200">
          {t(lang, 'tipOfDay')}
        </p>
        <h3 className="font-display font-extrabold text-2xl mt-1">{daily[lang].title}</h3>
        <p className="mt-2 text-blue-50">{daily[lang].advice}</p>
      </section>

      <section aria-labelledby="tips-you">
        <h3 id="tips-you" className="font-display font-bold text-lg mb-2">
          {t(lang, 'tipsForYou')}
        </h3>
        {myTips.length === 0 ? (
          <p className="bg-white rounded-2xl border border-slate-200 p-5 text-slate-600">{t(lang, 'tipsEmpty')}</p>
        ) : (
          <div className="space-y-3">
            {myTips.map((tip) => {
              const linkedSaved = tip.linkedTags.flatMap((tag) => taggedMeds[tag] ?? [])
              const uniqueMeds = Array.from(new Map(linkedSaved.map((m) => [m.id, m])).values())
              return (
                <article key={tip.id} className="bg-white rounded-2xl border border-slate-200 p-4 border-l-4 border-l-blue-700">
                  <h4 className="font-bold text-lg">{tip[lang].title}</h4>
                  <p className="text-slate-700 mt-1">{tip[lang].advice}</p>
                  {uniqueMeds.length > 0 && (
                    <p className="mt-2 text-sm text-slate-500">
                      {t(lang, 'navMeds')}:{' '}
                      {uniqueMeds.map((m, i) => (
                        <span key={m.id}>
                          {i > 0 && ', '}
                          <button onClick={() => onOpenMed(m.id)} className="text-blue-700 underline font-semibold">
                            {findMed(m.id)?.name ?? m.id}
                          </button>
                        </span>
                      ))}
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

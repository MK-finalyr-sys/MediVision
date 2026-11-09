'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lang, Medicine, Slot } from '@/data/types'
import { localized, TRANSLATIONS_VERIFIED, MEDICINES } from '@/data/medicines'
import type { SavedMed } from '@/data/types'
import { t } from '@/lib/i18n'
import { checkDuplicate } from '@/lib/guard'
import { speak, stopSpeaking, voiceAvailable, type SpeechController } from '@/lib/tts'
import { ALL_SLOTS } from '@/lib/storage'
import { TIPS } from '@/data/tips'

export default function MedicineCard({
  med,
  lang,
  isSaved,
  savedMeds,
  savedSlots,
  onSave,
  onRemove,
  onBack,
  onOpenMed,
}: {
  med: Medicine
  lang: Lang
  isSaved: boolean
  savedMeds: SavedMed[]
  savedSlots: Partial<Record<Slot, boolean>>
  onSave: (med: Medicine, slots: Partial<Record<Slot, boolean>>) => void
  onRemove: (id: string) => void
  onBack: () => void
  onOpenMed: (med: Medicine) => void
}) {
  const content = localized(med, lang)
  const [slots, setSlots] = useState<Partial<Record<Slot, boolean>>>(() => ({
    Morning: savedSlots.Morning ?? false,
    Afternoon: savedSlots.Afternoon ?? false,
    Evening: savedSlots.Evening ?? false,
    Night: savedSlots.Night ?? false,
  }))
  const [dup, setDup] = useState<{ sharedSalts: string[]; existing: Medicine } | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const speechRef = useRef<SpeechController | null>(null)

  const sameSalts = useMemo(
    () => MEDICINES.filter((m) => m.id !== med.id && (m.activeIngredient === med.activeIngredient || m.activeIngredient2 === med.activeIngredient)),
    [med],
  )
  const tips = useMemo(() => TIPS.filter((tip) => tip.linkedTags.some((tag) => med.tags.includes(tag))), [med])
  const hasVoice = voiceAvailable(lang)
  const translationPending = !TRANSLATIONS_VERIFIED[lang]

  useEffect(() => {
    return () => stopSpeaking()
  }, [])

  const buildSpeechText = () => {
    const lines = [
      `${med.name}. ${med.activeIngredient}${med.activeIngredient2 ? ` plus ${med.activeIngredient2}` : ''}, ${med.strength}.`,
      content.uses,
      `Before you take it.`,
      ...content.beforeYouTake,
      `Common side effects. ${content.sideEffects}`,
      `Stop and get medical help if: ${content.stopAndGetHelp.join(' ')}`,
    ]
    return lines.join('. ')
  }

  const onListen = () => {
    if (speaking && !paused) {
      speechRef.current?.pause()
      setPaused(true)
      return
    }
    if (speaking && paused) {
      speechRef.current?.resume()
      setPaused(false)
      return
    }
    const ctrl = speak(buildSpeechText(), lang)
    if (ctrl) {
      speechRef.current = ctrl
      setSpeaking(true)
      setPaused(false)
      const timer = setInterval(() => {
        if (!ctrl.speaking()) {
          setSpeaking(false)
          setPaused(false)
          clearInterval(timer)
        }
      }, 500)
    }
  }

  const onStop = () => {
    stopSpeaking()
    speechRef.current = null
    setSpeaking(false)
    setPaused(false)
  }

  const confirmSave = () => {
    const res = checkDuplicate(med, savedMeds)
    if (res.duplicate && res.existing) {
      setDup({ sharedSalts: res.sharedSalts, existing: res.existing })
      return
    }
    onSave(med, slots)
  }

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="min-h-[44px] px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm"
      >
        ← {t(lang, 'navScan')}
      </button>

      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display font-extrabold text-3xl">{med.name}</h2>
            <p className="text-slate-700 mt-1 text-lg">
              {med.activeIngredient}
              {med.activeIngredient2 ? ` + ${med.activeIngredient2}` : ''} ·{' '}
              <span className="font-nums font-bold">{med.strength}</span> · {med.form}
            </p>
            <p className="text-sm text-slate-500">{med.category}</p>
          </div>
          <span className="text-xs font-bold bg-slate-100 text-slate-600 rounded-full px-3 py-1">{med.verified ? 'Verified' : 'Reference list'}</span>
        </div>

        {translationPending && (
          <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2" role="note">
            ⚠ {t(lang, 'translationsPending')}
          </p>
        )}

        {med.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {med.tags.map((tag) => (
              <span key={tag} className="text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200 rounded-full px-2.5 py-1">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Listen aloud */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={onListen}
            disabled={!hasVoice}
            className="min-h-[48px] px-5 rounded-xl bg-blue-700 text-white font-bold disabled:opacity-40"
          >
            🔊 {speaking ? (paused ? t(lang, 'resume') : t(lang, 'pause')) : t(lang, 'listen')}
          </button>
          {speaking && (
            <button onClick={onStop} className="min-h-[48px] px-5 rounded-xl bg-slate-200 text-slate-800 font-bold">
              ⏹ {t(lang, 'stop')}
            </button>
          )}
          {!hasVoice && <span className="text-xs text-slate-400 self-center">No {lang} voice installed on this device</span>}
        </div>
      </section>

      {/* Pre-consumption checklist */}
      <section className="bg-blue-700 text-white rounded-2xl p-5">
        <h3 className="font-display font-extrabold text-xl">{t(lang, 'cardChecklist')}</h3>
        <ul className="mt-3 space-y-2">
          {content.preChecklist.map((c, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span aria-hidden="true" className="mt-1">☐</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-display font-extrabold text-xl">{t(lang, 'cardUses')}</h3>
        <p className="mt-2 text-slate-800">{content.uses}</p>
      </section>

      <section className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
        <h3 className="font-display font-extrabold text-xl text-amber-900">{t(lang, 'cardBefore')}</h3>
        <ul className="mt-2 space-y-2 text-amber-950">
          {content.beforeYouTake.map((c, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span aria-hidden="true" className="mt-1">•</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-display font-extrabold text-xl">{t(lang, 'cardSide')}</h3>
        <p className="mt-2 text-slate-800">{content.sideEffects}</p>
      </section>

      <section className="bg-red-50 border-2 border-red-300 rounded-2xl p-5">
        <h3 className="font-display font-extrabold text-xl text-red-800">{t(lang, 'cardStop')}</h3>
        <ul className="mt-2 space-y-2 text-red-950">
          {content.stopAndGetHelp.map((c, i) => (
            <li key={i} className="flex gap-2 items-start">
              <span aria-hidden="true" className="mt-1">⚠</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Rule-based tips for this medicine */}
      {tips.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-display font-extrabold text-xl">{t(lang, 'tipsTitle')}</h3>
          <ul className="mt-3 space-y-3">
            {tips.map((tip) => (
              <li key={tip.id} className="border-l-4 border-blue-700 pl-3">
                <p className="font-bold">{tip[lang].title}</p>
                <p className="text-slate-700 text-sm">{tip[lang].advice}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Save + reminder slots */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-display font-extrabold text-xl">{t(lang, 'slotsLabel')}</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {ALL_SLOTS.map((s) => (
            <button
              key={s}
              onClick={() => setSlots((prev) => ({ ...prev, [s]: !prev[s] }))}
              aria-pressed={!!slots[s]}
              className={`min-h-[48px] rounded-xl font-bold border ${slots[s] ? 'bg-blue-700 text-white border-blue-700' : 'bg-slate-50 text-slate-700 border-slate-300'}`}
            >
              {slots[s] ? '✓ ' : ''}
              {s}
            </button>
          ))}
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          <button onClick={confirmSave} className="min-h-[52px] rounded-xl bg-blue-700 text-white text-lg font-bold px-4">
            {isSaved ? `✓ ${t(lang, 'saved')} — ${t(lang, 'save')}` : t(lang, 'save')}
          </button>
          {isSaved && (
            <button onClick={() => onRemove(med.id)} className="min-h-[52px] rounded-xl bg-slate-200 text-slate-800 font-bold px-4">
              {t(lang, 'remove')}
            </button>
          )}
        </div>
        {sameSalts.length > 0 && (
          <p className="mt-3 text-sm text-slate-600">
            Same active ingredient ({med.activeIngredient}):{' '}
            {sameSalts.slice(0, 4).map((m) => (
              <button key={m.id} onClick={() => onOpenMed(m)} className="text-blue-700 underline font-semibold mr-1">
                {m.name}
              </button>
            ))}
          </p>
        )}
      </section>

      {/* Sources */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-display font-extrabold text-xl">{t(lang, 'cardSources')}</h3>
        <ul className="mt-2 space-y-2">
          {med.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-blue-700 underline break-all"
              >
                {s.title}
              </a>
              <span className="text-xs text-slate-400 ml-2 uppercase">{s.sourceType}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-xs text-slate-500 pb-2">{t(lang, 'disclaimer')}</p>

      {/* Possible double dose modal */}
      {dup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="dup-title">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border-4 border-amber-400">
            <h3 id="dup-title" className="font-display font-extrabold text-2xl text-amber-800">
              ⚠ {t(lang, 'doubleDoseTitle')}
            </h3>
            <p className="mt-2">
              <strong>{t(lang, 'doubleDoseBody')}</strong>
            </p>
            <p className="mt-1 bg-amber-50 rounded-lg p-3 font-semibold text-amber-900">
              {dup.existing.name} ↔ {med.name}
              <span className="block font-nums text-sm">({dup.sharedSalts.join(', ')})</span>
            </p>
            <p className="mt-2 text-slate-700">{t(lang, 'doubleDoseDetail')}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setDup(null)} className="min-h-[52px] rounded-xl bg-blue-700 text-white font-bold">
                {t(lang, 'doNotSave')}
              </button>
              <button onClick={confirmSave} className="min-h-[52px] rounded-xl bg-slate-200 text-slate-800 font-bold">
                {t(lang, 'saveAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

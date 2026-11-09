'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DoseLog, Lang, Medicine, SavedMed, SavedMedsSchema, Slot } from '@/data/types'
import { findMed } from '@/data/medicines'
import { loadState, saveState, todayISO, ALL_SLOTS } from '@/lib/storage'
import { warmVoices, stopSpeaking } from '@/lib/tts'
import { t, LANG_LABELS } from '@/lib/i18n'
import ScanView from '@/components/views/ScanView'
import MedicineCard from '@/components/views/MedicineCard'
import MyMedsView from '@/components/views/MyMedsView'
import TipsView from '@/components/views/TipsView'
import ShareView from '@/components/views/ShareView'

type View = 'scan' | 'meds' | 'tips' | 'share'

export default function MediVisionApp() {
  const [state, setState] = useState<SavedMedsSchema | null>(null)
  const [view, setView] = useState<View>('scan')
  const [cardMed, setCardMed] = useState<Medicine | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await Promise.resolve()
      if (cancelled) return
      setState(loadState())
      warmVoices()
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(id)
  }, [toast])

  const lang: Lang = state?.lang ?? 'en'

  const update = useCallback((fn: (prev: SavedMedsSchema) => SavedMedsSchema) => {
    setState((prev) => {
      const base = prev ?? loadState()
      const next = fn(base)
      saveState(next)
      return next
    })
  }, [])

  const setLang = useCallback(
    (l: Lang) => {
      stopSpeaking()
      update((p) => ({ ...p, lang: l }))
    },
    [update],
  )

  const openMed = useCallback((med: Medicine) => {
    stopSpeaking()
    setCardMed(med)
    update((p) => ({
      ...p,
      recentScans: [{ medId: med.id, timestamp: new Date().toISOString() }, ...p.recentScans].slice(0, 12),
    }))
  }, [update])

  const openMedById = useCallback((id: string) => {
    const med = findMed(id)
    if (med) openMed(med)
  }, [openMed])

  const onScanned = useCallback(
    (med: Medicine) => {
      openMed(med)
      setView('scan')
    },
    [openMed],
  )

  const saveMed = useCallback(
    (med: Medicine, slots: Partial<Record<Slot, boolean>>) => {
      update((p) => {
        const exists = p.meds.some((m) => m.id === med.id)
        const meds: SavedMed[] = exists
          ? p.meds.map((m) => (m.id === med.id ? { ...m, slots } : m))
          : [...p.meds, { id: med.id, slots, savedAt: new Date().toISOString() }]
        return { ...p, meds }
      })
      setToast(t(lang, 'saved'))
    },
    [update, lang],
  )

  const removeMed = useCallback(
    (id: string) => {
      update((p) => ({ ...p, meds: p.meds.filter((m) => m.id !== id), doseLogs: p.doseLogs.filter((l) => l.medId !== id) }))
    },
    [update],
  )

  const toggleSlot = useCallback(
    (medId: string, slot: Slot, on: boolean) => {
      update((p) => ({
        ...p,
        meds: p.meds.map((m) => (m.id === medId ? { ...m, slots: { ...m.slots, [slot]: on } } : m)),
      }))
    },
    [update],
  )

  const setDose = useCallback(
    (medId: string, slot: Slot, status: 'taken' | 'missed' | null) => {
      const date = todayISO()
      update((p) => {
        const others = p.doseLogs.filter((l) => !(l.medId === medId && l.dateISO === date && l.slot === slot))
        const logs: DoseLog[] =
          status === null
            ? others
            : [...others, { medId, dateISO: date, slot, status, timestamp: new Date().toISOString() }]
        return { ...p, doseLogs: logs.slice(-400) }
      })
    },
    [update],
  )

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-lg">{t('en', 'loading')}</p>
      </div>
    )
  }

  const savedIds = new Set(state.meds.map((m) => m.id))

  const navItems: Array<{ key: View; label: string }> = [
    { key: 'scan', label: t(lang, 'navScan') },
    { key: 'meds', label: t(lang, 'navMeds') },
    { key: 'tips', label: t(lang, 'navTips') },
    { key: 'share', label: t(lang, 'navShare') },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center font-display font-extrabold text-lg shrink-0" aria-hidden="true">
                Rx
              </div>
              <div className="min-w-0">
                <h1 className="font-display font-extrabold text-lg leading-tight truncate">{t(lang, 'appName')}</h1>
                <p className="text-[11px] text-slate-500 leading-tight truncate hidden sm:block">{t(lang, 'tagline')}</p>
              </div>
            </div>
            <nav aria-label={t(lang, 'langLabel')} className="flex items-center rounded-lg border border-slate-300 overflow-hidden shrink-0">
              {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className={`px-2.5 py-2 min-h-[44px] text-sm font-semibold ${lang === l ? 'bg-blue-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </nav>
          </div>
          <nav className="mt-2 grid grid-cols-4 gap-1" aria-label="Main">
            {navItems.map((n) => (
              <button
                key={n.key}
                onClick={() => {
                  stopSpeaking()
                  setCardMed(null)
                  setView(n.key)
                }}
                aria-current={view === n.key && !cardMed ? 'page' : undefined}
                className={`min-h-[44px] rounded-lg text-sm font-semibold px-1 ${view === n.key && !cardMed ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 pb-24">
        {cardMed ? (
          <MedicineCard
            med={cardMed}
            lang={lang}
            isSaved={savedIds.has(cardMed.id)}
            savedMeds={state.meds}
            savedSlots={state.meds.find((m) => m.id === cardMed.id)?.slots ?? {}}
            onSave={saveMed}
            onRemove={removeMed}
            onBack={() => {
              stopSpeaking()
              setCardMed(null)
            }}
            onOpenMed={openMed}
          />
        ) : view === 'scan' ? (
          <ScanView lang={lang} onScanned={onScanned} onOpenMed={openMed} />
        ) : view === 'meds' ? (
          <MyMedsView
            lang={lang}
            meds={state.meds}
            doseLogs={state.doseLogs}
            onOpenMed={openMedById}
            onToggleSlot={toggleSlot}
            onSetDose={setDose}
            onRemove={removeMed}
          />
        ) : view === 'tips' ? (
          <TipsView lang={lang} meds={state.meds} recentScans={state.recentScans} onOpenMed={openMedById} />
        ) : (
          <ShareView lang={lang} />
        )}
      </main>

      {/* Persistent safety disclaimer footer */}
      <footer className="mt-auto bg-white border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-3 text-center text-xs text-slate-500">
          {t(lang, 'disclaimer')} · {t(lang, 'privacyNote')}
        </div>
      </footer>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}

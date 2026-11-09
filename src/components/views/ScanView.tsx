'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang, Medicine } from '@/data/types'
import { MEDICINES } from '@/data/medicines'
import { t } from '@/lib/i18n'
import { runScan, makeSampleStrip, blurScore, BLUR_THRESHOLD, matchTokens, tokenize, type MatchResult } from '@/lib/pipeline'
import { lookupOnline, checkCapability, checkBackend, type BackendInfo } from '@/lib/onlineClient'
import type { OnlineResult } from '@/lib/onlineTypes'

type Stage = 'idle' | 'enhance' | 'ocr' | 'match' | 'done' | 'error'

const SAMPLES = [
  { brand: 'Dolo 650', sub: 'Paracetamol Tablets IP 650 mg', color: '#dc2626', medId: 'dolo-650' },
  { brand: 'Pan 40', sub: 'Pantoprazole Tablets IP 40 mg', color: '#1d4ed8', medId: 'pan-40' },
  { brand: 'Glycomet 500', sub: 'Metformin Hydrochloride Tablets IP 500 mg', color: '#15803d', medId: 'glycomet-500' },
  { brand: 'Ecosprin 75', sub: 'Aspirin Gastro-resistant Tablets IP 75 mg', color: '#b45309', medId: 'ecosprin-75' },
]

export default function ScanView({
  lang,
  onScanned,
  onOpenMed,
}: {
  lang: Lang
  onScanned: (med: Medicine) => void
  onOpenMed: (med: Medicine) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('idle')
  const [liveOn, setLiveOn] = useState(false)
  const [cameraDenied, setCameraDenied] = useState(false)
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [tokens, setTokens] = useState<string[]>([])
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [lowMsg, setLowMsg] = useState(false)
  const [blurWarn, setBlurWarn] = useState<HTMLCanvasElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [failedStage, setFailedStage] = useState<Stage | null>(null)
  const [onlineStatus, setOnlineStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [onlineResult, setOnlineResult] = useState<OnlineResult | null>(null)
  const [onlineError, setOnlineError] = useState<string | null>(null)
  const [onlineCached, setOnlineCached] = useState(false)
  const [geminiOn, setGeminiOn] = useState(false)
  const [backend, setBackend] = useState<BackendInfo>({ connected: false })
  const [lastOcrText, setLastOcrText] = useState('')
  const lastImageRef = useRef<string | null>(null)

  const busy = stage === 'enhance' || stage === 'ocr' || stage === 'match'

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    setLiveOn(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  // Phase 4: is the AI tier (GEMINI_API_KEY) configured on the server?
  useEffect(() => {
    void checkCapability().then((cap) => setGeminiOn(cap.geminiEnabled))
  }, [])

  // Phase 4 backend: trained CRF NER model service (medivision-backend/).
  // When it is running, every online lookup goes through it; when not, the
  // built-in tier answers automatically — the app works either way.
  useEffect(() => {
    void checkBackend().then(setBackend)
  }, [])

  const startLive = useCallback(async () => {
    setCameraDenied(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      setLiveOn(true)
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
      })
    } catch {
      setCameraDenied(true)
      setLiveOn(false)
    }
  }, [])

  const executePipeline = useCallback(
    async (canvas: HTMLCanvasElement) => {
      setBlurWarn(null)
      setStage('enhance')
      try {
        const res = await runScan(canvas, (s) => setStage(s))
        setBefore(res.preprocess.beforeDataUrl)
        setAfter(res.preprocess.afterDataUrl)
        setTokens(res.tokens)
        setMatch(res.match)
        setLastOcrText(res.tokens.join(' '))
        lastImageRef.current = res.preprocess.afterDataUrl
        setStage('done')
        if (res.match.status === 'high' && res.match.med) {
          onScanned(res.match.med)
        } else if (res.match.status === 'low') {
          setLowMsg(true)
          setTimeout(() => searchRef.current?.focus(), 100)
        }
      } catch (e) {
        setError(e instanceof Error && e.message === 'OCR_FAIL' ? t(lang, 'ocrFailed') : t(lang, 'unknownError'))
        setFailedStage(stage)
        setStage('error')
      }
    },
    [lang, onScanned, stage],
  )

  const processCanvas = useCallback(
    async (canvas: HTMLCanvasElement) => {
      setError(null)
      setLowMsg(false)
      setMatch(null)
      setTokens([])
      setBefore(null)
      setAfter(null)
      setFailedStage(null)
      // Blur gate — advisory, with explicit retake option
      if (blurScore(canvas) < BLUR_THRESHOLD) {
        setBlurWarn(canvas)
        return
      }
      await executePipeline(canvas)
    },
    [executePipeline],
  )

  const captureLive = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const c = document.createElement('canvas')
    c.width = video.videoWidth
    c.height = video.videoHeight
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    stopCamera()
    void processCanvas(c)
  }, [stopCamera, processCanvas])

  const onFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        if (ctx) ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        void processCanvas(c)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        setError(t(lang, 'unknownError'))
      }
      img.src = url
    },
    [processCanvas, lang],
  )

  const runSample = useCallback(
    (sample: (typeof SAMPLES)[number]) => {
      const c = makeSampleStrip(sample.brand, sample.sub, sample.color)
      void processCanvas(c)
    },
    [processCanvas],
  )

  // Phase 4 — online retrieval via /api/identify (server-side, sources attached).
  // If the first pass finds nothing and we still have the strip photo, retry once
  // with forced AI vision — this is what rescues heavily damaged strips.
  const runOnlineSearch = useCallback(async (text: string, forceVision = false) => {
    const q = text.trim()
    if (q.length < 2) return
    setOnlineStatus('loading')
    setOnlineError(null)
    setOnlineResult(null)
    const out = await lookupOnline(q, lastImageRef.current ?? undefined, forceVision)
    if ('error' in out) {
      setOnlineError(out.error)
      setOnlineStatus('error')
    } else {
      setOnlineResult(out.result)
      setOnlineCached(out.cached)
      setOnlineStatus('done')
      if (!out.result.found && !forceVision && !out.result.visionUsed && lastImageRef.current) {
        await runOnlineSearch(text, true)
      }
    }
  }, [])

  // Manual search with the same fuzzy matcher
  const searchResults = query.trim().length >= 2 ? matchTokens(tokenize([{ text: query, confidence: 100 }])) : null
  const searchList =
    searchResults && searchResults.med
      ? [searchResults.med]
      : query.trim().length >= 2
        ? MEDICINES.filter((m) => {
            const q = query.toLowerCase()
            return (
              m.name.toLowerCase().includes(q) ||
              m.aliases.some((a) => a.includes(q)) ||
              m.activeIngredient.toLowerCase().includes(q)
            )
          }).slice(0, 6)
        : []

  const stageItems: Array<{ key: Stage; label: string }> = [
    { key: 'enhance', label: t(lang, 'stageEnhance') },
    { key: 'ocr', label: t(lang, 'stageReading') },
    { key: 'match', label: t(lang, 'stageMatching') },
    { key: 'done', label: t(lang, 'stageDone') },
  ]

  return (
    <div className="space-y-5">
      <section aria-labelledby="scan-title">
        <h2 id="scan-title" className="font-display font-extrabold text-2xl">
          {t(lang, 'scanTitle')}
        </h2>
        <p className="text-slate-600 mt-1">{t(lang, 'scanHelp')}</p>
        {backend.connected && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-full px-3 py-1">
            🧠 {t(lang, 'backendOn')}
            {backend.ner ? ` · ${backend.ner}` : ''}
          </p>
        )}
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        {/* Capture controls */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.currentTarget.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="w-full min-h-[56px] rounded-xl bg-blue-700 text-white text-lg font-bold px-4 disabled:opacity-50"
          >
            📷 {t(lang, 'scanCamera')}
          </button>
          {liveOn ? (
            <div className="space-y-2">
              <div className="rounded-xl overflow-hidden bg-black">
                <video ref={videoRef} playsInline muted className="w-full max-h-72 object-contain" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={captureLive} className="min-h-[48px] rounded-xl bg-blue-700 text-white font-bold px-3">
                  {t(lang, 'capture')}
                </button>
                <button onClick={stopCamera} className="min-h-[48px] rounded-xl bg-slate-200 text-slate-800 font-bold px-3">
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startLive}
              disabled={busy}
              className="w-full min-h-[48px] rounded-xl bg-slate-100 text-slate-800 font-bold px-4 disabled:opacity-50"
            >
              🎥 {t(lang, 'scanLive')}
            </button>
          )}
          {cameraDenied && (
            <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {t(lang, 'cameraDenied')}
            </p>
          )}
          <p className="text-xs text-slate-400">{t(lang, 'privacyNote')}</p>
        </div>

        {/* Sample test bench */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-display font-bold text-base mb-2">{t(lang, 'scanSamples')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.medId}
                onClick={() => runSample(s)}
                disabled={busy}
                className="min-h-[48px] rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 font-semibold text-sm px-2 disabled:opacity-50"
              >
                {s.brand}
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">Pipeline</p>
            <ol className="space-y-1">
              {stageItems.map((s) => {
                const order: Stage[] = ['enhance', 'ocr', 'match', 'done']
                const currentIdx = order.indexOf(stage === 'error' ? (failedStage ?? 'error') : stage)
                const idx = order.indexOf(s.key)
                const active = stage === s.key
                const complete = currentIdx > idx
                return (
                  <li key={s.key} className={`text-sm flex items-center gap-2 ${active ? 'text-blue-700 font-bold' : complete ? 'text-emerald-700' : 'text-slate-400'}`}>
                    <span aria-hidden="true">{complete ? '✓' : active ? '●' : '○'}</span>
                    {s.label}
                  </li>
                )
              })}
            </ol>
            {stage === 'error' && (
              <div className="mt-2">
                <p role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-2">
                  {t(lang, 'stageFailed')}: {error}
                </p>
                <button onClick={() => fileRef.current?.click()} className="mt-2 min-h-[44px] px-3 rounded-lg bg-blue-700 text-white font-bold text-sm">
                  {t(lang, 'retry')}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Blur warning gate */}
      {blurWarn && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4" role="alert">
          <p className="text-amber-900 font-bold">{t(lang, 'blurryWarning')}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="min-h-[48px] rounded-xl bg-blue-700 text-white font-bold"
            >
              {t(lang, 'retry')}
            </button>
            <button onClick={() => void executePipeline(blurWarn)} className="min-h-[48px] rounded-xl bg-slate-200 text-slate-800 font-bold">
              {t(lang, 'useAnyway')}
            </button>
          </div>
        </div>
      )}

      {/* Before / after + tokens */}
      {(before || after) && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="grid grid-cols-2 gap-3">
            {before && (
              <figure>
                <figcaption className="text-xs font-bold text-slate-500 uppercase mb-1">{t(lang, 'before')}</figcaption>
                <img src={before} alt="original scan" className="rounded-lg border border-slate-200 w-full" />
              </figure>
            )}
            {after && (
              <figure>
                <figcaption className="text-xs font-bold text-blue-700 uppercase mb-1">{t(lang, 'after')}</figcaption>
                <img src={after} alt="enhanced scan" className="rounded-lg border border-slate-200 w-full" />
              </figure>
            )}
          </div>
          {tokens.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t(lang, 'ocrTokens')}</p>
              <div className="flex flex-wrap gap-1.5">
                {tokens.slice(0, 24).map((tok) => (
                  <span key={tok} className="font-nums text-xs bg-slate-100 border border-slate-200 rounded px-2 py-1">
                    {tok}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Medium confidence confirm gate */}
      {match?.status === 'medium' && match.med && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4" role="alert">
          <p className="text-amber-900 font-bold text-lg">{t(lang, 'matchMedium')}</p>
          <p className="text-amber-900 mt-1">
            {match.med.name} · {match.med.activeIngredient}
            {match.med.activeIngredient2 ? ` + ${match.med.activeIngredient2}` : ''} · {match.med.strength}
          </p>
          <p className="font-nums text-sm text-amber-800 mt-1">
            {t(lang, 'confidence')}: {Math.round(match.score * 100)}%
          </p>
          <p className="mt-2 font-semibold">{t(lang, 'matchQuestion')}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => onScanned(match.med!)} className="min-h-[48px] rounded-xl bg-blue-700 text-white font-bold">
              {t(lang, 'yes')}
            </button>
            <button
              onClick={() => {
                setMatch(null)
                setLowMsg(true)
                searchRef.current?.focus()
              }}
              className="min-h-[48px] rounded-xl bg-slate-200 text-slate-800 font-bold"
            >
              {t(lang, 'no')}
            </button>
          </div>
        </div>
      )}

      {/* Low confidence — never guess; offer the free online databases */}
      {lowMsg && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 space-y-3" role="alert">
          <p className="text-red-900 font-bold text-lg">{t(lang, 'matchLow')}</p>
          <button
            onClick={() => void runOnlineSearch(lastOcrText)}
            disabled={onlineStatus === 'loading' || lastOcrText.trim().length < 2}
            className="min-h-[48px] w-full rounded-xl bg-blue-700 text-white font-bold px-4 disabled:opacity-50"
          >
            {onlineStatus === 'loading' ? `… ${t(lang, 'onlineSearching')}` : `🌐 ${t(lang, 'onlineBtn')}`}
          </button>
          <p className="text-xs text-red-700">{t(lang, 'onlineNeedsInternet')}</p>
        </div>
      )}

      {/* Phase 4 — online database result */}
      {onlineStatus === 'done' && onlineResult && (
        <OnlineResultPanel lang={lang} result={onlineResult} cached={onlineCached} />
      )}
      {onlineStatus === 'error' && onlineError && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4" role="alert">
          <p className="text-amber-900 font-bold">{t(lang, 'onlineNeedsInternet')}</p>
        </div>
      )}

      {/* Manual search — always available */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4">
        <label htmlFor="manual-search" className="font-display font-bold text-base block mb-2">
          {t(lang, 'manualSearch')}
        </label>
        <input
          id="manual-search"
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t(lang, 'searchPlaceholder')}
          className="w-full min-h-[48px] rounded-xl border border-slate-300 px-4 text-lg"
        />
        {query.trim().length >= 2 && (
          <ul className="mt-3 space-y-2 max-h-96 overflow-y-auto">
            {searchList.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => onOpenMed(m)}
                  className="w-full min-h-[56px] text-left rounded-xl border border-slate-200 hover:border-blue-700 hover:bg-blue-50 px-4 py-2"
                >
                  <span className="font-bold">{m.name}</span>
                  <span className="block text-sm text-slate-600">
                    {m.activeIngredient}
                    {m.activeIngredient2 ? ` + ${m.activeIngredient2}` : ''} · {m.strength}
                  </span>
                </button>
              </li>
            ))}
            {searchList.length === 0 && (
              <li className="py-2 space-y-2">
                <p className="text-slate-600">{t(lang, 'noSearchResults')}</p>
                <button
                  onClick={() => void runOnlineSearch(query)}
                  disabled={onlineStatus === 'loading'}
                  className="min-h-[48px] w-full rounded-xl bg-blue-700 text-white font-bold px-4 disabled:opacity-50"
                >
                  {onlineStatus === 'loading' ? `… ${t(lang, 'onlineSearching')}` : `🌐 ${t(lang, 'onlineBtn')}`}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * Phase 4 online result — renders ONLY verified, sourced content:
 * - RxNorm verification badge (salt exists in NIH RxNorm)
 * - Gemini easy-read card when configured (composed from the sources only)
 * - Raw label extracts otherwise (always English, straight from openFDA)
 * - Real source URLs for every fact shown
 */
function OnlineResultPanel({
  lang,
  result,
  cached,
}: {
  lang: Lang
  result: OnlineResult
  cached: boolean
}) {
  const card = result.card ? (result.card[lang] ?? result.card.en) : undefined
  const needsConfirm = result.mappingBasis !== 'salt-in-text'
  const isWebCard = Boolean(result.card?.model?.includes('search'))
  return (
    <section className="bg-white rounded-2xl border-2 border-blue-200 p-4 space-y-4" aria-live="polite">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display font-extrabold text-xl">{result.salt ?? result.query.slice(0, 40)}</h3>
          {result.rxnormId && (
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-full px-3 py-1">
              ✓ {t(lang, 'onlineVerified')}
            </span>
          )}
          {cached && <span className="text-xs text-slate-500">{t(lang, 'onlineCached')}</span>}
        </div>
        {needsConfirm && (
          <p className="mt-2 text-amber-900 bg-amber-50 border border-amber-300 rounded-lg p-2 text-sm font-semibold">
            ⚠ {t(lang, 'confirmBrand')} <b>{result.salt}</b> — {t(lang, 'onlineBrandGuess')}
          </p>
        )}
        {result.visionUsed && <p className="text-xs text-slate-500 mt-1">{t(lang, 'aiVisionNote')}</p>}
        {result.engine === 'backend-ner' && result.entities && result.entities.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t(lang, 'nerEntities')}</p>
            <div className="flex flex-wrap gap-1.5">
              {result.entities.slice(0, 10).map((e, i) => (
                <span key={i} className="text-xs bg-slate-100 border border-slate-200 rounded px-2 py-1">
                  <b>{e.label}</b> {e.text}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {!result.found && <p className="text-red-900 font-bold text-lg">{t(lang, 'onlineNotFound')}</p>}

      {/* AI easy-read card — grounded in the sources below, never free-generated */}
      {card && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display font-bold">{t(lang, 'aiCardTitle')}</p>
            {lang !== 'en' && (
              <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-full px-3 py-1">
                {t(lang, 'translationsPending')}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600">{t(lang, isWebCard ? 'aiWebNote' : 'aiCardNote')}</p>
          <p>
            <b>{t(lang, 'cardUses')}:</b> {card.uses}
          </p>
          {card.beforeYouTake.length > 0 && (
            <div>
              <b>{t(lang, 'cardBefore')}:</b>
              <ul className="list-disc pl-5">
                {card.beforeYouTake.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          <p>
            <b>{t(lang, 'cardSide')}:</b> {card.sideEffects}
          </p>
          {card.stopAndGetHelp.length > 0 && (
            <div>
              <b>{t(lang, 'cardStop')}:</b>
              <ul className="list-disc pl-5">
                {card.stopAndGetHelp.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Keyless tier — raw label extracts, always in English from openFDA */}
      {!card && result.label && (
        <div className="rounded-xl border border-slate-200 p-3 space-y-2 text-slate-800">
          <p className="font-display font-bold">{t(lang, 'onlineLabel')}</p>
          {result.label.uses && (
            <p>
              <b>{t(lang, 'cardUses')}:</b> {result.label.uses}
            </p>
          )}
          {result.label.warnings && (
            <p>
              <b>{t(lang, 'cardBefore')}:</b> {result.label.warnings}
            </p>
          )}
          {result.label.sideEffects && (
            <p>
              <b>{t(lang, 'cardSide')}:</b> {result.label.sideEffects}
            </p>
          )}
        </div>
      )}

      {/* Sources — every fact shown above traces to these */}
      {result.searchQueries && result.searchQueries.length > 0 && (
        <p className="text-xs text-slate-500">
          🔍 {t(lang, 'webSearched')}: {result.searchQueries.join(' · ')}
        </p>
      )}
      {result.sources.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase mb-1">{t(lang, 'cardSources')}</p>
          <ul className="space-y-1">
            {result.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 underline break-all text-sm"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-400">
        {t(lang, 'onlineDataBy')} · {t(lang, 'disclaimer')}
      </p>
    </section>
  )
}

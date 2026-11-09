'use client'

import { useEffect, useState } from 'react'
import type { Lang } from '@/data/types'
import { t } from '@/lib/i18n'
import QRCode from 'qrcode'

const DEMO_SCRIPT: Record<Lang, string[]> = {
  en: [
    '1. Open MediVision AI on your phone (this link).',
    '2. Tap "Scan Medicine Strip" and photograph a real blister strip (or tap a sample strip).',
    '3. Watch the pipeline: enhance → read text → match, with the before/after images.',
    '4. High confidence opens the medicine card. Medium asks you to confirm. Low says "ask your pharmacist" — it never guesses.',
    '5. Save the medicine; try saving Dolo 650 and then Crocin (same salt) to trigger the Possible Double Dose alert.',
    '6. Switch language to தமிழ் or हिंदी and tap Listen for text-to-speech.',
    '7. My Meds: mark a dose Taken/Missed and show the 7-day caregiver summary.',
  ],
  ta: [
    '1. போனில் MediVision AI திறக்கவும்.',
    '2. "மருந்து துண்டு ஸ்கேன்" தட்டி உண்மையான பிளிஸ்டர் புகைப்படம் எடுக்கவும் (அல்லது மாதிரி துண்டு).',
    '3. பைப்லைனை பாருங்கள்: மேம்படுத்தல் → உரை படித்தல் → பொருத்துதல்.',
    '4. உயர் நம்பிக்கை என்றால் மருந்து அட்டை திறக்கும்; குறைந்த நம்பிக்கை "மருந்தாளரை கேளுங்கள்" என்று சொல்லும்.',
    '5. Dolo 650 மற்றும் Crocin சேமித்து "இரட்டை அளவு" எச்சரிக்கையை பாருங்கள்.',
    '6. மொழியை மாற்றி Listen தட்டவும்.',
    '7. என் மருந்துகளில் அளவு குறித்து 7 நாள் சுருக்கம் பாருங்கள். [TODO: Verify translation]',
  ],
  hi: [
    '1. फोन पर MediVision AI खोलें।',
    '2. "दवा पट्टी स्कैन" दबाकर असली ब्लिस्टर की फोटो लें (या नमूना पट्टी दबाएँ)।',
    '3. पाइपलाइन देखें: सुधार → टेक्स्ट पढ़ना → मैच।',
    '4. ऊँचा विश्वास दवा कार्ड खोलता है; कम विश्वास "फार्मासिस्ट से पूछें" कहता है — कभी अंदाज़ा नहीं।',
    '5. Dolo 650 और Crocin सेव करके "दोहरी खुराक" अलर्ट देखें।',
    '6. भाषा बदलकर Listen दबाएँ।',
    '7. मेरी दवाओं में खुराक दर्ज कर 7-दिन सारांश दिखाएँ। [TODO: Verify translation]',
  ],
}

export default function ShareView({ lang }: { lang: Lang }) {
  const [qr, setQr] = useState<string | null>(null)
  const [url, setUrl] = useState('')

  useEffect(() => {
    let cancelled = false
    const u = window.location.href
    QRCode.toDataURL(u, { width: 512, margin: 2, color: { dark: '#0F172A', light: '#FFFFFF' } })
      .then((dataUrl) => {
        if (cancelled) return
        setQr(dataUrl)
        setUrl(u)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const downloadQR = () => {
    if (!qr) return
    const a = document.createElement('a')
    a.href = qr
    a.download = 'medivision-ai-qr.png'
    a.click()
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display font-extrabold text-2xl">{t(lang, 'shareTitle')}</h2>
      <p className="text-slate-600">{t(lang, 'shareHelp')}</p>

      <section className="bg-white rounded-2xl border border-slate-200 p-5 text-center">
        {qr ? (
          <img src={qr} alt="QR code to open MediVision AI" className="mx-auto rounded-xl border border-slate-200 w-56 h-56" />
        ) : (
          <div className="mx-auto w-56 h-56 rounded-xl bg-slate-100 animate-pulse" />
        )}
        <p className="font-nums text-xs text-slate-500 mt-3 break-all">{url}</p>
        <button
          onClick={downloadQR}
          disabled={!qr}
          className="mt-3 min-h-[48px] px-5 rounded-xl bg-blue-700 text-white font-bold disabled:opacity-40"
        >
          ⬇ {t(lang, 'downloadQR')}
        </button>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-display font-bold text-lg">{t(lang, 'demoScript')}</h3>
        <ol className="mt-2 space-y-2 list-decimal list-inside text-slate-800">
          {DEMO_SCRIPT[lang].map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-display font-bold text-lg mb-2">Privacy & safety</h3>
        <ul className="space-y-2 text-slate-700">
          <li>• {t(lang, 'privacyNote')}</li>
          <li>• No diagnosis, no dosage recommendations, no ordering.</li>
          <li>• Uncertain scans always say “ask your pharmacist”.</li>
          <li>• Dataset: 40 common Indian medicines; every card links its public reference sources.</li>
        </ul>
      </section>
    </div>
  )
}

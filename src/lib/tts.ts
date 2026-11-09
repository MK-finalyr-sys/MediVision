import type { Lang } from '@/data/types'

/**
 * Web Speech API wrapper for the Listen button.
 * Picks the best available voice per language (prefers Indian locales),
 * degrades gracefully when a voice is missing.
 */

export interface SpeechController {
  stop: () => void
  pause: () => void
  resume: () => void
  speaking: () => boolean
}

const LANG_TAGS: Record<Lang, string[]> = {
  en: ['en-IN', 'en-GB', 'en-US', 'en'],
  ta: ['ta-IN', 'ta'],
  hi: ['hi-IN', 'hi'],
}

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  for (const tag of LANG_TAGS[lang]) {
    const exact = voices.find((v) => v.lang.toLowerCase() === tag.toLowerCase())
    if (exact) return exact
  }
  for (const tag of LANG_TAGS[lang]) {
    const prefix = voices.find((v) => v.lang.toLowerCase().startsWith(tag.slice(0, 2)))
    if (prefix) return prefix
  }
  return null
}

export function voiceAvailable(lang: Lang): boolean {
  return pickVoice(lang) !== null
}

export function speak(text: string, lang: Lang, rate = 0.95): SpeechController | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(lang)
  if (voice) utter.voice = voice
  utter.lang = voice?.lang ?? LANG_TAGS[lang][0]
  utter.rate = rate
  window.speechSynthesis.speak(utter)
  return {
    stop: () => window.speechSynthesis.cancel(),
    pause: () => window.speechSynthesis.pause(),
    resume: () => window.speechSynthesis.resume(),
    speaking: () => window.speechSynthesis.speaking,
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

/** Voices load asynchronously in Chrome — warm them up on app start. */
export function warmVoices(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.getVoices()
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices()
    }
  }
}

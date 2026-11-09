# MediVision AI — "Know what you take. Think before you take it."

A mobile-first **PWA** for elderly users and caregivers: scan a medicine blister strip with the
phone camera, read plain-language safety information in **English / Tamil / Hindi** (with
text-to-speech), get a **Possible Double Dose** alert when two brands share the same active
ingredient, and keep a 7-day adherence log with a shareable caregiver summary.

**Zero-key baseline**: OCR runs 100% in the browser (Tesseract.js + Canvas preprocessing).
No API keys, no accounts, no cloud, no tracking. All data stays in `localStorage` on the device.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS 4, Calm Medical Blue (#1D4ED8) / Alabaster White, WCAG-AA+ contrast |
| Fonts | Plus Jakarta Sans (display), Public Sans (body ≥18px), JetBrains Mono (numbers) |
| OCR | tesseract.js (`eng`, lazy worker) |
| Fuzzy match | fuse.js multi-token scoring |
| Speech | Web Speech API (`en-IN` / `ta-IN` / `hi-IN`, graceful disable) |
| Persistence | `localStorage` (schema-validated), service worker offline shell |
| QR | qrcode (client-side PNG) |

## Phase 4 — Online retrieval (active, free)

The knowledge layer is no longer capped at the bundled 40 medicines. Any scan that
fails the local match is checked against **free government medical databases**, then —
if those have nothing (common for Indian brands) — against a **live web-search tier**
(the "Google Lens" path), and an optional **free AI key** adds easy-read cards in
EN/TA/HI + vision reading of damaged strips.

**Phase 4 backend (`medivision-backend/`, FastAPI + trained CRF NER model):** the
dedicated brain for this tier. The proxy route `/api/ai/identify` tries the backend
first — its CRF model extracts BRAND/SALT/STRENGTH/FORM entities from the noisy OCR
text (entity F1 ≈ 0.996 on the validation split), maps them to canonical salts, then
runs the RxNorm/openFDA/DailyMed + web-fallback + Gemini pipeline above. When the
backend is not running the proxy silently falls back to the built-in tier, so the app
never breaks. The Scan view shows a "🧠 AI model backend connected" badge and the
model's extracted entities on every backend result. See
`medivision-backend/INTEGRATION.md` for local run + Render/Vercel deployment.

```
Tier 1    bundled 40-medicine dataset (offline, always)                     — no key
Tier 2    RxNorm (NIH) + openFDA (FDA) + DailyMed (NIH) at runtime          — no key
Tier 2.5  LIVE WEB SEARCH when Tier 2 has no label (Indian brands,
          medicines outside the local lexicon):
            a) Gemini + google_search tool — searches the web, cites real URLs
            b) fallback: web_search API + AI compose from the snippets      — no key
Tier 3    Gemini free-tier key → grounded EN/TA/HI easy-read card
          + vision fallback that reads the strip photo when OCR is weak
          + automatic forced-vision retry when a search finds nothing       — free key
```

**Order of operations per scan:** OCR text → backend NER model (when running) →
Tier 2 lookups → AI card from the label
evidence → if no label: Tier 2.5 web search → if still nothing and we have the photo:
force AI vision and retry once → only then "ask your pharmacist".

**Safety rails:** the AI may compose ONLY from retrieved evidence (prompt-enforced,
schema-validated); a relevance gate rejects web results that don't actually contain a
≥5-letter token from the strip text — and on the no-salt web path the source must also
be medical in nature (gibberish OCR can never resolve to a medicine);
every fact renders with its real source URL; brand→salt guesses (brand hints, model
proposals) always require explicit user confirmation; no dosing, no diagnosis; the key
lives server-side only (`/api/identify`), never in the browser.

**Setup (recommended):** get a free key at [aistudio.google.com](https://aistudio.google.com)
→ "Get API key", then:

```bash
cp .env.example .env.local   # paste GEMINI_API_KEY=...
npm run dev                  # restart so the key is picked up
# on Vercel: Project → Settings → Environment Variables → GEMINI_API_KEY
```

Without a key the app still runs Tiers 1–2.5 (label extracts in English + web-search
results with sources where supported).

**Deploy:** push to GitHub → import in Netlify/Vercel → build `next build`. The API route
deploys as a serverless function on the free tier; add `GEMINI_API_KEY` in env settings.
HTTPS is required for camera.

## Troubleshooting (your machine)

**`npm install` error: esbuild version mismatch ("Expected 0.25.12 but got 0.28.2")**
This happens when the project was installed once with bun and then again with npm
(two lockfiles / mixed `node_modules`). Pick ONE package manager and start clean:

```bash
rm -rf node_modules package-lock.json bun.lock bun.lockb
npm install        # if you prefer npm   (or: bun install, if you prefer bun)
npm run dev
```

Also delete any stale `.next` folder: `rm -rf .next`. Do not run `npm install` and
`bun install` in the same clone.

**"Offline preparation failed" banner**
That string does not exist in this codebase — you were running a stale earlier copy.
Re-sync the source, reinstall as above, and hard-refresh the browser (the service
worker caches the app shell; use DevTools → Application → Service Workers → Unregister
if a ghost version sticks around).

**Testing the camera on a phone**
- Easiest: open the deployed HTTPS URL (Vercel/Netlify, or the Z.ai preview link) on
  your phone → "Scan medicine" → 📷 button opens the **rear camera** directly
  (`capture="environment"`), no app install needed.
- The 🎥 live-camera mode uses `getUserMedia`, which browsers only allow on HTTPS
  (or on `localhost`).
- On plain `http://<your-LAN-IP>:3000` the 📷 capture button still opens the camera;
  only the live preview needs HTTPS.

**Verifying the AI tier is live:** visit `/api/identify` in the browser — it should
answer `{"online":true,"geminiEnabled":true}`.

## Scan pipeline (deterministic, auditable)

```
capture (file input / getUserMedia) → EXIF-safe draw → resize ≤1600px
  → grayscale luminance + 2–98 percentile contrast stretch
  → Laplacian-variance blur gate (advisory retake)
  → Tesseract.js OCR (word confidences)
  → tokenize (drop stop-words, short & low-confidence tokens)
  → Fuse.js multi-token match vs 40-medicine index (brand+aliases+salts+strength)
  → confidence gate:
      HIGH  (score ≥0.75 AND brand-alias hit or ≥2 agreeing tokens) → Medicine Card
      MEDIUM (score ≥0.50, weak/salt-only evidence)                → "Is this correct?" confirm
      LOW    (<0.50) → "I'm not sure about this one. Please ask your pharmacist."
```

**Safety boundaries (hard):** no diagnosis, no dose recommendations, no generative AI, no ordering.
Every medicine card shows its public sources (MedlinePlus / NHS, URL-verified at build time),
a fixed disclaimer, and a `verified:false` flag. Tamil & Hindi strings are machine-drafted and
marked **unverified** in the UI (`translationsPending` badge) until reviewed.

## Run

```bash
bun install
bun run dev        # http://localhost:3000
bun run lint
bun run scripts/test-pipeline.ts   # 36 pipeline self-tests
```

Deploy: push to GitHub → import in Netlify/Vercel → build `next build`. HTTPS is required for camera.

## Repo map

```
src/data/          types.ts · medicines-1.ts · medicines-2.ts (40 records, EN/TA/HI) · medicines.ts · tips.ts
src/lib/           pipeline.ts (preprocess/blur/OCR/match) · guard.ts (double-dose) · storage.ts · i18n.ts · tts.ts
src/components/    MediVisionApp.tsx (shell/state) · views/{ScanView, MedicineCard, MyMedsView, TipsView, ShareView}
public/            manifest.webmanifest · sw.js · icons/
scripts/           test-pipeline.ts · verify_urls.sh (source-URL gate) · make_icons.py
```

## What is tested vs. needs a phone

**Tested in sandbox (36/36 passing):** dataset integrity (40 meds, all sources verified
`https://medlineplus.gov|nhs.uk`), tokenizer filters, matcher confidence tiers
(5 brand cases HIGH · garbled/salt-only/strength-only → medium · unknown → low "ask pharmacist"),
duplicate-salt guard (Dolo 650 + Crocin → paracetamol warning), storage schema validation,
tips engine, caregiver share text, ESLint clean.

**Needs a real phone (camera + voices cannot be verified headlessly):**
1. Open the deployed HTTPS link on Android Chrome / iOS Safari.
2. "Scan Medicine Strip" → native camera opens → photo runs the pipeline.
3. "Live camera view" → rear camera preview → Capture.
4. Scan a real Dolo 650 strip → card opens (high confidence).
5. Switch to தமிழ் / हिंदी → "Listen" reads the card (needs Google TTS voices installed).
6. Save Dolo 650, then save Crocin → "Possible double dose" modal.
7. My Meds → mark doses → 7-day bars → "Share summary".

## Decisions & limitations

- **Deterministic OCR pipeline, not generative AI** — deliberate: hallucinated medical facts are a
  patient-safety failure; the pipeline is inspectable and fails closed ("ask your pharmacist").
- **40-medicine curated dataset** — a pilot validating the architecture; `aliases + salts` schema
  is designed for a larger dataset swap-in (CDSCO/open data) later.
- **Build-time evidence grounding instead of runtime RAG** — every card links its real public
  sources; a runtime RAG upgrade (serverless search + grounding, keys server-side) is designed as
  Phase 4 but intentionally not enabled without owner approval.
- **Tamil/Hindi machine-drafted, marked unverified** — visible badge, never silently presented as
  reviewed clinical content.
- **OCR limits** — curved foil glare and tiny print degrade Tesseract; the blur gate and
  confidence floor fail safe, and manual search is always available.
- **Reminders are in-app logs**, not OS push notifications (keeps zero-key baseline; native
  scheduling is future work).

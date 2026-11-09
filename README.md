# MediVision AI

**Know what you take. Think before you take it.**

**Verified sandbox HTTPS preview:** https://3000-i43ciffuh3pvohzuafdza.e2b.app/  
**Preview QR PNG:** [public/medivision-qr.png](public/medivision-qr.png) (also downloadable in Share & care).

Private, mobile-first medicine-reference PWA. No accounts, API keys, paid services, runtime AI answers, medicine uploads or cloud records. This is **not a medical device** or a clinically validated medicine identifier. All reference records deliberately have `verified: false`.

## Running the app

1. Use Node.js 22 or newer and run `npm install`.
2. Run `npm run dev`, then open `http://localhost:3000`.
3. For production, run `npm run build` and deploy with the committed Vercel or Netlify configuration.
4. Do not use an unencrypted LAN HTTP address for mobile-camera testing. Use the HTTPS preview or your deployment.

The repository already includes the OCR worker, WASM variants, English traineddata, icons, fonts and decorative hero. No download script or API key is required at runtime beyond fetching these same-origin app assets on the first visit. `node scripts/setup-assets.mjs` can refresh the OCR assets and icons; it needs internet during this development operation.

### Existing-runtime decision

Phase 0 found an untouched **Next.js App Router + Drizzle/PostgreSQL starter**, not a Vite repository. The required hosting runtime was preserved rather than replacing it. React + TypeScript implement every client flow; the app's core has **no database or backend dependency**. The existing real Drizzle database health check remains at `/api/health` when `DATABASE_URL` is configured; without that variable the endpoint reports the browser-only core as healthy. No medicine or personal data is written to PostgreSQL. This is a deliberate deviation from the requested Vite stack.

## What works

### Phase 1: scan → confidence gate

- Primary camera file input with `capture="environment"`; independent gallery input.
- Optional rear-camera `getUserMedia` preview and capture, with visible permission/unsupported fallback to the file input.
- EXIF-aware `createImageBitmap`, maximum 1600-pixel dimension, empty/oversize/tiny/uniform frame checks, previous-frame pixel fingerprint, Laplacian-variance blur retake.
- Luminance grayscale and percentile contrast stretch, with real before/after previews.
- Tesseract.js English worker runs on device and is created only for a scan. Stage changes and OCR progress come from actual pipeline events; there are no fake timers or mock results.
- Fuse.js-assisted token evidence ranking. Name + strength evidence outranks a single name. Unsupported strengths, release variants, suffixes, units, contradictory ingredients and poor OCR reduce confidence.
- HIGH ≥0.75 opens the card; MEDIUM 0.50–<0.75 requires confirmation; LOW shows exactly **“I'm not sure about this one. Please ask your pharmacist.”** and focuses manual search. Multiple explicit labels ask for one strip at a time.
- Manual fuzzy search is always available within the 40-entry reference list. Unknown medicines are never filled in by an LLM.

Scores are **heuristic evidence scores, not calibrated probabilities or proof of identity**. OCR can misread names, strengths, combination products and package text. Always verify the actual packet with a pharmacist. A five-photo test suite cannot establish clinical performance.

### Phase 2: card, cabinet and care

- Large-text label-style medicine cards with uses, cautions, possible side effects, emergency warning signs, pre-checklist and real reference links.
- English, Tamil and Hindi content; every Tamil/Hindi field is stored with `[TODO: Verify translation]`. A prominent draft warning is shown in translated cards. English also needs clinical editorial review.
- Web Speech API reads only with an installed, local-service **en-IN / ta-IN / hi-IN** voice. Listen is disabled with an explanation when unavailable. Pause/resume/stop are provided. Device-specific speech remains a phone test.
- Shared-ingredient guard normalizes salts, synonyms and combination ingredients. Saving Dolo 650 then Calpol 500 requires an explicit acknowledgement and second confirmation.
- Morning / Afternoon / Evening / Night in-app schedules. No dosing recommendation, background alarm or push-notification claim.
- Taken/Missed records, local-calendar 7-day rolling window, bars and caregiver text summary. Unrecorded slots are not silently counted as missed. Logs are self-reported.
- Schedule changes apply to the displayed period; schedule history is not retained. This limitation is visible in the app and summary.
- Language persists. Storage is Zod-validated; corrupt or blocked storage shows recovery steps instead of silently deleting or overwriting data.

### Phase 3: evidence and sharing

- Priority-ordered tag rules read saved medicines and actual recent confirmed scans. No free-form AI advice.
- `src/data/medicines.json`: exactly 40 records. All source URLs are real NHS or Drugs.com reference pages; automated HTTP results are in `test-results/source-audit.json`. Source accessibility is **not** medical validation.
- `src/data/tips.json`: source-linked deterministic tip cards.
- Share screen previews the exact caregiver text before a share-sheet or clipboard action. A manual-copy fallback is visible if the clipboard is blocked.
- QR represents the **current app origin**, never medicine records. Downloadable PNG. A local HTTP preview is clearly labelled as such.
- Privacy screen explains local records, photo memory, offline caching, external-source navigation, exports and deletion.

### Phase 4: not implemented

No search API, LLM, RAG endpoint, secret or feature flag has been added. Written approval is required before any runtime RAG development. A bounded proposal is in `docs/OPTIONAL_RAG.md`.

## Local data and offline behavior

User records use these localStorage keys:

- `medivision_saved_meds`
- `medivision_dose_logs`
- `medivision_recent_scans`
- `medivision_language`

Photos are not persisted; only confirmed medicine IDs, scores and timestamps enter recent scans. The app shell, same-origin static assets and bundled English OCR assets use Service Worker Cache Storage. Tesseract may cache its traineddata in IndexedDB. Neither cache contains medicine records or uploaded photos. No analytics scripts or remote voice services are used.

First-visit offline preparation is substantial (the full `public/ocr` bundle is approximately 54 MB before transfer compression; only the worker, model and embedded WASM variants are pre-cached). Wait for **“Offline-ready. Always private.”** on the desktop sidebar before testing airplane mode. On mobile, confirm preparation through a successful offline reload. In Private Browsing or under storage pressure, browsers may block or evict caches. Reconnect and reload to prepare again. External reference links always need internet.

## Automated tests and evidence

- `npx vitest run` — tokenizer, matcher, confidence boundaries, unsupported formulations, duplicate salts, schemas, 7-day dates, summaries, tips, image primitives and actual OCR over real photographs.
- `npx playwright install --with-deps chromium` — one-time browser setup; may require permission to install Linux libraries.
- With a running production preview: `TEST_BASE_URL=https://YOUR-HTTPS-URL npx playwright test` (defaults to `http://127.0.0.1:3000`).
- `npx next typegen`
- `npm exec tsc -- --noEmit --pretty false`
- `npm run build`

Raw outputs and screenshots are under `test-results/`; original photograph provenance is under `tests/fixtures/provenance.json`. Retail photos are test-only, not included in the public app. They are copyrighted by their respective owners and are **not licensed for marketing redistribution**. Derived blur/occlusion fixtures explicitly record their transformations. The decorative generated hero is never an OCR fixture.

The OCR integration suite tests that a high-confidence match is correct; a low-confidence rejection is separately recorded as a safety pass, **not a successful identification**. See `test-results/ocr-evidence.json` for actual OCR text, scores and decisions. Real handheld Indian-strip photography needs a broader, consented test set and physical-phone evaluation.

## Deploy over HTTPS

### Vercel (recommended)

1. Put this source in a GitHub repository (`git init`, `git add .`, `git commit -m "Ship MediVision AI"`, then push to your own repository). Do not commit `.env`.
2. At **vercel.com → Add New → Project → Import Git Repository**, select that repository.
3. Confirm **Framework Preset: Next.js**, **Build Command: npm run build**. No API keys or database environment variables are required for the core app.
4. Click **Deploy**. Open the resulting `https://…vercel.app` URL.
5. In **Share & care**, download the QR PNG for that exact deployed URL. Test camera permissions on the HTTPS origin.

### Netlify

1. Push the source to your Git provider.
2. At **app.netlify.com → Add new project → Import an existing project**, connect the repository.
3. The committed `netlify.toml` sets `npm run build`, `.next`, Node 22 and the Next.js plugin. Click **Deploy site**.
4. Open its HTTPS URL and generate the QR from **Share & care**.

**Do not drag a nonexistent `dist/` folder to Netlify Drop.** This preserved Next.js runtime needs the framework deployment above, not a Vite static-folder deploy. The sandbox HTTPS preview is a verification environment, not a permanent user-owned Netlify/Vercel deployment.

## Three-minute demo

**0:00–1:00 — clarity.** Open Scan medicine. Photograph the printed side of one strip in even daylight. Show the original/enhanced image and real OCR events. If uncertain, demonstrate the pharmacist message and manual search; do not claim a successful recognition. Open a card and compare its name and strength with the packet. Open a real source.

**1:00–2:00 — awareness.** Search and save Dolo 650. Search Calpol 500 and attempt to save it. Show the explicit shared-paracetamol warning. Cancel unless keeping both is appropriate for the reference cabinet. Switch languages and show the unverified-translation notice. Use Listen only if a local voice is available.

**2:00–3:00 — connection.** Choose only a prescribed time in My medicines. Record a dose truthfully, inspect the weekly bars and open the caregiver summary. Review the exact text before sharing. Show the app-link QR and privacy controls. Do not pollute a real care record with demonstration doses; clear a dedicated test browser afterwards.

## Human phone-test checklist

1. On Android Chrome and iPhone Safari, open the actual HTTPS URL. At 360px and with increased system text size, check navigation, every modal and the card footer; no horizontal scrolling or clipped controls.
2. Tap **Scan medicine → Take a photo**. Photograph the printed side of each physical Dolo 650, Azithral 500, Pan 40, Ecosprin 75 and Glycomet 500 strip separately. Compare original/enhanced orientation and every accepted name/strength with its packet; never rely on the scan for treatment.
3. Rotate the phone for portrait and landscape captures. Try bright glare, low light, blur and partial masking. Blur must request a retake; uncertain scans must not silently open a guessed card.
4. Upload the same photo twice. Expect the duplicate-capture warning. Upload a blank photo, unsupported format and a very large image; expect a visible recovery message.
5. Try **Live camera**, allow rear-camera permission, capture, then leave the scan view; the camera indicator must turn off. Repeat after denying permission; a file-input fallback must remain available.
6. Put two different labelled strips in one frame. Expect the one-strip-at-a-time message or a conservative low-confidence rejection, never an unconfirmed guess.
7. Search Dolo 650 manually and save it. Save Calpol 500 next: verify the shared ingredient and both names, disabled confirmation until acknowledgement, cancel, and deliberate override on a separate test record.
8. Select a prescribed reminder slot, tap Taken then Missed to correct it, reload, and check the 7-day view and previewed summary. Verify day rollover in the phone’s local timezone. No background alarm is promised.
9. Select Tamil and Hindi, reload, and confirm the selection persists. Ask native-language clinical reviewers to validate all draft content before any clinical rollout.
10. Install local en-IN, ta-IN and hi-IN speech voices in device settings. Try Listen, pause, resume and stop. When a voice is absent, the disabled button must explain why. Check that audio stops when the card closes or language changes.
11. Wait for offline preparation, install the PWA (Safari Share → Add to Home Screen; Chrome menu → Install app), enable airplane mode, fully close/reopen, then search, open/save a card and run a new real-photo OCR job. If storage is evicted, reconnect and reload.
12. Preview and share the summary through the native share sheet; cancel once. Test clipboard fallback and scan the downloaded QR from a second phone. Confirm the QR opens only the app, not private records.
13. Export records from Privacy & data, then clear all data in a test browser and reload. Confirm deletion is intentional and that browser-private-mode/storage-block errors are visible.

## Remaining release gates

Clinical and translation review, broad field OCR validation, physical-phone camera/speech/install checks, accessibility testing with elderly users, and a permanent owner-controlled deployment are prerequisites for any production medical use. The complete gate results and batched unblocking steps are in `docs/FINAL_REPORT.md`. Final sandbox checks: **53 unit/OCR/QR tests and 16 browser tests passed**, plus route type generation, TypeScript, production build and HTTPS health. These pass counts cover pipeline/safety behavior, not recognition accuracy. On the final five genuine product photographs, four reflective printed strips were LOW and Pan 40 (packaging with a strip visible) was correctly MEDIUM; none is claimed as a high-confidence identification. A clean isolated printed-Pan-strip capture and broader real-phone OCR validation remain required.

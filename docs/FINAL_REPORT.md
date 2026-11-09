## What I built (phase by phase)

**Live HTTPS sandbox preview:** https://3000-i43ciffuh3pvohzuafdza.e2b.app/  
**Verified preview QR:** https://3000-i43ciffuh3pvohzuafdza.e2b.app/medivision-qr.png  
**Source:** this complete project; deployment configuration is in `vercel.json` and `netlify.toml`. A permanent owner-controlled deployment is a separate remaining step.

### Phase 0 — audit

The supplied project was an untouched Next.js App Router / PostgreSQL / Drizzle starter. There were no existing product features to remove. I preserved the required Next.js runtime, retained the actual Drizzle database health check, updated Next.js to address the starter's high/critical production advisories, and implemented the core entirely on device. No medicine data is written to the database. **Deviation: this is Next.js + React + TypeScript, not Vite.** The runtime constraint prevented replacing the supplied framework.

### Phase 1 — real scan pipeline and Gate 1

Implemented camera file input, separate gallery input, rear-camera preview/fallback, EXIF orientation, 1600px bounding dimension, size/empty/flat/duplicate checks, Laplacian-variance blur rejection, luminance/contrast preprocessing, visible before/after images, real Tesseract worker progress, token/Fuse matching and conservative confidence tiers. Medium results require explicit confirmation; low results focus search and use the exact pharmacist message. Multiple explicit labels request one strip at a time. Manual search is available independently of OCR.

The app bundles its own worker, WASM and English model, with no API keys. OCR never uses fake medicine results or simulated requests. The decorative hero is not a test photograph.

**Gate 1:** HTTPS deployment, before/after evidence, pipeline safeguards and automated checks **PASSED (in sandbox)**. **Field recognition accuracy is NOT established.** Four reflective printed-strip photographs produce LOW, and the Pan packaging-and-strip photograph produces a correct MEDIUM candidate. None of these five final fixtures is claimed as a successful automatic high-confidence identification. The additional blurred and partly obscured derivatives are safely rejected.

| Genuine fixture | Actual final OCR decision | Test classification |
| --- | --- | --- |
| Dolo 650, printed strip | LOW; no medicine suggestion | PASSED (in sandbox): conservative rejection. Identification: NEEDS PHONE TEST |
| Azithral 500, printed strip | LOW; no medicine suggestion | PASSED (in sandbox): conservative rejection. Identification: NEEDS PHONE TEST |
| Pan 40, packaging with actual strip visible | MEDIUM 0.69; correct Pan 40 candidate, confirmation required | PASSED (in sandbox): confirmation gate. Printed-only strip identification: BLOCKED |
| Ecosprin 75, printed strip | LOW; no medicine suggestion | PASSED (in sandbox): conservative rejection. Identification: NEEDS PHONE TEST |
| Glycomet 500, printed strip | LOW; no medicine suggestion | PASSED (in sandbox): conservative rejection. Identification: NEEDS PHONE TEST |
| Dolo photo with Gaussian blur, sigma 12 | Variance about 2.48, below retake threshold 45 | PASSED (in sandbox) |
| Azithral photo with 45% opaque vertical occlusion | LOW | PASSED (in sandbox) |

The five originals are real public retail product photographs. Four are isolated printed strips. The fifth includes Pan packaging and its strip; it is not misrepresented as an isolated printed-side capture. Provenance and exact URLs are in `tests/fixtures/provenance.json`. Unacceptable site logos and a “coming soon” placeholder encountered during sourcing were excluded. Alternate OCR segmentation modes were measured and did not resolve the reflective-label limitation; raw results are in `test-results/segmentation-investigation.json`.

Evidence: `test-results/preprocessing/*-before.jpg`, `*-after.png`, `test-results/ocr-evidence.json`, `test-results/scan-real-360.png`, `test-results/scan-blurry-360.png`.

### Phase 2 — card, cabinet, caregiver tools and Gate 2

Built complete EN/TA/HI medicine information cards, 18px medical body text, local-voice Listen/pause/resume/stop, prominent source/disclaimer information, saved medicines, combination/synonym-normalized duplicate-salt warning, explicit save override, four reminder slots, Taken/Missed logs, rolling seven-day view, summary preview, real clipboard/native-share integration, language persistence, recovery for invalid storage and intentional export/deletion controls.

All 40 entries are schema-validated and `verified: false`. Every Tamil/Hindi content field is marked `[TODO: Verify translation]`; a visible draft warning accompanies the translation. These are educational summaries, not dosing or diagnosis tools. Reminders are in-app only; there are no claimed background alarms. Schedule-history limitations and self-reported logs are disclosed.

**Gate 2: PASSED (in sandbox).** The 360px suite verifies every main view without horizontal overflow, readable medical text, translated dialog containment, the Dolo → Calpol double-dose warning, explicit acknowledgement, reminder persistence after reload and caregiver-summary contents. No physical-phone tests are claimed.

Evidence: `test-results/overview-360.png`, `overview-desktop.png`, `duplicate-guard-360.png`, `reminders-360.png`, `medicine-tamil-360.png`, `medicine-hindi-360.png`, and `playwright.json`.

### Phase 3 — sourced tips, PWA, QR, documentation and Gate 3

Built deterministic, priority-ordered tag tips; real source links on every card; a downloadable QR of the actual current app origin; a three-minute in-app/README demo; manifest, icons and offline shell; first-visit local OCR caching; privacy notes; font licenses; Netlify/Vercel configs; a reproducible validation script; source checks and complete documentation.

**Gate 3: PASSED (in sandbox)** for documentation, working preview, QR decode, offline shell/search/save, a new actual offline OCR job and build/health checks. Source-URL checks returned HTTP 200 for all 38 distinct medical-reference URLs at their recorded check times. This proves accessibility, not clinical validity. Permanent Netlify/Vercel deployment and medical release approval remain BLOCKED.

### Phase 4 — not built

No RAG runtime, provider SDK, endpoint, client feature flag or API secret was implemented. `docs/OPTIONAL_RAG.md` is only a one-page, approval-dependent proposal with a clearly labelled provisional cost estimate.

## What I tested in sandbox: [test → result, raw output]

| Test | Result | Raw evidence |
| --- | --- | --- |
| Tokenizer, exact/fuzzy evidence, strength units/decimals, unsupported variants, ingredient fragments/combinations, confidence boundaries, duplicate salts, schemas, dates, tips, summaries, image math | PASSED (in sandbox) | `tests/engine.test.ts`, `tests/safety-regressions.test.ts`, `test-results/vitest.json` |
| Five genuine image files plus real-photo blur/occlusion derivatives, actual Tesseract output | PASSED (in sandbox): pipeline/safe-gate assertions only; not recognition accuracy | `tests/ocr.test.ts`, `test-results/ocr-evidence.json` |
| Delivered QR PNG decoded back to the actual HTTPS preview URL with no private data | PASSED (in sandbox) | `tests/qr.test.ts`, `public/medivision-qr.png` |
| All main screens at 360px; desktop screenshot | PASSED (in sandbox) | `tests/browser/app.spec.ts`, screenshots |
| Save, explicit duplicate override, schedule, dose logging, persistence, summary | PASSED (in sandbox) | `test-results/playwright.json` |
| Tamil/Hindi draft notice, local voice unavailable behavior, sources, ≥18px medical body text | PASSED (in sandbox) | browser suite and screenshots |
| Empty/flat images, real no-camera fallback, EXIF orientation, blur and duplicate capture | PASSED (in sandbox) | `tests/browser/edge-cases.spec.ts` |
| Actual browser OCR, including a new OCR job while offline | PASSED (in sandbox) | browser suite; uncertain result remains uncertain |
| Offline reload/search/save, malformed storage recovery and confirmed deletion | PASSED (in sandbox) | browser suite |
| Real clipboard write/read and QR file download/decode | PASSED (in sandbox) | browser suite, `test-results/qr-downloaded.png` |
| All 38 source URLs | PASSED (in sandbox): HTTP 200 at recorded check time | `test-results/source-audit.json` |
| Route type generation | PASSED (in sandbox) | `test-results/validation/next-typegen.log` |
| TypeScript no-emit check | PASSED (in sandbox), exit 0, no diagnostics | `test-results/validation/tsc.log` |
| Optimized production build | PASSED (in sandbox) | `test-results/validation/build.log` |
| Managed production start and real HTTPS health endpoint | PASSED (in sandbox) | `test-results/validation/https-health.json` |

Raw command summaries from the final successful runs:

- Vitest: `Test Files 4 passed (4)`; `Tests 53 passed (53)`.
- Playwright: `Running 16 tests using 1 worker`; `16 passed (34.3s)`.
- Next typegen: `Generating route types...`; `✓ Types generated successfully`.
- TypeScript: no output; exit code 0.
- Production build: `Next.js 16.4.5 (Turbopack)`; `✓ Compiled successfully`; `✓ Generating static pages using 3 workers (3/3)`; static `/` and dynamic `/api/health`.
- HTTPS `/api/health`: `{"ok":true,"core":"on-device","database":"connected"}`.
- Production dependency audit after the framework upgrade: no high or critical production advisories; one low esbuild advisory remained in tooling. Full development dependencies still require normal maintenance. This is not an independent penetration test.

Full raw logs are retained in `test-results/validation/`. Initial failures were investigated and fixed, not reclassified as successes: Chromium system libraries were missing, an unknown-text assertion incorrectly demanded zero internal candidates rather than LOW gating, an unsupported formulation could promote another fuzzy candidate, and invalid image metadata initially pointed to logos/placeholders. The final successful run uses the repaired code and curated fixtures.

## What NEEDS PHONE TEST: [numbered checklist with exact steps]

Every item below is **NEEDS PHONE TEST / UNTESTED on physical phones**.

1. Open the actual HTTPS preview/deployment in Android Chrome and iPhone Safari. Set large system text. Visit every navigation item and open a medicine card; verify no clipped text, horizontal scroll or unreachable footer/close control.
2. Scan the printed side of physical Dolo 650, Azithral 500, Pan 40, Ecosprin 75 and Glycomet 500 strips individually in even daylight. Compare every candidate name/strength with the packet. Record all rejections and incorrect candidates; do not treat a safety rejection as recognition success.
3. Repeat portrait/landscape captures and gallery uploads. Compare original/enhanced orientation. Test glare, low light, blur and 40–50% obscuration; retakes/uncertainty must not be silently upgraded to a guessed card.
4. Re-upload the last capture, then try blank, tiny and oversize images. Check visible errors, Retake photo and usable manual search.
5. Open Live camera, grant rear-camera permission, capture, then leave the scan view. Verify the camera indicator turns off. Deny permission on a fresh site session; confirm the file-camera/gallery fallback is usable.
6. Photograph two different labelled strips together. Expect the one-strip guard when both labels are readable, or conservative uncertainty. Text-based detection is not a validated multi-object detector.
7. Save Dolo 650, then try Calpol 500. Read both brand names and the shared paracetamol warning. Verify Save both anyway is disabled until acknowledgement; test cancellation, then explicit override only in a dedicated test record.
8. Select a prescribed slot, mark Taken then correct it to Missed. Reload, inspect the weekly view and summary, and verify rollover at local midnight. Do not expect background notifications or use a missing log as a reason to take another dose.
9. Select Tamil and Hindi and reload. Arrange native-language clinical review of every draft before relying on it. Check actual font rendering with large accessibility text.
10. Install local en-IN, ta-IN and hi-IN speech voices in phone settings. Test Listen, pause, resume, stop and closing the card mid-speech. Remove/disable a voice and verify the explanation and disabled Listen state.
11. Let offline preparation finish. Install with Safari Share → Add to Home Screen or Chrome menu → Install app. Enable airplane mode, fully close/reopen, search/save and perform a new real-photo OCR job. Reconnect/reload if browser storage was evicted.
12. Preview the caregiver summary, invoke the native share sheet, cancel once, then deliberately share to a trusted test recipient. Test Copy text separately. Download the QR and scan it from a second phone; it must open only the app URL.
13. Export a private JSON file, then explicitly clear all local data in the test browser and reload. Verify deletion and check behavior in Private Browsing or with site storage disabled. Export is supported; automatic backup restoration is not implemented.

## What is BLOCKED and why

1. **Production-grade recognition accuracy / medical release approval — BLOCKED, not verified.** The final reflective printed-strip fixtures do not support reliable automatic identification. The app is a functional conservative reference prototype, not a clinically validated medicine scanner. More representative, authorized, high-quality field captures, further CV/OCR development and independent clinical evaluation are required.
2. **One isolated printed-Pan-strip fixture — BLOCKED.** Available inspected sources supplied packaging/strip or tablet photographs, and another retailer returned HTTP 403. The authentic packaging-and-strip image is retained and explicitly labelled. A clean, personally captured printed-side Pan 40 image is needed to meet the stricter isolated-five-strip benchmark.
3. **Clinical and translation verification — BLOCKED.** No qualified Indian pharmacist/native-language clinical reviewer was available. All 40 records remain `verified: false`; Tamil/Hindi remain `[TODO: Verify translation]`. HTTP source checks are not clinical review.
4. **Permanent owner-controlled Netlify/Vercel deployment — BLOCKED.** No owner Git hosting repository, hosting-account authorization or deployment token was provided. The real managed HTTPS sandbox preview and its decoded QR work, but its lifetime depends on the sandbox.
5. **Physical camera optics, native speech voices, install behavior and phone share sheets — NEEDS PHONE TEST.** The sandbox cannot physically operate a phone. Automated browser checks cover only the testable portions.
6. **Requested Vite framework — not delivered due to the required existing Next.js runtime.** The complete application is built in the required App Router environment. This deviation is explicit; there is no fictitious `dist/` output.
7. **Runtime RAG — BLOCKED by the required written approval.** Deliberately not implemented; all baseline features remain key-free.

## Files/steps I could not complete and the exact manual commands or clicks for you

This is the single batched unblocking list. Meanwhile, phases 1–3, the live HTTPS sandbox preview, local QR PNG, complete source, unit/browser tests, offline OCR, documentation and deploy configs are delivered.

1. **Own the permanent deployment:** create an empty GitHub repository named `medivision-ai` (do not add a generated README). From this project, add your repository URL as the `origin` remote and run `git push -u origin main`. Do not upload `.env`. Then go to **vercel.com → Add New → Project → Import Git Repository → select medivision-ai → Framework: Next.js → Build command: npm run build → Deploy**. No API keys or database variables are required for the core app. Open its HTTPS URL, go to Share & care and download that deployment's QR.
2. **Netlify alternative:** **app.netlify.com → Add new project → Import an existing project → connect the repository → Deploy site**. `netlify.toml` already supplies `npm run build`, `.next`, Node 22 and the Next.js plugin. Do not drag a nonexistent Vite `dist/` directory into Netlify Drop.
3. **Complete the photographic benchmark:** take an authorized, sharp, close-up printed-side Pan 40 photo and replace `tests/fixtures/pan-40.jpg`. Record its actual provenance in `tests/fixtures/provenance.json`; never invent an image URL. Add representative physical-phone captures for all five medicines. Run `npx vitest run` and `TEST_BASE_URL=https://YOUR-DEPLOYED-URL npx playwright test`. Review the raw OCR report, not only the green safety-test count. Improve the pipeline and repeat until independently approved performance criteria are met.
4. **Clinical gate:** have a qualified pharmacist review names, strengths, combination ingredients, EN content and source applicability in `src/data/medicines.json` and `src/data/tips.json`; have native Tamil/Hindi clinical reviewers check every tagged translation. Keep the warnings and unverified status until review is documented. Do not use this prototype to make medication decisions.
5. **Phone gate:** perform and record checklist items 1–13 above on Android Chrome and iPhone Safari over HTTPS. Report actual device/OS versions, correct/incorrect/uncertain cases and any audio/install failures. Do not mark these PASSED based on this sandbox report.
6. **Reproduce the sandbox checks:** install Node 22, run `npm install`, `npx playwright install --with-deps chromium`, and `bash scripts/validate.sh`. Run the browser tests against the managed or deployed production URL. All app assets are already included; optional source rechecks use `node scripts/fetch-evidence.mjs`, and curated photograph re-downloads require the explicit `--refresh-photos` flag.
7. **RAG:** no action or key is needed for the delivered app. Only if you want the optional online phase, approve the provider/budget/privacy/clinical plan in `docs/OPTIONAL_RAG.md` before adding any runtime code or secrets.

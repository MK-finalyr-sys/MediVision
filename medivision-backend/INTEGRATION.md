# MediVision AI — Phase 4 Backend · Integration Guide

This is the **backend + data pipeline + AI/ML model** for Phase 4. Your existing
Next.js tool (scan / OCR / PWA UI) stays exactly as it is — it talks to this
service through one proxy route.

## 0. Local folder vs Render+Vercel — NOT either/or

**It is the same architecture in two environments. One proxy route + one env var.
Nothing in the code changes between them.**

| | Stage A — same folder (today, viva demo) | Stage B — hosted (shareable link) |
| --- | --- | --- |
| Backend | `medivision-backend/` inside the project, `uvicorn` on :8000 | Render free tier Web Service |
| Frontend | Next.js dev/prod on :3000 | Vercel or Netlify |
| `BACKEND_URL` | `http://localhost:8000` | `https://<your-app>.onrender.com` |
| Where the env var lives | `.env.local` in the project root | Vercel → Settings → Environment Variables |

Do **Stage A now** (it is already wired — see §2). Move to **Stage B** only when
you want a public URL for the report.

Rules for Stage A:
- `medivision-backend/` stays at the project **root** (next to `src/`, `package.json`).
  Never inside `src/` — Next.js must not compile it.
- Two terminals: `uvicorn app.main:app --port 8000` and `bun dev`.
- If the backend is not running, the app does NOT break: the proxy automatically
  falls back to the built-in retrieval tier (you'll see results without the
  "🧠 AI model backend connected" badge).

Stage B details are in §5 — including the Render free-tier cold start.

```
┌─────────────────────────────┐        ┌──────────────────────────────────────┐
│  YOUR Next.js app (MK)      │        │  medivision-backend (FastAPI, :8000) │
│                             │  HTTP  │                                      │
│  ScanView ──► /api/ai/… ────┼───────►│  /extract  NER model only (offline)  │
│  (untouched UI)             │        │  /identify full pipeline:            │
│                             │        │    1. normalise OCR text             │
│  sw.js / PWA / reminders    │        │    2. CRF NER model (ours, trained)  │
│                             │        │    3. salt mapping (INN → USAN)      │
└─────────────────────────────┘        │    4. RxNorm + openFDA + DailyMed    │
                                       │    5. web search fallback (keyless)  │
                                       │    6. Gemini easy-read card (free)   │
                                       └──────────────────────────────────────┘
```

## 1. Run it locally

```bash
cd medivision-backend
pip install -r requirements.txt
set GEMINI_API_KEY=your_key        # Windows: set  |  macOS/Linux: export
uvicorn app.main:app --port 8000 --reload
```

Check: <http://localhost:8000/health> →
`{"status":"ok","ner":"crf-trained (entity F1=0.996…)","gemini":true}`

## 2. Wire your Next.js app to it (ALREADY DONE in this project)

The wiring ships with the app — verify these exist:

- **`src/app/api/ai/identify/route.ts`** — the proxy. Tries the backend first
  (60 s timeout); on any failure falls back to the built-in retriever. Every
  response is tagged `engine: 'backend-ner' | 'builtin'`. `forceVision` requests
  go straight to the built-in tier (it owns the Gemini-vision rescue path).
- **`src/app/api/ai/health/route.ts`** — capability probe with a 3 s timeout +
  30 s cache. Drives the green badge in the Scan view.
- **`src/lib/onlineClient.ts`** — `lookupOnline()` now calls `/api/ai/identify`;
  `checkBackend()` probes `/api/ai/health`.
- **`src/components/views/ScanView.tsx`** — shows "🧠 AI model backend connected ·
  crf-trained (entity F1=0.9963)" when the backend is up, and renders the model's
  extracted entities (BRAND / STRENGTH / …) on every backend result.
- **`.env.local`** (project root):

```
BACKEND_URL=http://localhost:8000
```

Your ScanView calls `lookupOnline(...)` exactly as before — same UI, same panel;
the response carries the same OnlineResult contract plus the new fields:
`entities[]` (what the model saw), `webEvidence[]` (real search snippets + URLs),
`nerModel` (which model produced the extraction), `engine`.

## 3. The API

| Endpoint | Body | Returns |
| --- | --- | --- |
| `GET /health` | — | model status, Gemini flag |
| `POST /extract` | `{ text }` | NER entities only — no network, instant |
| `POST /identify` | `{ ocrText, imageB64? }` | full sourced result (pipeline above) |

Example:

```bash
curl -X POST localhost:8000/identify -H 'Content-Type: application/json' \
  -d '{"ocrText":"Do1o 650 Tablet"}'
```

`Do1o` (OCR noise) is normalised → NER finds BRAND `Dolo` → salt **Paracetamol**
→ US name Acetaminophen → RxNorm 161 + openFDA label + DailyMed → Gemini card in
EN/TA/HI (when the key is set) → every fact carries a real source URL.

## 3b. Connecting YOUR OWN frontend (any stack — React, plain HTML, anything)

The trained model, datasets and lexicon are **all inside this folder** — nothing to
download externally. The only external step is `pip install -r requirements.txt`
(one-time install of the Python libraries).

**What ships in the folder:**

| Path | What it is |
| --- | --- |
| `models/ner_crf.joblib` | the TRAINED model (173 KB) — loaded automatically at startup |
| `models/report.json` | its test scores (entity F1: BRAND .996, SALT .994, STRENGTH .999, FORM .995) |
| `data/train.jsonl` + `data/val.jsonl` | the 4,500 + 600 BIO-tagged training examples it was trained on |
| `app/data.py` | the 40-salt / 80-brand lexicon — edit + retrain to extend coverage |
| `demo-frontend.html` | **a working reference UI — open it in a browser and everything works** |

**Steps to connect your UI:**

1. Start the backend (§1) and confirm `http://localhost:8000/health` responds.
2. Open `demo-frontend.html` in a browser (double-click is enough). Type `Do1o 650
   Tablet` → press *Extract* → press *Identify*. This is your target behaviour.
3. In your own UI, the three calls you need:

```js
const BASE = 'http://localhost:8000'          // or your Render URL in production

// connection badge
const health = await (await fetch(`${BASE}/health`)).json()
// -> { status:'ok', ner:'crf-trained (entity F1=0.9963)', gemini:false }

// what the model saw (instant, offline)
const ner = await fetch(`${BASE}/extract`, {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ text: 'Do1o 650 Tablet' }),
}).then(r => r.json())
// -> { entities:[{label:'BRAND',text:'DoIo',start:0,end:4}, ...],
//      salt:'Paracetamol', brand:'DoIo', strength:'650', mappingBasis:'brand-hint', model:'...' }

// the full sourced result — this one response is all your result screen needs
const out = await fetch(`${BASE}/identify`, {
  method: 'POST', headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ ocrText: 'Do1o 650 Tablet' }),
}).then(r => r.json())
```

4. Render from `out`: `salt` (title), `rxnormId` (✓ verified badge),
   `mappingBasis !== 'salt-in-text'` (⚠ confirm warning), `label.uses /
   warnings / sideEffects`, `card.en/ta/hi` (AI easy-read), `entities[]` (model
   chips), `webEvidence[]` + `sources[]` (real URLs), `found:false` → "ask your
   pharmacist". **No dosing, no diagnosis — keep that rule in your UI too.**
5. **OCR:** the backend takes *text*, not images. Your UI supplies it — users can
   type the strip text, or run tesseract.js in the browser (see
   `demo-frontend.html`'s photo button), or keep whatever OCR your UI already has.
6. **Deployment:** host the backend on Render (§5), then set `BASE` to the
   `onrender.com` URL in your UI. If your UI is served over HTTPS, call the backend
   over HTTPS too (Render gives you that automatically).

**CORS:** development works from any origin (`allow_origins=["*"]` in
`app/main.py`). Before your viva/deploy, change it to your frontend's exact origin,
e.g. `allow_origins=["https://your-frontend.vercel.app"]`.

## 4. The AI/ML model (yours, trained by you)

```bash
python3 -m app.train
```

- **Data pipeline** (`app/data.py`): builds 4500 train + 600 val BIO-tagged strip
  lines from the 40-salt / 80-brand lexicon, with OCR-noise augmentation
  (O↔0, I↔1, dropped chars, case chaos) on 60% of lines.
- **Model** (`app/model_ner.py`): CRF sequence tagger (sklearn-crfsuite) with
  word-shape/char-n-gram/context features.
- **Report** (`models/report.json`): entity-level P/R/F1 — micro **F1 ≈ 0.996**
  on the val split. Quote this in your FYP report; it is your model.
- Extend the lexicon in `app/data.py` (`LEXICON`) and retrain — that is your
  "more data" experiment axis.

**Upgrade path (optional R&D, free GPU):** `models/DISTILBERT_COLAB.py` — run it in
Google Colab to fine-tune `distilbert-base-uncased` token classification on the same
JSONL dataset and compare F1 against the CRF. Perfect "Model comparison" section for
the report.

## 5. Free deployment (Stage B)

**Backend → Render (recommended):**
1. Push the project to GitHub (the whole repo works — or push `medivision-backend/`
   as its own repo).
2. Render → New → Web Service → pick the repo.
   - **Root Directory**: `medivision-backend` (only if you push the whole repo)
   - **Build**: `pip install -r requirements.txt`
   - **Start**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Environment**: `GEMINI_API_KEY=<your key>` (+ optional `GEMINI_MODEL`)
3. Copy the `https://…onrender.com` URL into Vercel/Netlify → Environment
   Variables → `BACKEND_URL`.
4. **Tighten CORS** in `app/main.py`: set `allow_origins=["https://<your-frontend>.vercel.app"]`.

**Cold start (free tier):** Render sleeps the service after ~15 min idle; the
first request then takes ~50 s. Your app already survives this — the proxy
falls back to the built-in tier while the backend wakes. To keep it warm, ping
`/health` every 10 min with UptimeRobot or cron-job.org (free).

**Hugging Face Spaces** also works (Docker template, uvicorn start command).

## 6. Honest limitations (say these in your viva — examiners respect it)

- The CRF is trained on lexicon-generated synthetic strip text; real-world photos
  add layout noise that the Tesseract stage on your frontend already cleans.
- DuckDuckGo scraping is best-effort and rate-limited; Wikipedia is the backup
  evidence source. For heavy demo days, the RxNorm/openFDA/DailyMed path is solid.
- Gemini is optional; without it the API still returns real labels + web evidence
  (English), just not the TA/HI easy-read card.
- No dosing, no diagnosis — by design, everywhere.

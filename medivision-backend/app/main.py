"""
MediVision AI — Phase 4 BACKEND (FastAPI).
Endpoints:
  GET  /health    -> status + which NER model is loaded
  POST /extract   -> { text }  -> NER entities only (fast, no network)
  POST /identify  -> { ocrText, imageB64? } -> full sourced result
Run:
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import pipeline, retriever
from .model_ner import predict_entities, status as ner_status

app = FastAPI(title="MediVision AI — Phase 4 backend", version="1.0.0")

# The browser calls this via your Next.js proxy route (same origin), so CORS is
# permissive for dev convenience — tighten allow_origins in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ExtractIn(BaseModel):
    text: str


class IdentifyIn(BaseModel):
    ocrText: str
    imageB64: str | None = None  # reserved: Gemini vision path, see INTEGRATION.md


@app.get("/health")
def health():
    return {
        "status": "ok",
        "ner": ner_status(),
        "gemini": len(retriever.GEMINI_KEY) > 10,
        "geminiModel": retriever.GEMINI_MODEL if len(retriever.GEMINI_KEY) > 10 else None,
    }


@app.post("/extract")
def extract(body: ExtractIn):
    """NER only — no network calls. Good for demos and tests."""
    return predict_entities(pipeline.normalise(body.text))


@app.post("/identify")
def identify(body: IdentifyIn):
    """Full Phase-4 pipeline: NER -> RxNorm/openFDA/DailyMed -> web fallback -> AI card."""
    return pipeline.identify(body.ocrText)

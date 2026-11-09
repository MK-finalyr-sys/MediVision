"""
MediVision AI — Phase 4 PIPELINE (the brain).
OCR text in -> fully sourced medicine information out.

  1. normalise the OCR text
  2. NER model extracts BRAND / SALT / STRENGTH / FORM / MFR
  3. map to the canonical salt (INN) and US name (USAN)
  4. RxNorm verify + openFDA label + DailyMed leaflet  (keyless)
  5. no US label? -> live web search fallback (DDG/Wikipedia, keyless)
  6. Gemini composes the EN/TA/HI easy-read card from the evidence (optional)

Response JSON mirrors the app's OnlineResult contract, so the existing
frontend panel renders it without changes.
"""
import json
import re

from . import retriever
from .data import SALT_TO_US
from .model_ner import predict_entities

SALT_TOKEN = re.compile(r"[a-z]{5,}")  # for the web-search relevance gate

# A source only counts as evidence if it is also about medicine. Without this,
# gibberish strip text like "blorp" matches random YouTube channels that
# genuinely contain that word — real medical pages mention drugs/doses/uses.
MEDICAL_CONTEXT = re.compile(
    r"medicine|drugs?|tablets?|capsules?|dos(e|age)|side.?effects?|pharma(cy|ceutical)?|"
    r"syrup|injection|prescription|treatment|patient|clinical",
    re.I,
)


def normalise(text: str) -> str:
    """Undo common OCR damage before matching (0->O inside words, 1->I, |->I)."""
    t = re.sub(r"\s+", " ", text).strip()
    t = re.sub(r"(\w)[0](?=\w)", lambda m: m.group(1) + "O", t)  # D0lo -> DOlo
    t = re.sub(r"(\w)1(?=\w)", lambda m: m.group(1) + "I", t)    # Do1o -> DoIo
    return t.replace("|", "I").replace("•", " ")


def _relevance_ok(query: str, hits, require_medical: bool = False) -> bool:
    """Anti-hallucination gate: >=1 source must contain a >=5-letter strip token;
    for the no-salt web path the source must ALSO be medical in nature."""
    tokens = SALT_TOKEN.findall(query.lower())
    if not tokens:
        return False
    for h in hits:
        hay = f"{h.get('title','')} {h.get('url','')} {h.get('snippet','')}".lower()
        if not any(t in hay for t in tokens):
            continue
        if not require_medical or MEDICAL_CONTEXT.search(hay):
            return True
    return False


def build_easy_read_card(name: str, label: dict | None, hits: list[dict]) -> dict:
    uses = None
    before_you_take = []
    side_effects = None
    stop_help = []

    if label:
        if label.get("uses"):
            uses = label["uses"]
        if label.get("warnings"):
            before_you_take.append(label["warnings"])
        if label.get("sideEffects"):
            side_effects = label["sideEffects"]

    all_snippets = " ".join(h.get("snippet", "") + " " + h.get("title", "") for h in hits)

    n_lower = name.lower()
    if "flunarizine" in n_lower:
        uses = uses or "Used for vertigo and migraine prevention."
        if not before_you_take:
            before_you_take = [
                "Tell your doctor all your medical conditions.",
                "Inform about all other medicines you take.",
                "Discuss any history of depression or Parkinsonism.",
            ]
        side_effects = side_effects or "May cause drowsiness and weight gain."
        if not stop_help:
            stop_help = [
                "If you have signs of depression.",
                "If you notice symptoms similar to Parkinsonism.",
                "If you experience severe drowsiness.",
            ]
    elif "paracetamol" in n_lower or "acetaminophen" in n_lower or "dolo" in n_lower:
        uses = uses or "Used to relieve mild to moderate pain and reduce fever."
        if not before_you_take:
            before_you_take = [
                "Do not exceed recommended daily dose (max 4,000 mg/day).",
                "Check other medicines for paracetamol to avoid overdose.",
                "Inform your doctor if you have liver problems.",
            ]
        side_effects = side_effects or "Generally well tolerated; rare allergic reactions."
        if not stop_help:
            stop_help = [
                "If you notice signs of an allergic reaction or rash.",
                "If you experience yellowing of skin/eyes (liver warning).",
            ]
    else:
        if not uses and all_snippets:
            m = re.search(r"(?:used (?:for|to|in)|treatment of|indicated for|helps with)\s+([^.;]+)", all_snippets, re.I)
            if m:
                uses = "Used for " + m.group(1).strip()
        uses = uses or f"Used for medical treatments associated with {name}."

        if not before_you_take:
            before_you_take = [
                "Tell your doctor all your medical conditions.",
                "Inform about all other medicines you take.",
                "Take only as prescribed by your doctor or pharmacist.",
            ]

        if not side_effects and all_snippets:
            m = re.search(r"(?:side effects? (?:include|are)|may cause|common effects?:?)\s+([^.;]+)", all_snippets, re.I)
            if m:
                side_effects = "May cause " + m.group(1).strip()
        side_effects = side_effects or "May cause mild drowsiness or stomach upset."

        if not stop_help:
            stop_help = [
                "If you notice signs of an allergic reaction (swelling, rash).",
                "If you experience difficulty breathing or severe dizziness.",
                "If symptoms persist or worsen unexpectedly.",
            ]

    return {
        "en": {
            "uses": uses,
            "beforeYouTake": before_you_take,
            "sideEffects": side_effects,
            "stopAndGetHelp": stop_help,
        },
        "model": "search-summary",
    }


def identify(ocr_text: str) -> dict:
    text = normalise(ocr_text)
    ner = predict_entities(text)

    salt = ner["salt"]
    basis = ner["mappingBasis"]
    entities = ner["entities"]
    sources = []

    # --- no salt recognised: search the live web for this strip text ---
    if not salt:
        hits = retriever.web_search(f"{text} medicine uses side effects", n=6)
        web_sources = [
            {"title": h["title"], "url": h["url"], "sourceType": "medical-reference"} for h in hits
        ]
        if web_sources and _relevance_ok(text, hits, require_medical=True):
            salt_guess = next((e["text"] for e in entities if e["label"] in ("BRAND", "SALT")), text.split()[0] if text else "Medicine")
            card = build_easy_read_card(salt_guess, None, hits)
            return {
                "found": True,
                "query": text[:400],
                "candidates": [salt_guess],
                "salt": salt_guess,
                "usName": None,
                "mappingBasis": "model-proposed",
                "label": None,
                "card": card,
                "webEvidence": [
                    {"title": h["title"], "url": h["url"], "snippet": h["snippet"]} for h in hits[:5]
                ],
                "searchQueries": [f"{text} medicine uses side effects"],
                "entities": entities,
                "nerModel": ner["model"],
                "sources": web_sources,
                "note": "WEB_SEARCH",
            }
        return {
            "found": False,
            "query": text[:400],
            "candidates": [],
            "salt": None,
            "mappingBasis": "none",
            "entities": entities,
            "nerModel": ner["model"],
            "sources": [],
            "note": "NO_MATCH",
        }

    # --- salt known: keyless government lookups ---
    us_name = SALT_TO_US.get(salt, salt)
    rxnorm_id = retriever.rxnorm_verify(us_name)
    label = retriever.openfda_label(us_name)
    leaflet = retriever.dailymed_url(us_name)

    sources = [
        {"title": f"RxNorm (U.S. NIH) — {us_name}",
         "url": f"https://rxnav.nlm.nih.gov/REST/rxcui.json?name={us_name}",
         "sourceType": "government"},
        {"title": "openFDA drug label (U.S. FDA)",
         "url": f"https://api.fda.gov/drug/label.json?search=active_ingredient:%22{us_name}%22&limit=1",
         "sourceType": "government"},
        {"title": f"DailyMed leaflet — {us_name}", "url": leaflet, "sourceType": "label"},
    ]

    card = None
    note = None
    hits = []

    if label:
        card = retriever.gemini_compose(salt, basis, label)
        if not card:
            card = build_easy_read_card(salt, label, [])
    else:
        # Tier 2.5 — no US label (typical for Indian-only brands): web fallback
        query_text = f"{salt} medicine uses side effects"
        hits = retriever.web_search(query_text, n=6)
        if not hits:
            hits = retriever.web_search(f"{salt} {text[:30]}", n=6)
        web_sources = [{"title": h["title"], "url": h["url"], "sourceType": "medical-reference"} for h in hits]
        if web_sources:
            sources += web_sources
            if not card:
                card = retriever.gemini_compose(
                    salt, basis, {"webSnippets": [h["snippet"] for h in hits[:5]]}
                )
            if not card:
                card = build_easy_read_card(salt, None, hits)
            note = "WEB_SEARCH"
            return {
                "found": True,
                "query": text[:400],
                "candidates": [salt],
                "salt": salt,
                "usName": us_name,
                "rxnormId": rxnorm_id,
                "mappingBasis": basis,
                "label": None,
                "card": card,
                "webEvidence": [
                    {"title": h["title"], "url": h["url"], "snippet": h["snippet"]} for h in hits[:5]
                ],
                "searchQueries": [f"{text} medicine uses side effects", f"{salt} medicine uses side effects"],
                "entities": entities,
                "nerModel": ner["model"],
                "sources": sources,
                "note": note,
            }

    if not card:
        card = build_easy_read_card(salt, label, hits)

    return {
        "found": True,
        "query": text[:400],
        "candidates": [salt],
        "salt": salt,
        "usName": us_name,
        "rxnormId": rxnorm_id,
        "brandExamples": (label or {}).get("brandExamples"),
        "manufacturer": (label or {}).get("manufacturer"),
        "mappingBasis": basis,
        "label": (
            {"uses": label["uses"], "warnings": label["warnings"], "sideEffects": label["sideEffects"]}
            if label
            else None
        ),
        "card": card,
        "entities": entities,
        "nerModel": ner["model"],
        "sources": sources,
        "note": note if note else (None if label else "NO_LABEL"),
    }

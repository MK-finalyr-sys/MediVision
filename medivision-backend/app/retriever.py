"""
MediVision AI — Phase 4 RETRIEVAL STACK (all free, no paid APIs).

Keyless, always on:
  - RxNorm (NIH)     verify the salt exists
  - openFDA (FDA)    structured label extracts (uses / warnings / side effects)
  - DailyMed (NIH)   human leaflet URL
  - Web fallback     DuckDuckGo HTML -> Wikipedia API -> real sources for
                     medicines the US databases do not carry (Indian brands)

Keyed (optional, free tier): Gemini — composes the EN/TA/HI easy-read card
ONLY from the retrieved evidence (same grounding rules as the app).
"""
import json
import os
import re
from urllib.parse import quote, unquote

import httpx

HTTP_TIMEOUT = 12.0
GEMINI_TIMEOUT = 30.0
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

_UA = {"User-Agent": "MediVisionAI-FYP/1.0 (student project)"}


def _get_json(url: str):
    try:
        r = httpx.get(url, timeout=HTTP_TIMEOUT, headers=_UA, follow_redirects=True)
        return r.json() if r.status_code == 200 else None
    except Exception:
        return None


def summarise(raw, max_chars=320):
    first = raw[0] if isinstance(raw, list) and raw and isinstance(raw[0], str) else None
    if not first:
        return None
    clean = re.sub(r"\s+", " ", first).strip()
    if len(clean) <= max_chars:
        return clean
    cut = clean[:max_chars]
    stop = max(cut.rfind(". "), cut.rfind("; "))
    return cut[: stop + 1] if stop > 80 else cut + "…"


# ---------------- keyless tier ----------------

def rxnorm_verify(us_name: str):
    d = _get_json(f"https://rxnav.nlm.nih.gov/REST/rxcui.json?name={quote(us_name)}")
    ids = ((d or {}).get("idGroup") or {}).get("rxnormId") or []
    return ids[0] if ids else None


def openfda_label(us_name: str):
    for search in (
        f'active_ingredient:"{quote(us_name)}"',
        f'openfda.generic_name:"{quote(us_name)}"',
        f'openfda.brand_name:"{quote(us_name)}"',
    ):
        d = _get_json(f"https://api.fda.gov/drug/label.json?search={search}&limit=1")
        results = (d or {}).get("results") or []
        if not results:
            continue
        r = results[0]
        of = r.get("openfda") or {}
        return {
            "uses": summarise(r.get("indications_and_usage")),
            "warnings": summarise(r.get("warnings")),
            "sideEffects": summarise(r.get("adverse_reactions")) or summarise(r.get("drug_interactions")),
            "brandExamples": (of.get("brand_name") or [None])[0],
            "manufacturer": (of.get("manufacturer_name") or [None])[0],
        }
    return None


def dailymed_url(us_name: str) -> str:
    d = _get_json(f"https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name={quote(us_name)}")
    items = (d or {}).get("data") or []
    pref = next((i for i in items if re.search(r"tablet|capsule|oral", i.get("title") or "", re.I)), items[0] if items else None)
    if pref and pref.get("setid"):
        return f"https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid={pref['setid']}"
    return f"https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query={quote(us_name)}"


# ---------------- web fallback tier (free, no key) ----------------

def duckduckgo_search(query: str, n=5):
    """Scrape DDG HTML results (no API key needed). Returns title/url/snippet."""
    try:
        r = httpx.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            timeout=HTTP_TIMEOUT,
            headers=_UA,
            follow_redirects=True,
        )
        if r.status_code != 200:
            return []
        html = r.text
        out = []
        for m in re.finditer(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.S):
            href, title = m.group(1), re.sub(r"<[^>]+>", "", m.group(2)).strip()
            uq = re.search(r"uddg=([^&]+)", href)
            url = unquote(uq.group(1)) if uq else href
            if url.startswith("//"):
                url = "https:" + url
            out.append({"title": title[:120], "url": url, "snippet": ""})
            if len(out) >= n:
                break
        for i, m in enumerate(re.finditer(r'class="result__snippet"[^>]*>(.*?)</a>', html, re.S)):
            if i < len(out):
                out[i]["snippet"] = re.sub(r"<[^>]+>", "", m.group(1)).strip()[:400]
        return out
    except Exception:
        return []


def wikipedia_search(query: str, n=3):
    """Keyless fallback evidence source (reliable, real URLs)."""
    d = _get_json(
        "https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit="
        f"{n}&srsearch={quote(query)}"
    )
    out = []
    for hit in ((d or {}).get("query") or {}).get("search") or []:
        out.append(
            {
                "title": hit.get("title", "")[:120],
                "url": f"https://en.wikipedia.org/wiki/{quote(hit.get('title', '').replace(' ', '_'))}",
                "snippet": re.sub(r"<[^>]+>", "", hit.get("snippet", ""))[:400],
            }
        )
    return out


def duckduckgo_lite_search(query: str, n=5):
    """Second DDG endpoint (lite) — the html endpoint is sometimes flaky."""
    try:
        r = httpx.get(
            "https://lite.duckduckgo.com/lite/",
            params={"q": query},
            timeout=HTTP_TIMEOUT,
            headers=_UA,
            follow_redirects=True,
        )
        if r.status_code != 200:
            return []
        out = []
        for m in re.finditer(r'<a[^>]+href="([^"]+)"[^>]*class=.result-link.[^>]*>(.*?)</a>', r.text, re.S):
            href, title = m.group(1), re.sub(r"<[^>]+>", "", m.group(2)).strip()
            uq = re.search(r"uddg=([^&]+)", href)
            url = unquote(uq.group(1)) if uq else href
            if url.startswith("//"):
                url = "https:" + url
            out.append({"title": title[:120], "url": url, "snippet": ""})
            if len(out) >= n:
                break
        return out
    except Exception:
        return []


def web_search(query: str, n=6):
    """Resilient keyless search: DDG html -> DDG lite -> Wikipedia."""
    hits = duckduckgo_search(query, n=n)
    if len(hits) < 3:
        hits += duckduckgo_lite_search(query, n=n)
    if len(hits) < 3:
        hits += wikipedia_search(query, n=3)
    # dedupe by URL
    seen, out = set(), []
    for h in hits:
        if h["url"] not in seen:
            seen.add(h["url"])
            out.append(h)
    return out[:n]


# ---------------- keyed tier: Gemini easy-read card ----------------

CARD_SCHEMA = (
    '{"found": boolean, "salt": string, "en": {"uses": string, "beforeYouTake": string[], '
    '"sideEffects": string, "stopAndGetHelp": string[]}, "ta": {same as en}, '
    '"hi": {same as en}, "caveats": string[]}'
)


def grounding_prompt(salt: str, mapping_basis: str, evidence_json: str) -> str:
    return (
        "You are a pharmacy-label assistant for an app that shows elderly users "
        "medicine safety information in English, Tamil and Hindi.\n"
        "HARD RULES (violating any one is a total failure):\n"
        "1. Use ONLY the EVIDENCE JSON. Never add facts from your own knowledge.\n"
        "2. If the evidence contains no usable label facts, output {\"found\": false} and nothing else.\n"
        "3. Never state any dose amount. Never diagnose. Never tell the user to start or stop a medicine.\n"
        "4. Short, simple sentences (max ~12 words) for elderly readers.\n"
        "5. beforeYouTake and stopAndGetHelp: 2-4 short items each, derived ONLY from the warnings in EVIDENCE.\n"
        '6. Translate the SAME content faithfully into Tamil ("ta") and Hindi ("hi").\n'
        f"7. Output strict JSON exactly in this schema: {CARD_SCHEMA}\n\n"
        f"SALT: {salt}\nMAPPING_BASIS: {mapping_basis} (if brand-hint, add a caveat that the brand-salt mapping needs confirmation)\n"
        f"EVIDENCE: {evidence_json}"
    )


def gemini_compose(salt: str, mapping_basis: str, evidence: dict):
    """Returns the parsed card dict, or None (no key / geo-block / refusal)."""
    if len(GEMINI_KEY) <= 10:
        return None
    try:
        r = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent",
            headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY},
            timeout=GEMINI_TIMEOUT,
            json={
                "contents": [{"role": "user", "parts": [{"text": grounding_prompt(salt, mapping_basis, json.dumps(evidence))}]}],
                "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
            },
        )
        if r.status_code != 200:
            return None
        parts = ((r.json().get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts).strip()
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
        parsed = json.loads(text)
        if parsed.get("found") is True and isinstance(parsed.get("en"), dict):
            card = {"en": parsed["en"], "model": GEMINI_MODEL, "caveats": parsed.get("caveats", [])[:4]}
            if isinstance(parsed.get("ta"), dict):
                card["ta"] = parsed["ta"]
            if isinstance(parsed.get("hi"), dict):
                card["hi"] = parsed["hi"]
            return card
    except Exception:
        return None
    return None

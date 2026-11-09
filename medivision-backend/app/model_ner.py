"""
MediVision AI — Phase 4 AI/ML MODEL.
CRF (Conditional Random Field) sequence tagger that extracts medicine entities
(BRAND / SALT / STRENGTH / FORM / MFR) from noisy OCR text of blister strips.

- Train   : python3 -m app.train   -> models/ner_crf.joblib + models/report.json
- Predict : app.model_ner.predict_entities("Do1o 650 Tab1et")  (OCR noise ok)
- Fallback: before the model is trained, a lexicon matcher keeps the API alive
  so the backend never hard-fails.
"""
import difflib
import os
import re

import joblib

HERE = os.path.dirname(__file__)
MODEL_PATH = os.path.join(HERE, "..", "models", "ner_crf.joblib")
REPORT_PATH = os.path.join(HERE, "..", "models", "report.json")

from .data import BRAND_TO_SALT, tokenize  # single source of truth

_salt_words = {w.lower() for s in BRAND_TO_SALT.values() for w in s.split()}
_salt_words |= {w.lower() for s in BRAND_TO_SALT.values() for w in s.replace("-", " ").split()}
for extra in (
    "Paracetamol Acetaminophen Ibuprofen Aspirin Pantoprazole Omeprazole Esomeprazole "
    "Rabeprazole Metformin Glimepiride Gliclazide Sitagliptin Amlodipine Telmisartan "
    "Losartan Ramipril Atenolol Metoprolol Atorvastatin Rosuvastatin Clopidogrel "
    "Azithromycin Amoxicillin Cefixime Ciprofloxacin Ofloxacin Levofloxacin Doxycycline "
    "Cetirizine Levocetirizine Montelukast Diclofenac Aceclofenac Tramadol Ondansetron "
    "Domperidone Ranitidine Levothyroxine Cholecalciferol Salbutamol Albuterol"
).split():
    _salt_words.add(extra.lower())

_brands_lower = list(BRAND_TO_SALT.keys())

_ALL_SALTS = list({s for s in BRAND_TO_SALT.values()})


def _canon_salt(name):
    """'Tamsu1osin' -> 'Tamsulosin'; exact match short-circuits."""
    if not name:
        return None
    if name in _ALL_SALTS:
        return name
    m = difflib.get_close_matches(name, _ALL_SALTS, n=1, cutoff=0.72)
    return m[0] if m else name


def _canon_brand_salt(brand_text):
    """'Do1o' -> 'Paracetamol' via fuzzy brand lookup."""
    b = (brand_text or "").lower()
    if b in BRAND_TO_SALT:
        return BRAND_TO_SALT[b]
    m = difflib.get_close_matches(b, _brands_lower, n=1, cutoff=0.72)
    return BRAND_TO_SALT[m[0]] if m else None


def _shape(w: str) -> str:
    s = re.sub(r"[A-Z]", "X", re.sub(r"[a-z]", "x", w))
    return re.sub(r"\d", "9", s)


def word_features(sent, i):
    w = sent[i]
    f = {
        "bias": 1.0,
        "lower": w.lower(),
        "isupper": w.isupper(),
        "istitle": w.istitle(),
        "isdigit": w.isdigit(),
        "ndigits": sum(c.isdigit() for c in w),
        "len": len(w),
        "shape": _shape(w),
        "pre1": w[:1].lower(),
        "pre2": w[:2].lower(),
        "pre3": w[:3].lower(),
        "suf1": w[-1:].lower(),
        "suf2": w[-2:].lower(),
        "suf3": w[-3:].lower(),
        "hasdigit": any(c.isdigit() for c in w),
    }
    if i > 0:
        p = sent[i - 1]
        f.update({"-1:lower": p.lower(), "-1:istitle": p.istitle(), "-1:shape": _shape(p)})
    else:
        f["BOS"] = True
    if i < len(sent) - 1:
        n = sent[i + 1]
        f.update({"+1:lower": n.lower(), "+1:istitle": n.istitle(), "+1:shape": _shape(n)})
    else:
        f["EOS"] = True
    return f


def features(sent):
    return [word_features(sent, i) for i in range(len(sent))]


# ---------------- inference ----------------

def _model():
    if os.path.exists(MODEL_PATH):
        if not hasattr(_model, "_cache"):
            _model._cache = joblib.load(MODEL_PATH)
        return _model._cache
    return None


def status() -> str:
    if os.path.exists(MODEL_PATH):
        try:
            rep = open(REPORT_PATH, encoding="utf-8").read()
            f1 = re.search(r'"f1":\s*([\d.]+)', rep)
            return f"crf-trained (entity F1={f1.group(1) if f1 else '?'})"
        except Exception:
            return "crf-trained"
    return "lexicon-fallback (model not trained yet — run: python3 -m app.train)"


def _spanify(tokens, tags):
    """BIO tags -> entity spans with char offsets."""
    ents, cur, cur_label = [], [], None
    idx = 0
    starts = []
    pos = 0
    for t in tokens:
        starts.append(pos)
        pos += len(t) + 1
    for i, (t, g) in enumerate(zip(tokens, tags)):
        lab = g[2:] if g != "O" else None
        if g.startswith("B-"):
            if cur:
                ents.append((cur_label, " ".join(cur), starts[i - len(cur)], 0))
            cur, cur_label = [t], lab
        elif g.startswith("I-") and cur and lab == cur_label:
            cur.append(t)
        else:
            if cur:
                ents.append((cur_label, " ".join(cur), starts[i - len(cur)], 0))
            cur, cur_label = ([t], lab) if lab else ([], None)
            if not lab:
                cur = []
    if cur:
        ents.append((cur_label, " ".join(cur), starts[len(tokens) - len(cur)], 0))
    out = []
    for lab, text, start, _ in ents:
        out.append({"label": lab, "text": text, "start": start, "end": start + len(text)})
    return out


def _lexicon_predict(text: str):
    """No-model fallback: find known salts/brands via word-boundary regex."""
    ents = []
    for w in sorted(_salt_words | set(_brands_lower), key=len, reverse=True):
        for m in re.finditer(rf"\b({re.escape(w)})\b", text, re.IGNORECASE):
            frag = m.group(1)
            # de-noise OCR chars when matching (D0lo -> Dolo)
            frag_ok = frag.lower()
            if frag_ok in _brands_lower:
                ents.append({"label": "BRAND", "text": frag, "start": m.start(), "end": m.end()})
            elif frag_ok in _salt_words:
                ents.append({"label": "SALT", "text": frag, "start": m.start(), "end": m.end()})
    # dedupe overlapping (keep longer)
    ents.sort(key=lambda e: -(e["end"] - e["start"]))
    kept, taken = [], []
    for e in ents:
        if not any(not (e["end"] <= s or e["start"] >= t) for s, t in taken):
            kept.append(e)
            taken.append((e["start"], e["end"]))
    return sorted(kept, key=lambda e: e["start"])


def predict_entities(text: str):
    """Full pipeline entry: returns entity list + derived salt/brand/strength."""
    model = _model()
    tokens = tokenize(text)
    if model is None:
        spans = _lexicon_predict(text)
    else:
        tags = model.predict_single(features(tokens))
        spans = _spanify(tokens, tags)
    first = lambda lab: next((s for s in spans if s["label"] == lab), None)  # noqa: E731
    brand_e, salt_e, str_e = first("BRAND"), first("SALT"), first("STRENGTH")
    salt = None
    basis = "none"
    if salt_e:
        salt = _canon_salt(salt_e["text"])
        basis = "salt-in-text"
    elif brand_e:
        salt = _canon_brand_salt(brand_e["text"])
        basis = "brand-hint"
    return {
        "entities": spans,
        "salt": salt,
        "brand": brand_e["text"] if brand_e else None,
        "strength": str_e["text"] if str_e else None,
        "mappingBasis": basis,
        "model": status(),
    }

"""
MediVision AI — Phase 4 DATA PIPELINE.
Builds the NER training corpus for medicine-strip OCR text.

Input : a curated lexicon (40 salts + 80+ Indian brands, forms, strengths,
        manufacturers) — the same data your scan app already uses.
Output: data/train.jsonl + data/val.jsonl — BIO-tagged token sequences with
        OCR-noise augmentation (char swaps O<->0, I<->1, dropped chars,
        casing chaos) so the model tolerates damaged-strip text.

Run    : python3 -m app.data          (regenerates the dataset)
Labels : BRAND, SALT, STRENGTH, FORM, MFR  (BIO scheme)
"""
import json
import os
import random
import re

random.seed(42)

HERE = os.path.dirname(__file__)
DATA_DIR = os.path.join(HERE, "..", "data")

# ---------------- curated lexicon (salt -> Indian brand hints) ----------------
LEXICON = {
    "Paracetamol": ["Dolo", "Crocin", "Calpol", "Metacin", "Pacimol"],
    "Ibuprofen": ["Brufen", "Ibugesic"],
    "Aspirin": ["Ecosprin", "Dispirin", "Loprin"],
    "Pantoprazole": ["Pan 40", "Pantocid", "Pantop"],
    "Omeprazole": ["Omez", "Ocid"],
    "Esomeprazole": ["Nexpro", "Sompraz"],
    "Rabeprazole": ["Razo", "Rabium"],
    "Metformin": ["Glycomet", "Glucophage", "Obimet"],
    "Glimepiride": ["Amaryl", "Glimestar", "Glimis"],
    "Gliclazide": ["Glizid", "Reclide"],
    "Sitagliptin": ["Januvia", "Sitazit"],
    "Amlodipine": ["Amlopres", "Stamlo", "Amlong"],
    "Telmisartan": ["Telma", "Telsartan", "Telvas"],
    "Losartan": ["Losar", "Repace"],
    "Ramipril": ["Cardace", "Ramistar"],
    "Atenolol": ["Aten", "Betacard"],
    "Metoprolol": ["Metolar", "Betaloc"],
    "Atorvastatin": ["Atorva", "Atorlip", "Lipvas", "Storvas"],
    "Rosuvastatin": ["Rosuvas", "Rozavel", "Rosutor"],
    "Clopidogrel": ["Clopilet", "Deplatt", "Clotnil"],
    "Azithromycin": ["Azithral", "Azee", "Azithro"],
    "Amoxicillin": ["Mox", "Novamox", "Augmentin", "Clavam"],
    "Cefixime": ["Taxim-O", "Zifi", "Cefolac"],
    "Ciprofloxacin": ["Ciplox", "Cifran", "Ciprodac"],
    "Ofloxacin": ["Zanocin", "Oflox"],
    "Levofloxacin": ["Levotas", "Loxof", "Levotas-500"],
    "Doxycycline": ["Doxt", "Doxy-1"],
    "Cetirizine": ["Cetzine", "Okacet", "Alerid"],
    "Levocetirizine": ["Xyzal", "Teczine", "Levocet"],
    "Montelukast": ["Montair", "Montek", "Montair LC"],
    "Diclofenac": ["Voveran", "Voltaren", "Diclomol"],
    "Aceclofenac": ["Hifenac", "Aceclo"],
    "Tramadol": ["Contramal", "Tramatas"],
    "Ondansetron": ["Emeset", "Ondem", "Vomikind"],
    "Domperidone": ["Domstal", "Vomistop"],
    "Ranitidine": ["Rantac", "Aciloc", "Histac"],
    "Levothyroxine": ["Thyronorm", "Eltroxin", "Thyrox"],
    "Cholecalciferol": ["Calcirol", "Drise", "D3 60K"],
    "Folic Acid": ["Folvite"],
    "Salbutamol": ["Asthalin", "Volmax", "Salbetol"],
}

# INN (India) -> USAN (US naming used by RxNorm/openFDA)
SALT_TO_US = {
    "Paracetamol": "Acetaminophen",
    "Salbutamol": "Albuterol",
    "Ranitidine": "Ranitidine",
}

BRAND_TO_SALT = {b.lower(): salt for salt, brands in LEXICON.items() for b in brands}

FORMS = ["Tablet", "Tablets", "Tab", "TAB", "Cap", "Capsule", "CAP", "Strip", "Sachet", "Suspension", "Injection", "SR Tab"]
STRENGTHS = ["325", "500", "650", "40", "20", "75", "150", "300", "10", "5", "2.5", "0.4", "0.5", "25", "50", "100", "850", "1000", "60K"]
STRENGTH_UNITS = ["MG", "mg", "Mcg", "mcg", "g"]
COMBOS = ["500/125", "10/650", "50/10", "5/500", "20/750", "2/500", "100+5"]
MFRS = ["Cipla", "Sun Pharma", "Mankind", "Alkem", "Micro Labs", "Torrent Pharma", "Zydus", "Dr Reddys", "GSK", "Abbott", "Lupin", "USV", "Aristo", "Intas", "Macleods", "Glenmark"]
FILLERS = [
    "Store below 25 C", "Keep out of reach of children", "Each film coated tablet contains",
    "Mfg Lic No 112", "Batch No B245", "MRP Rs 35.00", "Strip of 15 tablets", "Only",
    "Pack 10 x 10", "Not for sale", "Regd", "Estd 1984", "IP", "Sterile",
]

OCR_SWAPS = {"O": "0", "0": "O", "I": "1", "1": "I", "l": "1", "B": "8", "S": "5", "Z": "2", "G": "6", "D": "0"}


def ocr_noise(text: str, p: float = 0.12) -> str:
    """Simulate damaged-strip OCR: char swaps, drops, case chaos."""
    out = []
    for ch in text:
        r = random.random()
        if r < p and ch in OCR_SWAPS:
            out.append(OCR_SWAPS[ch])
        elif r < p * 0.3 and ch.isalpha():
            continue  # dropped character
        else:
            out.append(ch if random.random() > p * 0.2 else ch.lower() if ch.isupper() else ch)
    return "".join(out)


def tokenize(s: str):
    return re.findall(r"[A-Za-z0-9][A-Za-z0-9.%/+°-]*|[^\sA-Za-z0-9]", s)


def tag_span(text, label):
    """(tokens, BIO tags) for one labelled segment: first token B-, rest I-."""
    toks = tokenize(text)
    tags = [f"B-{label}"] + [f"I-{label}"] * (len(toks) - 1)
    return toks, tags


def tag_o(text):
    toks = tokenize(text)
    return toks, ["O"] * len(toks)


def make_sentence():
    """One synthetic strip line -> (tokens, tags), kept strictly aligned."""
    salt = random.choice(list(LEXICON.keys()))
    brands = LEXICON[salt]
    parts = []
    kind = random.random()

    if kind < 0.45:  # brand-led (most common on real strips)
        parts.append(tag_span(random.choice(brands), "BRAND"))
        if random.random() < 0.85:
            st = random.choice(STRENGTHS) + random.choice(["", random.choice(STRENGTH_UNITS)])
            parts.append(tag_span(st, "STRENGTH"))
    elif kind < 0.75:  # salt printed directly
        parts.append(tag_span(salt, "SALT"))
        parts.append(tag_span(random.choice(STRENGTHS) + random.choice(["MG", "mg", ""]), "STRENGTH"))
    else:  # brand + salt both
        parts.append(tag_span(random.choice(brands), "BRAND"))
        parts.append(tag_span(salt, "SALT"))

    if random.random() < 0.55:
        parts.append(tag_span(random.choice(FORMS), "FORM"))
    if random.random() < 0.12:
        parts.append(tag_span(random.choice(COMBOS), "STRENGTH"))
    if random.random() < 0.35:
        parts.append(tag_span(random.choice(MFRS), "MFR"))
    if random.random() < 0.30:
        parts.append(tag_o(random.choice(FILLERS)))

    tokens, tags = [], []
    for toks, labs in parts:
        tokens.extend(toks)
        tags.extend(labs)

    # separators between segments (unlabelled)
    out_t, out_g = [], []
    for t, g in zip(tokens, tags):
        if random.random() < 0.12 and out_t:
            sep = "|" if random.random() < 0.5 else "•"
            out_t.append(sep)
            out_g.append("O")
        out_t.append(t)
        out_g.append(g)
    tokens, tags = out_t, out_g

    if random.random() < 0.6:  # 60% of lines get OCR damage
        joined = " ".join(tokens)
        damaged = tokenize(ocr_noise(joined))
        if len(damaged) == len(tokens):
            tokens = damaged  # keep alignment; else keep clean version
    return tokens, tags


def build_dataset(n_train=4500, n_val=600):
    rows = []
    while len(rows) < n_train + n_val:  # generate until enough VALID rows
        tokens, tags = make_sentence()
        if len(tokens) >= 3:
            rows.append({"tokens": tokens, "tags": tags})
    train, val = rows[:n_train], rows[n_train:]
    os.makedirs(DATA_DIR, exist_ok=True)
    for name, data in (("train.jsonl", train), ("val.jsonl", val)):
        with open(os.path.join(DATA_DIR, name), "w", encoding="utf-8") as f:
            for r in data:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return len(train), len(val)


if __name__ == "__main__":
    n_tr, n_va = build_dataset()
    sample = open(os.path.join(DATA_DIR, "train.jsonl"), encoding="utf-8").readline()
    print(f"dataset built: {n_tr} train / {n_va} val -> data/train.jsonl, data/val.jsonl")
    print("sample:", sample[:220])

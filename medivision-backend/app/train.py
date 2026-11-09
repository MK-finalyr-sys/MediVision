"""
MediVision AI — Phase 4 MODEL TRAINING.
One command:  python3 -m app.train
Trains the CRF NER on the generated dataset, evaluates entity-level
precision/recall/F1 on the val split, saves model + report.

Upgrade path (optional, GPU): fine-tune DistilBERT token classification in
free Google Colab — see models/DISTILBERT_COLAB.py in this folder.
"""
import json
import os
import time
from collections import defaultdict

import joblib
from sklearn_crfsuite import CRF

from . import data
from .model_ner import MODEL_PATH, REPORT_PATH, features


def load(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def spans_of(tags):
    out, cur, lab = [], [], None
    for g in tags:
        if g.startswith("B-"):
            if cur:
                out.append((lab, len(cur)))
            cur, lab = [g], g[2:]
        elif g.startswith("I-") and cur and lab == g[2:]:
            cur.append(g)
        else:
            if cur:
                out.append((lab, len(cur)))
            cur, lab = ([g], g[2:]) if g != "O" else ([], None)
            if g == "O":
                cur = []
    if cur:
        out.append((lab, len(cur)))
    return out


def evaluate(y_true, y_pred):
    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)
    for truth, pred in zip(y_true, y_pred):
        t = defaultdict(int)
        for lab, n in spans_of(truth):
            t[(lab, n)] += 1
        p = defaultdict(int)
        for lab, n in spans_of(pred):
            p[(lab, n)] += 1
        for k in set(t) | set(p):
            tp[k[0]] += min(t[k], p[k])
            fp[k[0]] += max(0, p[k] - t[k])
            fn[k[0]] += max(0, t[k] - p[k])
    report = {}
    all_tp = all_fp = all_fn = 0
    for lab in ("BRAND", "SALT", "STRENGTH", "FORM", "MFR"):
        prec = tp[lab] / (tp[lab] + fp[lab]) if tp[lab] + fp[lab] else 0.0
        rec = tp[lab] / (tp[lab] + fn[lab]) if tp[lab] + fn[lab] else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        report[lab] = {"precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4)}
        all_tp += tp[lab]
        all_fp += fp[lab]
        all_fn += fn[lab]
    prec = all_tp / (all_tp + all_fp) if all_tp + all_fp else 0.0
    rec = all_tp / (all_tp + all_fn) if all_tp + all_fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    report["micro"] = {"precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4)}
    return report


def main():
    t0 = time.time()
    print("[1/4] building dataset (data pipeline)…")
    n_tr, n_va = data.build_dataset()
    train = load(os.path.join(data.DATA_DIR, "train.jsonl"))
    val = load(os.path.join(data.DATA_DIR, "val.jsonl"))
    print(f"      {len(train)} train / {len(val)} val sentences (on disk)")

    print("[2/4] training CRF…")
    crf = CRF(algorithm="lbfgs", c1=0.1, c2=0.1, max_iterations=140, all_possible_transitions=True)
    crf.fit([features(r["tokens"]) for r in train], [r["tags"] for r in train])

    print("[3/4] evaluating on val split…")
    y_pred = crf.predict([features(r["tokens"]) for r in val])
    report = evaluate([r["tags"] for r in val], y_pred)

    print("[4/4] saving model + report…")
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    joblib.dump(crf, MODEL_PATH)
    report["meta"] = {
        "model": "CRF (lbfgs, c1=0.1, c2=0.1) — sklearn-crfsuite",
        "train_sentences": n_tr,
        "val_sentences": n_va,
        "labels": "BRAND SALT STRENGTH FORM MFR (BIO)",
        "trained_seconds": round(time.time() - t0, 1),
        "noise_augmentation": "OCR char swaps/drops on 60% of lines",
    }
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print("\n=== Entity-level results (val split) ===")
    for lab, m in report.items():
        if lab != "meta":
            print(f"  {lab:9s} P={m['precision']:.3f} R={m['recall']:.3f} F1={m['f1']:.3f}")
    print(f"  trained in {report['meta']['trained_seconds']}s -> models/ner_crf.joblib")


if __name__ == "__main__":
    main()

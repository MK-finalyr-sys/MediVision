"""
MediVision AI — optional model upgrade: DistilBERT NER in free Google Colab.

The shipped model is the CRF (app/model_ner.py). This script fine-tunes
distilbert-base-uncased for token classification on the SAME dataset the CRF
used (data/train.jsonl + data/val.jsonl), so you can compare F1 in your report.

How to use (free):
  1. Go to colab.research.google.com → New notebook
  2. Runtime → Change runtime type → T4 GPU
  3. Upload medivision-backend/data/train.jsonl and val.jsonl
  4. Paste this whole file into one cell and run (~15-25 min)

After training you get models/distilbert-ner/ plus a val F1 you can put
next to the CRF number in your report.
"""

# ── 1. install ──────────────────────────────────────────────────────────────
# !pip -q install transformers datasets seqeval

# ── 2. load the JSONL dataset ───────────────────────────────────────────────
import json

LABELS = ["O", "B-BRAND", "I-BRAND", "B-SALT", "I-SALT", "B-STRENGTH", "I-STRENGTH", "B-FORM", "I-FORM", "B-MFR", "I-MFR"]
LABEL2ID = {l: i for i, l in enumerate(LABELS)}
ID2LABEL = {i: l for l, i in LABEL2ID.items()}


def load_jsonl(path):
    return [json.loads(l) for l in open(path, encoding="utf-8")]


train_rows = load_jsonl("train.jsonl")   # uploaded to Colab
val_rows = load_jsonl("val.jsonl")

# ── 3. tokenise with label alignment ────────────────────────────────────────
from transformers import AutoTokenizer

MODEL = "distilbert-base-uncased"
tok = AutoTokenizer.from_pretrained(MODEL)


def encode(rows):
    enc = tok([r["tokens"] for r in rows], is_split_into_words=True, truncation=True, max_length=64)
    labels = []
    for i, r in enumerate(rows):
        word_ids = enc.word_ids(batch_index=i)
        prev, labs = None, []
        for wid in word_ids:
            if wid is None:
                labs.append(-100)
            elif wid != prev:
                labs.append(LABEL2ID[r["tags"][wid]])
            else:
                labs.append(LABEL2ID[r["tags"][wid]] if r["tags"][wid].startswith("I-") else -100)
            prev = wid
        labels.append(labs)
    enc["labels"] = labels
    return enc


train_enc = encode(train_rows)
val_enc = encode(val_rows)

# ── 4. train ────────────────────────────────────────────────────────────────
from datasets import Dataset
from transformers import (
    AutoModelForTokenClassification,
    DataCollatorForTokenClassification,
    Trainer,
    TrainingArguments,
)

train_ds = Dataset.from_dict(train_enc)
val_ds = Dataset.from_dict(val_enc)
model = AutoModelForTokenClassification.from_pretrained(
    MODEL, num_labels=len(LABELS), id2label=ID2LABEL, label2id=LABEL2ID
)

args = TrainingArguments(
    "distilbert-ner",
    per_device_train_batch_size=32,
    num_train_epochs=3,
    learning_rate=5e-5,
    eval_strategy="epoch",
    logging_steps=50,
    save_strategy="no",
    report_to=[],
)
trainer = Trainer(
    model=model,
    args=args,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    data_collator=DataCollatorForTokenClassification(tok),
)
trainer.train()

# ── 5. entity-level F1 (same metric as the CRF report) ──────────────────────
import numpy as np
from seqeval.metrics import classification_report

pred = trainer.predict(val_ds)
preds = np.argmax(pred.predictions, axis=2)
true_tags, pred_tags = [], []
for row_labels, row_preds in zip(pred.label_ids, preds):
    t = [ID2LABEL[l] for l, p in zip(row_labels, row_preds) if l != -100]
    p_ = [ID2LABEL[p] for l, p in zip(row_labels, row_preds) if l != -100]
    true_tags.append(t)
    pred_tags.append(p_)
print(classification_report(true_tags, pred_tags, digits=4))

# ── 6. save for download ────────────────────────────────────────────────────
trainer.save_model("distilbert-ner")
tok.save_pretrained("distilbert-ner")
# Colab: Files → distilbert-ner/ → download; put it in medivision-backend/models/

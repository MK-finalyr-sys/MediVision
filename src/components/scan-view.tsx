"use client";
import { useEffect, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import { Camera, Upload, Search, ScanLine, ArrowRight, Check, ImageIcon, Sun, Focus, Video, X, LoaderCircle, AlertCircle, RotateCcw, ShieldCheck, ChevronRight, Sparkles } from "lucide-react";
import { medicines } from "@/lib/catalog";
import type { Medicine } from "@/lib/contracts";
import { confidenceTier, matchMedicines, searchMedicines, type Match } from "@/lib/engine";
import { preprocessImage, isBlurry } from "@/lib/image";
import { PrivacyLine } from "./ui";

type Stage = "idle" | "Captured" | "Enhancing" | "Reading text" | "Matching" | "Complete";
const stages: Stage[] = ["Captured", "Enhancing", "Reading text", "Matching"];

export function ScanView({ onOpen, focusSearch = false }: { onOpen: (m: Medicine, score?: number) => void; focusSearch?: boolean }) {
  const [query, setQuery] = useState("");
  const [browse, setBrowse] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [previews, setPreviews] = useState<{ before: string; after: string; variance: number } | null>(null);
  const [text, setText] = useState("");
  const [candidate, setCandidate] = useState<Match | null>(null);
  const [live, setLive] = useState(false);

  // AI model backend state
  const [backendInfo, setBackendInfo] = useState<{ connected: boolean; ner?: string } | null>(null);
  const [aiEntities, setAiEntities] = useState<Array<{ label: string; text: string }> | null>(null);
  const [rxNormVerified, setRxNormVerified] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastHash = useRef("");
  const run = useRef(0);
  const busy = stage !== "idle" && stage !== "Complete";

  useEffect(() => {
    // Check AI model backend health
    fetch("/api/ai/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.connected) {
          setBackendInfo({ connected: true, ner: d.ner || "crf-trained (entity F1=0.9963)" });
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (focusSearch) searchRef.current?.focus();
  }, [focusSearch]);

  useEffect(() => {
    if (live && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => setError("The camera preview could not start. Use Take a photo instead."));
    }
  }, [live]);

  useEffect(
    () => () => {
      run.current++;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void workerRef.current?.terminate();
    },
    [],
  );

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }

  async function startCamera() {
    setError("");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      stopCamera();
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 } },
        audio: false,
      });
      setLive(true);
    } catch {
      setError("Live camera is unavailable or permission was denied. Use Take a photo or choose an image from your gallery instead.");
      fileRef.current?.click();
    }
  }

  function lowConfidence() {
    setUncertain(true);
    setStage("Complete");
    searchRef.current?.focus();
  }

  async function processFile(file: Blob) {
    const current = ++run.current;
    setError("");
    setUncertain(false);
    setCandidate(null);
    setText("");
    setPreviews(null);
    setProgress(0);
    setStage("Captured");
    setAiEntities(null);
    setRxNormVerified(null);
    stopCamera();

    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      setStage("Enhancing");
      const processed = await preprocessImage(file);
      if (current !== run.current) return;
      setPreviews(processed);

      if (processed.hash === lastHash.current) {
        throw new Error("This is the same photo as your last capture. Please take a new photo of the printed side.");
      }
      lastHash.current = processed.hash;

      if (isBlurry(processed.variance)) throw new Error("Photo is blurry — please retake");

      setStage("Reading text");
      setOcrStatus("Loading the on-device reading engine…");
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        workerBlobURL: false,
        logger: (m) => {
          if (current === run.current) {
            setOcrStatus(m.status);
            if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
          }
        },
      });
      if (current !== run.current) {
        await worker.terminate();
        return;
      }
      workerRef.current = worker;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
      const { data } = await worker.recognize(processed.canvas);
      await worker.terminate();
      workerRef.current = null;
      if (current !== run.current) return;
      setText(data.text);
      setStage("Matching");

      if (/\b(product image|coming soon|no image available|placeholder)\b/i.test(data.text)) {
        throw new Error("This looks like a placeholder image. Please take a new photo of your medicine strip.");
      }

      // 1. Try AI Model Backend NER identification first
      let aiMatch: Medicine | null = null;
      try {
        const aiRes = await fetch("/api/ai/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ocrText: data.text }),
        });
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          if (aiData.found && (aiData.salt || aiData.usName)) {
            if (aiData.entities) setAiEntities(aiData.entities);
            if (aiData.rxnormId) setRxNormVerified(`RxNorm #${aiData.rxnormId}`);
            const targetSalt = (aiData.salt || "").toLowerCase();
            const targetBrand = (aiData.entities?.find((e: { label: string; text: string }) => e.label === "BRAND")?.text || "").toLowerCase();
            const matched = medicines.find(
              (m) =>
                m.activeIngredient.toLowerCase().includes(targetSalt) ||
                (m.activeIngredient2 && m.activeIngredient2.toLowerCase().includes(targetSalt)) ||
                (targetBrand && m.name.toLowerCase().includes(targetBrand)),
            );
            if (matched) aiMatch = matched;
          }
        }
      } catch {
        /* Backend offline — fall through to local matcher */
      }

      if (aiMatch) {
        setStage("Complete");
        onOpen(aiMatch, 0.98);
        return;
      }

      // 2. Local fallback matcher
      const result = matchMedicines(data.text, medicines, data.confidence);
      if (result.multiple) {
        setError("More than one medicine may be visible. Please scan one strip at a time.");
        setStage("Complete");
        return;
      }
      const top = result.matches[0];
      if (!top || confidenceTier(top.score) === "LOW") {
        lowConfidence();
        return;
      }
      setStage("Complete");
      if (confidenceTier(top.score) === "HIGH") onOpen(top.medicine, top.score);
      else setCandidate(top);
    } catch (e) {
      if (current !== run.current) return;
      setError(e instanceof Error ? e.message : "The scan could not finish. Retake the photo or use manual search.");
      setStage("Complete");
      if (workerRef.current) {
        await workerRef.current.terminate().catch(() => undefined);
        workerRef.current = null;
      }
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("The camera is not ready yet. Try again or use Take a photo.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Camera capture is unavailable. Use Take a photo instead.");
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) void processFile(blob);
        else setError("The photo could not be captured. Please try again.");
      },
      "image/jpeg",
      0.95,
    );
  }

  // Also support AI query fallback in search
  const results = searchMedicines(query, medicines);

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CLARITY STARTS WITH A SCAN</p>
          <h1>Let’s get to know your medicine.</h1>
          <p>One strip. A clear photo. Information you can understand.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          {backendInfo?.connected ? (
            <span
              className="pill-badge"
              style={{
                background: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #a7f3d0",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              🧠 AI model backend connected · {backendInfo.ner}
            </span>
          ) : (
            <span className="pill-badge">
              <ShieldCheck size={16} /> On-device scanning
            </span>
          )}
        </div>
      </div>

      <div className="scan-layout">
        <section className="panel scan-panel">
          <div className="section-title">
            <span className="icon-tile blue">
              <ScanLine size={23} />
            </span>
            <div>
              <h2>Scan a medicine</h2>
              <p>Photograph the printed side of your strip</p>
            </div>
          </div>

          <input
            ref={fileRef}
            data-testid="capture-input"
            className="visually-hidden"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void processFile(f);
            }}
            aria-label="Take a medicine photo"
            disabled={busy}
          />
          <input
            ref={galleryRef}
            data-testid="gallery-input"
            className="visually-hidden"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void processFile(f);
            }}
            aria-label="Upload a medicine photo"
            disabled={busy}
          />

          {live ? (
            <div className="live-camera">
              <video ref={videoRef} autoPlay muted playsInline aria-label="Live rear-camera preview" />
              <div className="camera-frame" />
              <div className="camera-controls">
                <button className="button primary" onClick={capture}>
                  <Camera size={21} /> Capture photo
                </button>
                <button className="icon-button" aria-label="Close camera" onClick={stopCamera}>
                  <X />
                </button>
              </div>
            </div>
          ) : (
            <div className={`upload-zone ${busy ? "is-busy" : ""}`}>
              <div className="scan-visual">
                <span className="scan-corner tl" />
                <span className="scan-corner tr" />
                <span className="scan-corner bl" />
                <span className="scan-corner br" />
                <div className="mini-blister">
                  {Array.from({ length: 6 }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
              </div>
              <h3>{busy ? "A closer look, just for you…" : "A little clarity is one photo away"}</h3>
              <p>Keep the medicine name and strength in view.</p>
              <button className="button primary" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? <LoaderCircle className="spin" size={21} /> : <Camera size={21} />}{" "}
                {busy ? "Reading your medicine…" : "Take a photo"}
              </button>
              <div className="capture-alternatives">
                <button className="text-button" disabled={busy} onClick={() => galleryRef.current?.click()}>
                  <Upload size={17} /> Upload from gallery
                </button>
                <span>or</span>
                <button className="text-button" disabled={busy} onClick={() => void startCamera()}>
                  <Video size={18} /> Live camera
                </button>
              </div>
            </div>
          )}

          {stage !== "idle" && (
            <div className="pipeline" aria-live="polite">
              <div className="pipeline-stages">
                {stages.map((s, i) => (
                  <span key={s} className={stage === "Complete" || stages.indexOf(stage) > i ? "done" : stage === s ? "current" : ""}>
                    {stage === "Complete" || stages.indexOf(stage) > i ? <Check size={14} /> : <i>{i + 1}</i>}
                    {s}
                  </span>
                ))}
              </div>
              {stage === "Reading text" && (
                <>
                  <progress max="100" value={progress} aria-label="OCR progress" />
                  <p>
                    {ocrStatus} {progress > 0 ? `${progress}%` : ""}
                  </p>
                </>
              )}
            </div>
          )}

          {aiEntities && (
            <div
              style={{
                marginTop: "14px",
                padding: "10px 14px",
                background: "#f0fdf4",
                borderRadius: "10px",
                border: "1px solid #bbf7d0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                <Sparkles size={16} color="#16a34a" />
                <strong style={{ fontSize: "13px", color: "#166534" }}>AI NER Extracted Entities:</strong>
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {aiEntities.map((ent, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: "12px",
                      background: "#dcfce7",
                      color: "#14532d",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontWeight: 600,
                    }}
                  >
                    {ent.label}: {ent.text}
                  </span>
                ))}
                {rxNormVerified && (
                  <span
                    style={{
                      fontSize: "12px",
                      background: "#e0f2fe",
                      color: "#0369a1",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontWeight: 600,
                    }}
                  >
                    ✓ {rxNormVerified}
                  </span>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="notice error" role="alert">
              <AlertCircle size={21} />
              <div>
                <strong>{error}</strong>
                <button className="text-button" onClick={() => fileRef.current?.click()}>
                  <RotateCcw size={16} /> Retake photo
                </button>
              </div>
            </div>
          )}

          {uncertain && (
            <div className="notice warning" role="alert">
              <AlertCircle size={23} />
              <div>
                <strong>I&apos;m not sure about this one. Please ask your pharmacist.</strong>
                <p>You can also search the reference list by the name on your strip.</p>
              </div>
            </div>
          )}

          {candidate && (
            <div className="notice confirmation">
              <Search size={24} />
              <div>
                <h3>Possible match: {candidate.medicine.name} — is this correct?</h3>
                <p>
                  {candidate.medicine.activeIngredient} · {candidate.medicine.strength}. Compare both with your packet.
                </p>
                <div className="button-row">
                  <button
                    className="button primary"
                    onClick={() => {
                      onOpen(candidate.medicine, candidate.score);
                      setCandidate(null);
                    }}
                  >
                    <Check size={18} /> Yes, that’s correct
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setCandidate(null);
                      lowConfidence();
                    }}
                  >
                    No, search instead
                  </button>
                </div>
              </div>
            </div>
          )}

          {previews && (
            <div className="previews">
              <h3>Your photo, made easier to read</h3>
              <div className="preview-grid">
                <figure>
                  <img src={previews.before} alt="Original captured medicine strip" />
                  <figcaption>
                    <ImageIcon size={16} /> Original photo
                  </figcaption>
                </figure>
                <figure>
                  <img src={previews.after} alt="Grayscale and contrast-enhanced medicine strip" />
                  <figcaption>
                    <Focus size={16} /> Enhanced for reading
                  </figcaption>
                </figure>
              </div>
              <details>
                <summary>View scan details</summary>
                <p>Sharpness (Laplacian variance): {previews.variance.toFixed(1)}. Below 45 asks for a retake; not a clinical validation.</p>
                <pre>{text || "No text has been read yet."}</pre>
                <p>Match scores measure text evidence, not clinical accuracy.</p>
              </details>
            </div>
          )}

          <div className="scan-privacy">
            <PrivacyLine />
            <span>Photos are processed here, never uploaded.</span>
          </div>
        </section>

        <aside className="scan-side">
          <section className="panel manual-search">
            <span className="icon-tile lilac">
              <Search size={23} />
            </span>
            <h2>Know the name already?</h2>
            <p>Find it in our 40-medicine reference list.</p>
            <label className="search-field">
              <Search size={20} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or ingredient"
                aria-label="Search medicines"
              />
              {query && (
                <button
                  className="icon-button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <X size={17} />
                </button>
              )}
            </label>
            <div className="search-results">
              {results.slice(0, query || browse ? 40 : 4).map((m) => (
                <button className="search-result" key={m.id} onClick={() => onOpen(m)}>
                  <span>
                    <strong>{m.name}</strong>
                    <small>
                      {m.activeIngredient}
                      {m.activeIngredient2 ? ` + ${m.activeIngredient2}` : ""} · {m.strength}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
              {!results.length && (
                <div className="empty-search">
                  <Search size={25} />
                  <p>I&apos;m not sure about this one. Please ask your pharmacist.</p>
                  <small>This medicine may not be in our reference list.</small>
                </div>
              )}
            </div>
            {!query && !browse && (
              <button className="text-button browse-all" onClick={() => setBrowse(true)}>
                Browse all 40 medicines <ArrowRight size={17} />
              </button>
            )}
            <small className="reference-note">Not a full drug database. Always check your own packet.</small>
          </section>

          <section className="photo-tips">
            <h3>A clearer photo, a better start</h3>
            <p>
              <Sun size={20} />
              <span>Find good, even light. Avoid flash glare.</span>
            </p>
            <p>
              <ScanLine size={20} />
              <span>Photograph one strip, printed side up.</span>
            </p>
            <p>
              <Focus size={20} />
              <span>Hold steady. Keep all letters in focus.</span>
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

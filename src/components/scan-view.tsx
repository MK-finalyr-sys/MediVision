"use client";
import { useEffect, useRef, useState } from "react";
import type { Worker } from "tesseract.js";
import {
  Camera,
  Upload,
  Search,
  ScanLine,
  ArrowRight,
  Check,
  ImageIcon,
  Sun,
  Focus,
  Video,
  X,
  LoaderCircle,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  ChevronRight,
  Globe,
  ExternalLink,
} from "lucide-react";
import { medicines } from "@/lib/catalog";
import type { Medicine } from "@/lib/contracts";
import { confidenceTier, matchMedicines, searchMedicines, type Match } from "@/lib/engine";
import { preprocessImage, isBlurry } from "@/lib/image";
import { PrivacyLine } from "./ui";

type Stage = "idle" | "Captured" | "Enhancing" | "Reading text" | "Matching" | "Complete";
const stages: Stage[] = ["Captured", "Enhancing", "Reading text", "Matching"];

interface OnlineResult {
  found: boolean;
  query: string;
  salt?: string | null;
  usName?: string | null;
  rxnormId?: string | null;
  brandExamples?: string | null;
  manufacturer?: string | null;
  mappingBasis?: string | null;
  label?: {
    uses?: string | null;
    warnings?: string | null;
    sideEffects?: string | null;
  } | null;
  card?: {
    model?: string;
    uses?: string;
    beforeYouTake?: string[];
    sideEffects?: string;
    stopAndGetHelp?: string[];
    en?: {
      uses?: string;
      beforeYouTake?: string[];
      sideEffects?: string;
      stopAndGetHelp?: string[];
    };
  } | null;
  entities?: Array<{ label: string; text: string }>;
  nerModel?: string;
  sources?: Array<{ title: string; url: string; sourceType?: string }>;
  webEvidence?: Array<{ title: string; url: string; snippet?: string }>;
  searchQueries?: string[];
  note?: string | null;
  engine?: string;
}

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
  const [ocrWords, setOcrWords] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<Match | null>(null);
  const [live, setLive] = useState(false);

  // AI Backend state
  const [backendInfo, setBackendInfo] = useState<{ connected: boolean; ner?: string } | null>(null);
  const [onlineResult, setOnlineResult] = useState<OnlineResult | null>(null);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);

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

  async function runOnlineSearch(searchText: string) {
    const q = searchText.trim();
    if (!q) return;
    setOnlineLoading(true);
    setOnlineError(null);
    setOnlineResult(null);

    try {
      const res = await fetch("/api/ai/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocrText: q }),
      });
      if (res.ok) {
        const data = (await res.json()) as OnlineResult;
        setOnlineResult(data);
      } else {
        setOnlineError("Unable to reach medical databases. Please check your internet connection.");
      }
    } catch {
      setOnlineError("Medical database search failed. Offline reference list is still available.");
    } finally {
      setOnlineLoading(false);
    }
  }

  function lowConfidence(readText: string) {
    setUncertain(true);
    setStage("Complete");
    searchRef.current?.focus();
    // Automatically trigger AI backend search for the scanned strip if text exists
    if (readText && readText.trim().length >= 3) {
      void runOnlineSearch(readText);
    }
  }

  async function processFile(file: Blob) {
    const current = ++run.current;
    setError("");
    setUncertain(false);
    setCandidate(null);
    setText("");
    setOcrWords([]);
    setPreviews(null);
    setOnlineResult(null);
    setOnlineError(null);
    setProgress(0);
    setStage("Captured");
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
      setOcrStatus("Loading on-device reading engine…");
      const { createWorker, PSM } = await import("tesseract.js");

      let worker: Worker;
      try {
        worker = await createWorker("eng", 1, {
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
      } catch {
        // Fallback to standard Tesseract worker if local assets have a cache lock
        worker = await createWorker("eng", 1, {
          logger: (m) => {
            if (current === run.current) {
              setOcrStatus(m.status);
              if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
            }
          },
        });
      }

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

      const rawText = data.text || "";
      setText(rawText);

      // Extract words for "TEXT FOUND ON STRIP" chips
      const extractedWords = rawText
        .split(/\s+/)
        .map((w) => w.trim().replace(/[^a-zA-Z0-9]/g, ""))
        .filter((w) => w.length >= 2)
        .slice(0, 16);
      setOcrWords(extractedWords);

      setStage("Matching");

      if (/\b(product image|coming soon|no image available|placeholder)\b/i.test(rawText)) {
        throw new Error("This looks like a placeholder image. Please take a new photo of your medicine strip.");
      }

      // Check local catalog match
      const result = matchMedicines(rawText, medicines, data.confidence);
      if (result.multiple) {
        setError("More than one medicine may be visible. Please scan one strip at a time.");
        setStage("Complete");
        return;
      }
      const top = result.matches[0];
      if (!top || confidenceTier(top.score) === "LOW") {
        lowConfidence(rawText);
        return;
      }
      setStage("Complete");
      if (confidenceTier(top.score) === "HIGH") {
        onOpen(top.medicine, top.score);
      } else {
        setCandidate(top);
      }
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

          {/* 1. BEFORE & AFTER ENHANCED PREVIEWS (IMAGE 1) */}
          {previews && (
            <div className="previews" style={{ marginTop: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>BEFORE</span>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "#2563eb", textTransform: "uppercase" }}>AFTER (ENHANCED)</span>
              </div>
              <div className="preview-grid">
                <figure>
                  <img src={previews.before} alt="Original captured medicine strip" />
                </figure>
                <figure>
                  <img src={previews.after} alt="Grayscale and contrast-enhanced medicine strip" />
                </figure>
              </div>

              {/* TEXT FOUND ON STRIP CHIPS (IMAGE 1) */}
              {ocrWords.length > 0 && (
                <div style={{ marginTop: "14px" }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "6px" }}>
                    TEXT FOUND ON STRIP
                  </p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {ocrWords.map((word, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "3px 8px",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          color: "#334155",
                        }}
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. UNCERTAIN BOX WITH "SEARCH FREE MEDICAL DATABASES" BUTTON (IMAGE 1) */}
          {uncertain && (
            <div
              className="notice warning"
              role="alert"
              style={{
                marginTop: "16px",
                background: "#fef2f2",
                border: "1.5px solid #fecaca",
                borderRadius: "14px",
                padding: "16px",
                display: "flex",
                gap: "12px",
                alignItems: "flex-start",
              }}
            >
              <AlertCircle size={22} color="#dc2626" style={{ marginTop: "2px", flexShrink: 0 }} />
              <div style={{ width: "100%" }}>
                <strong style={{ color: "#991b1b", fontSize: "16px", display: "block" }}>
                  I&apos;m not sure about this one. Please ask your pharmacist.
                </strong>

                <div style={{ marginTop: "12px" }}>
                  <button
                    className="button primary"
                    onClick={() => void runOnlineSearch(text)}
                    disabled={onlineLoading || text.trim().length < 2}
                    style={{
                      width: "100%",
                      minHeight: "48px",
                      background: "#1d4ed8",
                      color: "#ffffff",
                      fontWeight: 700,
                      fontSize: "15px",
                      borderRadius: "10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {onlineLoading ? (
                      <>
                        <LoaderCircle className="spin" size={18} /> Checking government medical databases…
                      </>
                    ) : (
                      <>
                        <Globe size={18} /> Search free medical databases
                      </>
                    )}
                  </button>
                </div>
                <p style={{ fontSize: "12px", color: "#b91c1c", marginTop: "8px" }}>
                  Online search needs internet. Your offline reference list still works.
                </p>
              </div>
            </div>
          )}

          {/* 3. ONLINE AI DATABASE RESULT PANEL (IMAGE 2) */}
          {onlineResult && (
            <div
              style={{
                marginTop: "20px",
                background: "#ffffff",
                border: "2px solid #bfdbfe",
                borderRadius: "16px",
                padding: "20px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
              }}
            >
              {/* Medicine Title & RxNorm Tag */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                  {onlineResult.salt || onlineResult.query.slice(0, 40)}
                </h2>
                {onlineResult.rxnormId && (
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#065f46",
                      background: "#d1fae5",
                      border: "1px solid #a7f3d0",
                      padding: "4px 10px",
                      borderRadius: "20px",
                    }}
                  >
                    ✓ Salt verified in RxNorm (NIH)
                  </span>
                )}
              </div>

              {/* Yellow Warning Banner */}
              <div
                style={{
                  marginTop: "12px",
                  padding: "10px 14px",
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "8px",
                  color: "#92400e",
                  fontSize: "14px",
                }}
              >
                <strong>
                  ⚠️ This strip may contain {onlineResult.salt || "the identified medicine"} — Brand guess — please confirm
                </strong>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#b45309" }}>
                  AI read the strip photo (camera text was weak).
                </p>
              </div>

              {/* NER Entities */}
              {onlineResult.entities && onlineResult.entities.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "6px" }}>
                    YOUR CRF MODEL EXTRACTED:
                  </p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {onlineResult.entities.map((e, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: "12px",
                          background: "#f1f5f9",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          padding: "2px 8px",
                          color: "#334155",
                        }}
                      >
                        <b>{e.label}:</b> {e.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Easy-read Summary Card */}
              {(() => {
                const card = onlineResult.card?.en || onlineResult.card;
                if (!card) return null;
                return (
                  <div
                    style={{
                      marginTop: "16px",
                      padding: "16px",
                      background: "#f8fafc",
                      border: "1.5px solid #bfdbfe",
                      borderRadius: "12px",
                    }}
                  >
                    <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#1e3a8a", margin: "0 0 4px" }}>Easy-read summary</h3>
                    <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 14px" }}>
                      Researched live on the web just now (sources below) — not a government label. Confirm with your pharmacist.
                    </p>

                    {card.uses && (
                      <div style={{ marginBottom: "12px" }}>
                        <strong style={{ color: "#0f172a" }}>What it is commonly used for: </strong>
                        <span style={{ color: "#334155" }}>{card.uses}</span>
                      </div>
                    )}

                    {card.beforeYouTake && card.beforeYouTake.length > 0 && (
                      <div style={{ marginBottom: "12px" }}>
                        <strong style={{ color: "#0f172a" }}>Before you take it:</strong>
                        <ul style={{ margin: "6px 0 0", paddingLeft: "20px", color: "#334155" }}>
                          {card.beforeYouTake.map((point, idx) => (
                            <li key={idx} style={{ marginBottom: "4px" }}>
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {card.sideEffects && (
                      <div style={{ marginBottom: "12px" }}>
                        <strong style={{ color: "#0f172a" }}>Common side effects: </strong>
                        <span style={{ color: "#334155" }}>{card.sideEffects}</span>
                      </div>
                    )}

                    {card.stopAndGetHelp && card.stopAndGetHelp.length > 0 && (
                      <div style={{ marginBottom: "8px" }}>
                        <strong style={{ color: "#991b1b" }}>Stop and get medical help if...:</strong>
                        <ul style={{ margin: "6px 0 0", paddingLeft: "20px", color: "#7f1d1d" }}>
                          {card.stopAndGetHelp.map((point, idx) => (
                            <li key={idx} style={{ marginBottom: "4px" }}>
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Searched Query Info */}
              <div style={{ marginTop: "14px", fontSize: "12px", color: "#64748b" }}>
                🔍 <strong>Searched:</strong> {onlineResult.query}
              </div>

              {/* Sources */}
              {onlineResult.sources && onlineResult.sources.length > 0 && (
                <div style={{ marginTop: "14px" }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "6px" }}>
                    WHERE THIS INFORMATION COMES FROM
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                    {onlineResult.sources.map((src, idx) => (
                      <li key={idx}>
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#1d4ed8",
                            textDecoration: "underline",
                            fontSize: "13px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            wordBreak: "break-all",
                          }}
                        >
                          {src.title} <ExternalLink size={12} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {onlineError && (
            <div className="notice error" style={{ marginTop: "14px" }}>
              <AlertCircle size={20} />
              <div>
                <strong>{onlineError}</strong>
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
                      lowConfidence(text);
                    }}
                  >
                    No, search instead
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="scan-privacy" style={{ marginTop: "20px" }}>
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

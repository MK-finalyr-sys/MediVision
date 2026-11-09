"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, ScanLine, Plus, ShieldCheck } from "lucide-react";
export function Brand({ small = false }: { small?: boolean }) { return <div className={`brand ${small ? "brand-small" : ""}`}><span className="brand-symbol"><ScanLine size={31} strokeWidth={1.7} /><Plus className="brand-plus" size={15} strokeWidth={3} /></span><span>MediVision<span className="ai-badge">AI</span><small>A little clarity. Better care.</small></span></div>; }
export function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; const previous = document.activeElement as HTMLElement | null; el?.showModal(); return () => { el?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className={`modal ${className}`} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-label={title}><div className="modal-inner"><button className="icon-button close-modal" onClick={onClose} aria-label={`Close ${title}`}><X size={22} /></button>{children}</div></dialog>;
}
export function PrivacyLine() { return <span className="privacy-line"><ShieldCheck size={16} /> Your medicines stay on this device.</span>; }
export function cleanTranslation(text: string) { return text.replaceAll("[TODO: Verify translation] ", ""); }

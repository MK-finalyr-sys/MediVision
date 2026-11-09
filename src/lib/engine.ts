import Fuse from "fuse.js";
import type { Medicine, SavedMedicine, DoseLog, Tip } from "./contracts";
const stop = new Set(["tablet", "tablets", "tab", "capsule", "capsules", "mg", "mcg", "ip", "bp", "usp", "batch", "mfg", "exp", "film", "coated", "composition", "each", "contains", "ltd", "limited", "pharma", "manufactured", "by", "of", "the", "and", "acid", "hydrochloride", "sodium", "potassium", "dihydrate"]);
export function tokenize(text: string): string[] {
  return [...new Set(text.normalize("NFKD").toLowerCase().replace(/(^|\s)\.(\d)/g, (_, space: string, digit: string) => `${space}0.${digit}`).replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2").replace(/[^a-z0-9.\s]/g, " ").split(/\s+/).map(t => t.replace(/^\.+|\.+$/g, "")).filter(t => t && !stop.has(t)))];
}
export function confidenceTier(score: number): "HIGH" | "MEDIUM" | "LOW" { return !Number.isFinite(score) ? "LOW" : score >= .75 ? "HIGH" : score >= .5 ? "MEDIUM" : "LOW"; }
export function searchMedicines(text: string, medicines: Medicine[]) {
  if (!text.trim()) return medicines;
  return new Fuse(medicines, { keys: [{ name: "name", weight: .6 }, { name: "aliases", weight: .25 }, { name: "activeIngredient", weight: .15 }], threshold: .38, ignoreLocation: true, includeScore: true }).search(text.trim()).map(r => r.item);
}
export type Match = { medicine: Medicine; score: number; evidence: string[] };
export function matchMedicines(text: string, medicines: Medicine[], ocrConfidence?: number): { matches: Match[]; multiple: boolean } {
  const tokens = tokenize(text);
  if (!tokens.length) return { matches: [], multiple: false };
  const tokenSet = new Set(tokens);
  const recognizedIngredients = [...new Set(medicines.flatMap(m => [m.activeIngredient, m.activeIngredient2].filter((s): s is string => !!s)))].filter(s => tokenize(s).every(t => tokenSet.has(t)));
  const unsupportedRelease = /\b(sr|xr|cr|mr|er|xl|retard|sustained|extended)\b/i.test(text) || medicines.some(m => {
    const words = tokenize(m.name).filter(t => /[a-z]/.test(t));
    if (!words.length || !words.every(t => tokenSet.has(t))) return false;
    const next = tokens[tokens.indexOf(words[words.length - 1]) + 1];
    return !!next && /^[a-z]{1,2}$/.test(next) && !words.includes(next);
  });
  const observedUnits = [...text.toLowerCase().matchAll(/\d+(?:\.\d+)?\s*(mcg|mg|g)\b/g)].map(m => m[1]);
  const index = new Fuse(medicines, { keys: ["name", "aliases", "activeIngredient"], includeScore: true, ignoreLocation: true, threshold: .35 });
  const fuzzy = new Map<string, number>();
  function distance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { const current = [i]; for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = current; }
    return previous[b.length];
  }
  for (const term of tokens.filter(t => /^[a-z]+$/.test(t) && t.length >= 4)) {
    for (const result of index.search(term)) {
      const words = tokenize([result.item.name, ...result.item.aliases, result.item.activeIngredient, result.item.activeIngredient2 || ""].join(" ")).filter(t => /^[a-z]+$/.test(t) && t.length >= 4);
      const wholeWordEvidence = words.flatMap(word => { const length = Math.max(word.length, term.length); const edits = distance(term, word); return edits <= Math.max(1, Math.floor(length * .18)) ? [1 - edits / length] : []; });
      if (wholeWordEvidence.length) fuzzy.set(result.item.id, Math.max(fuzzy.get(result.item.id) || 0, ...wholeWordEvidence));
    }
  }
  const matches = medicines.map(medicine => {
    const nameTokens = tokenize(medicine.name);
    const letters = nameTokens.filter(t => /[a-z]/.test(t));
    const numbers = tokenize(medicine.strength).filter(t => /^\d/.test(t));
    const nameHits = letters.filter(t => tokenSet.has(t));
    const strengthHits = numbers.filter(t => tokenSet.has(t));
    const ingredientTerms = tokenize(medicine.activeIngredient);
    const ingredientHits = ingredientTerms.filter(t => tokenSet.has(t));
    const allIngredient = ingredientTerms.length > 0 && ingredientHits.length === ingredientTerms.length;
    const allName = letters.length > 0 && nameHits.length === letters.length;
    const namedNumbers = nameTokens.filter(t => /^\d/.test(t));
    const allStrength = numbers.length > 0 && (strengthHits.length === numbers.length || (numbers.length > 1 && namedNumbers.length > 0 && namedNumbers.every(t => tokenSet.has(t))));
    const hasConflictingStrength = tokens.some(t => /^\d/.test(t)) && !allStrength;
    let score = 0;
    if (allName) score = .62 + (allStrength ? .23 : 0) + (nameHits.length > 1 ? .06 : 0) + (ingredientHits.length && !letters.every(t => tokenize(medicine.activeIngredient).includes(t)) ? .06 : 0);
    else if (allIngredient) score = .50 + (allStrength ? .12 : 0);
    else if (fuzzy.has(medicine.id)) score = Math.min(allStrength ? .67 : .49, .38 + fuzzy.get(medicine.id)! * .16 + (allStrength ? .12 : 0));
    if (allName && allStrength && nameTokens.every(t => tokenSet.has(t))) score = Math.max(score, .91);
    const exactAlias = medicine.aliases.some(alias => { const ts = tokenize(alias); return ts.length >= 2 && ts.every(t => tokenSet.has(t)); });
    if (exactAlias && allStrength) score = Math.max(score, .90);
    const ownIngredients = [medicine.activeIngredient, medicine.activeIngredient2].filter(Boolean);
    if (recognizedIngredients.length && !recognizedIngredients.every(s => ownIngredients.includes(s))) score = Math.min(score, .49);
    if (allName && letters.every(t => t.length < 4) && !allStrength && !ingredientHits.length) score = Math.min(score, .49);
    const namePosition = tokens.indexOf(letters[letters.length - 1]);
    const following = tokens[namePosition + 1];
    const unsupportedSuffix = allName && namePosition >= 0 && following && /^[a-z]{1,2}$/.test(following) && !nameTokens.includes(following);
    const expectedUnits: string[] = medicine.strength.toLowerCase().match(/\b(mcg|mg|g)\b/g) || [];
    const unitsMismatch = observedUnits.length > 0 && !observedUnits.some(unit => expectedUnits.includes(unit));
    if (unsupportedRelease || unsupportedSuffix || unitsMismatch || hasConflictingStrength) score = Math.min(score, .49);
    if (ocrConfidence !== undefined && ocrConfidence < 40) score = Math.min(score, .49);
    else if (ocrConfidence !== undefined && ocrConfidence < 60) score = Math.min(score, .69);
    return { medicine, score: Math.min(.98, score), evidence: [...new Set([...nameHits, ...strengthHits, ...ingredientHits])] };
  }).filter(m => m.score >= .30).sort((a, b) => b.score - a.score);
  const explicit = matches.filter(m => { const name = tokenize(m.medicine.name); const numbers = name.filter(t => /^\d/.test(t)); const strength = tokenize(m.medicine.strength).filter(t => /^\d/.test(t)); return name.every(t => tokenSet.has(t)) && (numbers.length ? numbers.every(t => tokenSet.has(t)) : strength.length > 0 && strength.every(t => tokenSet.has(t))); });
  const branded = explicit.filter(m => tokenize(m.medicine.name).filter(t => /[a-z]/.test(t)).join(" ") !== tokenize(m.medicine.activeIngredient).join(" "));
  // A brand plus its own ingredient is one medicine, not two strips.
  const distinct = explicit.filter(m => branded.includes(m) || !branded.some(b => normalizeIngredients(m.medicine.activeIngredient, m.medicine.activeIngredient2).every(s => normalizeIngredients(b.medicine.activeIngredient, b.medicine.activeIngredient2).includes(s)) && tokenize(m.medicine.strength).every(s => tokenize(b.medicine.strength).includes(s))));
  const multiple = distinct.length > 1;
  if (!multiple && matches.length > 1 && matches[0].score - matches[1].score < .04) matches[0].score = Math.min(.69, matches[0].score);
  return { matches, multiple };
}
export function normalizeIngredients(ingredient: string, ingredient2?: string | null): string[] {
  return [...new Set([ingredient, ingredient2 || ""].flatMap(x => x.toLowerCase().split(/\s*(?:\+|\/|,|\band\b)\s*/)).map(x => x.replace(/\([^)]*\)/g, "").replace(/\b(hydrochloride|hcl|sodium|potassium|dihydrate|trihydrate|maleate|besilate|besylate)\b/g, "").replace(/\d+(?:\.\d+)?\s*(mg|mcg|g)\b/g, "").trim().replace(/\s+/g, " ")).map(x => x === "acetaminophen" ? "paracetamol" : x === "acetylsalicylic acid" ? "aspirin" : x).filter(Boolean))];
}
export function findDuplicates(candidate: Medicine, saved: SavedMedicine[], medicines: Medicine[]) {
  const salts = normalizeIngredients(candidate.activeIngredient, candidate.activeIngredient2);
  return saved.filter(s => s.id !== candidate.id).flatMap(s => { const medicine = medicines.find(m => m.id === s.id); if (!medicine) return []; const shared = normalizeIngredients(medicine.activeIngredient, medicine.activeIngredient2).filter(salt => salts.includes(salt)); return shared.length ? [{ medicine, shared }] : []; });
}
export function localDate(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function lastSevenDays(now = new Date()): string[] { return Array.from({ length: 7 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - 6 + i); return localDate(d); }); }
export function rollingLogs(logs: DoseLog[], now = new Date()): DoseLog[] { const days = new Set(lastSevenDays(now)); return logs.filter(l => days.has(l.date)); }
export function tipsForTags(tags: string[], tips: Tip[]): Tip[] { return tips.filter(t => t.linkedTags.includes("all") || t.linkedTags.some(tag => tags.includes(tag))).sort((a, b) => b.priority - a.priority); }
export function buildSummary(saved: SavedMedicine[], logs: DoseLog[], medicines: Medicine[], now = new Date()): string {
  const days = lastSevenDays(now); const recent = rollingLogs(logs, now).filter(l => saved.some(s => s.id === l.medicineId));
  const taken = recent.filter(l => l.status === "taken").length;
  const expected = saved.reduce((total, med) => total + days.filter(d => d >= localDate(new Date(med.addedAt))).length * med.slots.length, 0);
  return [`MediVision AI · 7-day caregiver summary`, `${days[0]} to ${days[6]}`, "", ...saved.map(s => { const m = medicines.find(m => m.id === s.id); const entries = recent.filter(l => l.medicineId === s.id); return `${m?.name || s.id}: ${entries.filter(l => l.status === "taken").length} taken, ${entries.filter(l => l.status === "missed").length} marked missed. Slots: ${s.slots.join(", ") || "not set"}.`; }), "", `${taken} taken · ${recent.length - taken} marked missed · ${Math.max(0, expected - recent.length)} unrecorded scheduled slots.`, "Self-reported taps only; this is not a prescription or proof of taking medicine.", "Schedule changes apply to the displayed period; previous schedules are not retained.", "Information from the label and a reference list. Not medical advice."].join("\n");
}

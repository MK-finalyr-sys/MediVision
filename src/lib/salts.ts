/**
 * Curated salt lexicon for Phase 4 online retrieval.
 *
 * `name`  — Indian naming (what appears on strips), also the display name
 * `us`    — US/USAN naming used by RxNorm / openFDA / DailyMed lookups.
 *           Only differs where INN ≠ USAN (e.g. Paracetamol = Acetaminophen).
 * `hints` — well-known Indian brand-name prefixes that hint this salt when read
 *           on a strip. Hints are ONLY ever shown to the user as a guess that
 *           requires confirmation — they never silently open a card.
 *
 * These are standard, widely published INN/USAN equivalences — no clinical
 * claims are made here; all clinical content is fetched at runtime from
 * government databases and rendered with its source URLs.
 */

export interface SaltEntry {
  name: string
  us: string
  hints: string[]
}

export const SALT_LEXICON: SaltEntry[] = [
  { name: 'Paracetamol', us: 'Acetaminophen', hints: ['dolo', 'crocin', 'calpol', 'metacin', 'paracip', 'pacimol'] },
  { name: 'Ibuprofen', us: 'Ibuprofen', hints: ['brufen', 'ibugesic', 'ibuprofen'] },
  { name: 'Aspirin', us: 'Aspirin', hints: ['ecosprin', 'dispirin', 'loprin'] },
  { name: 'Pantoprazole', us: 'Pantoprazole', hints: ['pan', 'pantocid', 'pantop'] },
  { name: 'Omeprazole', us: 'Omeprazole', hints: ['omez', 'ocid'] },
  { name: 'Esomeprazole', us: 'Esomeprazole', hints: ['nexpro', 'sompraz'] },
  { name: 'Rabeprazole', us: 'Rabeprazole', hints: ['razo', 'rabium'] },
  { name: 'Metformin', us: 'Metformin', hints: ['glycomet', 'glucophage', 'obimet'] },
  { name: 'Glimepiride', us: 'Glimepiride', hints: ['amaryl', 'glimestar', 'glimis'] },
  { name: 'Gliclazide', us: 'Gliclazide', hints: ['glizid', 'reclide'] },
  { name: 'Sitagliptin', us: 'Sitagliptin', hints: ['januvia', 'sitazit'] },
  { name: 'Amlodipine', us: 'Amlodipine', hints: ['amlopres', 'stamlo', 'amlong'] },
  { name: 'Telmisartan', us: 'Telmisartan', hints: ['telma', 'telsartan', 'telvas'] },
  { name: 'Losartan', us: 'Losartan', hints: ['losar', 'repace'] },
  { name: 'Ramipril', us: 'Ramipril', hints: ['cardace', 'ramistar'] },
  { name: 'Atenolol', us: 'Atenolol', hints: ['aten', 'betacard'] },
  { name: 'Metoprolol', us: 'Metoprolol', hints: ['metolar', 'betaloc'] },
  { name: 'Atorvastatin', us: 'Atorvastatin', hints: ['atorva', 'atorlip', 'lipvas', 'storvas'] },
  { name: 'Rosuvastatin', us: 'Rosuvastatin', hints: ['rosuvas', 'rozavel', 'rosutor'] },
  { name: 'Clopidogrel', us: 'Clopidogrel', hints: ['clopilet', 'deplatt', 'clotnil'] },
  { name: 'Azithromycin', us: 'Azithromycin', hints: ['azithral', 'azee', 'azithro'] },
  { name: 'Amoxicillin', us: 'Amoxicillin', hints: ['mox', 'novamox', 'augmentin', 'clavam'] },
  { name: 'Cefixime', us: 'Cefixime', hints: ['taxim', 'zifi', 'cefolac'] },
  { name: 'Ciprofloxacin', us: 'Ciprofloxacin', hints: ['ciplox', 'cifran', 'ciprodac'] },
  { name: 'Ofloxacin', us: 'Ofloxacin', hints: ['zanocin', 'oflox'] },
  { name: 'Levofloxacin', us: 'Levofloxacin', hints: ['levoflox', 'loxof', 'levotas'] },
  { name: 'Doxycycline', us: 'Doxycycline', hints: ['doxt', 'doxy'] },
  { name: 'Cetirizine', us: 'Cetirizine', hints: ['cetzine', 'okacet', 'alerid'] },
  { name: 'Levocetirizine', us: 'Levocetirizine', hints: ['xyzal', 'teczine', 'levocet'] },
  { name: 'Montelukast', us: 'Montelukast', hints: ['montair', 'montek'] },
  { name: 'Diclofenac', us: 'Diclofenac', hints: ['voveran', 'voltaren', 'diclomol'] },
  { name: 'Aceclofenac', us: 'Aceclofenac', hints: ['hifenac', 'aceclo'] },
  { name: 'Tramadol', us: 'Tramadol', hints: ['contramal', 'tramatas'] },
  { name: 'Ondansetron', us: 'Ondansetron', hints: ['emeset', 'ondem', 'vomikind'] },
  { name: 'Domperidone', us: 'Domperidone', hints: ['domstal', 'vomistop'] },
  { name: 'Ranitidine', us: 'Ranitidine', hints: ['rantac', 'aciloc', 'histac'] },
  { name: 'Levothyroxine', us: 'Levothyroxine', hints: ['thyronorm', 'eltroxin', 'thyrox'] },
  { name: 'Cholecalciferol', us: 'Cholecalciferol', hints: ['calcirol', 'drise', 'd3'] },
  { name: 'Folic Acid', us: 'Folic Acid', hints: ['folic'] },
  { name: 'Salbutamol', us: 'Albuterol', hints: ['asthalin', 'volmax', 'salbetol'] },
  { name: 'Chlorpheniramine', us: 'Chlorpheniramine', hints: ['avil', 'cpm'] },
]

/** Word-boundary-safe match of a term inside free OCR text. */
export function textHasTerm(text: string, term: string): boolean {
  const t = term.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (t.length < 3) return false
  const re = new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`, 'i')
  return re.test(text.toLowerCase())
}

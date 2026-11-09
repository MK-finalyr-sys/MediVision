import { z } from "zod";

export const languages = ["en", "ta", "hi"] as const;
export type Language = (typeof languages)[number];
const contentSchema = z.object({
  uses: z.string().min(10),
  beforeYouTake: z.array(z.string()).min(3).max(5),
  sideEffects: z.string().min(5),
  stopAndGetHelp: z.array(z.string()).min(2).max(4),
  preChecklist: z.array(z.string()).min(2).max(4),
});
export const medicineSchema = z.object({
  id: z.string(), name: z.string(), aliases: z.array(z.string()),
  activeIngredient: z.string(), activeIngredient2: z.string().nullable(),
  strength: z.string(), form: z.string(), category: z.string(), tags: z.array(z.string()),
  verified: z.literal(false),
  sources: z.array(z.object({ title: z.string(), url: z.string().url().startsWith("https://"), sourceType: z.enum(["label", "government", "medical-reference"]) })).min(1),
  en: contentSchema, ta: contentSchema, hi: contentSchema,
});
export type Medicine = z.infer<typeof medicineSchema>;
export const tipSchema = z.object({
  id: z.string(), linkedTags: z.array(z.string()), priority: z.number(),
  en: z.object({ title: z.string(), advice: z.string() }),
  ta: z.object({ title: z.string(), advice: z.string() }),
  hi: z.object({ title: z.string(), advice: z.string() }),
  sourceUrl: z.string().url(),
});
export type Tip = z.infer<typeof tipSchema>;
export const slots = ["Morning", "Afternoon", "Evening", "Night"] as const;
export type Slot = (typeof slots)[number];
export const savedSchema = z.array(z.object({ id: z.string().min(1), slots: z.array(z.enum(slots)).max(4).refine(s => new Set(s).size === s.length, "Reminder slots must be unique"), addedAt: z.string().datetime() })).max(100).refine(records => new Set(records.map(r => r.id)).size === records.length, "Saved medicine IDs must be unique");
export type SavedMedicine = z.infer<typeof savedSchema>[number];
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T12:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "A valid calendar date is required");
export const logsSchema = z.array(z.object({ medicineId: z.string().min(1), date: dateSchema, slot: z.enum(slots), status: z.enum(["taken", "missed"]) })).max(3000).refine(records => new Set(records.map(r => `${r.medicineId}:${r.date}:${r.slot}`)).size === records.length, "Only one status per medicine, day and slot");
export type DoseLog = z.infer<typeof logsSchema>[number];
export const recentSchema = z.array(z.object({ id: z.string(), at: z.string().datetime(), score: z.number().min(0).max(1) })).max(30);
export type RecentScan = z.infer<typeof recentSchema>[number];

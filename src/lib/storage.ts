import { z } from "zod";
import { savedSchema, logsSchema, recentSchema } from "./contracts";
import { rollingLogs } from "./engine";
export const keys = { saved: "medivision_saved_meds", logs: "medivision_dose_logs", recent: "medivision_recent_scans", language: "medivision_language" };
export function loadStored<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  let raw: string | null;
  try { raw = localStorage.getItem(key); } catch { throw new Error("This browser is blocking local storage. Enable site storage to save your medicines."); }
  if (!raw) return fallback;
  try { return schema.parse(JSON.parse(raw)); } catch { throw new Error(`Saved ${key.replace("medivision_", "").replaceAll("_", " ")} could not be read. Your original data has not been changed. Use Privacy & data to reset it, or try another browser.`); }
}
export function persist<T>(key: string, schema: z.ZodType<T>, data: T) {
  schema.parse(data);
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { throw new Error("Could not save on this device. Storage may be full or disabled. Free up space and try again."); }
}
export function loadState() { return { saved: loadStored(keys.saved, savedSchema, []), logs: rollingLogs(loadStored(keys.logs, logsSchema, [])), recent: loadStored(keys.recent, recentSchema, []), language: loadStored(keys.language, z.enum(["en", "ta", "hi"]), "en") }; }

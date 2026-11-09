import { describe,it,expect,vi,afterEach } from "vitest";
import { medicineSchema,savedSchema,logsSchema,recentSchema,tipSchema } from "../src/lib/contracts";
import data from "../src/data/medicines.json";
import tipData from "../src/data/tips.json";
import {tokenize,confidenceTier,matchMedicines,searchMedicines,findDuplicates,normalizeIngredients,lastSevenDays,rollingLogs,buildSummary,tipsForTags} from "../src/lib/engine";
import {luminance,laplacianVariance,isBlurry,contrastStretch} from "../src/lib/image";
import {loadStored,persist} from "../src/lib/storage";
const medicines=medicineSchema.array().parse(data);const tips=tipSchema.array().parse(tipData);
afterEach(()=>vi.unstubAllGlobals());
describe("reference contracts",()=>{
 it("has exactly 40 unique, unverified medicines with real HTTPS references",()=>{expect(medicines).toHaveLength(40);expect(new Set(medicines.map(m=>m.id)).size).toBe(40);for(const m of medicines){expect(m.verified).toBe(false);expect(m.sources.length).toBeGreaterThan(0);expect(m.sources.every(s=>/^https:\/\/(www\.)?(nhs\.uk|drugs\.com)\//.test(s.url))).toBe(true);}});
 it("preserves complete EN/TA/HI contracts and labels unverified translations",()=>{for(const m of medicines)for(const lang of ["ta","hi"] as const){expect(m[lang].uses).toContain("[TODO: Verify translation]");expect(m[lang].beforeYouTake.length).toBeGreaterThanOrEqual(3);expect(m[lang].stopAndGetHelp.length).toBeGreaterThanOrEqual(2);}});
 it("validates all rule tips and their sources",()=>{expect(tips.length).toBeGreaterThanOrEqual(8);expect(tips.every(t=>t.sourceUrl.startsWith("https:"))).toBe(true);});
});
describe("tokenizer and evidence matching",()=>{
 it("normalizes strip punctuation, whitespace and joined brand strengths",()=>expect(tokenize("DOLO-650\nParacetamol Tablets IP 650mg")).toEqual(["dolo","650","paracetamol"]));
 it("keeps decimal strengths and removes repeated tokens",()=>expect(tokenize("2.5 mg RAMIPRIL ramipril")).toEqual(["2.5","ramipril"]));
 it.each([["Dolo 650 Paracetamol IP","dolo-650"],["Azithral 500 Azithromycin","azithral-500"],["Pan 40 Pantoprazole","pan-40"],["Ecosprin 75 Aspirin","ecosprin-75"],["Glycomet 500 Metformin","glycomet-500"]])("identifies transcribed label evidence %s",(label,id)=>{const result=matchMedicines(label,medicines);expect(result.matches[0]?.medicine.id).toBe(id);expect(confidenceTier(result.matches[0].score)).toBe("HIGH");expect(result.multiple).toBe(false);});
 it("multi-token name/strength evidence outranks a single brand token",()=>{expect(matchMedicines("Dolo 650",medicines).matches[0].score).toBeGreaterThan(matchMedicines("Dolo",medicines).matches[0].score);expect(confidenceTier(matchMedicines("Dolo",medicines).matches[0].score)).toBe("MEDIUM");});
 it("rejects unsupported strengths instead of silently substituting",()=>{expect(confidenceTier(matchMedicines("Dolo 500",medicines).matches[0].score)).toBe("LOW");});
 it("unknown and empty OCR never invent a medicine",()=>{expect(matchMedicines("",medicines).matches).toEqual([]);expect(confidenceTier(matchMedicines("sunset bicycle mountain",medicines).matches[0]?.score||0)).toBe("LOW");});
 it("detects two explicit medicine labels",()=>expect(matchMedicines("Dolo 650 Azithral 500",medicines).multiple).toBe(true));
 it.each(["Glycomet 500 SR", "Pan D 40", "Levothyroxine 50 mg"])("never silently substitutes an unsupported formulation: %s",text=>expect(confidenceTier(matchMedicines(text,medicines).matches[0]?.score||0)).toBe("LOW"));
 it("contradictory ingredient evidence and poor OCR reduce confidence",()=>{expect(confidenceTier(matchMedicines("Pan 40 paracetamol",medicines).matches[0]?.score||0)).not.toBe("HIGH");expect(confidenceTier(matchMedicines("Dolo 650",medicines,25).matches[0]?.score||0)).toBe("LOW");});
 it("manual fuzzy search tolerates a small spelling error",()=>expect(searchMedicines("azithrl",medicines)[0].id).toBe("azithral-500"));
 it.each([[.75,"HIGH"],[.749,"MEDIUM"],[.5,"MEDIUM"],[.499,"LOW"],[0,"LOW"],[NaN,"LOW"]])("confidence boundary %s → %s",(score,tier)=>expect(confidenceTier(score as number)).toBe(tier));
});
describe("duplicate-ingredient safety",()=>{
 const saved=[{id:"dolo-650",slots:[],addedAt:"2026-01-01T00:00:00.000Z"}];
 it("saving Dolo 650 then Calpol 500 raises a paracetamol warning",()=>{const result=findDuplicates(medicines.find(m=>m.id==="calpol-500")!,saved,medicines);expect(result).toHaveLength(1);expect(result[0].medicine.name).toBe("Dolo 650");expect(result[0].shared).toEqual(["paracetamol"]);});
 it("detects the second salt in Combiflam",()=>expect(findDuplicates(medicines.find(m=>m.id==="combiflam")!,saved,medicines)[0].shared).toEqual(["paracetamol"]));
 it("splits combinations and canonicalizes synonyms / salt forms",()=>expect(normalizeIngredients("Ibuprofen + Acetaminophen", "Metformin hydrochloride")).toEqual(["ibuprofen","paracetamol","metformin"]));
 it("does not warn for unrelated salts or the same already-saved record",()=>{expect(findDuplicates(medicines.find(m=>m.id==="pan-40")!,saved,medicines)).toEqual([]);expect(findDuplicates(medicines[0],saved,medicines)).toEqual([]);});
});
describe("image primitives",()=>{
 it("computes luminance rather than using one color channel",()=>{const gray=luminance(new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255]));expect(gray[0]).toBeCloseTo(76.245);expect(gray[1]).toBeCloseTo(149.685);expect(gray[2]).toBeCloseTo(29.07);});
 it("rejects uniform placeholder images and invalid dimensions",()=>{expect(laplacianVariance(new Float64Array(100).fill(128),10,10)).toBe(0);expect(laplacianVariance([1],1,1)).toBe(0);expect(isBlurry(0)).toBe(true);});
 it("separates sharp edges from smooth frames",()=>{const image=Array.from({length:400},(_,i)=>(Math.floor(i/20)+i%20)%2?255:0);expect(laplacianVariance(image,20,20)).toBeGreaterThan(1000);expect(isBlurry(laplacianVariance(image,20,20))).toBe(false);});
 it("contrast stretching outputs equal RGB channels and opaque alpha",()=>{const out=contrastStretch(new Uint8ClampedArray([90,90,90,255,120,130,100,255,160,160,160,255]));for(let i=0;i<out.length;i+=4){expect(out[i]).toBe(out[i+1]);expect(out[i]).toBe(out[i+2]);expect(out[i+3]).toBe(255);}});
});
describe("local persistence and seven-day care",()=>{
 it("rejects malformed saved medicine and invalid dose status schemas",()=>{expect(savedSchema.safeParse([{id:"x",slots:["Whenever"]}]).success).toBe(false);expect(logsSchema.safeParse([{medicineId:"x",date:"today",slot:"Night",status:"maybe"}]).success).toBe(false);expect(recentSchema.safeParse([{id:"x",at:"invalid",score:5}]).success).toBe(false);});
 it("malformed storage is never silently overwritten",()=>{const setItem=vi.fn();vi.stubGlobal("localStorage",{getItem:()=>"broken-json",setItem});expect(()=>loadStored("medivision_saved_meds",savedSchema,[])).toThrow("original data has not been changed");expect(setItem).not.toHaveBeenCalled();});
 it("storage quota failures produce a meaningful error",()=>{vi.stubGlobal("localStorage",{setItem:()=>{throw new Error("QuotaExceeded");}});expect(()=>persist("medivision_saved_meds",savedSchema,[])).toThrow("Could not save on this device");});
 it("keeps exactly seven local-calendar days and excludes future records",()=>{const now=new Date(2026,0,9,12);expect(lastSevenDays(now)).toEqual(["2026-01-03","2026-01-04","2026-01-05","2026-01-06","2026-01-07","2026-01-08","2026-01-09"]);const logs=["2026-01-02","2026-01-03","2026-01-09","2026-01-10"].map(date=>({medicineId:"dolo-650",date,slot:"Morning" as const,status:"taken" as const}));expect(rollingLogs(logs,now).map(l=>l.date)).toEqual(["2026-01-03","2026-01-09"]);});
 it("caregiver summary distinguishes missed from unrecorded and avoids dosing",()=>{const summary=buildSummary([{id:"dolo-650",slots:["Morning"],addedAt:"2026-01-03T00:00:00.000Z"}],[{medicineId:"dolo-650",slot:"Morning",date:"2026-01-09",status:"taken"}],medicines,new Date(2026,0,9,12));expect(summary).toContain("1 taken · 0 marked missed · 6 unrecorded");expect(summary).toContain("not a prescription");});
 it("tip rules are tag-based and priority-ordered",()=>{const result=tipsForTags(["paracetamol"],tips);expect(result[0].id).toBe("paracetamol-overlap");expect(result.some(t=>t.id==="antibiotic-course")).toBe(false);expect(result.some(t=>t.id==="check-the-ingredient")).toBe(true);});
});

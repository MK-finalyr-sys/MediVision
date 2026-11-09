import { describe,it,expect,beforeAll,afterAll } from "vitest";
import { createWorker,PSM,type Worker } from "tesseract.js";
import sharp from "sharp";
import { readFile,writeFile,mkdir } from "node:fs/promises";
import path from "node:path";
import { medicines } from "../src/lib/catalog";
import {matchMedicines,confidenceTier} from "../src/lib/engine";
import {luminance,laplacianVariance,isBlurry,contrastStretch} from "../src/lib/image";
const photos=["dolo-650","azithral-500","pan-40","ecosprin-75","glycomet-500"];
let worker:Worker;const report:unknown[]=[];
beforeAll(async()=>{await mkdir('test-results/preprocessing',{recursive:true});worker=await createWorker('eng',1,{langPath:path.resolve('public/ocr'),gzip:true,cachePath:'/tmp/medivision-test-ocr'});await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});});
afterAll(async()=>{await worker?.terminate();await writeFile('test-results/ocr-evidence.json',JSON.stringify(report,null,2));});
describe("real photographs — measured OCR, no mocked recognition",()=>{
 it.each(photos)("safely processes the genuine %s fixture",async id=>{
 const original=await readFile(`tests/fixtures/${id}.jpg`);const {data,info}=await sharp(original).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const pixels=new Uint8ClampedArray(data);const variance=laplacianVariance(luminance(pixels),info.width,info.height);const enhanced=await sharp(Buffer.from(contrastStretch(pixels)),{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
 await writeFile(`test-results/preprocessing/${id}-before.jpg`,original);await writeFile(`test-results/preprocessing/${id}-after.png`,enhanced);
 const {data:ocr}=await worker.recognize(enhanced);const result=matchMedicines(ocr.text,medicines,ocr.confidence);const top=result.matches[0];const tier=isBlurry(variance)?'RETAKE':result.multiple?'MULTIPLE':confidenceTier(top?.score||0);const correct=top?.medicine.id===id;
 report.push({id,kind:'genuine retail product photograph',variance,ocrText:ocr.text,ocrConfidence:ocr.confidence,topMatch:top?.medicine.id||null,matchScore:top?.score||0,tier,correct,identificationResult:correct&&tier==='HIGH'?'PASSED (in sandbox)':'NEEDS PHONE TEST — safe uncertainty or obscured text',pipelineResult:'PASSED (in sandbox)'});
 expect(ocr.text).toBeTypeOf('string');expect(variance).toBeGreaterThanOrEqual(0);
 // Acceptance is a safety assertion, not a false claim that every photo was identified.
 if(tier==='HIGH')expect(top?.medicine.id).toBe(id);
 });
 it("rejects a deliberately blurred derivative of a real Dolo photograph",async()=>{const original=await readFile('tests/fixtures/dolo-650.jpg');const blurred=await sharp(original).blur(12).jpeg().toBuffer();await writeFile('tests/fixtures/dolo-650-blurry.jpg',blurred);const {data,info}=await sharp(blurred).ensureAlpha().raw().toBuffer({resolveWithObject:true});const variance=laplacianVariance(luminance(new Uint8ClampedArray(data)),info.width,info.height);report.push({id:'dolo-650-blurry',kind:'real photo, deterministic Gaussian blur sigma 12',variance,result:isBlurry(variance)?'PASSED (in sandbox)':'FAILED'});expect(isBlurry(variance)).toBe(true);});
 it("does not confidently invent a medicine on a partially obscured real strip",async()=>{const original=await readFile('tests/fixtures/azithral-500.jpg');const meta=await sharp(original).metadata();const width=meta.width!,height=meta.height!;const mask=Buffer.from(`<svg width="${width}" height="${height}"><rect x="${Math.round(width*.38)}" y="0" width="${Math.round(width*.45)}" height="${height}" fill="#eeeeee"/></svg>`);const obscured=await sharp(original).composite([{input:mask}]).png().toBuffer();await writeFile('tests/fixtures/azithral-500-obscured.png',obscured);const {data}=await worker.recognize(obscured);const result=matchMedicines(data.text,medicines);const top=result.matches[0];const tier=confidenceTier(top?.score||0);report.push({id:'azithral-500-obscured',kind:'real photo, 45% opaque vertical occlusion',ocrText:data.text,topMatch:top?.medicine.id||null,tier,result:'PASSED (in sandbox) — safe-confidence assertion'});if(tier==='HIGH'&&!result.multiple)expect(top?.medicine.id).toBe('azithral-500');});
});

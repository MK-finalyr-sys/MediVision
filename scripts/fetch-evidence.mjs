import {mkdir,writeFile,readFile} from 'node:fs/promises';
import sharp from 'sharp';
const headers={'User-Agent':'Mozilla/5.0 (compatible; MediVision reference-check/1.0)'};
await mkdir('test-results',{recursive:true});
const medicines=JSON.parse(await readFile('src/data/medicines.json','utf8'));
const tips=JSON.parse(await readFile('src/data/tips.json','utf8'));
const urls=[...new Set([...medicines.flatMap(m=>m.sources.map(s=>s.url)),...tips.map(t=>t.sourceUrl)])];
const checks=[];
for(let i=0;i<urls.length;i+=5)await Promise.all(urls.slice(i,i+5).map(async url=>{try{const response=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});const html=await response.text();checks.push({url,status:response.status,finalUrl:response.url,title:(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.replace(/\s+/g,' ').trim()||null,checkedAt:new Date().toISOString()});console.log(response.status,url);}catch(error){checks.push({url,status:'BLOCKED',error:error.message});console.log('BLOCKED',url,error.message);}}));
await writeFile('test-results/source-audit.json',JSON.stringify(checks,null,2));
// Re-fetch only the explicitly curated and visually inspected image URLs.
// Never replace a fixture from a site's og:image (which may be a logo/placeholder).
if(process.argv.includes('--refresh-photos')){
 const fixtures=JSON.parse(await readFile('tests/fixtures/provenance.json','utf8'));
 for(const fixture of fixtures){const response=await fetch(fixture.imageUrl,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`${fixture.id}: image HTTP ${response.status}`);await sharp(Buffer.from(await response.arrayBuffer())).flatten({background:'white'}).jpeg({quality:96}).toFile(fixture.file);console.log('REFRESHED',fixture.id,'from visually inspected source');}
}

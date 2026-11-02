const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const X=require('../assets/vendor/xlsx.full.min.js');
const root=path.join(__dirname,'..');
const cases=[['primary','primary/Primary_Progress_Template.xlsx'],['secondary','secondary/Student_Progress_Template.xlsx'],
 ['junior-college','junior-college/Student_Progress_Template.xlsx'],['college','college/College_Progress_Template.xlsx'],
 ['primary','master/TESA_Master_Primary.xlsx'],['secondary','master/TESA_Master_Secondary.xlsx'],
 ['junior-college','master/TESA_Master_Junior_College.xlsx'],['college','master/TESA_Master_College.xlsx']];
const attr=(s,n)=>new RegExp('\\b'+n+'="([^"]*)"').exec(s)?.[1];
const elements=(s,n)=>[...s.matchAll(new RegExp('<'+n+'\\b[^>]*?(?:/>|>[\\s\\S]*?</'+n+'>)','g'))].map(m=>m[0]);
function parse(segment,bytes){
 const wb=X.read(bytes),html=fs.readFileSync(path.join(root,`segments/${segment}-reports.html`),'utf8');
 const start=html.indexOf('function isAbsent(')>=0?html.indexOf('function isAbsent('):html.indexOf('function norm(');
 const ctx=vm.createContext({});vm.runInContext(html.slice(start,html.indexOf('function detectBatches(')),ctx);
 const sheets=Object.fromEntries(wb.SheetNames.map(n=>[n,X.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:null})]));
 return {data:ctx.parseWorkbook(sheets),wb,sheets};
}
for(const [segment,file]of cases)test(file+': four subjects, protected labels and copy permission',()=>{
 const bytes=fs.readFileSync(path.join(root,'assets/templates',file)),zip=X.CFB.read(bytes,{type:'buffer'});
 const read=n=>Buffer.from(zip.FileIndex[zip.FullPaths.indexOf('Root Entry/'+n)].content).toString();
 const book=read('xl/workbook.xml');assert.match(book,/_TESA_DefaultSubjects/);assert.doesNotMatch(book,/_TESA_SubjectSlots/);
 const rels=new Map(elements(read('xl/_rels/workbook.xml.rels'),'Relationship').map(r=>[attr(r,'Id'),attr(r,'Target')]));
 const sheet=elements(book,'sheet').find(s=>attr(s,'name')==='Marks'),target=rels.get(attr(sheet,'r:id'));
 const xml=read(target.startsWith('/')?target.slice(1):'xl/'+target);
 const protection=elements(xml,'sheetProtection')[0];assert.equal(attr(protection,'insertColumns'),'0');assert.equal(attr(protection,'sheet'),'1');
 const {data,sheets}=parse(segment,bytes),blocks=data.tests||data.semesters;
 assert.ok(blocks.length>=2);for(const b of blocks)assert.equal(b.subjects.length,4);
 assert.equal(data.students.length,2);assert.equal(data.marks.length,2);assert.equal(data.warnings.length,0);
 assert.doesNotMatch(JSON.stringify(sheets.Instructions),/10 extra|spare subject|PASTE-READY/);
 assert.match(JSON.stringify(sheets.Instructions),/Insert Copied Cells/);
});
const nativeResults=path.join(root,'../.scratch/report-subject-copy/results.json');
if(fs.existsSync(nativeResults))for(const result of JSON.parse(fs.readFileSync(nativeResults,'utf8').replace(/^\uFEFF/,''))){
 const match=cases.find(([,f])=>f.replaceAll('/','\\')===result.source);
 if(match)test(result.source+': Excel-saved copied subject works in the report',()=>{
   const {data}=parse(match[0],fs.readFileSync(result.copy)),blocks=data.tests||data.semesters;
   assert.equal(blocks[0].subjects.length,5);assert.equal(blocks[1].subjects.length,4);
   assert.equal(blocks[0].subjects[3].name,'Computer Science');
   const rec=data.marks[0];
   if(data.tests){
     const baseline=parse(match[0],fs.readFileSync(path.join(root,'assets/templates',match[1]))).data;
     assert.equal(rec.tests[blocks[0].name].obtained,baseline.marks[0].tests[blocks[0].name].obtained+42);
   }
   else assert.equal(rec.semesters[blocks[0].name]['Computer Science'].mark,42);
   assert.equal(data.warnings.length,0);
 });
}

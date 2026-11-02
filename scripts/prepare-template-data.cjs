const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const X=require('../assets/vendor/xlsx.full.min.js');
const root=path.join(__dirname,'..'),out=path.join(root,'../.scratch/report-four-subject-build');
fs.mkdirSync(out,{recursive:true});
const cases=new Map([
 ['primary/Primary_Progress_Template.xlsx','primary'],['secondary/Student_Progress_Template.xlsx','secondary'],
 ['junior-college/Student_Progress_Template.xlsx','junior-college'],['college/College_Progress_Template.xlsx','college'],
 ['master/TESA_Master_Primary.xlsx','primary'],['master/TESA_Master_Secondary.xlsx','secondary'],
 ['master/TESA_Master_Junior_College.xlsx','junior-college'],['master/TESA_Master_College.xlsx','college']]);
function scan(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?scan(path.join(dir,f.name)):[path.join(dir,f.name)]);}
const templates=[];
for(const file of scan(path.join(root,'assets/templates')).filter(f=>f.endsWith('.xlsx'))){
 const relative=path.relative(path.join(root,'assets/templates'),file).replaceAll('\\','/'),segment=cases.get(relative);
 const wb=X.read(fs.readFileSync(file),{cellNF:true});
 const sheets=wb.SheetNames.map(name=>({name,rows:X.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null,raw:true})}));
 if(segment){
   const html=fs.readFileSync(path.join(root,`segments/${segment}-reports.html`),'utf8');
   const start=html.indexOf('function isAbsent(')>=0?html.indexOf('function isAbsent('):html.indexOf('function norm(');
   const ctx=vm.createContext({});vm.runInContext(html.slice(start,html.indexOf('function detectBatches(')),ctx);
   const data=ctx.parseWorkbook(Object.fromEntries(sheets.map(s=>[s.name,s.rows])));
   const slots=(wb.Workbook?.Names||[]).some(n=>n.Name==='_TESA_SubjectSlots');
   for(const sheet of sheets.filter(s=>s.name==='Marks'||(s.name==='Attendance'&&segment==='college'&&s.rows.findIndex(r=>r.includes('Student Name'))>0))){
     const hr=sheet.rows.findIndex(r=>r.includes('Student Name'));
     const blocks=sheet.name==='Marks'?(data.tests||data.semesters):ctx.parseSemesterBlocks(sheet.rows).semesters;
     const max=sheet.rows.findIndex(r=>/^MAX MARKS/.test(String(r[1]||'')));
     for(const block of [...blocks].reverse()){
       const start=block.subjects[0].col,end=block.subjects.at(-1).col,count=block.subjects.length;
       for(let r=0;r<sheet.rows.length;r++){
         const row=sheet.rows[r];
         if(slots)row.splice(end+1,10);
         if(count>4)row.splice(start+4,count-4);
         if(count<4){
           const added=Array.from({length:4-count},(_,i)=>r===hr?`Subject ${count+i+1}`:r===max?(row[end]||50):null);
           row.splice(end+1,0,...added);
         }
       }
     }
     if(sheet.name==='Marks'&&sheet.rows[1]?.[3]==='YEAR'){
       sheet.rows[2]||=[];sheet.rows[2][0]='YEAR';sheet.rows[2][1]=sheet.rows[1][4];sheet.rows[1][3]=null;sheet.rows[1][4]=null;
     }
     // Semester anchors remain at the first subject; duplicated columns carry
     // their editable metadata when Excel copies the complete subject column.
     if(segment==='college')for(const row of sheet.rows.slice(0,hr))if(/^(TEST|SEMESTER)/.test(String(row[1]||'')))row[1]='SEMESTER -';
   }
 }
 for(const sheet of sheets){
   const hr=sheet.rows.findIndex(r=>r.includes('Student Name'));
   sheet.header=sheet.name==='Instructions'?0:hr>=0?hr+1:1;
   while(sheet.rows.length&&sheet.rows.at(-1).every(v=>v==null||v===''))sheet.rows.pop();
   for(const row of sheet.rows)while(row.length&&(row.at(-1)==null||row.at(-1)===''))row.pop();
   sheet.width=Math.max(...sheet.rows.map(r=>r.length),1);
 }
 templates.push({relative,source:file,segment:segment||null,sheets});
}
fs.writeFileSync(path.join(out,'templates.json'),JSON.stringify(templates));
console.log(`Prepared ${templates.length} clean workbooks in ${out}`);

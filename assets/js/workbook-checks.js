/* Exact worksheet diagnostics. Raw cells are inspected without changing data. */
(function(){
'use strict';
const norm=v=>String(v??'').trim(),key=v=>norm(v).toLowerCase().replace(/\s+/g,' ');
const NAME=['student name','name of student','name'],ROLL=['roll no','roll','sr. no.','sr no'];
const ABS=new Set(['A','AB','ABS','ABSENT']),NA=new Set(['-','–','—','NA','N/A','N.A.','X','NT']);
const TOTAL=new Set(['total','grand total','overall']);
const LEDGERS=new Set(['charges','payments','notes','timetable','homework','milestones']);
function col(c){let out='';for(c++;c>0;c=Math.floor((c-1)/26))out=String.fromCharCode(65+(c-1)%26)+out;return out;}
function numeric(v){if(norm(v)==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function rollKey(v){const n=numeric(v);return n===null?key(v):String(n);}
function state(v){const s=norm(v);if(!s)return 'missing';if(ABS.has(s.toUpperCase()))return 'absent';if(NA.has(s.toUpperCase()))return 'na';return numeric(v)!==null?'number':'invalid';}
function describe(sheet,rows){
 const hr=rows.slice(0,30).findIndex(r=>(r||[]).some(c=>NAME.includes(key(c))));if(hr<0)return {sheet,rows,hr};
 const header=rows[hr]||[],nc=header.findIndex(c=>NAME.includes(key(c))),rc=header.findIndex(c=>ROLL.includes(key(c)));
 const meta={};
 for(let r=hr-1;r>=Math.max(0,hr-10);r--){const label=key((rows[r]||[]).slice(0,3).find(v=>norm(v)));if(!label)continue;
  if(label.includes('max')&&meta.max===undefined)meta.max=r;
  else if(label.includes('semester')&&meta.sem===undefined)meta.sem=r;
  else if(label.includes('date')&&meta.date===undefined)meta.date=r;
  else if(/test|eval|cycle|term/.test(label)&&meta.test===undefined)meta.test=r;
 }
 return {sheet,rows,hr,header,nc,rc,meta};
}
function suffix(name,prefix){const m=norm(name).match(new RegExp('^'+prefix+'(?:$|[\\s_:–—-])','i'));return m?key(norm(name).slice(prefix.length).replace(/^[\s_:–—-]+/,'')):null;}
function audit(sheets,parserWarnings=[],opts={}){
 const issues=[],seenIssues=new Set(),descs=Object.entries(sheets||{}).filter(([,rows])=>Array.isArray(rows)).map(([name,rows])=>describe(name,rows));
 function add(d,r,c,code,level,problem,fix,extra={}){
  const identity=[d.sheet,r,c,code].join('|');if(seenIssues.has(identity))return;seenIssues.add(identity);
  const cell=r!=null&&c!=null?col(c)+(r+1):'',value=r!=null&&c!=null?(d.rows[r]||[])[c]:null;
  issues.push({sheet:d.sheet,row:r,col:c,cell,code,level,value:value??'',student:r>d.hr&&d.nc>=0?norm((d.rows[r]||[])[d.nc]):'',problem,fix,...extra,msg:(cell?d.sheet+'!'+cell:d.sheet)+': '+problem+' '+fix});
 }
 const rosterDescs=descs.filter(d=>suffix(d.sheet,'students')!==null&&d.hr>=0);
 for(const d of descs){
  const {rows,hr,header,nc,rc,meta}=d;
  const academic=/^(marks|evaluation|holistic|tests)(?:$|[\s_:–—-])/i.test(d.sheet);
  if(hr<0){
   if(academic&&rows.some(r=>(r||[]).some(v=>norm(v)))){
    const guess=rows.slice(0,30).findIndex(row=>(row||[]).some(v=>ROLL.includes(key(v))));
    const r=guess>=0?guess:0,c=guess>=0?Math.max(0,rows[guess].findIndex(v=>ROLL.includes(key(v))))+1:1;
    add(d,r,c,'missing-header','error','The Student Name column header was not found in the first 30 rows.','Restore the template’s Student Name header above the student entries.');
   }
   continue;
  }
  const data=rows.map((row,r)=>({row:row||[],r})).filter(x=>x.r>hr&&norm(x.row[nc]));
  const base=key(d.sheet).split(/[\s_:–—-]/)[0],ledger=LEDGERS.has(base)||(opts.ledgerSheets||[]).some(n=>key(n)===key(d.sheet));
  const names=new Map(),rolls=new Map();
  for(let r=hr+1;r<rows.length;r++){
   const row=rows[r]||[];if(!norm(row[nc])&&row.some(v=>norm(v)))add(d,r,nc,'missing-student-name','error','This row contains data but no student name.','Enter the student name or remove the entire unused row.');
  }
  for(const {row,r} of data){
   const n=key(row[nc]);
   if(!ledger&&names.has(n))add(d,r,nc,'duplicate-name','error',`Student name “${norm(row[nc])}” repeats ${col(nc)}${names.get(n)+1}; name-based reporting could merge these students.`,'Remove the duplicate or use distinct, matching names on all worksheets.');
   else names.set(n,r);
   if(!ledger&&rc>=0&&norm(row[rc])){
    const batchCol=header.findIndex(c=>['class','batch','batch / class','program / division'].includes(key(c))),batch=batchCol>=0?key(row[batchCol]):'';
    const identity=batch+'|'+rollKey(row[rc]);
    if(rolls.has(identity))add(d,r,rc,'duplicate-roll','error',`Roll number “${norm(row[rc])}” repeats row ${rolls.get(identity)+1} in the same class.`,'Correct the roll number or remove the duplicate row.');else rolls.set(identity,r);
   }
  }
  if(academic){
   const batchSuffix=norm(d.sheet).replace(/^(marks|evaluation|holistic|tests)/i,'').replace(/^[\s_:–—-]+/,'');
   const roster=rosterDescs.find(x=>suffix(x.sheet,'students')===key(batchSuffix))||rosterDescs.find(x=>key(x.sheet)==='students')||(rosterDescs.length===1?rosterDescs[0]:null);
   if(roster){
    const rosterRows=roster.rows.map((row,r)=>({row:row||[],r})).filter(x=>x.r>roster.hr&&norm(x.row[roster.nc]));
    const byName=new Map(rosterRows.map(x=>[key(x.row[roster.nc]),x]));
    for(const {row,r} of data){const match=byName.get(key(row[nc]));
     if(!match){const sameRoll=rc>=0&&roster.rc>=0&&norm(row[rc])?rosterRows.filter(x=>rollKey(x.row[roster.rc])===rollKey(row[rc])):[];
      add(d,r,nc,'student-mismatch','error',`“${norm(row[nc])}” is not listed in ${roster.sheet}.`,'Use the same student name as the roster'+(sameRoll.length===1?` (${roster.sheet}!${col(roster.nc)}${sameRoll[0].r+1}: “${norm(sameRoll[0].row[roster.nc])}”).`:'.'));
     }else if(rc>=0&&roster.rc>=0&&norm(row[rc])&&norm(match.row[roster.rc])&&rollKey(row[rc])!==rollKey(match.row[roster.rc]))add(d,r,rc,'roll-mismatch','error',`Roll “${norm(row[rc])}” does not match ${roster.sheet}!${col(roster.rc)}${match.r+1} (“${norm(match.row[roster.rc])}”) for ${norm(row[nc])}.`,'Make the roll numbers consistent.');
    }
    // Shared rosters may cover several batches. Only require rows for this
    // batch when a matching class can be identified without guessing.
    const target=key(batchSuffix||((rows.find(row=>key(row?.[0])==='batch')||[])[1])||''),classCol=roster.header.findIndex(c=>['class','batch','batch / class','program / division'].includes(key(c)));
    if(base==='marks'||base==='evaluation')for(const x of rosterRows){
     const matchesBatch=key(roster.sheet)!=='students'||!target||(classCol>=0&&key(x.row[classCol])===target);
     if(matchesBatch&&!names.has(key(x.row[roster.nc])))add(roster,x.r,roster.nc,'missing-assessment-row','warn',`${norm(x.row[roster.nc])} has no student row in ${d.sheet}.`,'Check whether this student needs a report and add their assessment row if applicable.');
    }
   }
  }
  // Numeric Marks sheets have a MAX MARKS row; college semester grids use
  // the parser's documented out-of-100 convention. Qualitative Tests and
  // Evaluation sheets must never be treated as numeric marks.
  const numericMarks=base==='marks'&&(meta.max!==undefined||meta.sem!==undefined);
  if(base==='marks'&&!numericMarks&&data.length)add(d,hr,Math.max(nc,rc)+1,'missing-maxima','error','No MAX MARKS or SEMESTER metadata was found above these marks.','Restore the maximum-marks row from the template (or the semester row for college reports).');
  if(!numericMarks)continue;
  const start=Math.max(nc,rc)+1,blocks=[],assessmentNames=new Set();let c=start;
  for(let sc=start;sc<header.length;sc++)if(!norm(header[sc]))for(const {row,r} of data)if(norm(row[sc]))add(d,r,sc,'unnamed-subject','error',`“${norm(row[sc])}” is entered in a column with no subject heading.`,'Add the subject heading in the intended test block, or clear this separator cell.');
  while(c<header.length){
   if(!norm(header[c])){c++;continue;}
   const columns=[],begin=c;let total=-1;
   while(c<header.length){
    if(TOTAL.has(key(header[c]))){total=c++;break;}
    if(!norm(header[c])){if(meta.max!==undefined&&norm(rows[meta.max]?.[c])){c++;continue;}break;}
    columns.push(c++);
   }
   if(!columns.length){c=Math.max(c,begin+1);continue;}
   const groupRow=meta.sem??meta.test,assessment=norm(rows[groupRow]?.[columns[0]])||(meta.sem!==undefined?'Semester ':'Test ')+(blocks.length+1);
   const block={columns,total,assessment};blocks.push(block);
   if(assessmentNames.has(key(assessment)))add(d,groupRow??hr,columns[0],'duplicate-assessment','error',`Assessment name “${assessment}” is used for more than one column block.`,'Give each test or semester a unique name so results are not overwritten.');assessmentNames.add(key(assessment));
   const headers=new Map();
   for(const sc of columns){
    if(headers.has(key(header[sc])))add(d,hr,sc,'duplicate-subject','error',`${assessment}: subject “${norm(header[sc])}” also appears at ${col(headers.get(key(header[sc])))}${hr+1}.`,'Give each subject in this assessment a distinct heading.');else headers.set(key(header[sc]),sc);
    const maximum=meta.max!==undefined?numeric(rows[meta.max]?.[sc]):100;
    if(maximum===null||maximum<=0){add(d,meta.max??hr,sc,'invalid-maximum','error',`${assessment} / ${norm(header[sc])}: maximum marks must be a positive number; found “${norm(rows[meta.max]?.[sc])||'blank'}”.`,'Enter the correct maximum before calculating percentages.');continue;}
    for(const {row,r} of data){
     const kind=state(row[sc]);if(kind==='invalid')add(d,r,sc,'invalid-mark','error',`${assessment} / ${norm(header[sc])}: “${norm(row[sc])}” is not a valid mark.`,'Enter a number, AB for absent, or N/A for not applicable.',{assessment,subject:norm(header[sc]),expected:`Number ≤ ${maximum}; AB; N/A`});
     if(kind==='number'){
      const n=numeric(row[sc]);if(n>maximum)add(d,r,sc,'mark-over-maximum','error',`${assessment} / ${norm(header[sc])}: ${n} exceeds the maximum of ${maximum}.`,'Correct this mark or the assessment maximum.',{assessment,subject:norm(header[sc]),expected:`≤ ${maximum}`});
      else if(n<0)add(d,r,sc,'negative-mark','warn',`${assessment} / ${norm(header[sc])}: score ${n} is negative.`,'Keep it only if this examination permits negative marking; otherwise correct it.',{assessment,subject:norm(header[sc])});
     }
    }
   }
   const started=data.some(({row})=>columns.some(sc=>['number','absent'].includes(state(row[sc]))));
   for(const {row,r} of data){
    if(!started||columns.every(sc=>state(row[sc])==='na'))continue;
    const startedForStudent=columns.some(sc=>['number','absent','invalid'].includes(state(row[sc])));
    const missing=columns.filter(sc=>state(row[sc])==='missing');
    if(!missing.length)continue;
    if(!startedForStudent&&missing.length===columns.length)add(d,r,missing[0],'missing-assessment','warn',`${norm(row[nc])}: all marks for ${assessment} are missing; other students have entries.`,'Enter results, AB for absence, or N/A where the assessment does not apply. Blanks are not zero.',{assessment,subject:missing.map(sc=>norm(header[sc])).join(', ')});
    else for(const sc of missing)add(d,r,sc,'missing-mark','warn',`${assessment} / ${norm(header[sc])}: a mark is missing in this partially completed assessment.`,'Enter the actual score (0 is valid), AB for absent, or N/A for not applicable.',{assessment,subject:norm(header[sc])});
   }
   if(total>=0)for(const {row,r} of data){
    const complete=columns.every(sc=>['number','na','absent'].includes(state(row[sc]))),actual=numeric(row[total]);
    if(!complete||actual===null)continue;
    const expected=columns.reduce((sum,sc)=>sum+(state(row[sc])==='number'?numeric(row[sc]):0),0);
    if(Math.abs(actual-expected)>.00001)add(d,r,total,'total-mismatch','warn',`${assessment}: the Excel total ${actual} does not match the sum of entered marks (${expected}).`,'Recalculate the workbook in Excel. Reports calculate totals from the subject marks.',{assessment,expected});
   }
  }
 }
 // Retain parser-specific diagnostics, and locate rubric errors by the
 // student / assessment / subject context supplied by the existing parsers.
 for(const message of parserWarnings||[]){
  if(/exceeds max|marks are expected out of 100|Could not find the 'Student Name' header/.test(message))continue;
  const rubric=String(message).match(/^(.*?) · (.*?) · (.*?): unrecognized rating/);
  let located=false;
  if(rubric)for(const d of descs){if(d.hr<0)continue;const r=d.rows.findIndex((row,i)=>i>d.hr&&key(row[d.nc])===key(rubric[1]));if(r<0)continue;
   const candidates=d.header.map((v,c)=>({v,c})).filter(x=>key(x.v)===key(rubric[3]));
   const groupRow=d.meta.test??d.meta.sem;
   const groupAt=c=>{for(let i=c;i>Math.max(d.nc,d.rc);i--)if(norm(d.rows[groupRow]?.[i]))return key(d.rows[groupRow][i]);return '';};
   let c=candidates.find(x=>groupAt(x.c)===key(rubric[2]))?.c;
   if(c===undefined&&candidates.length===1)c=candidates[0].c;
   if(c!==undefined){add(d,r,c,'invalid-rating','error',String(message).split(': ').slice(1).join(': '),'Use a supported rating from the template.');located=true;break;}
  }
  if(!located)issues.push({sheet:null,row:null,col:null,cell:'',code:'parser-warning',level:'warn',value:'',problem:String(message),fix:'Check the named student and field in the workbook.',msg:String(message)});
 }
 return issues;
}
function csv(issues){
 const cell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const rows=[['Severity','Worksheet','Cell','Student','Assessment','Subject','Value','Problem','Correction'],...issues.map(i=>[i.level,i.sheet,i.cell,i.student,i.assessment,i.subject,i.value,i.problem||i.msg,i.fix])];
 return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
function reviewWorkbook(sheets,issues,XLSX){
 const wb=XLSX.utils.book_new();
 Object.entries(sheets).forEach(([name,rows])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name));
 let title='Problems';for(let n=2;wb.SheetNames.includes(title);n++)title='Problems '+n;
 const rows=[['Severity','Worksheet','Cell','Student','Assessment','Subject','Value','Problem','Correction'],...issues.map(i=>[i.level,i.sheet||'',i.cell||'',i.student||'',i.assessment||'',i.subject||'',i.value??'',i.problem||i.msg||'',i.fix||''])];
 const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:12},{wch:24},{wch:12},{wch:24},{wch:22},{wch:24},{wch:18},{wch:70},{wch:80}];ws['!autofilter']={ref:ws['!ref']};
 issues.forEach((issue,i)=>{
  if(!issue.sheet||!issue.cell||!wb.Sheets[issue.sheet])return;
  ws['C'+(i+2)].l={Target:"#'"+issue.sheet.replace(/'/g,"''")+"'!"+issue.cell,Tooltip:'Go to the problem cell'};
  const target=wb.Sheets[issue.sheet],address=issue.cell;
  if(!target[address])target[address]={t:'s',v:''};
  target[address].c=target[address].c||[];target[address].c.push({a:'Report Generator',t:(issue.problem||issue.msg)+'\nCorrection: '+(issue.fix||'Review this entry.')});
 });
 XLSX.utils.book_append_sheet(wb,ws,title);wb.SheetNames=[title,...wb.SheetNames.filter(n=>n!==title)];
 return wb;
}
window.WorkbookChecks={audit,state,csv,reviewWorkbook};
})();

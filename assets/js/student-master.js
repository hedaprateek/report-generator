/* =====================================================================
   SPDRoster — the shared Student Master.

   Every segment app and office tool used to want its own Excel upload, so
   the same 60 children were typed in ten times. This module keeps one
   roster on the device and lets everything else read from it: upload once
   in June, add a student mid-year in one place, and ID cards, certificates,
   fee statements and reports all just have them.

   It owns a separate IndexedDB database from the workbook cache on purpose —
   the roster outlives any single workbook, and keeping it independent means
   no schema-version coupling with the nine pages that use the other one.

   Public API
     SPDRoster.load()                  -> Promise<{students,updatedAt}>
     SPDRoster.save(students)          -> Promise
     SPDRoster.count()                 -> Promise<number>
     SPDRoster.clear()                 -> Promise
     SPDRoster.fromSheets(sheets)      -> students[]  (reads any Students sheet)
     SPDRoster.merge(incoming)         -> Promise<{added,updated}>
     SPDRoster.toAoa(students)         -> array-of-arrays for Excel export
     SPDRoster.openManager(opts)       -> overlay editor
     SPDRoster.mountManager(el,opts)   -> full-page editor
   ===================================================================== */
(function(){
"use strict";

const DB_NAME="spdStudentMaster_v1",STORE="roster",KEY="master";

/* Field order here drives the manager table, the Excel export and the merge —
   one list so the three can never drift apart. */
const FIELDS=[
  {k:"roll",     label:"Roll No",        w:70,  headers:["Roll No","Roll","Sr. No."]},
  {k:"name",     label:"Student Name",   w:170, headers:["Student Name","Name of Student","Name"],req:true},
  {k:"batch",    label:"Class / Batch",  w:130, headers:["Class / Batch","Program / Division","Class","Batch","Division","Program"]},
  {k:"gender",   label:"Gender",         w:80,  headers:["Gender","Sex"]},
  {k:"parent",   label:"Parent / Guardian",w:170,headers:["Parent / Guardian Name","Parent Name","Guardian Name","Father's Name"]},
  {k:"phone",    label:"Parent Phone",   w:130, headers:["Parent Phone","Phone","Contact","Mobile"]},
  {k:"dob",      label:"Date of Birth",  w:120, headers:["Date of Birth","DOB","Birth Date"]},
  {k:"admission",label:"Admission Date", w:130, headers:["Admission Date","Date of Admission","Joined On"]},
  {k:"blood",    label:"Blood Group",    w:100, headers:["Blood Group","Blood"]},
  {k:"address",  label:"Address",        w:200, headers:["Address","Residence"]},
  {k:"conduct",  label:"Conduct",        w:110, headers:["Conduct","Character","Behaviour"]},
  {k:"achievement",label:"Achievement",  w:200, headers:["Achievement","Award","Award For","Reason"]},
  {k:"photo",    label:"Photo URL",      w:170, headers:["Photo URL","Photo","Picture","Image URL","Image"]},
  {k:"notes",    label:"Notes",          w:200, headers:["Notes","Note","Remark","Remarks","Comments"]}
];

function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function norm(v){return String(v==null?"":v).trim();}
function keyName(v){return norm(v).toLowerCase().replace(/\s+/g," ");}

/* ------------------------------------------------------------- storage */
function dbOpen(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function load(){
  try{
    const db=await dbOpen();
    const rec=await new Promise((res,rej)=>{const tx=db.transaction(STORE,"readonly");
      const r=tx.objectStore(STORE).get(KEY);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});
    db.close();
    return rec&&Array.isArray(rec.students)?rec:{students:[],updatedAt:null};
  }catch(e){return{students:[],updatedAt:null};}
}
async function save(students){
  try{
    const db=await dbOpen();
    await new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).put({students,updatedAt:Date.now()},KEY);
      tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
    db.close();return true;
  }catch(e){return false;}
}
async function clear(){try{const db=await dbOpen();
  await new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
  db.close();}catch(e){}}
async function count(){return (await load()).students.length;}

/* ------------------------------------------------- reading any workbook */
function blank(){const o={};FIELDS.forEach(f=>o[f.k]="");return o;}
function fromSheets(sheets){
  if(!sheets)return[];
  // Prefer a sheet actually called Students; otherwise take the first sheet that
  // has a Student Name header, so a marks workbook still contributes its roster.
  const names=Object.keys(sheets);
  const preferred=names.find(n=>keyName(n)==="students");
  const order=preferred?[preferred,...names.filter(n=>n!==preferred)]:names;
  for(const sheetName of order){
    const aoa=sheets[sheetName]||[];
    let hr=-1;
    for(let i=0;i<Math.min(aoa.length,25);i++){
      const row=(aoa[i]||[]).map(keyName);
      if(row.some(c=>["student name","name of student","name"].includes(c))){hr=i;break;}
    }
    if(hr<0)continue;
    const header=(aoa[hr]||[]).map(keyName);
    const idx={};
    FIELDS.forEach(f=>{idx[f.k]=-1;
      for(const h of f.headers){const i=header.indexOf(keyName(h));if(i>=0){idx[f.k]=i;break;}}});
    if(idx.name<0)continue;
    const out=[];const seen={};
    for(let r=hr+1;r<aoa.length;r++){
      const row=aoa[r]||[];
      const nm=norm(row[idx.name]);
      if(!nm)continue;
      const k=keyName(nm);
      if(seen[k])continue;           // a ledger sheet repeats names; first wins
      seen[k]=1;
      const s=blank();
      FIELDS.forEach(f=>{if(idx[f.k]>=0)s[f.k]=norm(row[idx[f.k]]);});
      s.name=nm;
      out.push(s);
    }
    if(out.length)return out;
  }
  return[];
}

/* --------------------------------------------------------------- merge */
// Names are the identity everywhere else in this suite, so they are here too.
// Incoming blanks never wipe existing detail — a marks workbook that only knows
// name + roll must not erase the address a roster upload supplied earlier.
async function merge(incoming,opts){
  opts=opts||{};
  incoming=(incoming||[]).filter(s=>norm(s.name));
  if(!incoming.length)return{added:0,updated:0};
  const cur=await load();
  const list=cur.students.slice();
  const byKey={};list.forEach((s,i)=>{byKey[keyName(s.name)]=i;});
  let added=0,updated=0;
  incoming.forEach(inc=>{
    const k=keyName(inc.name);
    if(byKey[k]===undefined){
      const s=blank();FIELDS.forEach(f=>s[f.k]=norm(inc[f.k]));s.name=norm(inc.name);
      list.push(s);byKey[k]=list.length-1;added++;
    }else{
      const tgt=list[byKey[k]];let touched=false;
      FIELDS.forEach(f=>{
        const v=norm(inc[f.k]);
        if(!v)return;
        if(opts.overwrite?tgt[f.k]!==v:!norm(tgt[f.k])){tgt[f.k]=v;touched=true;}
      });
      if(touched)updated++;
    }
  });
  await save(list);
  return{added,updated};
}

function toAoa(students){
  return[FIELDS.map(f=>f.label),...(students||[]).map(s=>FIELDS.map(f=>{
    const v=norm(s[f.k]);
    return v===""?null:(f.k==="roll"&&/^-?\d+$/.test(v)?Number(v):v);
  }))];
}

/* ------------------------------------------------------------------ UI */
const CSS=`
.sm-wrap{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#2B2F3A}
#smOverlay{position:fixed;inset:0;z-index:320;background:rgba(15,20,35,.62);display:flex;
  align-items:center;justify-content:center;padding:20px}
#smOverlay.hidden{display:none}
#smOverlay .sm-card{max-height:92vh}
.sm-card{background:#fff;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.4);width:100%;max-width:1180px;
  display:flex;flex-direction:column;overflow:hidden}
.sm-head{padding:18px 22px 14px;border-bottom:1px solid #E4E0D6;flex-shrink:0;display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap}
.sm-head h2{margin:0 0 3px;font-family:Georgia,serif;font-size:19px;color:#1F2A44;font-weight:600}
.sm-head p{margin:0;font-size:12.5px;color:#556074}
.sm-head .sm-grow{flex:1}
.sm-search{font-family:inherit;font-size:13px;padding:8px 12px;border:1px solid #D8D3C6;border-radius:8px;min-width:190px}
.sm-body{flex:1;overflow:auto;padding:0;background:#FCFBF7}
.sm-table{border-collapse:separate;border-spacing:0;font-size:12.5px;width:100%}
.sm-table th{background:#F3F1EA;position:sticky;top:0;z-index:2;font-weight:700;color:#5B6472;
  font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;padding:8px 9px;text-align:left;
  border-bottom:1px solid #E4E0D6;white-space:nowrap}
.sm-table td{border-bottom:1px solid #EFEDE6;padding:0}
.sm-cell{padding:7px 9px;outline:none;min-height:32px;white-space:pre-wrap;word-break:break-word}
.sm-cell:focus{background:#E2F0EF;box-shadow:inset 0 0 0 2px #0E7C7B}
.sm-cell.sm-req:empty::before{content:"required";color:#B4472F;font-style:italic}
.sm-del{border:none;background:none;color:#656E82;cursor:pointer;font-size:12px;padding:3px 7px;border-radius:5px}
.sm-del:hover{background:#F6E3DD;color:#B4472F}
.sm-foot{padding:14px 22px;border-top:1px solid #E4E0D6;display:flex;gap:10px;align-items:center;flex-wrap:wrap;flex-shrink:0}
.sm-foot .sm-grow{flex:1}
.sm-btn{display:inline-flex;align-items:center;gap:7px;border:none;border-radius:9px;font-family:inherit;
  font-weight:600;font-size:13.5px;padding:10px 16px;cursor:pointer;text-decoration:none}
.sm-btn-primary{background:#0E7C7B;color:#fff}
.sm-btn-primary:hover{filter:brightness(1.07)}
.sm-btn-ghost{background:transparent;color:#1F2A44;border:1px solid #D8D3C6}
.sm-btn-ghost:hover{background:#F0EEE7}
.sm-btn-danger{background:transparent;color:#B4472F;border:1px solid #E8B49A}
.sm-btn-danger:hover{background:#FDF1EC}
.sm-hint{font-size:11.5px;color:#656E82}
.sm-empty{padding:40px 20px;text-align:center;color:#556074;font-size:13.5px}
`;
function injectCSS(){
  if(document.getElementById("smCSS"))return;
  const s=document.createElement("style");s.id="smCSS";s.textContent=CSS;document.head.appendChild(s);
}

function managerHTML(embedded){
  return `<div class="sm-card sm-wrap">
    <div class="sm-head">
      <div><h2 id="smTitle">Student Master</h2><p id="smSub"></p></div>
      <div class="sm-grow"></div>
      <input class="sm-search" id="smSearch" type="search" aria-label="Search students by name, class or phone" placeholder="Search name, class, phone…">
    </div>
    <div class="sm-body" id="smBody"></div>
    <div class="sm-foot">
      <button class="sm-btn sm-btn-ghost" id="smAdd">+ Add student</button>
      <button class="sm-btn sm-btn-ghost" id="smImport">Import from Excel</button>
      <button class="sm-btn sm-btn-ghost" id="smExport">Download as Excel</button>
      <input type="file" id="smFile" accept=".xlsx,.xls" style="display:none">
      <span class="sm-hint" id="smStatus"></span>
      <div class="sm-grow"></div>
      <button class="sm-btn sm-btn-danger" id="smClear">Clear all</button>
      ${embedded?"":'<button class="sm-btn sm-btn-ghost" id="smClose">Close</button>'}
      <button class="sm-btn sm-btn-primary" id="smSave">Save</button>
    </div>
  </div>`;
}

let M=null; // {students, filter, onSaved, host, embedded}

function renderTable(){
  const body=document.getElementById("smBody");
  const q=keyName(M.filter||"");
  const rows=M.students.map((s,i)=>({s,i}))
    .filter(({s})=>!q||FIELDS.some(f=>keyName(s[f.k]).includes(q)));
  document.getElementById("smSub").textContent=
    `${M.students.length} student${M.students.length===1?"":"s"} saved on this device`+
    (q?` · showing ${rows.length}`:"");
  if(!M.students.length){
    body.innerHTML=`<div class="sm-empty">No students saved yet.<br>
      Add one below, import an Excel file, or just open any report app — students you upload there are collected here automatically.</div>`;
    return;
  }
  body.innerHTML=`<table class="sm-table">
    <thead><tr>${FIELDS.map(f=>`<th style="min-width:${f.w}px">${esc(f.label)}</th>`).join("")}<th></th></tr></thead>
    <tbody>${rows.map(({s,i})=>`<tr>${FIELDS.map(f=>
      `<td><div class="sm-cell${f.req?" sm-req":""}" contenteditable="true" spellcheck="false"
        data-i="${i}" data-k="${f.k}">${esc(s[f.k])}</div></td>`).join("")}
      <td><button class="sm-del" data-del="${i}" title="Remove this student">✕</button></td></tr>`).join("")}
    </tbody></table>`;
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{
    commit();M.students.splice(Number(b.dataset.del),1);renderTable();
  }));
}
function commit(){
  const body=document.getElementById("smBody");
  if(!body)return;
  body.querySelectorAll(".sm-cell").forEach(c=>{
    const i=Number(c.dataset.i),k=c.dataset.k;
    if(M.students[i])M.students[i][k]=c.textContent.replace(/ /g," ").trim();
  });
}
function status(msg){
  const el=document.getElementById("smStatus");
  if(!el)return;el.textContent=msg;
  if(msg)setTimeout(()=>{if(el.textContent===msg)el.textContent="";},4000);
}

function wire(embedded){
  document.getElementById("smSearch").addEventListener("input",e=>{commit();M.filter=e.target.value;renderTable();});
  document.getElementById("smAdd").addEventListener("click",()=>{
    commit();M.filter="";document.getElementById("smSearch").value="";
    M.students.push(blank());renderTable();
    const body=document.getElementById("smBody");body.scrollTop=body.scrollHeight;
    const cells=body.querySelectorAll('.sm-cell[data-k="name"]');
    const last=cells[cells.length-1];if(last)last.focus();
  });
  document.getElementById("smImport").addEventListener("click",()=>document.getElementById("smFile").click());
  document.getElementById("smFile").addEventListener("change",e=>{
    const f=e.target.files[0];e.target.value="";
    if(!f)return;
    if(typeof XLSX==="undefined"){status("Excel engine still loading — try again.");return;}
    const rd=new FileReader();
    rd.onload=ev=>{
      try{
        const wb=XLSX.read(new Uint8Array(ev.target.result),{type:"array"});
        const sheets={};wb.SheetNames.forEach(n=>{sheets[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:null,raw:true});});
        const incoming=fromSheets(sheets);
        if(!incoming.length){status("No students found in that file.");return;}
        commit();
        const byKey={};M.students.forEach((s,i)=>byKey[keyName(s.name)]=i);
        let added=0,updated=0;
        incoming.forEach(inc=>{
          const k=keyName(inc.name);
          if(byKey[k]===undefined){M.students.push(inc);byKey[k]=M.students.length-1;added++;}
          else{const t=M.students[byKey[k]];let touched=false;
            FIELDS.forEach(fl=>{const v=norm(inc[fl.k]);if(v&&!norm(t[fl.k])){t[fl.k]=v;touched=true;}});
            if(touched)updated++;}
        });
        renderTable();status(`Imported: ${added} new, ${updated} updated. Press Save to keep.`);
      }catch(err){status("Could not read that file.");}
    };
    rd.readAsArrayBuffer(f);
  });
  document.getElementById("smExport").addEventListener("click",()=>{
    commit();
    if(typeof XLSX==="undefined"){status("Excel engine still loading — try again.");return;}
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(toAoa(M.students)),"Students");
    XLSX.writeFile(wb,"Student_Master.xlsx");
  });
  document.getElementById("smClear").addEventListener("click",()=>{
    if(!confirm("Remove every student from the master roster on this device? Workbook files on your computer are not touched."))return;
    M.students=[];renderTable();status("Cleared — press Save to confirm.");
  });
  document.getElementById("smSave").addEventListener("click",async()=>{
    commit();
    const clean=M.students.filter(s=>norm(s.name));
    const dropped=M.students.length-clean.length;
    await save(clean);
    M.students=clean;renderTable();
    status(`Saved${dropped?` · ${dropped} row${dropped>1?"s":""} without a name skipped`:""}`);
    if(M.onSaved)M.onSaved(clean);
  });
  if(!embedded){
    document.getElementById("smClose").addEventListener("click",closeManager);
  }
}

async function openManager(opts){
  opts=opts||{};
  injectCSS();
  let ov=document.getElementById("smOverlay");
  if(!ov){
    ov=document.createElement("div");ov.id="smOverlay";document.body.appendChild(ov);
    ov.addEventListener("click",e=>{if(e.target===ov)closeManager();});
  }
  ov.innerHTML=managerHTML(false);
  ov.classList.remove("hidden");
  const cur=await load();
  M={students:cur.students.map(s=>Object.assign(blank(),s)),filter:"",onSaved:opts.onSaved,embedded:false};
  renderTable();wire(false);
}
function closeManager(){
  const ov=document.getElementById("smOverlay");
  if(ov)ov.classList.add("hidden");
  M=null;
}
async function mountManager(el,opts){
  opts=opts||{};
  injectCSS();
  el.innerHTML=managerHTML(true);
  const cur=await load();
  M={students:cur.students.map(s=>Object.assign(blank(),s)),filter:"",onSaved:opts.onSaved,embedded:true};
  renderTable();wire(true);
}

window.SPDRoster={FIELDS,load,save,clear,count,fromSheets,merge,toAoa,openManager,closeManager,mountManager,
  blank,keyName:keyName};
})();

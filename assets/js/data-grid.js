/* =====================================================================
   SPDGrid — shared data review + manual-entry grid for every segment app.

   Every segment parses its workbook into the same intermediate shape: a
   plain { sheetName: array-of-arrays } object. That's the only thing this
   module touches, so one implementation serves Pre-Primary through College
   without knowing anything about marks, rubrics, credits or attendance.

   Public API
     SPDGrid.audit(sheets, parserWarnings)  -> [{sheet,row,col,msg,level}]
     SPDGrid.open(sheets, opts)             -> opens the overlay
     SPDGrid.blankFrom(sampleSheets)        -> sheets with data rows cleared

   opts: { issues, title, subtitle, applyLabel, filename, onApply(sheets) }
   ===================================================================== */
(function(){
"use strict";

const CSS = `
#spdGridOverlay{position:fixed;inset:0;z-index:300;background:rgba(15,20,35,.62);display:flex;
  align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
#spdGridOverlay.hidden{display:none}
.spdg-card{background:#FFF;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.4);width:100%;max-width:1180px;
  max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
.spdg-head{padding:18px 22px 14px;border-bottom:1px solid #E4E0D6;flex-shrink:0}
.spdg-head h3{margin:0 0 3px;font-family:Georgia,serif;font-size:19px;color:#1F2A44;font-weight:600}
.spdg-head p{margin:0;font-size:12.5px;color:#7C8598;line-height:1.5}
.spdg-issues{margin:12px 0 0;background:#FBEEDC;border:1px solid #EBD3A8;border-left:3px solid #C9791B;
  border-radius:9px;padding:11px 14px;max-height:132px;overflow:auto}
.spdg-issues h4{margin:0 0 6px;font-size:12.5px;color:#8A5310}
.spdg-issues ul{margin:0;padding-left:18px;font-size:12px;color:#6E4A1A;line-height:1.55}
.spdg-issues li{margin:2px 0}
.spdg-tabs{display:flex;gap:2px;padding:0 22px;border-bottom:1px solid #E4E0D6;flex-shrink:0;overflow-x:auto}
.spdg-tab{background:none;border:none;font-family:inherit;font-size:13px;font-weight:600;color:#7C8598;
  padding:10px 14px;border-bottom:3px solid transparent;cursor:pointer;white-space:nowrap}
.spdg-tab:hover{color:#1F2A44}
.spdg-tab.on{color:#1F2A44;border-bottom-color:#0E7C7B}
.spdg-tab .spdg-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#C9791B;margin-left:5px;vertical-align:middle}
.spdg-body{flex:1;overflow:auto;padding:14px 22px 4px;background:#FCFBF7}
.spdg-table{border-collapse:separate;border-spacing:0;font-size:12.5px;font-variant-numeric:tabular-nums}
.spdg-table td,.spdg-table th{border:1px solid #E4E0D6;padding:0;vertical-align:middle}
.spdg-table th{background:#F3F1EA;position:sticky;top:0;z-index:2;font-weight:700;color:#5B6472;
  font-size:10.5px;padding:5px 7px;text-align:center;min-width:34px}
.spdg-rowhead{background:#F3F1EA;color:#9AA3B2;font-size:10px;font-weight:700;text-align:center;
  padding:0 6px;position:sticky;left:0;z-index:1;min-width:30px}
.spdg-cell{min-width:92px;max-width:230px;padding:5px 7px;outline:none;white-space:pre-wrap;word-break:break-word;background:#FFF}
.spdg-cell:focus{background:#E2F0EF;box-shadow:inset 0 0 0 2px #0E7C7B}
.spdg-cell.spdg-flag{background:#FBEEDC;box-shadow:inset 0 0 0 2px #C9791B}
.spdg-cell.spdg-meta{background:#F6F5F0;color:#5B6472;font-weight:600}
.spdg-del{border:none;background:none;color:#9AA3B2;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:5px}
.spdg-del:hover{background:#F6E3DD;color:#B4472F}
.spdg-bodyfoot{padding:10px 0 14px;display:flex;gap:10px;align-items:center}
.spdg-foot{padding:14px 22px;border-top:1px solid #E4E0D6;display:flex;gap:10px;align-items:center;flex-shrink:0;flex-wrap:wrap}
.spdg-foot .spdg-spacer{flex:1}
.spdg-btn{display:inline-flex;align-items:center;gap:7px;border:none;border-radius:9px;font-family:inherit;
  font-weight:600;font-size:13.5px;padding:10px 16px;cursor:pointer}
.spdg-btn-primary{background:#0E7C7B;color:#fff}
.spdg-btn-primary:hover{filter:brightness(1.07)}
.spdg-btn-ghost{background:transparent;color:#1F2A44;border:1px solid #D8D3C6}
.spdg-btn-ghost:hover{background:#F0EEE7}
.spdg-hint{font-size:11.5px;color:#9AA3B2}
@media(max-width:700px){.spdg-head,.spdg-tabs,.spdg-body,.spdg-foot{padding-left:14px;padding-right:14px}}
`;

function injectCSS(){
  if(document.getElementById("spdGridCSS"))return;
  const s=document.createElement("style");s.id="spdGridCSS";s.textContent=CSS;
  document.head.appendChild(s);
}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function norm(v){return String(v==null?"":v).trim();}
function keyName(v){return norm(v).toLowerCase().replace(/\s+/g," ");}
function colLabel(i){let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}

// The one structural convention every template shares: a header row containing
// a "Student Name" (or "Name") cell, with student rows beneath it.
function findHeaderRow(aoa){
  for(let i=0;i<Math.min(aoa.length,30);i++){
    const row=aoa[i]||[];
    if(row.some(c=>["student name","name of student","name"].includes(keyName(c))))return i;
  }
  return -1;
}
function findNameCol(aoa,hr){
  if(hr<0)return -1;
  const row=aoa[hr]||[];
  for(let i=0;i<row.length;i++)if(["student name","name of student","name"].includes(keyName(row[i])))return i;
  return -1;
}

/* ---------------- audit: generic, template-agnostic sanity checks --------------- */
// opts.ledgerSheets — names of sheets where one student legitimately owns many rows
// (fee charges, payments, timetable slots). The duplicate-name rule is meaningless there.
function audit(sheets,parserWarnings,opts){
  opts=opts||{};
  const issues=[];
  const declaredLedgers=(opts.ledgerSheets||[]).map(keyName);
  (parserWarnings||[]).forEach(w=>issues.push({sheet:null,row:null,col:null,msg:w,level:"warn"}));

  Object.keys(sheets||{}).forEach(sheetName=>{
    const aoa=sheets[sheetName]||[];
    const hr=findHeaderRow(aoa);
    if(hr<0)return;
    const nameCol=findNameCol(aoa,hr);
    if(nameCol<0)return;

    // Collect first, judge after: a stray typo duplicates one name once, whereas a ledger
    // repeats most of its names by design. Flagging the latter buries the real warnings.
    const seen={},dups=[];let lastDataRow=-1,nameRows=0;
    for(let r=hr+1;r<aoa.length;r++){
      const row=aoa[r]||[];
      const nm=norm(row[nameCol]);
      if(nm!==""){lastDataRow=r;nameRows++;
        const k=keyName(nm);
        if(seen[k]!==undefined)dups.push({row:r,first:seen[k],name:nm});
        else seen[k]=r;
      }
    }
    const dupRatio=nameRows?dups.length/nameRows:0;
    const isLedger=declaredLedgers.includes(keyName(sheetName))||dupRatio>0.25;
    if(!isLedger){
      dups.forEach(d=>issues.push({sheet:sheetName,row:d.row,col:nameCol,level:"warn",
        msg:`${sheetName}: "${d.name}" appears twice (rows ${d.first+1} and ${d.row+1}) — only one will be reported on.`}));
    }
    // a blank name row sandwiched between real students silently truncates some parsers
    for(let r=hr+1;r<lastDataRow;r++){
      const row=aoa[r]||[];
      if(norm(row[nameCol])==="" && row.some(c=>norm(c)!=="")){
        issues.push({sheet:sheetName,row:r,col:nameCol,level:"warn",
          msg:`${sheetName}: row ${r+1} has data but no student name.`});
      }
    }
    // Typo'd numbers. Kept deliberately high-precision: these sheets legitimately contain
    // phone numbers, dates, "9th A", "+2 per correct" and free-text notes, so anything
    // fuzzier than this produces false alarms and trains teachers to click straight past
    // the review screen — which defeats the point of having one.
    for(let r=hr+1;r<aoa.length;r++){
      const row=aoa[r]||[];
      if(norm(row[nameCol])==="")continue;
      for(let c=0;c<row.length;c++){
        if(c===nameCol)continue;
        const v=norm(row[c]);
        if(v==="")continue;
        if(/^[0-9]+[Oo][0-9]*$|^[Oo][0-9]+$/.test(v)){
          issues.push({sheet:sheetName,row:r,col:c,level:"warn",
            msg:`${sheetName}: "${v}" in ${colLabel(c)}${r+1} looks like a number typed with the letter O.`});
        }else if(/^-?\d+[.]\d*[.]/.test(v)){ // 8.5.2 — but never 1,234,567 thousands grouping
          issues.push({sheet:sheetName,row:r,col:c,level:"warn",
            msg:`${sheetName}: "${v}" in ${colLabel(c)}${r+1} has more than one decimal point.`});
        }
      }
    }
  });
  return issues;
}

/* ---------------- blank seed: keep the template scaffold, drop the data -------- */
function blankFrom(sampleSheets,blankRows){
  blankRows=blankRows||6;
  const out={};
  Object.keys(sampleSheets||{}).forEach(name=>{
    const aoa=(sampleSheets[name]||[]).map(r=>Array.isArray(r)?r.slice():[]);
    const hr=findHeaderRow(aoa);
    if(hr<0){out[name]=aoa;return;} // no student rows (e.g. a Subjects/credits sheet) — keep as-is
    const width=Math.max(...aoa.map(r=>r.length),1);
    const kept=aoa.slice(0,hr+1);
    for(let i=0;i<blankRows;i++)kept.push(new Array(width).fill(null));
    out[name]=kept;
  });
  return out;
}

/* ---------------- the overlay ---------------- */
let state=null;

function ensureOverlay(){
  let el=document.getElementById("spdGridOverlay");
  if(el)return el;
  injectCSS();
  el=document.createElement("div");
  el.id="spdGridOverlay";el.className="hidden";
  el.innerHTML=`
    <div class="spdg-card">
      <div class="spdg-head">
        <h3 id="spdgTitle"></h3>
        <p id="spdgSub"></p>
        <div id="spdgIssues" class="spdg-issues" style="display:none"></div>
      </div>
      <div class="spdg-tabs" id="spdgTabs"></div>
      <div class="spdg-body" id="spdgBody"></div>
      <div class="spdg-foot">
        <button class="spdg-btn spdg-btn-ghost" id="spdgAddRow">+ Add row</button>
        <span class="spdg-hint">Click any cell to edit. Changes stay on this device.</span>
        <span class="spdg-spacer"></span>
        <button class="spdg-btn spdg-btn-ghost" id="spdgExport">Download as Excel</button>
        <button class="spdg-btn spdg-btn-ghost" id="spdgCancel">Cancel</button>
        <button class="spdg-btn spdg-btn-primary" id="spdgApply">Looks good — continue</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  el.addEventListener("click",e=>{if(e.target===el)close();});
  document.getElementById("spdgAddRow").addEventListener("click",addRow);
  document.getElementById("spdgExport").addEventListener("click",exportXlsx);
  document.getElementById("spdgCancel").addEventListener("click",close);
  document.getElementById("spdgApply").addEventListener("click",apply);
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&state&&!el.classList.contains("hidden"))close();
  });
  return el;
}

function open(sheets,opts){
  opts=opts||{};
  ensureOverlay();
  const names=Object.keys(sheets||{});
  const issues=opts.issues||[];
  // land on the sheet that actually has a problem, not whichever happens to be first
  const firstFlagged=(issues.find(i=>i.sheet&&names.indexOf(i.sheet)>=0)||{}).sheet;
  state={
    sheets:JSON.parse(JSON.stringify(sheets||{})), // edit a copy; caller's data is untouched until Apply
    active:firstFlagged||names[0]||null,
    issues,
    onApply:opts.onApply||null,
    filename:opts.filename||"Progress_Data.xlsx"
  };
  document.getElementById("spdgTitle").textContent=opts.title||"Review your data";
  document.getElementById("spdgSub").textContent=opts.subtitle||
    "Check the values below, fix anything that looks wrong, then continue.";
  document.getElementById("spdgApply").textContent=opts.applyLabel||"Looks good — continue";
  renderIssues();renderTabs();renderTable();
  document.getElementById("spdGridOverlay").classList.remove("hidden");
}
function close(){
  const el=document.getElementById("spdGridOverlay");
  if(el)el.classList.add("hidden");
  state=null;
}

function renderIssues(){
  const box=document.getElementById("spdgIssues");
  const list=state.issues||[];
  if(!list.length){box.style.display="none";box.innerHTML="";return;}
  box.style.display="block";
  const shown=list.slice(0,8);
  box.innerHTML=`<h4>⚠ ${list.length} thing${list.length>1?"s":""} worth checking</h4>
    <ul>${shown.map(i=>`<li>${esc(i.msg)}</li>`).join("")}
    ${list.length>shown.length?`<li>…and ${list.length-shown.length} more</li>`:""}</ul>`;
}

function renderTabs(){
  const tabs=document.getElementById("spdgTabs");
  const names=Object.keys(state.sheets);
  tabs.innerHTML=names.map(n=>{
    const flagged=(state.issues||[]).some(i=>i.sheet===n);
    return `<button class="spdg-tab ${n===state.active?"on":""}" data-sheet="${esc(n)}">${esc(n)}${flagged?'<span class="spdg-dot"></span>':""}</button>`;
  }).join("");
  tabs.querySelectorAll(".spdg-tab").forEach(b=>b.addEventListener("click",()=>{
    commitVisible();state.active=b.dataset.sheet;renderTabs();renderTable();
  }));
}

function renderTable(){
  const body=document.getElementById("spdgBody");
  const name=state.active;
  if(!name){body.innerHTML="";return;}
  const aoa=state.sheets[name]||[];
  const width=Math.max(1,...aoa.map(r=>(r||[]).length));
  const hr=findHeaderRow(aoa);
  const flagSet={};
  (state.issues||[]).forEach(i=>{if(i.sheet===name&&i.row!=null&&i.col!=null)flagSet[i.row+":"+i.col]=1;});

  let html=`<table class="spdg-table"><thead><tr><th class="spdg-rowhead"></th>`;
  for(let c=0;c<width;c++)html+=`<th>${colLabel(c)}</th>`;
  html+=`<th></th></tr></thead><tbody>`;
  aoa.forEach((row,r)=>{
    row=row||[];
    const isData=hr>=0&&r>hr;
    html+=`<tr><td class="spdg-rowhead">${r+1}</td>`;
    for(let c=0;c<width;c++){
      const v=row[c]==null?"":row[c];
      const cls="spdg-cell"+(flagSet[r+":"+c]?" spdg-flag":"")+(isData?"":" spdg-meta");
      html+=`<td><div class="${cls}" contenteditable="true" spellcheck="false" data-r="${r}" data-c="${c}">${esc(v)}</div></td>`;
    }
    html+=`<td>${isData?`<button class="spdg-del" data-del="${r}" title="Delete this row">✕</button>`:""}</td></tr>`;
  });
  html+=`</tbody></table>`;
  body.innerHTML=html;
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click",()=>{
    commitVisible();
    state.sheets[name].splice(Number(b.dataset.del),1);
    state.issues=(state.issues||[]).filter(i=>i.sheet!==name);
    renderTabs();renderTable();
  }));
}

// contenteditable values only exist in the DOM until we read them back
function commitVisible(){
  const body=document.getElementById("spdgBody");
  if(!body||!state||!state.active)return;
  const aoa=state.sheets[state.active];
  if(!aoa)return;
  body.querySelectorAll(".spdg-cell").forEach(cell=>{
    const r=Number(cell.dataset.r),c=Number(cell.dataset.c);
    if(!aoa[r])aoa[r]=[];
    const txt=cell.textContent.replace(/ /g," ").trim();
    aoa[r][c]=txt===""?null:(/^-?\d+(\.\d+)?$/.test(txt)?Number(txt):txt);
  });
}

function addRow(){
  commitVisible();
  const aoa=state.sheets[state.active];
  if(!aoa)return;
  const width=Math.max(1,...aoa.map(r=>(r||[]).length));
  aoa.push(new Array(width).fill(null));
  renderTable();
  const body=document.getElementById("spdgBody");
  body.scrollTop=body.scrollHeight;
}

function exportXlsx(){
  commitVisible();
  if(typeof XLSX==="undefined"){alert("The Excel engine is still loading — try again in a moment.");return;}
  const wb=XLSX.utils.book_new();
  Object.keys(state.sheets).forEach(name=>{
    const ws=XLSX.utils.aoa_to_sheet(state.sheets[name]||[]);
    XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
  });
  XLSX.writeFile(wb,state.filename);
}

function apply(){
  commitVisible();
  const sheets=state.sheets,cb=state.onApply;
  close();
  if(cb)cb(sheets);
}

window.SPDGrid={audit,open,close,blankFrom};
})();

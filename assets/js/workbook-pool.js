/* =====================================================================
   WorkbookPool — upload once, use everywhere.

   The hub promises "fill one workbook per class and it drives every tool
   below", and the master workbook really does carry Students, Marks,
   Attendance, Fees, Timetable and Notes together. But every tool cached its
   upload under its own key and only ever read that one, so the same file had
   to be uploaded again in each place.

   The store was always shared; only the reading was narrow. This lists what
   any tool or segment has cached and lets another one adopt it.

   It offers rather than assumes: a Pre-Primary workbook has no Fees sheet, so
   picking one runs the tool's normal parse and shows the normal error if it
   doesn't fit. Silently loading a half-usable file would be worse than asking.
   ===================================================================== */
(function(){
"use strict";

const DB="spdWorkbookCache_v1",STORE="workbooks";

const LABELS={
  "pre-primary":"Pre-Primary reports","primary":"Primary reports","secondary":"Secondary reports",
  "junior-college":"Junior College reports","college":"College reports",
  "tool-fees":"Fees & Dues","tool-idcards":"ID Cards","tool-documents":"Certificates",
  "tool-timetable":"Timetable","tool-marksentry":"Enter Marks","tool-atrisk":"At-Risk Radar",
  "tool-parentfile":"Parent File","tool-studentfile":"Student File","tool-resultspack":"Results Pack",
  "tool-testbuilder":"Test Builder","tool-testeval":"Test Evaluator"
};

function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function dbOpen(){
  return new Promise((resolve,reject)=>{
    // version 2 matches the app; the upgrade guard keeps this safe if it opens first
    const req=indexedDB.open(DB,2);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);
      if(!req.result.objectStoreNames.contains("photoOverrides"))req.result.createObjectStore("photoOverrides");
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}

async function list(){
  try{
    const db=await dbOpen();
    const rows=await new Promise((res,rej)=>{
      const tx=db.transaction(STORE,"readonly"),os=tx.objectStore(STORE);
      const k=os.getAllKeys(),v=os.getAll();
      tx.oncomplete=()=>res((k.result||[]).map((key,i)=>({key,rec:(v.result||[])[i]})));
      tx.onerror=()=>rej(tx.error);
    });
    db.close();
    return rows.filter(r=>r.rec&&r.rec.bytes).map(r=>({
      key:r.key,filename:r.rec.filename||"(unnamed)",savedAt:r.rec.savedAt||0,
      from:LABELS[r.key]||r.key,bytes:r.rec.bytes
    })).sort((a,b)=>b.savedAt-a.savedAt);
  }catch(e){return[];}
}

function ago(t){
  if(!t)return"";
  const d=Math.floor((Date.now()-t)/86400000);
  return d<=0?"today":d===1?"yesterday":d+" days ago";
}

/* Paints the picker into `el`. onPick(record, buttonEl) does the loading, because
   only the caller knows how its own parser and cache work. */
async function mount(el,opts){
  opts=opts||{};
  if(!el)return 0;
  const all=await list();
  const others=all.filter(r=>r.key!==opts.selfKey);
  if(!others.length){el.classList.add("hidden");el.innerHTML="";return 0;}
  el.innerHTML=`
    <h3>${esc(opts.title||"Use a workbook you've already uploaded")}</h3>
    <p class="rsub">${esc(opts.subtitle||"The class workbook holds every sheet this suite reads, so you only need to upload it once.")}</p>
    <ul>${others.slice(0,6).map((r,i)=>`<li>
      <div class="rn"><b>${esc(r.filename)}</b>
        <span>from ${esc(r.from)}${r.savedAt?" · "+esc(ago(r.savedAt)):""}</span></div>
      <button type="button" data-pool="${i}">Use this</button></li>`).join("")}</ul>`;
  el.classList.remove("hidden");
  el.querySelectorAll("[data-pool]").forEach(b=>b.addEventListener("click",()=>{
    const r=others[+b.dataset.pool];
    b.disabled=true;b.textContent="Loading…";
    Promise.resolve()
      .then(()=>opts.onPick&&opts.onPick(r,b))
      .catch(err=>{
        b.disabled=false;b.textContent="Use this";
        if(opts.onError)opts.onError(err,r);
      });
  }));
  return others.length;
}

// Shared styling so the picker looks the same in every tool and segment.
const CSS=`
.wp-box{margin-top:18px;border:1px solid var(--line);border-radius:11px;padding:14px 16px;background:#FCFBF7}
.wp-box.hidden{display:none}
.wp-box h3{margin:0 0 3px;font-size:12.5px;color:var(--navy)}
.wp-box .rsub{margin:0 0 11px;font-size:11.5px;color:var(--mut);line-height:1.5}
.wp-box ul{list-style:none;margin:0;padding:0;display:grid;gap:7px}
.wp-box li{display:flex;align-items:center;gap:11px;border:1px solid var(--line2);border-radius:9px;
  padding:9px 11px;background:#fff}
.wp-box .rn{flex:1;min-width:0;text-align:left}
.wp-box .rn b{display:block;font-size:12.5px;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-box .rn span{font-size:11px;color:var(--mut)}
.wp-box button{background:var(--teal-soft);color:#12615F;border:1px solid #A8D4D2;border-radius:7px;
  padding:7px 12px;font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer;font-family:inherit}
.wp-box button:hover{background:var(--teal);color:#fff;border-color:var(--teal)}
.wp-box button:disabled{opacity:.6;cursor:default}
`;
function injectCSS(){
  if(document.getElementById("wpCSS"))return;
  const s=document.createElement("style");s.id="wpCSS";s.textContent=CSS;
  document.head.appendChild(s);
}

window.WorkbookPool={list,mount,injectCSS,LABELS,ago};
})();

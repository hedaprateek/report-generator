/* =====================================================================
   ReportSections — choose what goes on the report before it goes out.

   Not every section suits every class or every term. A term with no trips
   has nothing to say under Milestones; a parent meeting may want only the
   marks and the teacher's note. Rather than a teacher deleting blocks by
   hand after printing, the sections are switchable here.

   Sections are DISCOVERED from the rendered report rather than declared in
   a list, for the same reason the translator works on the DOM: the five
   segments build their reports from a dozen different template functions,
   and a hardcoded list would drift out of step the moment one changed.
   Anything that is a .rep-sec with a heading becomes a toggle, and a small
   map names the few blocks that have no heading of their own.

   The choice is remembered per segment, because a kindergarten report and a
   college report share nothing but the mechanism.
   ===================================================================== */
(function(){
"use strict";

const KEY_PREFIX="spdReportSections_v1:";

/* Blocks worth offering that carry no <h3> of their own. Keyed by a class
   found inside them. Anything not listed and without a heading is left alone —
   the identity strip and the signature row are structure, not content. */
const UNTITLED={
  "spot-grid":"Best At / Needs Attention",
  "badge-row":"Badges & highlights",
  "growth-story":"Growth story"
};

const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

const CSS=`
.rs-off{display:none !important}
.rs-panel{border:1px solid var(--line);border-radius:11px;background:#FCFBF7;
  padding:13px 15px;margin:12px 0 4px;max-width:760px}
.rs-panel h4{margin:0 0 2px;font-size:12.5px;color:var(--navy)}
.rs-panel .rs-sub{margin:0 0 10px;font-size:11.5px;color:var(--mut);line-height:1.5}
.rs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:4px 14px}
.rs-item{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink);
  padding:5px 0;cursor:pointer;min-height:28px}
.rs-item input{width:16px;height:16px;accent-color:var(--teal);flex-shrink:0;margin:0}
.rs-item.off{color:var(--mut2)}
.rs-actions{display:flex;gap:10px;margin-top:10px;font-size:12px}
.rs-actions button{background:none;border:none;color:var(--teal);cursor:pointer;
  font:inherit;text-decoration:underline;text-underline-offset:3px;padding:4px 2px}
.rs-actions button:hover{color:var(--navy)}
.rs-count{margin-left:auto;color:var(--mut);text-decoration:none;cursor:default}
@media print{.rs-panel{display:none !important}}
`;
function injectCSS(){
  if(document.getElementById("rsCSS"))return;
  const s=document.createElement("style");s.id="rsCSS";s.textContent=CSS;
  document.head.appendChild(s);
}

/* A stable id for a section. Taken from the ENGLISH heading, so switching the
   report to Hindi or Marathi does not silently orphan the saved choices —
   which means discovery must run before the translator. */
function keyOf(sec){
  const h=sec.querySelector("h3,h4");
  if(h)return h.textContent.trim().toLowerCase().replace(/\s+/g," ").slice(0,60);
  for(const cls in UNTITLED){
    if(sec.querySelector("."+cls))return "@"+cls;
  }
  return null;
}
function labelOf(sec,key){
  const h=sec.querySelector("h3,h4");
  if(h)return h.textContent.trim();
  return UNTITLED[key.replace(/^@/,"")]||key;
}

function discover(root){
  if(!root)return[];
  const out=[],seen=new Set();
  root.querySelectorAll(".rep-sec").forEach(sec=>{
    const key=keyOf(sec);
    if(!key||seen.has(key))return;
    seen.add(key);
    out.push({key,label:labelOf(sec,key)});
  });
  return out;
}

function load(segment){
  try{
    const raw=localStorage.getItem(KEY_PREFIX+segment);
    return raw?JSON.parse(raw):{};
  }catch(e){return{};}
}
function save(segment,hidden){
  try{localStorage.setItem(KEY_PREFIX+segment,JSON.stringify(hidden));}catch(e){}
}

/* Applied to every .sheet on the page, so Print All and the all-students PDF
   drop the same sections as the single report on screen. */
function apply(scope,segment){
  const hidden=load(segment);
  let off=0;
  (scope||document).querySelectorAll(".rep-sec").forEach(sec=>{
    const key=keyOf(sec);
    if(!key)return;
    const hide=!!hidden[key];
    sec.classList.toggle("rs-off",hide);
    if(hide)off++;
  });
  return off;
}

/* The panel lists what this report actually contains right now. onChange is
   the caller's re-render — cheaper and safer than trying to unhide correctly. */
function mountPanel(el,sampleSheet,segment,onChange){
  if(!el)return;
  injectCSS();
  const sections=discover(sampleSheet);
  if(!sections.length){el.innerHTML="";return;}
  const hidden=load(segment);
  const shown=sections.filter(s=>!hidden[s.key]).length;

  el.className="rs-panel no-print";
  el.innerHTML=`
    <h4>Sections on this report</h4>
    <p class="rs-sub">Untick anything you don't want printed or sent. Applies to the
      report on screen, the PDF, the shared page and Print All.</p>
    <div class="rs-grid">
      ${sections.map(s=>`<label class="rs-item${hidden[s.key]?" off":""}">
        <input type="checkbox" data-sec="${esc(s.key)}"${hidden[s.key]?"":" checked"}>
        <span>${esc(s.label)}</span></label>`).join("")}
    </div>
    <div class="rs-actions">
      <button type="button" data-rs="all">Select all</button>
      <button type="button" data-rs="none">Clear all</button>
      <span class="rs-count">${shown} of ${sections.length} shown</span>
    </div>`;

  el.querySelectorAll("[data-sec]").forEach(cb=>cb.addEventListener("change",()=>{
    const h=load(segment);
    if(cb.checked)delete h[cb.dataset.sec];else h[cb.dataset.sec]=1;
    save(segment,h);
    if(onChange)onChange();
  }));
  el.querySelectorAll("[data-rs]").forEach(b=>b.addEventListener("click",()=>{
    const h={};
    if(b.dataset.rs==="none")sections.forEach(s=>h[s.key]=1);
    save(segment,h);
    if(onChange)onChange();
  }));
}

window.ReportSections={discover,apply,mountPanel,load,save,injectCSS};
})();

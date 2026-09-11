/* =====================================================================
   HealthBlock — the physical details, in one compact strip.

   Blood group was already being collected in every master workbook and had
   never once appeared on a report. Height and weight now sit beside it.

   Deliberately small: this is a strip of chips, not a section with tables.
   A report card is about how a child is doing at school, and these are
   reference details a parent occasionally needs — useful to have on the
   page, wrong to give a third of it to.

   It renders as an ordinary .rep-sec with a heading, which means the
   section chooser picks it up automatically and an academy that does not
   record any of this simply switches it off — or never sees it, because a
   block with nothing in it is not rendered at all.

   "Others" is handled by naming the columns you want in EXTRA below, or by
   adding your own to the Students sheet and listing the header here. The
   reader matches on header text, so no column positions to keep in step.
   ===================================================================== */
(function(){
"use strict";

const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm=v=>String(v==null?"":v).trim();
const keyName=v=>norm(v).toLowerCase().replace(/\s+/g," ");

/* label -> the header names that may carry it. Add a row to extend; nothing
   else needs changing. Anything absent from the workbook is skipped. */
const FIELDS=[
  {label:"Height",      unit:" cm", headers:["Height (cm)","Height","Ht (cm)","Ht"]},
  {label:"Weight",      unit:" kg", headers:["Weight (kg)","Weight","Wt (kg)","Wt"]},
  {label:"Blood group", unit:"",    headers:["Blood Group","Blood","Blood Grp"]},
  {label:"Vision",      unit:"",    headers:["Vision","Eyesight"]},
  {label:"Allergies",   unit:"",    headers:["Allergies","Allergy"]},
  {label:"House",       unit:"",    headers:["House","Team"]},
  {label:"Date of birth",unit:"",   headers:["Date of Birth","DOB","Birth Date"]}
];

const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtCell(label,v){
  if(label!=="Date of birth")return norm(v);
  // dates arrive as Excel serials or as text, depending on the cell format
  let d=null;
  if(v instanceof Date)d=v;
  else if(typeof v==="number"&&isFinite(v)){
    const t=new Date(Math.round((v-25569)*86400000));
    if(!isNaN(t))d=new Date(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate());
  }else{
    const m=norm(v).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if(m)d=new Date(+m[1],+m[2]-1,+m[3]);
  }
  return d?d.getDate()+" "+MONTHS[d.getMonth()]+" "+d.getFullYear():norm(v);
}

function findSheet(sheets,name){
  if(!sheets)return null;
  const want=keyName(name);
  for(const k in sheets)if(keyName(k)===want)return sheets[k];
  return null;
}

/* Returns [{label,value}] for one student, or [] when the workbook records
   none of it. Matching is by student name, the identity used everywhere else
   in this suite. */
function read(sheets,studentName){
  const aoa=findSheet(sheets,"Students");
  if(!aoa||!aoa.length)return[];
  let hr=-1;
  for(let i=0;i<Math.min(aoa.length,15);i++){
    const row=(aoa[i]||[]).map(keyName);
    if(row.some(c=>c==="student name"||c==="name of student"||c==="name")){hr=i;break;}
  }
  if(hr<0)return[];
  const header=(aoa[hr]||[]).map(keyName);
  const nameCol=header.findIndex(c=>c==="student name"||c==="name of student"||c==="name");
  if(nameCol<0)return[];

  const want=keyName(studentName);
  let row=null;
  for(let r=hr+1;r<aoa.length;r++){
    const cand=aoa[r]||[];
    if(keyName(cand[nameCol])===want){row=cand;break;}
  }
  if(!row)return[];

  const out=[];
  FIELDS.forEach(f=>{
    let i=-1;
    for(const h of f.headers){const j=header.indexOf(keyName(h));if(j>=0){i=j;break;}}
    if(i<0)return;
    const raw=row[i];
    const val=fmtCell(f.label,raw);
    if(!val)return;
    out.push({label:f.label,value:val+(f.unit&&/^[\d.]+$/.test(val)?f.unit:"")});
  });
  return out;
}

/* BMI is free once height and weight are both there, and is the one thing a
   parent cannot work out at a glance. Deliberately unlabelled as healthy or
   otherwise — that is a doctor's call, not a report card's. */
function bmiOf(items){
  const h=items.find(i=>i.label==="Height"),w=items.find(i=>i.label==="Weight");
  if(!h||!w)return null;
  const hv=parseFloat(h.value),wv=parseFloat(w.value);
  if(!isFinite(hv)||!isFinite(wv)||hv<=0)return null;
  const m=hv/100;
  const bmi=wv/(m*m);
  return isFinite(bmi)&&bmi>0&&bmi<100?bmi.toFixed(1):null;
}

function sectionHTML(items,opts){
  opts=opts||{};
  if(!items||!items.length)return"";
  const bmi=opts.showBmi===false?null:bmiOf(items);
  const chips=items.map(i=>
    `<span class="hb-chip"><span class="hb-k">${esc(i.label)}</span><b>${esc(i.value)}</b></span>`).join("");
  const bmiChip=bmi?`<span class="hb-chip"><span class="hb-k">BMI</span><b>${esc(bmi)}</b></span>`:"";
  return `<div class="rep-sec">
    <h3>${esc(opts.heading||"Physical & health")}</h3>
    <div class="hb-strip">${chips}${bmiChip}</div>
  </div>`;
}

const CSS=`
.hb-strip{display:flex;flex-wrap:wrap;gap:5px 7px}
.hb-chip{display:inline-flex;align-items:baseline;gap:5px;border:1px solid var(--line2);
  border-radius:20px;padding:3px 10px;background:#FCFBF7;font-size:9.5px;line-height:1.5}
.hb-chip .hb-k{color:var(--mut);letter-spacing:.02em}
.hb-chip b{color:var(--navy);font-size:10.5px;font-weight:700}
@media print{.hb-chip{background:transparent}}
`;
function injectCSS(){
  if(document.getElementById("hbCSS"))return;
  const s=document.createElement("style");s.id="hbCSS";s.textContent=CSS;
  document.head.appendChild(s);
}

window.HealthBlock={read,sectionHTML,bmiOf,injectCSS,FIELDS};
})();

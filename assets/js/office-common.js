/* =====================================================================
   OFFICE — shared shell for the front-office tools (Fees, ID Cards,
   Documents, Timetable).

   Every one of these is the same story: a roster/ledger comes in from an
   Excel sheet, and branded paper comes out. This module owns everything
   that is identical between them — theme, top bar, landing screen, upload
   + demo + manual-entry paths, the review-on-oddities step, the workbook
   cache, branding overrides, printing and PDF sharing — so each tool only
   has to implement its own domain logic and views.

   A tool calls:
     OFFICE.boot({
       title, subtitle, kicker, headline, blurb,
       templateHref, sampleSheets, cacheKey,
       emptyMessage,                  // shown if the sheet has no usable rows
       parse(sheets),                 // -> data, or throw new Error(msg)
       render(data, mount, sheets)    // paint the tool
     })
   ===================================================================== */
(function(){
"use strict";

/* ---------------------------------------------------------------- theme */
const CSS = `
:root{
  --navy:#1F2A44; --ink:#2B2F3A; --paper:#F5F3EE; --card:#FFFFFF;
  --teal:#0E7C7B; --teal-soft:#E2F0EF; --amber:#C9791B; --amber-soft:#FBEEDC;
  --line:#E4E0D6; --line2:#D8D3C6; --mut:#7C8598; --mut2:#9AA3B2;
  --b1:#B4472F; --b1s:#F6E3DD; --b5:#1F7A4D; --b5s:#DEEEE4;
  --gold:#C9A227;
  --shadow:0 1px 2px rgba(31,42,68,.04),0 6px 20px rgba(31,42,68,.06);
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--paper);color:var(--ink);min-height:100vh;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
.serif{font-family:Georgia,"Times New Roman",serif}
button{font-family:inherit;cursor:pointer}
a{color:var(--teal)}
.hidden{display:none !important}

/* landing */
#ofLanding{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative}
.of-back{position:absolute;top:22px;left:24px;color:#7C8598;font-size:12.5px;text-decoration:none;font-weight:600}
.of-back:hover{color:var(--navy)}
.of-land-card{max-width:760px;width:100%;background:var(--card);border:1px solid var(--line);
  border-radius:16px;box-shadow:var(--shadow);overflow:hidden}
.of-land-head{background:linear-gradient(135deg,#1B2540 0%,#25335A 55%,#1F2A44 100%);color:#fff;padding:32px 40px 34px;text-align:center}
.of-land-head img{height:72px;width:auto;border-radius:12px;box-shadow:0 6px 18px rgba(0,0,0,.28);margin-bottom:14px}
.of-land-head .kicker{color:#D9B94A;font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700}
.of-land-head h1{font-family:Georgia,serif;font-weight:600;font-size:28px;margin:8px 0 6px}
.of-land-head p{margin:0 auto;color:#C6CEDC;font-size:14px;max-width:52ch;line-height:1.5}
.of-land-body{padding:30px 40px 36px}
#ofDrop{border:2px dashed var(--line2);border-radius:12px;padding:34px;text-align:center;background:#FCFBF7;cursor:pointer}
#ofDrop.drag{border-color:var(--teal);background:var(--teal-soft)}
#ofDrop h3{margin:0 0 4px;font-size:16px;color:var(--navy)}
#ofDrop p{margin:0;color:var(--mut);font-size:13px}
.of-actions{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap;align-items:center}
.of-err{background:#FDF1EC;border:1px solid #E8B49A;border-left:4px solid var(--b1);border-radius:9px;
  padding:14px 16px;margin:16px 0;font-size:13px;color:#7A3323;line-height:1.55}
.of-note{margin-top:22px;padding-top:20px;border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr;gap:18px}
.of-note h4{margin:0 0 4px;font-size:12.5px;color:var(--navy)}
.of-note p{margin:0;font-size:12.5px;color:var(--mut);line-height:1.5}
@media(max-width:640px){.of-note{grid-template-columns:1fr}}

/* buttons */
.btn{display:inline-flex;align-items:center;gap:8px;border:none;border-radius:9px;
  font-weight:600;font-size:14px;padding:11px 18px;text-decoration:none}
.btn:active{transform:translateY(1px)}
.btn-primary{background:var(--teal);color:#fff}
.btn-primary:hover{filter:brightness(1.06)}
.btn-ghost{background:transparent;color:var(--navy);border:1px solid var(--line2)}
.btn-ghost:hover{background:#F0EEE7}

/* app shell */
#ofApp{display:none;min-height:100vh}
.of-top{position:sticky;top:0;z-index:40;background:linear-gradient(90deg,#1B2540,#243257);color:#fff;
  display:flex;align-items:center;gap:18px;padding:0 22px;height:60px;box-shadow:0 2px 14px rgba(31,42,68,.14)}
.of-top img{height:38px;width:auto;border-radius:8px;background:rgba(255,255,255,.06)}
.of-brand{display:flex;flex-direction:column;line-height:1.1}
.of-brand b{font-family:Georgia,serif;font-size:16px}
.of-brand span{font-size:10.5px;color:#AEB9CC;letter-spacing:.05em;margin-top:2px}
.of-tabs{display:flex;gap:2px;height:100%}
.of-tab{background:none;border:none;color:#B9C4D6;font-weight:600;font-size:13.5px;
  padding:0 16px;height:100%;border-bottom:3px solid transparent}
.of-tab:hover{color:#fff}
.of-tab.on{color:#fff;border-bottom-color:var(--teal)}
.of-top-right{margin-left:auto;display:flex;align-items:center;gap:10px}
.of-pill{font-size:11.5px;color:#C6CEDC;background:rgba(255,255,255,.08);padding:6px 12px;border-radius:20px}
.mini-btn{background:rgba(255,255,255,.1);color:#fff;border:none;border-radius:7px;
  padding:8px 13px;font-size:12.5px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center}
.mini-btn:hover{background:rgba(255,255,255,.18)}
.of-wrap{max-width:1200px;margin:0 auto;padding:26px 22px 60px}

/* generic view furniture */
.of-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px;gap:16px;flex-wrap:wrap}
.of-head h2{font-family:Georgia,serif;font-weight:600;font-size:24px;color:var(--navy);margin:2px 0 0}
.of-eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);font-weight:600}
.of-filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
select,input[type=text],input[type=number],input[type=date]{font-family:inherit;font-size:13px;padding:8px 12px;
  border:1px solid var(--line2);border-radius:8px;background:var(--card);color:var(--ink)}
select:focus,input:focus{outline:2px solid var(--teal-soft);border-color:var(--teal)}
label.flab{font-size:12px;color:var(--mut);font-weight:600}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;box-shadow:var(--shadow)}
.panel h3{margin:0 0 3px;font-size:14.5px;color:var(--navy);font-weight:700}
.panel .sub{font-size:12px;color:var(--mut);margin:0 0 16px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:22px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:15px 16px;box-shadow:var(--shadow)}
.kpi .k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);font-weight:600}
.kpi .v{font-family:Georgia,serif;font-size:26px;color:var(--navy);margin-top:6px;line-height:1}
.kpi .s{font-size:11.5px;color:var(--mut);margin-top:5px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);
  font-weight:700;padding:9px 10px;border-bottom:2px solid var(--line2)}
td{padding:9px 10px;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:none}
th.r,td.r{text-align:right}
th.c,td.c{text-align:center}
tbody tr.clickable{cursor:pointer}
tbody tr.clickable:hover{background:#FAF8F2}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap}
.empty{color:var(--mut);font-size:13px;padding:24px;text-align:center}
.of-print-head{display:none;align-items:center;gap:12px;border-bottom:2.5px solid var(--navy);padding-bottom:12px;margin-bottom:18px}
.of-print-head img{height:44px;width:auto;border-radius:8px}
.of-print-head .acad{font-family:Georgia,serif;font-size:20px;color:var(--navy);font-weight:600}
.of-print-head .doc{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);font-weight:700;margin-top:2px}
.of-print-head .meta{margin-left:auto;text-align:right;font-size:11px;color:var(--mut);line-height:1.5}

/* paper */
.sheet{background:#fff;width:210mm;max-width:100%;margin:0 auto 18px;border:1px solid var(--line);
  box-shadow:var(--shadow);padding:14mm 14mm;color:#22262F}

@media print{
  @page{size:A4;margin:10mm}
  body{background:#fff}
  .of-top,#ofLanding,.no-print,#spdGridOverlay{display:none !important}
  #ofApp{display:block !important}
  .of-wrap{padding:0;max-width:none}
  .of-view:not(.print-target){display:none !important}
  .of-print-head{display:flex}
  .panel,.kpi{box-shadow:none;border:1px solid #D8D3C6}
  .sheet{width:auto;margin:0;border:none;box-shadow:none;padding:0}
  .page-break{page-break-after:always}
  tr,.card-item{break-inside:avoid}
}
`;

/* --------------------------------------------------------------- branding */
const DEFAULT_BRANDING={
  name:"The Extra Step Academy",
  logoFull:"../../assets/images/tesa-logo-full.png",
  logoEmblem:"../../assets/images/tesa-emblem.png"
};
const BRANDING_KEY="spdBrandingOverrides_v1"; // shared with every segment app
function loadBranding(){
  let saved={};
  try{saved=JSON.parse(localStorage.getItem(BRANDING_KEY)||"{}")||{};}catch(e){saved={};}
  return{name:saved.name||DEFAULT_BRANDING.name,
    logoFull:saved.logoFull||DEFAULT_BRANDING.logoFull,
    logoEmblem:saved.logoEmblem||DEFAULT_BRANDING.logoEmblem};
}
let BRANDING=loadBranding();

/* ------------------------------------------------------------- utilities */
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function norm(v){return String(v==null?"":v).trim();}
function keyName(v){return norm(v).toLowerCase().replace(/\s+/g," ");}
function toNum(v){if(typeof v==="number")return v;const s=norm(v);if(s==="")return null;
  const n=Number(s.replace(/[,\s₹]/g,""));return isNaN(n)?null:n;}
function slugify(s){return norm(s).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")||"document";}

const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
// Excel serials are decoded with pure UTC arithmetic so the day never shifts with timezone.
function parseDate(v){
  if(v==null||v==="")return null;
  if(typeof v==="number"&&isFinite(v)&&v>0&&v<300000){
    const d=new Date(Math.round((v-25569)*86400000));
    if(isNaN(d))return null;
    return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  }
  // Already a Date: every Date this module produces is local midnight, so read it back with
  // local getters. Using UTC getters here silently shifted dates back a day east of Greenwich.
  if(v instanceof Date)return isNaN(v)?null:new Date(v.getFullYear(),v.getMonth(),v.getDate());
  const s=norm(v);if(s==="")return null;
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso)return new Date(+iso[1],+iso[2]-1,+iso[3]);
  const dmy=s.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3,})[-\/ ](\d{2,4})$/);
  if(dmy){const mi=MONTHS.findIndex(m=>m.toLowerCase()===dmy[2].slice(0,3).toLowerCase());
    if(mi>=0){let y=+dmy[3];if(y<100)y+=2000;return new Date(y,mi,+dmy[1]);}}
  const d=new Date(s);return isNaN(d)?null:d;
}
function fmtDate(v){const d=parseDate(v);return d?`${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`:norm(v);}
function today(){const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate());}

function money(n){
  if(n==null||isNaN(n))return "—";
  // Indian digit grouping: 12,34,567
  const neg=n<0;n=Math.abs(Math.round(n));
  let s=String(n),out="";
  if(s.length>3){const last3=s.slice(-3);let rest=s.slice(0,-3);
    rest=rest.replace(/\B(?=(\d{2})+(?!\d))/g,",");out=rest+","+last3;}
  else out=s;
  return (neg?"-₹":"₹")+out;
}
const ONES=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve",
  "Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"];
const TENS=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
function twoDigit(n){return n<20?ONES[n]:TENS[Math.floor(n/10)]+(n%10?" "+ONES[n%10]:"");}
// Indian numbering — receipts are legal-ish documents, so "Rupees ... Only" is expected.
function moneyInWords(n){
  n=Math.round(Math.abs(n||0));
  if(n===0)return "Rupees Zero Only";
  const parts=[];
  const crore=Math.floor(n/10000000);n%=10000000;
  const lakh=Math.floor(n/100000);n%=100000;
  const thousand=Math.floor(n/1000);n%=1000;
  const hundred=Math.floor(n/100);n%=100;
  if(crore)parts.push(twoDigit(crore)+" Crore");
  if(lakh)parts.push(twoDigit(lakh)+" Lakh");
  if(thousand)parts.push(twoDigit(thousand)+" Thousand");
  if(hundred)parts.push(ONES[hundred]+" Hundred");
  if(n)parts.push((parts.length?"and ":"")+twoDigit(n));
  return "Rupees "+parts.join(" ")+" Only";
}

/* ------------------------------------------------------- sheet plumbing */
function sheetsFromBytes(bytes){
  const wb=XLSX.read(new Uint8Array(bytes),{type:"array"});
  const out={};
  wb.SheetNames.forEach(n=>{out[n]=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:null,raw:true});});
  return out;
}
function findSheet(sheets,name){
  const want=keyName(name);
  for(const k of Object.keys(sheets||{}))if(keyName(k)===want)return sheets[k];
  return null;
}
// Reads a flat header-row table into objects. `map` is {outKey:[accepted,header,names]}.
function readTable(aoa,map){
  if(!aoa||aoa.length<1)return[];
  let hr=-1;
  const wanted=Object.values(map).flat().map(keyName);
  for(let i=0;i<Math.min(aoa.length,20);i++){
    const row=(aoa[i]||[]).map(keyName);
    if(row.some(c=>c&&wanted.includes(c))){hr=i;break;}
  }
  if(hr<0)return[];
  const header=(aoa[hr]||[]).map(keyName);
  const idx={};
  Object.keys(map).forEach(k=>{
    idx[k]=-1;
    for(const cand of map[k]){const i=header.indexOf(keyName(cand));if(i>=0){idx[k]=i;break;}}
  });
  const rows=[];
  for(let r=hr+1;r<aoa.length;r++){
    const row=aoa[r]||[];
    if(!row.some(c=>norm(c)!==""))continue;
    const obj={__row:r};
    Object.keys(idx).forEach(k=>{obj[k]=idx[k]>=0?row[idx[k]]:null;});
    rows.push(obj);
  }
  return rows;
}

/* ------------------------------------------- cross-workbook data readers
   The suite produces five different marks formats (pre-primary ratings through
   college credits). Rather than teach every new tool all five, these readers
   pull the three things any tool actually needs — how they're scoring, whether
   they're turning up, and whether they've paid — out of whatever workbook the
   user happens to have. Best-effort by design: a signal that can't be read is
   simply absent, never wrong.
   ------------------------------------------------------------------------ */
function headerRowOf(aoa,extra){
  const want=["student name","name of student","name"].concat(extra||[]);
  for(let i=0;i<Math.min((aoa||[]).length,30);i++){
    const row=(aoa[i]||[]).map(keyName);
    if(row.some(c=>want.includes(c)))return i;
  }
  return -1;
}
function nameColOf(aoa,hr){
  const row=(aoa[hr]||[]).map(keyName);
  for(let i=0;i<row.length;i++)if(["student name","name of student","name"].includes(row[i]))return i;
  return -1;
}
const SKIP_COLS=new Set(["","total","grand total","overall","remarks","remark","roll no","roll","sr. no.","sr no",
  "student name","name of student","name","batch","class","division","section","goals for next term","notes","note"]);

// Marks may be out of 20, 50, 100 or a 4-point rating. Everything is normalised to a
// percentage against that column's own ceiling so scores stay comparable across blocks.
function readAcademic(sheets){
  const aoa=findSheet(sheets,"marks")||findSheet(sheets,"evaluation");
  if(!aoa)return null;
  const hr=headerRowOf(aoa);
  if(hr<0)return null;
  const cName=nameColOf(aoa,hr);
  if(cName<0)return null;
  const header=aoa[hr]||[];
  // Meta rows above the header: MAX MARKS gives the true ceiling, TEST names the
  // column block, TOPICS says which chapter each column examined. Only MAX is
  // required; the other two simply unlock richer analysis when they're filled in.
  let maxRow=null,testRow=null,topicRow=null;
  for(let i=hr-1;i>=Math.max(0,hr-10);i--){
    const row=aoa[i]||[];
    let label="";
    for(let c=0;c<Math.min(4,row.length);c++){const k=keyName(row[c]);if(k){label=k;break;}}
    if(!label)continue;
    if(!maxRow&&label.includes("max"))maxRow=row;
    else if(!topicRow&&label.includes("topic"))topicRow=row;
    else if(!testRow&&(label.includes("test")||label.includes("exam")||label.includes("semester")||label.includes("eval")))testRow=row;
  }
  const cols=[];
  header.forEach((c,i)=>{if(i>cName&&!SKIP_COLS.has(keyName(c)))cols.push({label:norm(c),i});});
  if(!cols.length)return null;

  // Test names sit only on the first column of each block, so carry them forward;
  // topics are written per column and are read directly.
  let curTest="";
  cols.forEach(c=>{
    if(testRow){const t=norm(testRow[c.i]);if(t)curTest=t;}
    c.test=curTest||"Assessment";
    c.topic=topicRow?norm(topicRow[c.i]):"";
    if(c.topic==="-"||keyName(c.topic)==="na")c.topic="";
    c.subject=c.label;
  });

  const rows=[];
  for(let r=hr+1;r<aoa.length;r++){
    const row=aoa[r]||[];const nm=norm(row[cName]);
    if(!nm)continue;
    rows.push({name:nm,row});
  }
  if(!rows.length)return null;

  // ceiling per column: declared max, else the highest value anyone scored
  cols.forEach(c=>{
    const declared=maxRow?toNum(maxRow[c.i]):null;
    let seen=0;rows.forEach(({row})=>{const n=toNum(row[c.i]);if(n!=null&&n>seen)seen=n;});
    c.max=(declared&&declared>0)?declared:(seen>0?seen:100);
  });

  const byName={};
  rows.forEach(({name,row})=>{
    const seq=[],absent=[];
    const subjAcc={},topicAcc={},testAcc={};
    cols.forEach(c=>{
      const raw=row[c.i];
      const s=norm(raw).toUpperCase();
      if(["A","AB","ABS","ABSENT"].includes(s)){absent.push(c.label);return;}
      const n=toNum(raw);
      if(n==null)return;
      const pct=clamp(n/c.max*100,0,100);
      seq.push({label:c.label,pct,test:c.test,topic:c.topic,subject:c.subject});
      (subjAcc[c.subject]=subjAcc[c.subject]||[]).push(pct);
      (testAcc[c.test]=testAcc[c.test]||{got:0,max:0,n:0});
      testAcc[c.test].got+=n;testAcc[c.test].max+=c.max;testAcc[c.test].n++;
      if(c.topic){
        const k=c.subject+"||"+c.topic;
        (topicAcc[k]=topicAcc[k]||{subject:c.subject,topic:c.topic,pcts:[]}).pcts.push(pct);
      }
    });
    if(!seq.length&&!absent.length)return;
    const pcts=seq.map(x=>x.pct);
    const avg=pcts.length?mean(pcts):null;
    // least-squares slope in percentage-points per assessment
    let slope=null;
    if(pcts.length>=3){
      const n=pcts.length;let sx=0,sy=0,sxy=0,sxx=0;
      pcts.forEach((y,x)=>{sx+=x;sy+=y;sxy+=x*y;sxx+=x*x;});
      const d=n*sxx-sx*sx;
      slope=d===0?0:(n*sxy-sx*sy)/d;
    }
    const bySubject={};Object.keys(subjAcc).forEach(k=>bySubject[k]=mean(subjAcc[k]));
    const byTopic=Object.values(topicAcc).map(t=>({subject:t.subject,topic:t.topic,
      avg:mean(t.pcts),n:t.pcts.length})).sort((a,b)=>a.avg-b.avg);
    const byTest=Object.keys(testAcc).map(t=>({test:t,
      pct:testAcc[t].max>0?testAcc[t].got/testAcc[t].max*100:null,n:testAcc[t].n}));
    byName[keyName(name)]={name,seq,avg,slope,absences:absent.length,absentIn:absent,
      bySubject,byTopic,byTest};
  });
  if(!Object.keys(byName).length)return null;
  return{byName,
    columns:cols.map(c=>c.label),
    subjects:[...new Set(cols.map(c=>c.subject))],
    tests:[...new Set(cols.map(c=>c.test))],
    topics:[...new Set(cols.map(c=>c.topic).filter(Boolean))],
    hasTopics:cols.some(c=>c.topic)};
}
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null;}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

// Handles both shapes the suite produces: P/A/L day columns, and subject-wise
// percentages (college). Whichever it finds, the answer is one percentage.
function readAttendance(sheets){
  const aoa=findSheet(sheets,"attendance");
  if(!aoa)return null;
  const hr=headerRowOf(aoa);
  if(hr<0)return null;
  const cName=nameColOf(aoa,hr);
  if(cName<0)return null;
  const header=aoa[hr]||[];
  const cols=[];
  header.forEach((c,i)=>{if(i>cName&&norm(c)!=="")cols.push(i);});
  if(!cols.length)return null;
  const byName={};
  for(let r=hr+1;r<aoa.length;r++){
    const row=aoa[r]||[];const nm=norm(row[cName]);
    if(!nm)continue;
    let P=0,A=0,L=0,pcts=[];
    cols.forEach(i=>{
      const s=norm(row[i]).toUpperCase();
      if(s==="P")P++;else if(s==="A")A++;else if(s==="L")L++;
      else{const n=toNum(row[i]);if(n!=null&&n>=0&&n<=100)pcts.push(n);}
    });
    const marked=P+A+L;
    if(marked>0)byName[keyName(nm)]={pct:P/marked*100,present:P,total:marked,kind:"days"};
    else if(pcts.length)byName[keyName(nm)]={pct:mean(pcts),present:null,total:null,kind:"subjectwise"};
  }
  return Object.keys(byName).length?{byName}:null;
}

// A dated observation log, one row per note. Richer than the single Notes column on the
// roster because it keeps history — "what did we tell this parent in July" is a real question.
function readNotes(sheets){
  const aoa=findSheet(sheets,"notes");
  if(!aoa)return null;
  const rows=readTable(aoa,{
    date:["Date","On","When"],name:["Student Name","Name"],
    by:["By","Teacher","Staff","Recorded By"],
    type:["Type","Category","Kind"],
    note:["Note","Observation","Remark","Comment","Details"]
  }).map(r=>({date:parseDate(r.date),name:norm(r.name),by:norm(r.by),
    type:norm(r.type),note:norm(r.note)})).filter(n=>n.name&&n.note);
  if(!rows.length)return null;
  const byName={};
  rows.forEach(n=>{(byName[keyName(n.name)]=byName[keyName(n.name)]||[]).push(n);});
  // newest first — a teacher opening this wants the latest, not the oldest
  Object.keys(byName).forEach(k=>byName[k].sort((a,b)=>(b.date?b.date.getTime():0)-(a.date?a.date.getTime():0)));
  return{byName,all:rows};
}

// Same charges/payments model the Fees tool uses, so every tool quotes the same number.
function readFees(sheets){
  const chg=findSheet(sheets,"charges"),pay=findSheet(sheets,"payments");
  if(!chg&&!pay)return null;
  const charges=readTable(chg||[],{name:["Student Name","Name"],item:["Item","Particulars","Description","Fee Head"],
    amount:["Amount","Fee","Value"],due:["Due Date","Due","Date"]})
    .map(r=>({name:norm(r.name),item:norm(r.item)||"Fee",amount:toNum(r.amount)||0,due:parseDate(r.due)}))
    .filter(c=>c.name&&c.amount>0);
  const payments=readTable(pay||[],{name:["Student Name","Name"],date:["Date","Payment Date","Paid On"],
    amount:["Amount","Paid","Value"]})
    .map(r=>({name:norm(r.name),date:parseDate(r.date),amount:toNum(r.amount)||0}))
    .filter(p=>p.name&&p.amount>0);
  if(!charges.length&&!payments.length)return null;
  const names={};
  charges.forEach(c=>names[keyName(c.name)]=1);payments.forEach(p=>names[keyName(p.name)]=1);
  const now=today(),byName={};
  Object.keys(names).forEach(k=>{
    const cs=charges.filter(c=>keyName(c.name)===k).sort((a,b)=>(a.due?a.due.getTime():0)-(b.due?b.due.getTime():0));
    const ps=payments.filter(p=>keyName(p.name)===k);
    const charged=cs.reduce((a,c)=>a+c.amount,0),paid=ps.reduce((a,p)=>a+p.amount,0);
    let pool=paid,overdue=0,oldest=null;
    cs.forEach(c=>{
      const applied=Math.min(pool,c.amount);pool-=applied;
      const unpaid=c.amount-applied;
      if(unpaid>0&&c.due&&c.due<now){overdue+=unpaid;if(!oldest||c.due<oldest)oldest=c.due;}
    });
    byName[k]={charged,paid,balance:charged-paid,overdue,oldestOverdue:oldest,
      daysOverdue:oldest?Math.round((now-oldest)/86400000):0};
  });
  return{byName};
}

/* ------------------------------------------------------- workbook cache */
const CACHE_DB="spdWorkbookCache_v1",CACHE_STORE="workbooks",PHOTO_STORE="photoOverrides";
function dbOpen(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(CACHE_DB,2);
    req.onupgradeneeded=()=>{
      if(!req.result.objectStoreNames.contains(CACHE_STORE))req.result.createObjectStore(CACHE_STORE);
      if(!req.result.objectStoreNames.contains(PHOTO_STORE))req.result.createObjectStore(PHOTO_STORE);
    };
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function cacheSave(key,filename,bytes){
  try{const db=await dbOpen();
    await new Promise((res,rej)=>{const tx=db.transaction(CACHE_STORE,"readwrite");
      tx.objectStore(CACHE_STORE).put({filename,savedAt:Date.now(),bytes},key);
      tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
    db.close();
  }catch(e){/* storage unavailable — just won't auto-restore next time */}
}
async function cacheLoad(key){
  try{const db=await dbOpen();
    const rec=await new Promise((res,rej)=>{const tx=db.transaction(CACHE_STORE,"readonly");
      const r=tx.objectStore(CACHE_STORE).get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});
    db.close();return rec;
  }catch(e){return null;}
}
async function cacheClear(key){
  try{const db=await dbOpen();
    await new Promise((res,rej)=>{const tx=db.transaction(CACHE_STORE,"readwrite");
      tx.objectStore(CACHE_STORE).delete(key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
    db.close();
  }catch(e){}
}

/* --------------------------------------------------------- print / share */
function printView(id){
  document.querySelectorAll(".of-view").forEach(v=>v.classList.remove("print-target"));
  const t=document.getElementById(id);
  if(t){t.classList.remove("hidden");t.classList.add("print-target");}
  window.print();
}
function showShareHint(title){
  const old=document.getElementById("ofToast");if(old)old.remove();
  const box=document.createElement("div");box.id="ofToast";
  box.style.cssText="position:fixed;bottom:20px;right:20px;z-index:250;background:#fff;border:1px solid #E4E0D6;"+
    "border-radius:12px;padding:14px 16px;box-shadow:0 12px 32px rgba(0,0,0,.22);max-width:300px";
  box.innerHTML=`<div style="font-weight:700;color:#1F2A44;font-size:13.5px;margin-bottom:4px">PDF downloaded ✓</div>
    <div style="font-size:12px;color:#7C8598;margin-bottom:10px;line-height:1.5">Attach it in WhatsApp or email to send "${esc(title)}".</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a class="btn btn-ghost" style="padding:6px 10px;font-size:11.5px" target="_blank" rel="noopener"
         href="https://wa.me/?text=${encodeURIComponent(title)}">Open WhatsApp</a>
      <button class="btn btn-ghost" style="padding:6px 10px;font-size:11.5px" id="ofToastClose">Close</button>
    </div>`;
  document.body.appendChild(box);
  document.getElementById("ofToastClose").addEventListener("click",()=>box.remove());
  setTimeout(()=>{const b=document.getElementById("ofToast");if(b)b.remove();},15000);
}
async function sharePDF(el,filename,title,btnEl){
  if(!el){alert("Nothing to share yet.");return;}
  if(typeof html2pdf==="undefined"){alert("The PDF engine is still loading (needs internet on first load) — try again in a moment.");return;}
  const orig=btnEl?btnEl.textContent:null;
  if(btnEl){btnEl.textContent="Preparing…";btnEl.disabled=true;}
  try{
    const blob=await html2pdf().set({margin:0,filename,image:{type:"jpeg",quality:.95},
      html2canvas:{scale:2,useCORS:true,backgroundColor:"#ffffff"},
      jsPDF:{unit:"mm",format:"a4",orientation:"portrait"},
      pagebreak:{mode:["css"],before:".page-break"}}).from(el).outputPdf("blob");
    const file=new File([blob],filename,{type:"application/pdf"});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      try{await navigator.share({files:[file],title,text:title});return;}
      catch(e){if(e&&e.name==="AbortError")return;}
    }
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    showShareHint(title);
  }catch(err){alert("Could not generate the PDF: "+err.message);}
  finally{if(btnEl){btnEl.textContent=orig;btnEl.disabled=false;}}
}

/* ------------------------------------------------------------------ boot */
let CFG=null,SHEETS=null,DATA=null;

function shell(){
  document.body.innerHTML=`
  <div id="ofLanding">
    <a class="of-back" href="../../index.html">← All programs</a>
    <div class="of-land-card">
      <div class="of-land-head">
        <img id="ofLandLogo" alt="">
        <div class="kicker">${esc(CFG.kicker||"Front Office")}</div>
        <h1 class="serif">${esc(CFG.headline||CFG.title)}</h1>
        <p>${esc(CFG.blurb||"")}</p>
      </div>
      <div class="of-land-body">
        <div id="ofDrop">
          <h3>Drop your Excel file here</h3>
          <p>or click to choose — .xlsx from the template</p>
          <input id="ofFile" type="file" accept=".xlsx,.xls" class="hidden">
        </div>
        <div id="ofErr" class="of-err hidden"></div>
        <div class="of-actions">
          <button class="btn btn-primary hidden" id="ofRoster">Use saved students</button>
          <button class="btn btn-primary" id="ofPick">Choose file</button>
          <button class="btn btn-ghost" id="ofDemo">Explore with sample data</button>
          <button class="btn btn-ghost" id="ofManual">Type data in manually</button>
          ${CFG.templateHref?`<a class="btn btn-ghost" href="${esc(CFG.templateHref)}" download>Download template</a>`:""}
        </div>
        <div class="of-note">
          <div><h4>Uses the fill-in template</h4><p>${esc(CFG.noteLeft||"Fill the sheets in the template, then upload it here.")}</p></div>
          <div><h4>Private by design</h4><p>Your file is read on this device only. Nothing is sent to a server.</p></div>
        </div>
      </div>
    </div>
  </div>

  <div id="ofApp">
    <div class="of-top">
      <img id="ofTopLogo" alt="">
      <div class="of-brand"><b class="serif" id="ofBrandName">Academy</b><span>${esc(CFG.title)}</span></div>
      <div class="of-tabs" id="ofTabs"></div>
      <div class="of-top-right">
        <span class="of-pill" id="ofPill"></span>
        <button class="mini-btn" id="ofStudents" title="The shared student roster used by every tool">👥 Students</button>
        <button class="mini-btn" id="ofEditData" title="View or edit the data behind these documents">✎ Edit data</button>
        <button class="mini-btn" id="ofReload">New file</button>
        <a class="mini-btn" href="../../index.html" title="Back to the hub">⌂ Home</a>
      </div>
    </div>
    <div class="of-wrap" id="ofMount"></div>
  </div>`;

  document.getElementById("ofLandLogo").src=BRANDING.logoFull;
  document.getElementById("ofTopLogo").src=BRANDING.logoEmblem;
  document.getElementById("ofBrandName").textContent=BRANDING.name;

  const fileIn=document.getElementById("ofFile"),drop=document.getElementById("ofDrop");
  document.getElementById("ofPick").addEventListener("click",()=>fileIn.click());
  drop.addEventListener("click",e=>{if(e.target.closest("button"))return;fileIn.click();});
  fileIn.addEventListener("change",e=>{if(e.target.files[0])readFile(e.target.files[0]);});
  ["dragover","dragenter"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("drag");}));
  ["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("drag");}));
  drop.addEventListener("drop",e=>{if(e.dataTransfer.files[0])readFile(e.dataTransfer.files[0]);});

  document.getElementById("ofDemo").addEventListener("click",()=>{clearErr();use(CFG.sampleSheets,null,false,true);});
  document.getElementById("ofManual").addEventListener("click",()=>{
    clearErr();
    SPDGrid.open(SPDGrid.blankFrom(CFG.sampleSheets),{
      title:"Type your data in",
      subtitle:CFG.manualHint||"Fill the rows below, then continue. You can also download it as an Excel file to keep for next time.",
      applyLabel:"Continue",
      filename:slugify(BRANDING.name)+"_"+slugify(CFG.title)+".xlsx",
      onApply:edited=>use(edited)
    });
  });
  document.getElementById("ofEditData").addEventListener("click",()=>{
    if(!SHEETS)return;
    SPDGrid.open(SHEETS,{
      title:"Edit data",subtitle:"Change any value and continue — the documents rebuild instantly.",
      applyLabel:"Rebuild",filename:slugify(BRANDING.name)+"_"+slugify(CFG.title)+".xlsx",
      onApply:edited=>use(edited)
    });
  });
  document.getElementById("ofReload").addEventListener("click",()=>{
    SHEETS=null;DATA=null;
    document.getElementById("ofApp").style.display="none";
    document.getElementById("ofLanding").style.display="flex";
    fileIn.value="";cacheClear(CFG.cacheKey);
    refreshRosterButton();
  });

  // ---- Shared Student Master -------------------------------------------------
  document.getElementById("ofStudents").addEventListener("click",()=>{
    if(!window.SPDRoster)return;
    SPDRoster.openManager({onSaved:()=>refreshRosterButton()});
  });
  document.getElementById("ofRoster").addEventListener("click",async()=>{
    if(!window.SPDRoster||!CFG.rosterToSheets)return;
    clearErr();
    const{students}=await SPDRoster.load();
    if(!students.length)return;
    use(CFG.rosterToSheets(students),null,true,true); // came from the master — nothing to write back
  });
  refreshRosterButton();
}

// The roster shortcut only appears when it can actually do something: the tool must
// know how to turn students into its own sheets, and there must be students saved.
async function refreshRosterButton(){
  const btn=document.getElementById("ofRoster");
  if(!btn)return;
  if(!window.SPDRoster||!CFG.rosterToSheets){btn.classList.add("hidden");return;}
  const n=await SPDRoster.count();
  if(n>0){
    btn.textContent=`Use saved students (${n})`;
    btn.classList.remove("hidden");
    const pick=document.getElementById("ofPick");
    if(pick){pick.classList.remove("btn-primary");pick.classList.add("btn-ghost");}
  }else{
    btn.classList.add("hidden");
    const pick=document.getElementById("ofPick");
    if(pick){pick.classList.add("btn-primary");pick.classList.remove("btn-ghost");}
  }
}
// Every workbook that passes through any tool quietly tops up the master roster, so
// it fills itself from normal use rather than needing a separate setup step.
function contributeRoster(sheets){
  if(!window.SPDRoster||CFG.contributeRoster===false)return;
  try{
    const found=SPDRoster.fromSheets(sheets);
    if(found.length)SPDRoster.merge(found).then(()=>refreshRosterButton());
  }catch(e){/* roster is a convenience — never let it break the tool */}
}

function showErr(html){const b=document.getElementById("ofErr");b.innerHTML=html;b.classList.remove("hidden");}
function clearErr(){document.getElementById("ofErr").classList.add("hidden");}

function readFile(file){
  clearErr();
  const rd=new FileReader();
  rd.onload=e=>{
    const bytes=e.target.result;
    try{
      const sheets=sheetsFromBytes(bytes);
      use(sheets,()=>cacheSave(CFG.cacheKey,file.name,bytes.slice(0)));
    }catch(err){
      showErr(`<b>Could not read this file.</b><p style="margin:6px 0 0">${esc(err.message)}. Make sure it's an .xlsx saved from the template.</p>`);
    }
  };
  rd.readAsArrayBuffer(file);
}

// Single funnel for every data source: demo, upload, manual entry, cache restore.
// Runs the tool's own parse(), then only interrupts with the review grid when the
// shared auditor actually finds something suspicious.
// noContribute: sample data and roster-sourced data must never write back into the
// master, or one click on "Explore with sample data" would put fictional children on
// the academy's real roster.
function use(sheets,onOk,skipReview,noContribute){
  let data;
  try{data=CFG.parse(sheets);}
  catch(err){
    showErr(`<b>${esc(err.message||"Could not use this data.")}</b>`);
    document.getElementById("ofApp").style.display="none";
    document.getElementById("ofLanding").style.display="flex";
    return;
  }
  const issues=(!skipReview&&window.SPDGrid)
    ?SPDGrid.audit(sheets,(data&&data.warnings)||[],{ledgerSheets:CFG.ledgerSheets||[]}):[];
  if(issues.length){
    SPDGrid.open(sheets,{
      title:"Check this before we print anything",
      subtitle:"We spotted a few things that are usually typos. Fix anything that's wrong, or continue if it's intentional.",
      issues,filename:slugify(BRANDING.name)+"_"+slugify(CFG.title)+".xlsx",
      onApply:edited=>use(edited,onOk,true,noContribute)
    });
    return;
  }
  SHEETS=sheets;DATA=data;
  document.getElementById("ofLanding").style.display="none";
  document.getElementById("ofApp").style.display="block";
  document.getElementById("ofPill").textContent=CFG.pill?CFG.pill(data):"";
  CFG.render(data,document.getElementById("ofMount"),sheets);
  if(!noContribute)contributeRoster(sheets);
  if(onOk)onOk();
}

function tabs(list,active,onPick){
  const el=document.getElementById("ofTabs");
  el.innerHTML=list.map(t=>`<button class="of-tab ${t.id===active?"on":""}" data-t="${esc(t.id)}">${esc(t.label)}</button>`).join("");
  el.querySelectorAll(".of-tab").forEach(b=>b.addEventListener("click",()=>onPick(b.dataset.t)));
}

function boot(cfg){
  CFG=cfg;
  const style=document.createElement("style");style.textContent=CSS;document.head.appendChild(style);
  shell();
  (async function restore(){
    const rec=await cacheLoad(CFG.cacheKey);
    if(!rec)return;
    try{use(sheetsFromBytes(rec.bytes),null,true);}catch(e){cacheClear(CFG.cacheKey);}
  })();
}

window.OFFICE={
  boot,tabs,use:(s)=>use(s),
  get branding(){return BRANDING;},
  get sheets(){return SHEETS;},
  esc,norm,keyName,toNum,slugify,
  parseDate,fmtDate,today,MONTHS,
  money,moneyInWords,
  findSheet,readTable,sheetsFromBytes,
  readAcademic,readAttendance,readFees,readNotes,mean,clamp,
  printView,sharePDF,
  printHead(docTitle,meta){
    return `<div class="of-print-head"><img src="${esc(BRANDING.logoEmblem)}" alt="">
      <div><div class="acad">${esc(BRANDING.name)}</div><div class="doc">${esc(docTitle)}</div></div>
      <div class="meta">${meta||""}<br>Generated ${new Date().toLocaleDateString()}</div></div>`;
  }
};
})();

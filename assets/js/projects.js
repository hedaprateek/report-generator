/* =====================================================================
   Projects — what the class actually made this term.

   Marks and ratings tell a parent how their child is doing. For a four- or
   eight-year-old, what they remember and talk about at home is the clay
   solar system and the vegetable printing. Those were being done and never
   reaching the report.

   Reads a plain Projects sheet from the class workbook:

       Project / Activity | Status | Date | Class / Batch | What the children did

   Class-level rather than per-student on purpose: a nursery project is
   something the whole group did, and asking a teacher to log it per child
   would guarantee it never gets filled in.

   A row must have a title to count. The template's hint line deliberately
   leaves that column blank — an earlier sheet in this suite put a footnote
   in a name column and the parser turned it into a phantom student.
   ===================================================================== */
(function(){
"use strict";

const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm=v=>String(v==null?"":v).trim();

function keyName(v){return norm(v).toLowerCase().replace(/\s+/g," ");}

/* Excel dates arrive as serial numbers when the cell is formatted as a date
   and as text when it isn't. Both are normal in a teacher-filled sheet. */
function parseDate(v){
  if(v==null||v==="")return null;
  if(v instanceof Date)return isNaN(v)?null:new Date(v.getFullYear(),v.getMonth(),v.getDate());
  if(typeof v==="number"&&isFinite(v)){
    // Excel serial: days since 1899-12-30
    const d=new Date(Math.round((v-25569)*86400000));
    return isNaN(d)?null:new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  }
  const s=norm(v);
  let m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1]);   // d/m/y — the local convention
  const d=new Date(s);
  return isNaN(d)?null:d;
}

const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(d){return d?d.getDate()+" "+MONTHS[d.getMonth()]:"";}

function findSheet(sheets,name){
  if(!sheets)return null;
  const want=keyName(name);
  for(const k in sheets)if(keyName(k)===want)return sheets[k];
  for(const k in sheets)if(keyName(k).indexOf(want)>=0)return sheets[k];
  return null;
}

/* Returns {completed:[],upcoming:[]} — newest completed first, soonest
   upcoming first, which is the order a parent reads them in. */
function read(sheets,batch){
  const aoa=findSheet(sheets,"Projects");
  if(!aoa||!aoa.length)return null;

  // find the header row rather than assuming row 0
  let hr=-1;
  for(let i=0;i<Math.min(aoa.length,15);i++){
    const row=(aoa[i]||[]).map(keyName);
    if(row.some(c=>c==="project / activity"||c==="project"||c==="activity"||c==="project name"))
      {hr=i;break;}
  }
  if(hr<0)return null;
  const header=(aoa[hr]||[]).map(keyName);
  const col=(...names)=>{
    for(const n of names){const i=header.indexOf(keyName(n));if(i>=0)return i;}
    return -1;
  };
  const cT=col("Project / Activity","Project","Activity","Project Name"),
        cS=col("Status"),
        cD=col("Date","When"),
        cB=col("Class / Batch","Class","Batch"),
        cN=col("What the children did","Description","Details","Note");
  if(cT<0)return null;

  const wantBatch=keyName(batch||"");
  const out=[];
  for(let r=hr+1;r<aoa.length;r++){
    const row=aoa[r]||[];
    const title=norm(row[cT]);
    if(!title)continue;                       // hint lines and spacers have no title
    const rowBatch=cB>=0?norm(row[cB]):"";
    // a sheet may hold several classes; if this one is labelled, respect it
    if(wantBatch&&rowBatch&&keyName(rowBatch)!==wantBatch)continue;
    const statusRaw=cS>=0?keyName(row[cS]):"";
    const done=/^(completed|done|finished|complete)$/.test(statusRaw);
    out.push({
      title,
      status:done?"completed":"upcoming",
      date:cD>=0?parseDate(row[cD]):null,
      batch:rowBatch,
      note:cN>=0?norm(row[cN]):""
    });
  }
  if(!out.length)return null;

  const completed=out.filter(p=>p.status==="completed")
    .sort((a,b)=>(b.date?b.date.getTime():0)-(a.date?a.date.getTime():0));
  const upcoming=out.filter(p=>p.status==="upcoming")
    .sort((a,b)=>(a.date?a.date.getTime():9e15)-(b.date?b.date.getTime():9e15));
  return{completed,upcoming,all:out};
}

/* One .rep-sec, so the section chooser picks it up like any other block and
   it can be switched off for a class that did none. */
function sectionHTML(pr,opts){
  opts=opts||{};
  if(!pr||(!pr.completed.length&&!pr.upcoming.length))return"";
  const maxDone=opts.maxCompleted||4, maxNext=opts.maxUpcoming||3;
  const done=pr.completed.slice(0,maxDone), next=pr.upcoming.slice(0,maxNext);
  const item=p=>`<div class="proj-item">
      <div class="proj-top">
        <span class="proj-title">${esc(p.title)}</span>
        ${p.date?`<span class="proj-date">${esc(fmtDate(p.date))}</span>`:""}
      </div>
      ${p.note?`<div class="proj-note">${esc(p.note)}</div>`:""}
    </div>`;
  return `<div class="rep-sec">
    <h3>${esc(opts.heading||"Projects & activities")}</h3>
    <div class="proj-cols">
      ${done.length?`<div class="proj-col">
        <div class="proj-h proj-done">Recently completed</div>
        ${done.map(item).join("")}
      </div>`:""}
      ${next.length?`<div class="proj-col">
        <div class="proj-h proj-next">Coming up</div>
        ${next.map(item).join("")}
      </div>`:""}
    </div>
  </div>`;
}

const CSS=`
.proj-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px}
.proj-h{font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  margin-bottom:5px;padding-bottom:3px;border-bottom:1px solid var(--line)}
.proj-done{color:var(--b5)}
.proj-next{color:var(--amber)}
.proj-item{padding:4px 0;break-inside:avoid}
.proj-top{display:flex;align-items:baseline;gap:8px}
.proj-title{font-size:11px;font-weight:700;color:var(--navy);flex:1;min-width:0}
.proj-date{font-size:9.5px;color:var(--mut);white-space:nowrap}
.proj-note{font-size:9.5px;color:var(--ink);line-height:1.5;margin-top:1px}
@media(max-width:640px){.proj-cols{grid-template-columns:1fr}}
`;
function injectCSS(){
  if(document.getElementById("projCSS"))return;
  const s=document.createElement("style");s.id="projCSS";s.textContent=CSS;
  document.head.appendChild(s);
}

window.Projects={read,sectionHTML,injectCSS,parseDate,fmtDate};
})();

/* =====================================================================
   NotesTimeline — the term as it actually happened.

   Every master workbook carries a Notes sheet:

       Date | Student Name | By | Type | Note

   and the Instructions sheet even tells the teacher it "keeps the dated
   history". It was collected all term and read by exactly one place in the
   whole suite (the Parent File tool). No report ever showed it.

   That is the most valuable unused data here. Marks say a child scored 68.
   A dated line saying "asked excellent questions, clearly reading ahead"
   written in October is the thing a parent actually wants, and the teacher
   already typed it.

   Careful about one thing: this is a TEACHER'S log, not a parent letter.
   "Spoke to father about missed classes" is fine to show; other rows will
   not be. So an optional Share column can hold "no" against any row to keep
   it off the report. The column is optional and blank means show, because a
   feature that renders nothing until every existing workbook is re-edited
   looks broken rather than safe — and the section chooser can still switch
   the whole block off per segment.
   ===================================================================== */
(function(){
"use strict";

const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const norm=v=>String(v==null?"":v).trim();
const keyName=v=>norm(v).toLowerCase().replace(/\s+/g," ");

/* Excel hands dates over as serials when the cell is date-formatted and as
   text when it isn't. Both turn up in teacher-filled sheets. */
function parseDate(v){
  if(v==null||v==="")return null;
  if(v instanceof Date)return isNaN(v)?null:new Date(v.getFullYear(),v.getMonth(),v.getDate());
  if(typeof v==="number"&&isFinite(v)){
    const d=new Date(Math.round((v-25569)*86400000));   // days since 1899-12-30
    return isNaN(d)?null:new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  }
  const s=norm(v);
  let m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1]);            // d/m/y — the local convention
  const d=new Date(s);
  return isNaN(d)?null:d;
}

const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(d){return d?d.getDate()+" "+MONTHS[d.getMonth()]:"";}

/* Exact match first. A loose contains() would happily pick up a "Teacher
   Notes" or "Notes for office" sheet and print the wrong thing on a report,
   so the fallback still has to start with "notes". */
function findSheet(sheets,name){
  if(!sheets)return null;
  const want=keyName(name);
  for(const k in sheets)if(keyName(k)===want)return sheets[k];
  for(const k in sheets)if(keyName(k).indexOf(want)===0)return sheets[k];
  return null;
}

// blank means show; only an explicit refusal hides a row
const HIDE=/^(no|n|false|0|private|internal|hide|off|hidden)$/;
// "Parent" is deliberately NOT an alias here — too easily a parent-name column
const SHARE_HEADERS=["Share on report","Share","Show on report","Visible to parent","Show"];

/* Returns [{date,by,type,note}] for one student, newest first, or []. Matching
   is by student name — the identity the rest of this suite uses. */
function read(sheets,studentName){
  const aoa=findSheet(sheets,"Notes");
  if(!aoa||!aoa.length)return[];

  // find the header row rather than assuming row 0
  let hr=-1;
  for(let i=0;i<Math.min(aoa.length,15);i++){
    const row=(aoa[i]||[]).map(keyName);
    const hasName=row.some(c=>c==="student name"||c==="name");
    const hasNote=row.some(c=>c==="note"||c==="observation"||c==="remark"||c==="comment"||c==="details");
    if(hasName&&hasNote){hr=i;break;}
  }
  if(hr<0)return[];
  const header=(aoa[hr]||[]).map(keyName);
  const col=(...names)=>{
    for(const n of names){const i=header.indexOf(keyName(n));if(i>=0)return i;}
    return -1;
  };
  const cName=col("Student Name","Name"),
        cNote=col("Note","Observation","Remark","Comment","Details"),
        cDate=col("Date","On","When"),
        cBy  =col("By","Teacher","Staff","Recorded By"),
        cType=col("Type","Category","Kind"),
        cShare=col.apply(null,SHARE_HEADERS);
  if(cName<0||cNote<0)return[];

  const want=keyName(studentName);
  const out=[];
  for(let r=hr+1;r<aoa.length;r++){
    const row=aoa[r]||[];
    const note=norm(row[cNote]);
    if(!note)continue;                                   // spacers and hint lines
    if(keyName(row[cName])!==want)continue;
    if(cShare>=0&&HIDE.test(keyName(row[cShare])))continue;
    out.push({
      date:cDate>=0?parseDate(row[cDate]):null,
      by:cBy>=0?norm(row[cBy]):"",
      type:cType>=0?norm(row[cType]):"",
      note
    });
  }
  // newest first: the recent weeks are what a parent reads at a parents' evening
  out.sort((a,b)=>(b.date?b.date.getTime():0)-(a.date?a.date.getTime():0));
  return out;
}

/* One .rep-sec with an h3, so the section chooser picks it up like every
   other block and the language pass translates the heading for free. */
function sectionHTML(entries,opts){
  opts=opts||{};
  if(!entries||!entries.length)return"";
  const max=opts.max||5;                 // a report has to stay one page
  const shown=entries.slice(0,max);
  const rows=shown.map(e=>`<div class="nt-item">
      <div class="nt-when">${esc(fmtDate(e.date))}</div>
      <div class="nt-body">
        <div class="nt-note">${esc(e.note)}</div>
        ${(e.type||e.by)?`<div class="nt-meta">${
          e.type?`<span class="nt-type">${esc(e.type)}</span>`:""
        }${e.by?`<span class="nt-by">${esc(e.by)}</span>`:""}</div>`:""}
      </div>
    </div>`).join("");
  return `<div class="rep-sec">
    <h3>${esc(opts.heading||"Through the term")}</h3>
    <div class="nt-list">${rows}</div>
  </div>`;
}

const CSS=`
.nt-list{display:grid;gap:7px}
.nt-item{display:grid;grid-template-columns:44px 1fr;gap:9px;align-items:start;
  padding-left:9px;border-left:2px solid var(--line);break-inside:avoid}
.nt-when{font-size:9.5px;font-weight:700;color:var(--mut);white-space:nowrap;padding-top:1px;
  letter-spacing:.02em}
.nt-body{min-width:0}
.nt-note{font-size:10.5px;color:var(--ink);line-height:1.55}
.nt-meta{margin-top:2px;display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.nt-type{font-size:8.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--b5);border:1px solid var(--line2);border-radius:20px;padding:1px 7px;background:#FCFBF7}
.nt-by{font-size:9px;color:var(--mut)}
@media print{.nt-type{background:transparent}}
@media(max-width:640px){.nt-item{grid-template-columns:38px 1fr;gap:7px}}
`;
function injectCSS(){
  if(document.getElementById("ntCSS"))return;
  const s=document.createElement("style");s.id="ntCSS";s.textContent=CSS;
  document.head.appendChild(s);
}

window.NotesTimeline={read,sectionHTML,injectCSS,parseDate,fmtDate};
})();

/* =====================================================================
   QuestionParser — turns a question paper pasted from Word, PDF or a
   text file into the Questions sheet the test tools read.

   Teachers write papers in Word, not spreadsheets. Asking them to
   retype forty questions into twelve columns is the surest way to make
   the whole test feature go unused, so this accepts the formats people
   actually type and tells them plainly about anything it could not read.

   Deliberately forgiving about layout, deliberately strict about the
   answer key: a question whose correct option cannot be identified is
   reported, never guessed. A guessed key silently mis-scores a class.
   ===================================================================== */
(function(){
"use strict";

/* ------------------------------------------------------------ patterns */
// "1." / "1)" / "Q1." / "Q.1" / "Q 1)" — the number is optional overall
const RE_QNUM   = /^(?:q\s*\.?\s*)?(\d{1,3})\s*[\.\)\:]\s*(.*)$/i;
// "A)" "A." "(A)" "[A]" "A -"  — one letter only, so "Answer:" can't match
const RE_OPTION = /^[\(\[]?\s*([A-Ea-e])\s*[\)\.\]\:\-]\s+(.*)$/;
const RE_ANSWER = /^(?:ans|answer|correct|correct answer|key|soln?)\s*[:\-\.\)]?\s*[\(\[]?\s*([A-Ea-e])\s*[\)\]]?\s*\.?\s*$/i;
const RE_SECTION= /^(?:section|subject|part)\s*[:\-]\s*(.+)$/i;
const RE_BRACKET_SECTION=/^[\[\(\-\=\*\s]*([A-Za-z][A-Za-z \/&]{2,30}?)[\]\)\-\=\*\s]*$/;
const RE_MARKS  = /^(?:marks?|points?)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*$/i;
const RE_NEG    = /^(?:negative|penalty)\s*[:\-]?\s*(-?\d+(?:\.\d+)?)\s*$/i;
const RE_EXPL   = /^(?:explanation|solution|reason|why)\s*[:\-]\s*(.*)$/i;
const RE_INLINE_MARKS=/[\[\(]\s*(\d+(?:\.\d+)?)\s*(?:marks?|m)\s*[\]\)]/i;
const RE_TOPIC  = /^(?:topic|chapter)\s*[:\-]\s*(.+)$/i;

function norm(s){return String(s==null?"":s).replace(/\s+/g," ").trim();}
// Word and PDF paste in typographic quotes, non-breaking spaces and bullet glyphs.
function clean(s){
  return String(s||"")
    .replace(/\r\n?/g,"\n")
    .replace(/[   ]/g," ")
    .replace(/[‘’‛]/g,"'")
    .replace(/[“”]/g,'"')
    .replace(/[–—]/g,"-")
    .replace(/^[•●▪·]\s*/gm,"");
}
// A trailing or leading * (or ✓) is the commonest way people mark the right option
function starred(text){
  const t=text.trim();
  if(/^[\*✓✔]\s*/.test(t))return{text:t.replace(/^[\*✓✔]\s*/,"").trim(),star:true};
  if(/\s*[\*✓✔]$/.test(t))return{text:t.replace(/\s*[\*✓✔]$/,"").trim(),star:true};
  return{text:t,star:false};
}

/* -------------------------------------------------------------- parse */
function parse(raw){
  const text=clean(raw);
  const lines=text.split("\n");
  const out=[];const issues=[];
  let section="General",topic="";
  let cur=null,mode="idle"; // idle | question | options

  const finish=()=>{
    if(!cur)return;
    cur.text=norm(cur.textLines.join(" "));
    delete cur.textLines;
    if(cur.text&&cur.options.length>=2)out.push(cur);
    else if(cur.text)issues.push({q:cur.text.slice(0,60),why:cur.options.length?"only one option found":"no options found"});
    cur=null;
  };
  const startQ=(firstLine,num)=>{
    finish();
    cur={no:num||null,section,topic,textLines:firstLine?[firstLine]:[],
      options:[],correct:null,marks:null,negative:null,explain:""};
    mode="question";
  };

  for(let i=0;i<lines.length;i++){
    const rawLine=lines[i];
    const line=rawLine.trim();
    if(!line){continue;}

    // --- section / topic markers ---
    let m=line.match(RE_SECTION);
    if(m){finish();section=norm(m[1]);mode="idle";continue;}
    m=line.match(RE_TOPIC);
    if(m){topic=norm(m[1]);continue;}

    // --- answer key line ---
    m=line.match(RE_ANSWER);
    if(m&&cur){
      cur.correct=m[1].toUpperCase();
      // The question is complete but stays open: Marks, Negative and Explanation are
      // usually written *after* the answer, and closing here would both lose them and
      // turn each of those lines into a phantom question.
      mode="after";continue;
    }

    // --- marks / negative / explanation ---
    m=line.match(RE_MARKS);
    if(m&&cur){cur.marks=Number(m[1]);continue;}
    m=line.match(RE_NEG);
    if(m&&cur){cur.negative=Math.abs(Number(m[1]));continue;}
    m=line.match(RE_EXPL);
    if(m&&cur){cur.explain=norm(m[1]);continue;}

    // --- option line ---
    m=line.match(RE_OPTION);
    if(m&&cur&&(mode==="question"||mode==="options"||mode==="after")){
      const letter=m[1].toUpperCase();
      const st=starred(m[2]);
      // options arriving after a completed question mean the next one has begun
      if(mode==="after"){finish();startQ("",null);}
      // a repeated letter means the same thing
      else if(cur.options.some(o=>o.letter===letter)&&cur.options.length>=2){
        finish();startQ("",null);
      }
      if(!cur)startQ("",null);
      cur.options.push({letter,text:norm(st.text)});
      if(st.star)cur.correct=letter;
      mode="options";
      continue;
    }

    // --- numbered question ---
    m=line.match(RE_QNUM);
    if(m){
      const body=norm(m[2]);
      // "1) Paris" directly after options is an option list using digits — rare; treat
      // a numbered line as a new question only when we are not mid-options, or the
      // previous question already has its options.
      startQ(body,Number(m[1]));
      continue;
    }

    // --- plain text ---
    if(mode==="options"||mode==="after"){
      // text after the options (or after the answer) starts the next question
      startQ(line,null);
    }else if(mode==="question"&&cur){
      cur.textLines.push(line);
    }else{
      startQ(line,null);
    }
  }
  finish();

  // renumber sequentially; a paper that restarts numbering per section must not collide
  out.forEach((q,i)=>{
    q.idx=i;
    if(q.no==null)q.no=i+1;
    if(!q.correct)issues.push({q:q.text.slice(0,60),why:"no correct answer marked"});
  });
  // if numbering repeats, fall back to sequential so the sheet stays unambiguous
  const nums=out.map(q=>q.no);
  if(new Set(nums).size!==nums.length)out.forEach((q,i)=>q.no=i+1);

  return{questions:out,issues,
    sections:[...new Set(out.map(q=>q.section))],
    withKey:out.filter(q=>q.correct).length};
}

/* ------------------------------------------------ to the Questions sheet */
function toAoa(questions,defaults){
  defaults=defaults||{};
  const dm=defaults.marks!=null?defaults.marks:1;
  const dn=defaults.negative!=null?defaults.negative:0;
  const maxOpts=Math.max(2,...questions.map(q=>q.options.length));
  const head=["Q No","Section","Topic","Question"];
  for(let i=0;i<maxOpts;i++)head.push("Option "+"ABCDE"[i]);
  head.push("Correct","Marks","Negative","Explanation");
  const rows=[head];
  questions.forEach(q=>{
    const r=[q.no,q.section,q.topic||"",q.text];
    for(let i=0;i<maxOpts;i++){
      const L="ABCDE"[i];
      const o=q.options.find(x=>x.letter===L)||q.options[i];
      r.push(o?o.text:"");
    }
    r.push(q.correct||"",q.marks!=null?q.marks:dm,q.negative!=null?q.negative:dn,q.explain||"");
    rows.push(r);
  });
  return rows;
}

/* --------------------------------------------------------------- paste UI */
const CSS=`
#qpOverlay{position:fixed;inset:0;z-index:340;background:rgba(15,20,35,.62);display:flex;
  align-items:center;justify-content:center;padding:20px;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
#qpOverlay.hidden{display:none}
.qp-card{background:#fff;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.4);width:100%;
  max-width:1120px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
.qp-head{padding:18px 22px 14px;border-bottom:1px solid #E4E0D6}
.qp-head h3{margin:0 0 3px;font-family:Georgia,serif;font-size:19px;color:#1F2A44;font-weight:600}
.qp-head p{margin:0;font-size:12.5px;color:#7C8598;line-height:1.55}
.qp-body{flex:1;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:0}
@media(max-width:880px){.qp-body{grid-template-columns:1fr}}
.qp-left{padding:16px 18px;border-right:1px solid #E4E0D6;display:flex;flex-direction:column;min-height:0}
.qp-right{padding:16px 18px;background:#FCFBF7;overflow:auto;min-height:0}
.qp-left textarea{flex:1;min-height:280px;width:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:12.5px;line-height:1.65;padding:11px;border:1px solid #D8D3C6;border-radius:9px;resize:none}
.qp-left textarea:focus{outline:2px solid #0E7C7B;border-color:#0E7C7B}
.qp-lab{font-size:11px;font-weight:700;color:#1F2A44;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.qp-fmt{font-size:11.5px;color:#7C8598;line-height:1.6;margin-top:10px}
.qp-fmt code{background:#F3F1EA;border-radius:4px;padding:1px 5px;font-size:11px}
.qp-q{border:1px solid #E4E0D6;border-radius:9px;padding:10px 12px;margin-bottom:8px;background:#fff}
.qp-q .n{font-size:10.5px;color:#9AA3B2;font-weight:700}
.qp-q .t{font-size:13px;color:#2B2F3A;margin:3px 0 6px;line-height:1.45}
.qp-o{font-size:12px;color:#5B6472;padding:2px 0}
.qp-o.k{color:#1F7A4D;font-weight:700}
.qp-q.bad{border-color:#E8B49A;background:#FDF1EC}
.qp-warn{background:#FBEEDC;border:1px solid #EBD3A8;border-left:3px solid #C9791B;border-radius:9px;
  padding:10px 12px;font-size:12px;color:#6E4A1A;line-height:1.55;margin-bottom:10px}
.qp-warn ul{margin:5px 0 0;padding-left:16px}
.qp-ok{background:#DEEEE4;border-left:3px solid #1F7A4D;border-radius:9px;padding:10px 12px;
  font-size:12.5px;color:#17603c;margin-bottom:10px;font-weight:600}
.qp-foot{padding:14px 22px;border-top:1px solid #E4E0D6;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.qp-foot .sp{flex:1}
.qp-btn{border:none;border-radius:9px;font-family:inherit;font-weight:600;font-size:13.5px;
  padding:10px 16px;cursor:pointer}
.qp-primary{background:#0E7C7B;color:#fff}
.qp-primary:disabled{opacity:.45;cursor:not-allowed}
.qp-ghost{background:transparent;color:#1F2A44;border:1px solid #D8D3C6}
.qp-ghost:hover{background:#F0EEE7}
.qp-stat{font-size:12px;color:#7C8598}
`;
const SAMPLE=`Section: Physics

1. A body starts from rest and accelerates uniformly at 2 m/s². How far does it travel in 5 seconds?
A) 10 m
B) 25 m
C) 50 m
D) 100 m
Answer: B
Marks: 2
Explanation: s = ut + ½at² = 25 m

2. The slope of a distance-time graph gives:
(a) Acceleration
(b) Speed
(c) Displacement
(d) Force
Ans: (b)

Section: Maths

Q3. The roots of x² - 5x + 6 = 0 are:
a. 2 and 3 *
b. 1 and 6
c. -2 and -3
d. 2 and -3`;

let ST=null;
function injectCSS(){
  if(document.getElementById("qpCSS"))return;
  const s=document.createElement("style");s.id="qpCSS";s.textContent=CSS;document.head.appendChild(s);
}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function open(opts){
  opts=opts||{};
  injectCSS();
  let ov=document.getElementById("qpOverlay");
  if(!ov){
    ov=document.createElement("div");ov.id="qpOverlay";document.body.appendChild(ov);
    ov.addEventListener("click",e=>{if(e.target===ov)close();});
  }
  ov.className="";
  ov.innerHTML=`
  <div class="qp-card">
    <div class="qp-head">
      <h3>Paste your questions</h3>
      <p>Copy straight out of Word, a PDF or a text file. Most common layouts are understood —
         check the preview on the right before continuing.</p>
    </div>
    <div class="qp-body">
      <div class="qp-left">
        <div class="qp-lab">Paste here</div>
        <textarea id="qpText" spellcheck="false" placeholder="1. What is the capital of France?&#10;A) London&#10;B) Paris&#10;C) Rome&#10;D) Berlin&#10;Answer: B"></textarea>
        <div class="qp-fmt">
          Questions may be numbered <code>1.</code> <code>Q1.</code> or not at all.
          Options as <code>A)</code> <code>(a)</code> <code>a.</code>.
          Mark the answer with <code>Answer: B</code>, <code>Ans: (b)</code>, or a <code>*</code> after the right option.
          Optional lines: <code>Section: Physics</code>, <code>Topic: Kinematics</code>,
          <code>Marks: 2</code>, <code>Negative: 0.5</code>, <code>Explanation: …</code>
        </div>
      </div>
      <div class="qp-right" id="qpPreview"></div>
    </div>
    <div class="qp-foot">
      <button class="qp-btn qp-ghost" id="qpSample">Load an example</button>
      <span class="qp-stat" id="qpStat">Nothing pasted yet</span>
      <div class="sp"></div>
      <button class="qp-btn qp-ghost" id="qpXlsx" disabled>Download as Excel</button>
      <button class="qp-btn qp-ghost" id="qpCancel">Cancel</button>
      <button class="qp-btn qp-primary" id="qpUse" disabled>Use these questions</button>
    </div>
  </div>`;

  const ta=document.getElementById("qpText");
  const repaint=()=>{
    ST=parse(ta.value);
    const n=ST.questions.length;
    document.getElementById("qpStat").textContent=
      n?`${n} question${n===1?"":"s"} found · ${ST.withKey} with an answer key`:"Nothing recognised yet";
    document.getElementById("qpUse").disabled=!n;
    document.getElementById("qpXlsx").disabled=!n;
    const noKey=ST.questions.filter(q=>!q.correct).length;
    document.getElementById("qpPreview").innerHTML=
      (!n?`<div class="qp-stat">Paste on the left and the parsed questions appear here.</div>`:
        (noKey||ST.issues.length
          ?`<div class="qp-warn"><b>${noKey?`${noKey} question${noKey>1?"s have":" has"} no answer marked`:""}${noKey&&ST.issues.length?" · ":""}${ST.issues.length?`${ST.issues.length} block${ST.issues.length>1?"s":""} skipped`:""}</b>
             <ul>${ST.issues.slice(0,4).map(x=>`<li>${esc(x.why)} — “${esc(x.q)}…”</li>`).join("")}</ul>
             ${noKey?`<div style="margin-top:6px">Questions without a key are still imported, but they can't be scored
               until you set the answer.</div>`:""}</div>`
          :`<div class="qp-ok">✓ All ${n} questions read, every one with an answer key.</div>`)
        +ST.questions.map(q=>`
          <div class="qp-q${q.correct?"":" bad"}">
            <div class="n">${esc(q.section)}${q.topic?" · "+esc(q.topic):""} · Q${q.no}${q.marks!=null?` · ${q.marks} marks`:""}</div>
            <div class="t">${esc(q.text)}</div>
            ${q.options.map(o=>`<div class="qp-o${o.letter===q.correct?" k":""}">${o.letter}) ${esc(o.text)}${o.letter===q.correct?" ✓":""}</div>`).join("")}
            ${q.correct?"":`<div class="qp-o" style="color:#B4472F;font-weight:700">no answer marked</div>`}
          </div>`).join(""));
  };
  ta.addEventListener("input",repaint);
  document.getElementById("qpSample").addEventListener("click",()=>{ta.value=SAMPLE;repaint();});
  document.getElementById("qpCancel").addEventListener("click",close);
  document.getElementById("qpXlsx").addEventListener("click",()=>{
    if(typeof XLSX==="undefined"){alert("The Excel engine is still loading — try again in a moment.");return;}
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(toAoa(ST.questions)),"Questions");
    XLSX.writeFile(wb,"Questions.xlsx");
  });
  document.getElementById("qpUse").addEventListener("click",()=>{
    const sheets={Questions:toAoa(ST.questions)};
    close();
    if(opts.onAccept)opts.onAccept(sheets,ST);
  });
  repaint();
  setTimeout(()=>ta.focus(),50);
}
function close(){const ov=document.getElementById("qpOverlay");if(ov)ov.className="hidden";}

// Adds the entry point to an OFFICE landing screen without office-common needing to know.
function mountLandingButton(onAccept,label){
  const row=document.querySelector(".of-actions");
  if(!row||document.getElementById("qpLandBtn"))return;
  const b=document.createElement("button");
  b.id="qpLandBtn";b.className="btn btn-ghost";
  b.textContent=label||"Paste from Word or text";
  b.addEventListener("click",()=>open({onAccept}));
  // sits right after "Choose file", which is where someone looks when they have a paper in hand
  const pick=document.getElementById("ofPick");
  if(pick&&pick.nextSibling)row.insertBefore(b,pick.nextSibling);else row.appendChild(b);
}

window.QuestionParser={parse,toAoa};
window.QuestionPaste={open,close,mountLandingButton};
})();

/* =====================================================================
   ParentReport — the document a parent actually receives.

   Shared on purpose. The same function produces both the self-contained HTML
   file sent as a WhatsApp attachment and the page behind a shareable link, so
   the two can never drift into showing a child different things.

   It returns a complete HTML document as a string and takes no dependencies,
   because the file it produces has to keep working on an old phone with no
   internet, years from now.
   ===================================================================== */
(function(){
"use strict";

// Kept as one function returning a complete document so there is exactly one
// place to look when asking "what does the parent actually receive?"
function FILE_TEMPLATE(d){
  const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const band=p=>p==null?"#556074":p>=75?"#1F7A4D":p>=60?"#2E8B8A":p>=45?"#C9791B":"#B4472F";
  const pct=p=>p==null?"—":p.toFixed(0)+"%";

  const spark=(()=>{
    const t=d.tests;
    if(t.length<2)return "";
    const w=300,h=90,pad=8;
    const xs=(i)=>pad+(w-pad*2)*(t.length===1?0.5:i/(t.length-1));
    const ys=(v)=>pad+(h-pad*2)*(1-Math.max(0,Math.min(100,v))/100);
    const pts=t.map((x,i)=>[xs(i),ys(x.pct)]);
    const dpath=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
    const area=dpath+` L${pts[pts.length-1][0].toFixed(1)} ${h-pad} L${pts[0][0].toFixed(1)} ${h-pad} Z`;
    return `<svg viewBox="0 0 ${w} ${h}" class="spark" role="img" aria-label="Progress across tests">
      ${[25,50,75].map(g=>`<line x1="${pad}" y1="${ys(g)}" x2="${w-pad}" y2="${ys(g)}" stroke="#EDEAE1" stroke-width="1"/>`).join("")}
      <path d="${area}" fill="rgba(14,124,123,.10)"/>
      <path d="${dpath}" fill="none" stroke="#0E7C7B" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" fill="#0E7C7B"/>`).join("")}
    </svg>
    <div class="sparkx">${t.map(x=>`<span>${esc(x.test)}</span>`).join("")}</div>`;
  })();

  const strong=[...d.topics].sort((a,b)=>b.avg-a.avg).slice(0,3);
  const weak=d.topics.slice(0,3);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(d.student)} — Progress</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#F5F3EE;color:#2B2F3A;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;padding-bottom:30px}
.wrap{max-width:560px;margin:0 auto;padding:0 14px}
.hero{background:linear-gradient(150deg,#1B2540,#0E7C7B);color:#fff;padding:26px 18px 30px;text-align:center}
.hero img{height:52px;width:auto;border-radius:10px;background:rgba(255,255,255,.1);margin-bottom:10px}
.hero .ac{font-family:Georgia,serif;font-size:16px;font-weight:600;opacity:.95}
.hero .nm{font-family:Georgia,serif;font-size:27px;font-weight:700;margin-top:12px;line-height:1.15}
.hero .cl{font-size:12.5px;opacity:.85;margin-top:4px}
.big{margin-top:16px;display:inline-flex;align-items:baseline;gap:3px}
.big b{font-family:Georgia,serif;font-size:52px;font-weight:800;line-height:1}
.big span{font-size:19px;opacity:.9}
.biglab{font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.85;margin-top:4px}
.chips{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px}
.chip{background:rgba(255,255,255,.16);border-radius:20px;padding:6px 13px;font-size:12px;font-weight:600}
.card{background:#fff;border:1px solid #E4E0D6;border-radius:14px;padding:16px 16px;margin-top:14px;
  box-shadow:0 1px 2px rgba(31,42,68,.04),0 6px 18px rgba(31,42,68,.05)}
.card h2{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#556074;font-weight:700;margin-bottom:12px}
.row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #F0EEE7;cursor:pointer}
.row:last-child{border-bottom:none}
.row .nm{flex:1;font-weight:600;font-size:14px;color:#1F2A44}
.bar{height:8px;background:#EFEDE6;border-radius:5px;overflow:hidden;width:96px;flex-shrink:0}
.bar>i{display:block;height:100%;border-radius:5px}
.val{min-width:44px;text-align:right;font-weight:700;font-size:14px}
.sub{font-size:11.5px;color:#556074;padding:0 0 10px 0;display:none;line-height:1.6}
.row.open+.sub{display:block}
.caret{color:#656E82;font-size:11px;transition:transform .15s}
.row.open .caret{transform:rotate(90deg)}
.spark{width:100%;height:auto;display:block;margin-top:4px}
.sparkx{display:flex;justify-content:space-between;font-size:9.5px;color:#656E82;margin-top:2px}
.sparkx span{flex:1;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:420px){.two{grid-template-columns:1fr}}
.tlist li{list-style:none;font-size:12.5px;padding:6px 0;border-bottom:1px dotted #EFEDE6;line-height:1.4}
.tlist li:last-child{border-bottom:none}
.tlist .t{font-weight:600;color:#1F2A44}
.tlist .s{color:#656E82;font-size:10.5px}
.wk{border:1px solid #E4E0D6;border-radius:11px;margin-bottom:9px;overflow:hidden}
.wkh{display:flex;align-items:center;gap:9px;padding:11px 13px;background:#FCFBF7;cursor:pointer}
.wkh .n{width:26px;height:26px;border-radius:50%;background:#0E7C7B;color:#fff;display:grid;place-items:center;
  font-weight:800;font-size:11.5px;flex-shrink:0}
.wkh .l{flex:1;font-weight:700;font-size:13px;color:#1F2A44}
.wkh .d{font-size:10.5px;color:#656E82}
.wkb{display:none;padding:4px 13px 12px}
.wk.open .wkb{display:block}
.task{display:flex;gap:9px;padding:9px 0;border-bottom:1px dotted #EFEDE6}
.task:last-child{border-bottom:none}
.task .dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0}
.task .tt{font-weight:600;font-size:12.5px;color:#1F2A44}
.task .tn{font-size:11px;color:#556074;margin-top:2px;line-height:1.45}
.note{background:#E2F0EF;border-left:3px solid #0E7C7B;border-radius:8px;padding:11px 13px;
  font-size:13px;color:#22595a;line-height:1.6}
.foot{text-align:center;font-size:10.5px;color:#656E82;margin-top:18px;line-height:1.6}
.legend{font-size:10.5px;color:#656E82;margin-top:9px;line-height:1.5}
</style></head>
<body>
<div class="hero">
  ${d.logo?`<img src="${d.logo}" alt="">`:""}
  <div class="ac">${esc(d.academy)}</div>
  <div class="nm">${esc(d.student)}</div>
  <div class="cl">${esc(d.batch)}${d.roll!=null?" · Roll "+d.roll:""}</div>
  <div class="big"><b>${d.overall==null?"—":d.overall.toFixed(0)}</b><span>%</span></div>
  <div class="biglab">Overall so far</div>
  <div class="chips">
    ${d.rank?`<span class="chip">Rank ${d.rank.pos} of ${d.rank.of}</span>`:""}
    ${d.attendance?`<span class="chip">Attendance ${d.attendance.pct.toFixed(0)}%</span>`:""}
    ${d.trend!=null?`<span class="chip">${d.trend>1.5?"▲ Improving":d.trend<-1.5?"▼ Slipping":"▬ Steady"}</span>`:""}
    ${d.classAvg!=null?`<span class="chip">Class avg ${d.classAvg.toFixed(0)}%</span>`:""}
  </div>
</div>
<div class="wrap" role="main">

  <div class="card">
    <h2>Subject by subject</h2>
    ${d.subjects.map((s,i)=>`
      <div class="row" data-t="s${i}"><span class="nm">${esc(s.name)}</span>
        <span class="bar"><i style="width:${Math.max(2,Math.min(100,s.avg||0))}%;background:${band(s.avg)}"></i></span>
        <span class="val" style="color:${band(s.avg)}">${pct(s.avg)}</span><span class="caret">▸</span></div>
      <div class="sub" id="s${i}">Class average in ${esc(s.name)} is ${pct(s.cls)}.
        ${s.avg!=null&&s.cls!=null?(s.avg>=s.cls?`${esc(d.student.split(" ")[0])} is <b>${(s.avg-s.cls).toFixed(0)} points above</b> the class.`:`<b>${(s.cls-s.avg).toFixed(0)} points below</b> the class — worth some attention.`):""}</div>`).join("")}
    <div class="legend">Tap a subject for detail.</div>
  </div>

  ${d.tests.length>1?`<div class="card"><h2>Progress across tests</h2>${spark}</div>`:""}

  ${d.topics.length?`<div class="card"><h2>Topic strengths</h2>
    <div class="two">
      <div><div style="font-size:10.5px;font-weight:700;color:#1F7A4D;letter-spacing:.05em;text-transform:uppercase;margin-bottom:5px">Strong in</div>
        <ul class="tlist">${strong.map(t=>`<li><span class="t">${esc(t.topic)}</span> <span class="s">${esc(t.subject)} · ${t.avg.toFixed(0)}%</span></li>`).join("")}</ul></div>
      <div><div style="font-size:10.5px;font-weight:700;color:#B4472F;letter-spacing:.05em;text-transform:uppercase;margin-bottom:5px">Needs work</div>
        <ul class="tlist">${weak.map(t=>`<li><span class="t">${esc(t.topic)}</span> <span class="s">${esc(t.subject)} · ${t.avg.toFixed(0)}%</span></li>`).join("")}</ul></div>
    </div></div>`:""}

  ${d.plan?`<div class="card">
    <h2>Study plan${d.examName?" for "+esc(d.examName):""}</h2>
    <p style="font-size:12.5px;color:#556074;line-height:1.6;margin-bottom:12px">
      ${d.plan.summary.weeks} week${d.plan.summary.weeks===1?"":"s"} · ${d.plan.summary.sessionsPerWeek} sessions a week.
      More time is given to the topics that need it most${d.plan.summary.examDate?`, working back from ${esc(d.plan.summary.examDate)}`:""}.
      Tap a week to open it.</p>
    ${d.plan.weeks.map(w=>`
      <div class="wk" data-wk="${w.n}">
        <div class="wkh"><span class="n">${w.n}</span>
          <span class="l">${esc(w.label)}</span>
          <span class="d">${esc(w.start)} – ${esc(w.end)}</span></div>
        <div class="wkb">${w.items.map(it=>`
          <div class="task"><span class="dot" style="background:${it.kind==="mock"?"#1F2A44":band(it.avg)}"></span>
            <div><div class="tt">${esc(it.topic)}</div>
              <div class="tn">${esc(it.subject)}${it.avg!=null?` · currently ${it.avg.toFixed(0)}%`:""} — ${esc(it.note)}</div></div></div>`).join("")}
        </div>
      </div>`).join("")}
    <div class="legend">This plan is built from ${esc(d.student.split(" ")[0])}'s own topic marks, so it will look different for every student.</div>
  </div>`:""}

  ${d.observations&&d.observations.length?`<div class="card"><h2>What the teachers have noticed</h2>
    ${d.observations.map(n=>`<div style="padding:9px 0;border-bottom:1px dotted #EFEDE6">
      <div style="font-size:13px;color:#2B2F3A;line-height:1.55">${esc(n.note)}</div>
      <div style="font-size:10.5px;color:#656E82;margin-top:3px">
        ${esc([n.date,n.by,n.type].filter(Boolean).join(" · "))}</div></div>`).join("")}
    </div>`:""}

  ${d.note?`<div class="card"><h2>A note from the academy</h2><div class="note">${esc(d.note)}</div></div>`:""}

  <div class="foot">
    Prepared for ${esc(d.parent||"the parent/guardian")} · ${esc(d.generated)}<br>
    ${esc(d.academy)} — this file works offline; save it and open it any time.
  </div>
</div>
<script>
// Deliberately tiny and dependency-free: this has to run on an old phone forever.
document.querySelectorAll('.row[data-t]').forEach(function(r){
  r.addEventListener('click',function(){r.classList.toggle('open');});
});
document.querySelectorAll('.wkh').forEach(function(h){
  h.addEventListener('click',function(){h.parentNode.classList.toggle('open');});
});
var first=document.querySelector('.wk');if(first)first.classList.add('open');
<\/script>
</body></html>`;
}

window.ParentReport={render:FILE_TEMPLATE};
})();

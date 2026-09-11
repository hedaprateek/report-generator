/* =====================================================================
   ReportPage — the report as a living web page, not a picture of one.

   A PDF is a photograph: the tap-to-open tiles stop working, the logo may be
   missing on file://, and on a phone it is a pinch-and-zoom document. This
   exports the same report as ONE self-contained .html file a parent can open
   from WhatsApp — where the tiles still open, the layout adapts to their
   screen, and there is nothing to install.

   Self-contained means exactly that: styles are copied in, images become
   data: URIs, and the file makes no network request once saved. It keeps
   working years later on a phone with no signal.

   Interactivity comes free: the tiles carry inline onclick handlers, so they
   survive the copy without a line of exported script.
   ===================================================================== */
(function(){
"use strict";

const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* Only same-document <style> blocks can be read back on file:// — an external
   sheet throws on .cssRules. That is fine: the report's own look lives in the
   page's inline styles; the skipped files are app chrome the export doesn't want. */
function collectCSS(){
  let out="";
  for(const sheet of Array.from(document.styleSheets)){
    let rules=null;
    try{rules=sheet.cssRules;}catch(e){continue;}
    if(!rules)continue;
    for(const r of Array.from(rules)){
      const t=r.cssText||"";
      // the app's own furniture has no meaning in a standalone report
      if(/^\s*(\.topbar|\.top-right|#landing|#app|\.tab\b|\.mini-btn|\.wp-box|\.skip-link)/.test(t))continue;
      out+=t+"\n";
    }
  }
  return out;
}

async function inlineImagesInClone(clone){
  const imgs=Array.prototype.slice.call(clone.querySelectorAll("img"));
  let dropped=0;
  for(const im of imgs){
    const src=im.getAttribute("src")||"";
    if(!src||src.indexOf("data:")===0)continue;
    // reference through window explicitly rather than relying on the implicit global
    const PS=window.PdfSafe;
    const data=PS?await PS.toDataURL(src):null;
    if(data)im.setAttribute("src",data);
    else{im.remove();dropped++;}     // a broken-image icon would look worse
  }
  return dropped;
}

/* Styles layered on top of the copied ones: turn an A4-shaped sheet into
   something comfortable on a phone without touching the report's own design. */
const SHELL_CSS=`
html,body{margin:0;padding:0}
body{background:#EFEDE6;padding:14px;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  -webkit-text-size-adjust:100%}
.sheet{max-width:840px;margin:0 auto;background:#fff;border-radius:14px;
  box-shadow:0 6px 26px rgba(31,42,68,.14);padding:26px 28px;width:auto;min-height:0}
.sheet-inner{transform:none !important}
.no-print{display:none !important}
.rp-hint{max-width:840px;margin:0 auto 10px;font-size:12px;color:#556074;text-align:center}
.vf-stamp{margin-top:10px;text-align:center;font-size:9px;letter-spacing:.02em;color:#8A8F9C;line-height:1.5}
.vf-stamp b{font-weight:700;color:#6B7180}
.rp-foot{max-width:840px;margin:12px auto 0;font-size:11px;color:#656E82;
  text-align:center;line-height:1.6}
/* the tiles stay tappable, so make that obvious on a touch screen */
.snap-item,.skill-tile{cursor:pointer;-webkit-tap-highlight-color:rgba(14,124,123,.12)}
.snap-detail{max-height:0;opacity:0;overflow:hidden;
  transition:max-height .25s ease,opacity .2s ease,margin-top .25s ease}
.snap-item.open .snap-detail{max-height:600px;opacity:1;margin-top:7px}
.print-only{display:none !important}
@media(max-width:640px){
  body{padding:8px}
  .sheet{padding:16px 14px;border-radius:11px}
  .tile-grid{grid-template-columns:repeat(2,1fr) !important}
  .spot-grid,.rep-top-row{grid-template-columns:1fr !important;display:block !important}
  .rep-head{flex-wrap:wrap;gap:8px}
}
@media print{
  body{background:#fff;padding:0}
  .sheet{box-shadow:none;border-radius:0;max-width:none}
  .rp-hint,.rp-foot{display:none}
}
`;

/* Builds the complete document. `sheetEl` is the .sheet node on screen. */
async function build(sheetEl,meta){
  meta=meta||{};
  if(!sheetEl)throw new Error("There is no report on screen to export.");
  const clone=sheetEl.cloneNode(true);
  // controls that only make sense inside the app
  clone.querySelectorAll(".no-print,[contenteditable]").forEach(n=>{
    if(n.classList.contains("no-print"))n.remove();
    else n.removeAttribute("contenteditable");
  });
  const dropped=await inlineImagesInClone(clone);

  const title=(meta.student?meta.student+" — ":"")+(meta.docTitle||"Progress Report");
  return {
    dropped,
    html:`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="robots" content="noindex, nofollow">
<style>
${collectCSS()}
${SHELL_CSS}
</style>
</head>
<body>
<div class="rp-hint">Tap any area to see more detail.</div>
${clone.outerHTML}
<div class="rp-foot">${esc(meta.academy||"")}${meta.generated?" · "+esc(meta.generated):""}<br>
Saved on your device — this page works offline and sends nothing anywhere.</div>
<div class="vf-stamp"><b>Stunity Tech</b> · by Prateek</div>
</body>
</html>`
  };
}

async function shareOrDownload(html,filename,title){
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});
  const file=new File([blob],filename,{type:"text/html"});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    try{await navigator.share({files:[file],title});return "shared";}
    catch(e){if(e&&e.name==="AbortError")return "cancelled";}
  }
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);   // click only QUEUES the download
  return "downloaded";
}

window.ReportPage={build,shareOrDownload,collectCSS};
})();

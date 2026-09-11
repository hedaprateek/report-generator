/* =====================================================================
   Vendor credit footer.

   One place so the wording and styling stay identical on every page, and a
   change of company name is a one-line edit rather than a sweep of 22 files.

   Two separate things live here:

     · the page footer   — the credit on the software itself, marked no-print
                           because it belongs to the tool, not to the paper
     · the report stamp  — a line INSIDE the report sheet, which the academy
                           asked for, so it does print

   The stamp goes inside .sheet rather than being drawn on top of it, because
   everything a parent receives is built from that same DOM: print, the PDF,
   Print All and the exported web page all inherit it with no extra work.
   ===================================================================== */
(function(){
"use strict";

const COMPANY="Stunity Tech";
const AUTHOR="Prateek";

const CSS=`
.vendor-footer{
  margin:34px auto 0;padding:16px 20px 22px;max-width:1180px;
  border-top:1px solid rgba(31,42,68,.10);
  font:12px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  color:#656E82;text-align:center;
}
.vendor-footer b{color:#1F2A44;font-weight:700;letter-spacing:.01em}
.vendor-footer .vf-dot{opacity:.5;margin:0 6px}
@media print{.vendor-footer{display:none !important}}

/* The stamp on the report itself. Quiet on purpose — the academy's own
   footer line above it is the one that should carry weight. */
.vf-stamp{
  margin-top:3px;font-size:8px;letter-spacing:.02em;color:#8A8F9C;
  text-align:center;line-height:1.5;
}
.vf-stamp b{font-weight:700;color:#6B7180}
@media print{.vf-stamp{color:#8A8F9C !important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

function mount(){
  if(document.getElementById("vendorFooter"))return;
  if(!document.body)return;

  injectStyle();

  const f=document.createElement("footer");
  f.id="vendorFooter";
  f.className="vendor-footer no-print";
  f.innerHTML='<b>'+COMPANY+'</b><span class="vf-dot">·</span>by '+AUTHOR;
  document.body.appendChild(f);
}

/* Every printable document in the suite, by the container each tool prints.
   They grew separate names, so the list is explicit rather than clever — a
   new tool that prints something has to be added here, and that is easier to
   notice than a selector quietly failing to match. */
const PRINTABLE=[
  ".sheet",        // segment reports and certificates
  ".receipt",      // Fees & Dues
  ".doc-sheet",    // Certificates / bonafide documents
  ".card-sheet",   // ID cards, ten to a page
  ".tt-sheet",     // Timetable
  ".rp-stage",     // Results Pack
  ".sf-page"       // Student File
].join(",");

/* Stamps every printable document on the page. Called after each render, so
   Print All and the all-students PDF carry it as well as a single report.
   Idempotent: one that already has a stamp is left alone, and a re-render
   builds fresh nodes anyway. */
function stampReports(root){
  const scope=root||document;
  if(!scope.querySelectorAll)return 0;
  injectStyle();
  let n=0;
  scope.querySelectorAll(PRINTABLE).forEach(sheet=>{
    if(sheet.querySelector(".vf-stamp"))return;
    const stamp=document.createElement("div");
    stamp.className="vf-stamp";
    stamp.innerHTML="<b>"+COMPANY+"</b> · by "+AUTHOR;
    // sit under the academy's own footer line when there is one, so the two
    // read as a pair rather than competing
    const foot=sheet.querySelector(".rep-foot");
    if(foot)foot.parentNode.insertBefore(stamp,foot.nextSibling);
    else sheet.appendChild(stamp);
    n++;
  });
  return n;
}

function injectStyle(){
  if(document.getElementById("vendorFooterCSS"))return;
  const style=document.createElement("style");
  style.id="vendorFooterCSS";
  style.textContent=CSS;
  document.head.appendChild(style);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);
else mount();

/* A safety net for every print path in the suite. Tools render their
   documents at different moments and some have no render hook at all, so
   rather than chase each one, stamp whatever is about to go on paper.
   Idempotent, so this costs nothing where the render already stamped.
   (PDF export goes through html2canvas and never fires this, which is why
   the render-time call still exists.) */
window.addEventListener("beforeprint",function(){
  try{stampReports();}catch(e){}
});

window.VendorFooter={COMPANY,AUTHOR,mount,stampReports};
})();

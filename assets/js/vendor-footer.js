/* =====================================================================
   Vendor credit footer.

   One place so the wording and styling stay identical on every page, and a
   change of company name is a one-line edit rather than a sweep of 22 files.

   Deliberately marked no-print: this is a credit on the software, not on a
   child's report card. Printed reports and anything a parent receives are
   left alone unless the academy asks otherwise.
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
`;

function mount(){
  if(document.getElementById("vendorFooter"))return;
  if(!document.body)return;

  const style=document.createElement("style");
  style.textContent=CSS;
  document.head.appendChild(style);

  const f=document.createElement("footer");
  f.id="vendorFooter";
  f.className="vendor-footer no-print";
  f.innerHTML='<b>'+COMPANY+'</b><span class="vf-dot">·</span>by '+AUTHOR;
  document.body.appendChild(f);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);
else mount();

window.VendorFooter={COMPANY,AUTHOR,mount};
})();

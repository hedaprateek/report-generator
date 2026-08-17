/* =====================================================================
   PdfSafe — make a report exportable to PDF.

   html2canvas draws the page onto a <canvas>. Any image the browser cannot
   read cross-origin "taints" that canvas, and a tainted canvas refuses
   toDataURL() — which is the
       Failed to execute 'toDataURL' … Tainted canvases may not be exported
   error. Opened from a folder (file://) EVERY local image counts as
   cross-origin, so the academy logo alone was enough to break every
   "Share as PDF" button.

   The fix is to hand html2canvas only images it is allowed to read: fetch
   each one and swap in a data: URI for the duration of the capture. When
   that fetch is itself blocked — which is exactly the file:// case — the
   image is hidden for those few frames rather than left to poison the
   whole export. Losing the logo is a far better outcome than losing the PDF.

   Consequences worth knowing:
     · hosted over http(s)  -> every image inlines, PDF is complete
     · file:// + a logo uploaded in Settings -> already a data: URI, works
     · file:// + the default logo file       -> PDF minus the logo
   Print / Save as PDF always keeps the logo: the browser rasterises that
   itself and no canvas is involved.
   ===================================================================== */
(function(){
"use strict";

async function toDataURL(url){
  if(!url)return null;
  if(url.indexOf("data:")===0)return url;
  try{
    const res=await fetch(url);
    if(!res.ok)return null;
    const blob=await res.blob();
    return await new Promise(resolve=>{
      const rd=new FileReader();
      rd.onload=()=>resolve(rd.result);
      rd.onerror=()=>resolve(null);
      rd.readAsDataURL(blob);
    });
  }catch(e){return null;}      // file:// blocks fetch — caller hides the image
}

/* Returns {dropped, restore}. ALWAYS call restore() — in a finally — or the
   report is left with hidden images and rewritten sources on screen. */
async function inlineImages(root){
  if(!root)return{dropped:0,restore(){}};
  const undo=[];let dropped=0;
  const imgs=Array.prototype.slice.call(root.querySelectorAll("img"));
  for(const im of imgs){
    const src=im.getAttribute("src")||"";
    if(!src||src.indexOf("data:")===0)continue;
    const data=await toDataURL(src);
    if(data){
      undo.push(function(){im.setAttribute("src",src);});
      im.setAttribute("src",data);
    }else{
      // visibility, not display: keeps the header's layout identical so the
      // PDF matches what was on screen apart from the missing picture
      const prev=im.style.visibility;
      undo.push(function(){im.style.visibility=prev;});
      im.style.visibility="hidden";
      dropped++;
    }
  }
  return{dropped,restore(){undo.forEach(function(f){f();});}};
}

// Non-blocking: an alert after every share would be worse than the missing logo.
function toast(msg,ms){
  const old=document.getElementById("pdfSafeToast");if(old)old.remove();
  const box=document.createElement("div");
  box.id="pdfSafeToast";
  box.style.cssText="position:fixed;bottom:20px;right:20px;z-index:9999;max-width:320px;"+
    "background:#FBEEDC;border:1px solid #EBD3A8;border-left:3px solid #C9791B;color:#6E4A1A;"+
    "border-radius:11px;padding:13px 15px;font:12.5px/1.55 system-ui,sans-serif;"+
    "box-shadow:0 12px 32px rgba(0,0,0,.18)";
  box.textContent=msg;
  document.body.appendChild(box);
  setTimeout(function(){if(box.parentNode)box.remove();},ms||7000);
}
function noteDropped(n){
  if(!n)return;
  toast("The PDF was created without the logo — opened from a folder, the browser "+
        "won't let it be embedded. Use Print / Save as PDF to keep it, or publish "+
        "the suite to a web address.");
}

window.PdfSafe={toDataURL,inlineImages,toast,noteDropped};
})();

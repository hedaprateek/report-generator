/* =====================================================================
   Registers the service worker, and tells the user where they stand.

   Two honest constraints:
     · A service worker only runs over http(s). Opened from a folder
       (file://) there is nothing to register — but that case is already
       fine, because the libraries are served from the same folder.
     · The FIRST visit still needs a connection. After that the whole suite
       opens with none.

   So the only genuinely broken case left is "hosted, never opened online,
   now offline" — which no amount of client-side code can fix.
   ===================================================================== */
(function(){
"use strict";

const READY_KEY="spdOfflineReady_v1";

function markReady(){
  try{localStorage.setItem(READY_KEY,String(Date.now()));}catch(e){}
}
function isReady(){
  try{return !!localStorage.getItem(READY_KEY);}catch(e){return false;}
}

function register(){
  if(!("serviceWorker" in navigator))return;
  if(location.protocol==="file:")return;      // nothing to do, and nothing broken
  // scope is the folder this page sits under, so it works on a project-page URL
  // like /report-generator/ as well as at a domain root
  const base=location.pathname.replace(/\/[^/]*$/,"/");
  const swUrl=base.replace(/\/(segments|tools)\/$/,"/")+"sw.js";
  navigator.serviceWorker.register(swUrl,{scope:swUrl.replace(/sw\.js$/,"")})
    .then(reg=>{
      if(reg.active)markReady();
      reg.addEventListener("updatefound",()=>{
        const w=reg.installing;
        if(!w)return;
        w.addEventListener("statechange",()=>{if(w.state==="activated")markReady();});
      });
    })
    .catch(()=>{/* offline support is a bonus; never let it break the page */});
}

/* A quiet banner only when it matters: the connection is gone AND this device
   has never finished caching, i.e. things really may not work. */
function watchConnection(){
  function paint(){
    const off=navigator.onLine===false;
    let bar=document.getElementById("offlineBar");
    if(!off||isReady()){if(bar)bar.remove();return;}
    if(bar)return;
    bar=document.createElement("div");
    bar.id="offlineBar";
    bar.className="no-print";
    bar.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:9998;"+
      "background:#FBEEDC;border-top:1px solid #EBD3A8;color:#6E4A1A;"+
      "font:12.5px/1.5 system-ui,sans-serif;padding:10px 14px;text-align:center";
    bar.textContent="You're offline and this device hasn't finished saving the app yet — "+
      "some tools may not open. Reconnect once and it will work offline from then on.";
    document.body.appendChild(bar);
  }
  window.addEventListener("online",paint);
  window.addEventListener("offline",paint);
  paint();
}

function start(){register();watchConnection();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);
else start();

window.OfflineSupport={isReady,register};
})();

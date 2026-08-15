/* =====================================================================
   Shared accessibility behaviour.

   These pages are all JavaScript applications — none of them render
   anything useful without JS — so applying semantics from script costs
   nothing in robustness and lets one file fix twenty-one pages.

   What it adds:
     · a skip link to the main content
     · a <main> landmark on whatever the page uses as its content shell
     · proper tab semantics (tablist/tab/aria-selected) and the arrow-key
       behaviour a screen reader user expects from something that
       announces itself as a tab
     · polite live regions for status text that changes on its own
   ===================================================================== */
(function(){
"use strict";

function ready(fn){
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",fn);
  else fn();
}

// The content shell differs per page; take the first that exists.
const MAIN_SELECTORS=[".wrap","#mount",".of-wrap","main","#app",".page"];

function markMain(){
  if(document.querySelector("main,[role=main]"))return document.querySelector("main,[role=main]");
  for(const sel of MAIN_SELECTORS){
    const el=document.querySelector(sel);
    if(el){el.setAttribute("role","main");if(!el.id)el.id="main-content";return el;}
  }
  return null;
}

function addSkipLink(main){
  if(!main||document.querySelector(".skip-link"))return;
  const a=document.createElement("a");
  a.className="skip-link";
  a.href="#"+(main.id||"main-content");
  a.textContent="Skip to main content";
  // Anchoring alone does not move keyboard focus in every browser, so move it.
  a.addEventListener("click",function(e){
    e.preventDefault();
    main.setAttribute("tabindex","-1");
    main.focus({preventScroll:false});
    main.scrollIntoView();
  });
  document.body.insertBefore(a,document.body.firstChild);
}

/* ---------- tabs ----------
   Groups of buttons that behave like tabs get announced as tabs, and
   then have to behave like them: arrows move between tabs, Home/End jump
   to the ends. Announcing the role without the keys would be worse than
   saying nothing. */
const TAB_GROUPS=[".tabs",".segbar",".of-tabs",".sb-tabs",".tabbar"];

function wireTabs(){
  TAB_GROUPS.forEach(sel=>{
    document.querySelectorAll(sel).forEach(group=>{
      const tabs=[...group.querySelectorAll("button")];
      if(tabs.length<2)return;
      group.setAttribute("role","tablist");
      tabs.forEach(t=>{
        t.setAttribute("role","tab");
        const on=t.classList.contains("on")||t.classList.contains("active")||
                 t.getAttribute("aria-selected")==="true";
        t.setAttribute("aria-selected",on?"true":"false");
        t.tabIndex=on?0:-1;
      });
      if(group.__a11y)return;
      group.__a11y=true;
      group.addEventListener("keydown",e=>{
        const list=[...group.querySelectorAll('button[role="tab"]')];
        const i=list.indexOf(document.activeElement);
        if(i<0)return;
        let j=null;
        if(e.key==="ArrowRight"||e.key==="ArrowDown")j=(i+1)%list.length;
        else if(e.key==="ArrowLeft"||e.key==="ArrowUp")j=(i-1+list.length)%list.length;
        else if(e.key==="Home")j=0;
        else if(e.key==="End")j=list.length-1;
        if(j===null)return;
        e.preventDefault();
        list[j].focus();
        list[j].click();
      });
    });
  });
}

// Views re-render constantly in these tools, so re-apply after any DOM change.
function observe(){
  let queued=false;
  const mo=new MutationObserver(()=>{
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;wireTabs();});
  });
  mo.observe(document.body,{childList:true,subtree:true});
}

/* ---------- live regions ----------
   Status that changes without the user acting (a connection dropping, a
   count updating) should be announced, but politely — never interrupting. */
const LIVE_IDS=["liveTxt","liveNote","stat","pill","of-status","status"];
function wireLive(){
  LIVE_IDS.forEach(id=>{
    const el=document.getElementById(id);
    if(el&&!el.hasAttribute("aria-live")){
      el.setAttribute("aria-live","polite");
      el.setAttribute("aria-atomic","true");
    }
  });
}

ready(function(){
  const main=markMain();
  addSkipLink(main);
  wireTabs();
  wireLive();
  observe();
});
})();

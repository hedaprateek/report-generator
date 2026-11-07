/* A fixed A4 frame with a header, an adaptive middle and a bottom footer.
   Native printing and downloaded PDFs use the same measured layout. */
(function installA4Print(context){
"use strict";
const window=context||globalThis.window,document=window.document;
if(window.A4Print)return;
const DOCS=".sheet,.receipt,.doc-sheet,.card-sheet,.tt-sheet,.sf-page,.rp-stage";
const script=document.currentScript;
const vendorBase=script&&script.src?new URL("../vendor/",script.src).href:null;
const CSS=`
@page{size:A4 portrait;margin:0}
html.a4-printing,html.a4-printing body{height:auto!important;min-height:0!important;margin:0!important;padding:0!important;background:#fff!important}
html.a4-printing #app,html.a4-printing #ofApp{height:auto!important;min-height:0!important;padding:0!important;margin:0!important}
html.a4-printing .wrap,html.a4-printing .of-wrap,html.a4-printing .print-target{padding:0!important;margin:0!important;max-width:none!important;max-height:none!important;overflow:visible!important}
html.a4-printing *, .a4-export *{animation:none!important;transition:none!important}
html.a4-printing .view,html.a4-printing .of-view{transform:none!important}
html.a4-printing .no-print,.a4-export .no-print{display:none!important}
html.a4-printing .print-only,.a4-export .print-only{display:block!important}
html.a4-printing .page-break{break-after:auto!important;page-break-after:auto!important}
html.a4-printing .a4-page,.a4-export .a4-page{
 display:block!important;position:relative!important;box-sizing:border-box!important;
 width:210mm!important;min-width:210mm!important;max-width:210mm!important;
 height:296.8mm!important;min-height:296.8mm!important;max-height:296.8mm!important;
 padding:16mm 19mm 30mm!important;margin:0!important;border:0!important;border-radius:0!important;
 box-shadow:none!important;background:#fff!important;overflow:hidden!important;contain:layout paint;
 -webkit-print-color-adjust:exact;print-color-adjust:exact;
 break-inside:avoid!important;page-break-inside:avoid!important;
 break-before:page!important;page-break-before:always!important;
 break-after:auto!important;page-break-after:auto!important;
}
html.a4-printing .a4-page.a4-first{break-before:auto!important;page-break-before:auto!important}
html.a4-printing .a4-content,.a4-export .a4-content,
html.a4-printing .a4-heading,.a4-export .a4-heading,
html.a4-printing .a4-footing,.a4-export .a4-footing{
 display:flow-root!important;position:absolute!important;box-sizing:border-box!important;
 left:19mm;top:16mm;width:172mm!important;max-width:none!important;
 height:auto!important;min-height:0!important;margin:0!important;padding:0!important;
 transform-origin:top left!important;overflow:visible!important;
}
html.a4-printing .a4-content .sheet-inner,.a4-export .a4-content .sheet-inner{transform:none!important;height:auto!important;min-height:0!important}
html.a4-printing .a4-content.a4-spread,.a4-export .a4-content.a4-spread,
html.a4-printing .a4-spread>.sheet-inner,.a4-export .a4-spread>.sheet-inner{display:flex!important;flex-direction:column!important;justify-content:space-between!important}
html.a4-printing .a4-spread>.sheet-inner,.a4-export .a4-spread>.sheet-inner{min-height:100%!important}
html.a4-printing .a4-spread>*,.a4-export .a4-spread>*,html.a4-printing .a4-spread>.sheet-inner>*,.a4-export .a4-spread>.sheet-inner>*{flex-shrink:0!important}
html.a4-printing .a4-footing,.a4-export .a4-footing{top:auto;bottom:30mm}
html.a4-printing .a4-footing .rep-foot,.a4-export .a4-footing .rep-foot{white-space:nowrap!important;margin-top:8px!important}
html.a4-printing .a4-content *,.a4-export .a4-content *{break-before:auto!important;break-after:auto!important;break-inside:auto!important;page-break-before:auto!important;page-break-after:auto!important}
html.a4-printing body>.stunity-credit{display:none!important}
.a4-pdf-credit{display:flex;align-items:center;justify-content:center;gap:10px;font-family:ui-monospace,"Cascadia Mono",Menlo,Consolas,monospace;text-transform:uppercase;line-height:1.5}
.a4-pdf-credit .sc-dot{width:6px;height:6px;border-radius:50%;flex:none;background:#8a8a8a;opacity:.75}
.a4-pdf-credit b{font-weight:500;color:#111}
html.a4-printing .a4-page>.stunity-credit,.a4-export .a4-page>.stunity-credit{display:flex!important;position:absolute!important;left:10mm!important;right:10mm!important;bottom:10mm!important;max-width:none!important;margin:0!important;padding:3mm 0 0!important;font-size:10px!important;letter-spacing:.14em!important;white-space:nowrap!important;color:#5b5b5b;border-top:.2mm solid #c9c9c9}
.a4-export{position:absolute;left:-100000px;top:0;width:210mm;background:#fff;color:#22262f}
.a4-export .a4-paper{position:relative;box-sizing:border-box;width:210mm;height:297mm;padding:0;background:#fff;overflow:hidden}
.a4-export .a4-pdf-credit{position:absolute;left:10mm;right:10mm;bottom:10mm;max-width:none;margin:0;padding:3mm 0 0;font-size:10px;letter-spacing:.14em;white-space:nowrap;color:#5b5b5b;border-top:.2mm solid #c9c9c9}
.a4-export .print-head,.a4-export .of-print-head{display:flex!important}
.a4-export .snap-detail,.a4-export .snap-chev{display:none!important}
.a4-export .story-row{display:none!important}
.a4-export .sheet{box-shadow:none!important}
`;
let state=null,exporting=false,libraries=null;
function style(){
 let node=document.getElementById("a4PrintCSS");
 if(!node){node=document.createElement("style");node.id="a4PrintCSS";node.textContent=CSS;}
 document.head.appendChild(node); // page dimensions win over per-tool @page rules
}
function documents(scope){
 const found=[...(scope.matches&&scope.matches(DOCS)?[scope]:[]),...scope.querySelectorAll(DOCS)];
 return found.filter(el=>!found.some(parent=>parent!==el&&parent.contains(el)));
}
function wrap(page,created){
 const record={page,created,style:page.getAttribute("style"),content:document.createElement("div"),moved:[]};
 record.content.className="a4-content";
 while(page.firstChild)record.content.appendChild(page.firstChild);
 page.appendChild(record.content);page.classList.add("a4-page");
 record.credit=studioCredit();page.appendChild(record.credit);
 for(const [key,selector] of [["heading",".rep-head"],["footing",".sign,.rep-foot,.foot,.sf-signrow,.sf-foot,.doc-signrow,.doc-foot,.rc-foot,.vf-stamp"]]){
  const slot=document.createElement("div");slot.className="a4-"+key;
  record.content.querySelectorAll(selector).forEach(node=>{
   const marker=document.createComment("a4-position");node.replaceWith(marker);
   record.moved.push({node,marker});slot.appendChild(node);
  });
  if(slot.childNodes.length){page.appendChild(slot);record[key]=slot;}
 }
 return record;
}
function fallback(scope){
 const page=document.createElement("div");
 for(const node of [...scope.childNodes]){
  if(node.nodeType===1&&node.matches("script,style,.stunity-credit,.rp-hint,.rp-foot,.no-print"))continue;
  page.appendChild(node);
 }
 scope.appendChild(page);return page;
}
function fit(records){
 records.forEach(({page,content,heading,footing},index)=>{
  page.classList.toggle("a4-first",index===0);
  content.style.setProperty("transform","none","important");
  const cs=getComputedStyle(page),left=parseFloat(cs.paddingLeft),right=parseFloat(cs.paddingRight);
  const width=page.clientWidth-left-right-2;
  let top=parseFloat(cs.paddingTop),bottom=parseFloat(cs.paddingBottom);
  for(const [slot,isHead] of [[heading,true],[footing,false]]){
   if(!slot)continue;
   slot.style.setProperty("transform","none","important");
   const naturalWidth=Math.max(slot.scrollWidth,slot.offsetWidth,1),scale=Math.min(1,width/naturalWidth);
   const height=slot.offsetHeight*scale;
   slot.style.left=left+"px";
   slot.style.setProperty("transform","scale("+scale+")","important");
   if(isHead){slot.style.top=top+"px";top+=height+12;}
   else {slot.style.top=(page.clientHeight-bottom-height)+"px";slot.style.bottom="auto";bottom+=height+12;}
  }
  const height=page.clientHeight-top-bottom-2;
  content.classList.remove("a4-spread");content.style.setProperty("height","auto","important");
  // Reflow at the available visual width before reducing type size. This
  // preserves full-width tables instead of making a narrow strip of content.
  function fits(scale){
   content.style.setProperty("width",(width/scale)+"px","important");
   return Math.max(content.scrollHeight,content.offsetHeight)*scale<=height&&content.scrollWidth*scale<=width+1;
  }
  let scale=1;
  if(!fits(1)){
   let low=.01,high=1;
   for(let i=0;i<18;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}
   scale=low;
  }
  fits(scale);
  content.style.top=top+"px";
  content.style.setProperty("height",(height/scale)+"px","important");
  content.classList.add("a4-spread");
  content.style.left=left+"px";
  content.style.setProperty("transform","scale("+scale+")","important");
  page.dataset.a4Scale=String(scale);
 });
 return records;
}
function prepare(){
 if(exporting)return [];
 if(document.body?.dataset.printPreview==='image')return [];
 style();
 if(state)return fit(state);
 if(window.VendorFooter)window.VendorFooter.stampReports();
 let scopes=[...document.querySelectorAll(".view.print-target,.of-view.print-target")].filter(el=>!el.classList.contains("hidden"));
 if(!scopes.length){
  // Print CSS hides untargeted views before beforeprint fires; the UI's hidden
  // class, rather than computed print display, identifies the selected view.
  scopes=[...document.querySelectorAll(".view,.of-view")].filter(el=>!el.classList.contains("hidden"));
  scopes.forEach(el=>el.classList.add("print-target"));
 }
 if(!scopes.length){if(document.getElementById("landing")||document.getElementById("ofLanding"))return [];scopes=[document.body];}
 document.documentElement.classList.add("a4-printing");
 state=[];
 for(const scope of scopes){
  const pages=documents(scope);
  if(pages.length)pages.forEach(page=>state.push(wrap(page,false)));
  else state.push(wrap(fallback(scope),true));
 }
 return fit(state);
}
function restore(){
 if(!state)return;
 for(const {page,content,heading,footing,credit,moved,created,style:original} of state){
  moved.forEach(({node,marker})=>marker.replaceWith(node));heading?.remove();footing?.remove();
  credit.remove();
  while(content.firstChild)page.insertBefore(content.firstChild,content);
  content.remove();page.classList.remove("a4-page","a4-first");delete page.dataset.a4Scale;
  if(original===null)page.removeAttribute("style");else page.setAttribute("style",original);
  if(created)page.replaceWith(...page.childNodes);
 }
 state=null;document.documentElement.classList.remove("a4-printing");
}
function studioCredit(){
 const credit=document.createElement("div");credit.className="stunity-credit a4-pdf-credit";
 credit.innerHTML='<span class="sc-dot"></span><span>Stunity Tech — by <b>Prateek</b></span>';
 return credit;
}
async function loadLibraries(){
 if(window.html2canvas&&window.jspdf&&window.jspdf.jsPDF)return;
 if(!vendorBase)throw Error("The PDF libraries are unavailable. Use Print / Save as PDF.");
 if(!libraries)libraries=Promise.all([
  ["html2canvas.min.js",()=>!!window.html2canvas],["jspdf.umd.min.js",()=>!!(window.jspdf&&window.jspdf.jsPDF)]
 ].map(([name,ready])=>ready()?Promise.resolve():new Promise((resolve,reject)=>{
  const el=document.createElement("script");el.src=vendorBase+name;el.onload=resolve;el.onerror=()=>reject(Error("Could not load "+name));document.head.appendChild(el);
 })));
 await libraries;
}
async function pdf(root,asImage=false,options={}){
 await loadLibraries();
 if(document.fonts)await document.fonts.ready;
 if(window.VendorFooter)window.VendorFooter.stampReports(root);
 style();
 const holder=document.createElement("div");holder.className="a4-export";document.body.appendChild(holder);
 exporting=true;
 try{
  const sourcePages=documents(root),pages=sourcePages.length?sourcePages:[root];
  const doc=new window.jspdf.jsPDF({unit:"mm",format:"a4",orientation:"portrait",compress:true}),individual=[];
  for(let i=0;i<pages.length;i++){
   if(options.cancelled?.())throw new Error('Export cancelled. No incomplete pack was downloaded.');
   const paper=document.createElement("div");paper.className="a4-paper";
   const page=pages[i].cloneNode(true);page.classList.remove("hidden","print-target");
   page.querySelectorAll(".no-print").forEach(node=>node.remove());
   paper.appendChild(page);holder.appendChild(paper);
   const record=wrap(page,false);
   await Promise.all([...page.querySelectorAll("img")].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;})));
   fit([record]);
   const canvas=await window.html2canvas(paper,{scale:2,useCORS:true,backgroundColor:"#fff",windowWidth:1100,scrollX:0,scrollY:0});
   if(asImage){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;return blob;}
   if(i)doc.addPage("a4","portrait");
   const jpeg=canvas.toDataURL("image/jpeg",.96);
   doc.addImage(jpeg,"JPEG",0,0,210,297);
   if(options.split){const single=new window.jspdf.jsPDF({unit:'mm',format:'a4',orientation:'portrait',compress:true});single.addImage(jpeg,'JPEG',0,0,210,297);individual.push(single.output('blob'));}
   canvas.width=canvas.height=1;paper.remove();
   options.onPage?.(i+1,pages.length);
  }
  return options.split?{combined:doc.output('blob'),individual}:doc.output("blob");
 }finally{holder.remove();exporting=false;}
}
function scriptTag(){return "<script>("+installA4Print.toString()+")();</"+"script>";}
window.A4Print={prepare,restore,fit:prepare,pdf,bundle:(root,options)=>pdf(root,false,{...options,split:true}),image:root=>pdf(root,true),scriptTag,inFrame:target=>{installA4Print(target);return target.A4Print;}};
style();
window.addEventListener("beforeprint",prepare);
window.addEventListener("afterprint",restore);
})();

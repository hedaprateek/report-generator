(function(){
'use strict';
const segments={
 'pre-primary':{name:'Pre-Primary',headline:'Little steps.<br><em>A bigger picture.</em>',poster:'Little steps.<br><em>Visible growth.</em>',intro:'Give families a thoughtful view of milestones, classroom habits and the next small step in their child’s development.',features:['Development areas, milestones and observations','Parent-friendly progress stories and next steps','Attendance and term-by-term development'],parentFocus:'a classroom observation and one small activity to try at home'},
 primary:{name:'Primary School',headline:'Learning grows.<br><em>Keep parents close.</em>',poster:'Growing minds.<br><em>Clear progress.</em>',intro:'Bring subject marks, learning habits and teacher observations together in a report parents can understand and act on.',features:['Subject marks alongside holistic learning habits','Teacher notes, attendance and progress over time','A clear report for every parent conversation'],parentFocus:'a learning strength and one useful practice activity'},
 secondary:{name:'Secondary School',headline:'Every assessment.<br><em>A clearer next step.</em>',poster:'Every test.<br><em>A clearer path.</em>',intro:'Turn subject results into useful conversations about strengths, focus areas and what to work on before the next assessment.',features:['Subject-wise marks, trends and class comparison','Strengths, focus areas and teacher observations','Class overview, rankings and individual reports'],parentFocus:'a subject strength and one focus area for the next assessment'},
 'junior-college':{name:'Junior College',headline:'Many tests.<br><em>One clear direction.</em>',poster:'Many tests.<br><em>Clear direction.</em>',intro:'Make board and entrance-test preparation easier to discuss, with a consistent view of subject performance and assessment progress.',features:['Board and entrance-practice assessments','Subject performance and test-by-test comparisons','Class rankings, progress insights and parent reports'],parentFocus:'a test-performance highlight and the next preparation priority'},
 college:{name:'College',headline:'See the semester.<br><em>Support the journey.</em>',poster:'Semester results.<br><em>Real direction.</em>',intro:'Give students and mentors a readable picture of academic outcomes, attendance and the work ahead.',features:['Semester results and credit-aware summaries','Subject-wise attendance and mentor observations','Individual reports and an academic overview'],parentFocus:'an academic highlight and the next mentoring priority'}
};
const previewInfo={
 report:['Sample student report','A real report layout, filled with fictional student data.','A4 · one page'],
 brochure:['Academy brochure','A prospect-ready introduction with the report, benefits and your sales contact.','A4 · one page'],
 poster:['WhatsApp promotional image','An image for introducing the tool to prospective academies.','1080 × 1350 PNG'],
 guide:['Parent-update guide','A practical, repeatable routine for sharing progress and keeping records.','A4 · one page']
};
const $=id=>document.getElementById(id),frame=$('demoFrame'),pending=new Map();
let token='',sequence=0,resolveReady=null,current=null,logo=null,previewBlob=null,previewURL=null,busy=false,activePreview='brochure';
const previews=new Map();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'academy';
const siteURL=()=>{
 const url=new URL('index.html',AcademySettings.base);
 // Packs made in a local preview should still point prospects to the live app.
 return url.protocol==='file:'||['localhost','127.0.0.1','[::1]'].includes(url.hostname)?'https://hedaprateek.github.io/report-generator/':url.href;
};
const siteLabel=()=>siteURL().replace(/^https?:\/\//,'').replace(/index\.html$/,'').replace(/\/$/,'');
const cadence=()=>current?.cadence==='twice-monthly'?'Twice a month':'Monthly';
const updateHeading=()=>current?.cadence==='twice-monthly'?'Updates twice a month.':'Monthly updates.';
function status(text){$('demoStatus').textContent=text;}
function enable(on){
 document.querySelectorAll('.export,[data-preview]').forEach(button=>button.disabled=!on);
 $('buildDemo').disabled=busy;
 document.querySelectorAll('#demoForm input,#demoForm select').forEach(input=>input.disabled=busy);
}
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow||!event.data)return;
 if(event.data.type==='academy-showcase-ready'){resolveReady?.();return;}
 const message=event.data;if(message.type!=='academy-showcase-result'||message.token!==token)return;
 const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);
 message.error?task.reject(Error(message.error)):task.resolve(message);
});
async function request(options){
 const id=++sequence;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('The demo took too long to prepare. Update the preview and try again.'));},90000);
  pending.set(id,{resolve,reject,timer});frame.contentWindow.postMessage({type:'academy-showcase',token,id,...options},'*');
 });
}
function initialsLogo(name){
 const letters=name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="24" fill="#182c36"/><text x="80" y="98" font-family="Georgia,serif" font-size="54" text-anchor="middle" fill="#fff">${esc(letters)}</text></svg>`);
}
async function inlineLogo(url){
 if(url.startsWith('data:'))return url;const r=await fetch(url);if(!r.ok)throw Error('Logo unavailable');
 const blob=await r.blob();return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=reject;f.readAsDataURL(blob);});
}
async function renderReport(view,format){
 const sample=await request({action:'export',format:'markup',view});
 // The source frame runs with no origin and cannot read real academy storage.
 // This separate measurable frame has an origin but cannot execute scripts.
 const renderer=document.createElement('iframe');renderer.className='demo-frame';renderer.sandbox='allow-same-origin';renderer.title='Script-free sample layout';renderer.setAttribute('aria-hidden','true');document.body.appendChild(renderer);
 try{
  const doc=renderer.contentDocument;
  doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"><base href="'+esc(frame.src)+'">'+sample.styles+'</head><body class="pdf-export">'+sample.html+'</body></html>');doc.close();
  const viewWindow=renderer.contentWindow;viewWindow.html2canvas=window.html2canvas;viewWindow.jspdf=window.jspdf;
  const engine=A4Print.inFrame(viewWindow),root=doc.body.firstElementChild;
  return format==='png'?await engine.image(root):await engine.pdf(root);
 }finally{renderer.remove();}
}
async function build(){
 if(busy)return;busy=true;enable(false);status('Preparing your sample report…');
 current=null;previewBlob=null;previews.clear();$('demoPreview').hidden=true;$('previewPlaceholder').hidden=false;$('previewPlaceholder').textContent='Preparing your sample report…';
 try{
  const segment=$('segment').value,name=$('demoAcademy').value.trim()||AcademySettings.defaults.name,p=AcademySettings.profile();
  let demoLogo=logo;
  if(!demoLogo){try{demoLogo=name===p.name?await inlineLogo(p.logoEmblem):initialsLogo(name);}catch{demoLogo=initialsLogo(name);}}
  current={segment,name,cadence:$('updateCadence').value,contact:$('demoContact').value.trim(),profile:{name,logoFull:demoLogo,logoEmblem:demoLogo,tagline:'',address:'',phone:'',email:'',website:''}};
  $('segmentFeatures').innerHTML=segments[segment].features.map(f=>`<li>${esc(f)}</li>`).join('');
  for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('A new demo was selected.'));}pending.clear();
  token=crypto.randomUUID();let readyTimer;
  const ready=new Promise((resolve,reject)=>{resolveReady=()=>{clearTimeout(readyTimer);resolve();};readyTimer=setTimeout(()=>reject(Error('The sample renderer could not open. Please try again.')),30000);});
  frame.src=new URL('segments/'+segment+'-reports.html?showcase=1',AcademySettings.base).href;
  await ready;resolveReady=null;await request({action:'init',profile:current.profile});
  previewBlob=await renderReport('report','png');previews.set('report',previewBlob);
  if(reportURL)URL.revokeObjectURL(reportURL);reportURL=URL.createObjectURL(previewBlob);
  await displayPreview(activePreview);
  try{AcademySettings.write('spdMarketingSettings_v1',{segment});}catch{}
  status('Sample ready. Preview each design or download the complete pack.');
 }catch(err){current=null;previewBlob=null;previews.clear();$('demoPreview').hidden=true;$('previewPlaceholder').hidden=false;$('previewPlaceholder').textContent=err.message;status(err.message);}
 finally{busy=false;enable(!!current&&!!previewBlob);}
}
function productHeader(label){return `<header class="rep-head"><div class="product-lockup"><div class="product-mark">S.</div><div><div class="product-name">Report Generator</div><div class="product-byline">By Stunity Tech</div></div></div><div class="edition"><strong>${esc(segments[current.segment].name)}</strong>${esc(label)}</div></header>`;}
function productFooter(){return `<footer class="rep-foot">Product demonstration · Fictional student data · Save dated reports and backups for long-term records.</footer>`;}
function contactBlock(){return `${current.contact?`<p class="contact-line">${esc(current.contact)}</p>`:''}<p class="site-line">${esc(siteLabel())}</p>`;}
function prospect(){return `<div class="prospect"><img src="${esc(current.profile.logoEmblem)}" alt=""><div><span>Prepared for</span>${esc(current.name)}</div></div>`;}
function mountSheet(content){
 const stage=$('renderStage');stage.innerHTML=`<article class="sheet marketing-sheet" data-academy-demo><div class="sheet-inner">${content}</div></article>`;return stage.firstElementChild;
}
function brochure(){
 const details=segments[current.segment];
 return mountSheet(`${productHeader('Academy introduction')}
  <section class="rep-sec hero-grid"><div><div class="export-eyebrow">From Excel to a clearer conversation</div><h1>${details.headline}</h1><p>${esc(details.intro)}</p>${prospect()}</div><div class="report-display"><img src="${esc(previewURLForReport())}" alt="Sample report"><div class="image-caption">An actual report layout · Fictional student data</div></div></section>
  <section class="rep-sec benefit-grid"><div class="benefit"><span class="benefit-number">01</span><h3>Records that stay useful</h3><p>Build a dated digital history for reviews, parent meetings and future handovers. Keep reports and workbook backups together.</p></div><div class="benefit"><span class="benefit-number">02</span><h3>Parents kept in the loop</h3><p>Share a monthly or twice-monthly PDF or image through WhatsApp, with a personal note on progress and next steps.</p></div><div class="benefit"><span class="benefit-number">03</span><h3>Less routine printing</h3><p>Use digital copies for regular updates. Keep the single-page A4 format for the occasions that need a printed report.</p></div></section>
  <section class="rep-sec cadence-band"><div><div class="export-eyebrow">A simple communication habit</div><h2>${updateHeading()}<br>Closer parent connections.</h2></div><p>Assess → review → share.<br>Choose a monthly or twice-monthly routine. Send each student’s report privately to the appropriate parent or guardian. Sharing is manual.</p></section>
  <section class="rep-sec segment-line"><div class="export-eyebrow">Built for ${esc(details.name)}</div><p>${details.features.map(esc).join(' · ')}</p></section>
  <section class="rep-sec workflow"><div><strong>01 / Use familiar Excel</strong><p>Fill a structured template with your class data.</p></div><div><strong>02 / Make it your academy’s</strong><p>Add your logo, wording and signatures.</p></div><div><strong>03 / Export, share, keep</strong><p>Save reports, send updates and export backups.</p></div></section>
  <section class="rep-sec cta"><h2>Picture this with your academy’s name.</h2><p>Explore a sample, then try a class workbook with your own branding.</p>${contactBlock()}</section>${productFooter()}`);
}
// The report URL remains separate from the currently selected promotional preview.
let reportURL=null;
function previewURLForReport(){return reportURL;}
function parentMessage(){
 const d=segments[current.segment];
 return `Hello [Parent / Guardian],\nHere is [Student name]’s progress update for [reporting period] from ${current.name}.\nHighlight: [${d.parentFocus.split(' and ')[0]}].\nNext step: [one specific, achievable action].\nPlease review the attached report and reply if you would like to discuss it.\n— ${current.name}`;
}
function guide(){
 const twice=current.cadence==='twice-monthly';
 return mountSheet(`${productHeader('Parent-update playbook')}
  <section class="rep-sec guide-intro"><div class="export-eyebrow">A small routine. A stronger connection.</div><h1>Keep parents involved.<br><em>Keep progress on record.</em></h1><p>A repeatable reporting routine for ${esc(current.name)}. Use brief, useful updates rather than waiting until the end of a term.</p></section>
  <section class="rep-sec schedule"><div class="${twice?'':'chosen'}"><strong>Monthly</strong><p>One reviewed update at month-end. Summarise progress and agree on the next step.</p></div><div class="${twice?'chosen':''}"><strong>Twice a month</strong><p>Use a mid-month check-in and a month-end update. Choose two dates that fit your assessment cycle.</p></div></section>
  <section class="rep-sec guide-steps"><div class="guide-step"><span>01</span><div><strong>Update and review</strong><p>Enter current marks or observations in Excel. Check the student, reporting period and teacher comments before exporting.</p></div></div><div class="guide-step"><span>02</span><div><strong>Send the right report to the right family</strong><p>Download the individual PDF or report image, then attach it manually in a private WhatsApp conversation with the appropriate parent or guardian. Avoid class groups.</p></div></div><div class="guide-step"><span>03</span><div><strong>Keep a dated digital copy</strong><p>Archive the report and source workbook by academic year, class, student and reporting period. Export an app backup and keep a second copy in your chosen safe location.</p></div></div></section>
  <section class="rep-sec message-example"><div class="export-eyebrow">A parent message you can adapt · Sample only</div><p>${esc(parentMessage())}</p></section>
  <section class="rep-sec archive-row"><div><h3>Useful beyond this month</h3><p>A dated archive supports later reviews, parent discussions and staff handovers without searching through paper files.</p></div><div><h3>Paper when it adds value</h3><p>Digital routine updates can reduce printing. Print the same single-page A4 report for meetings or formal records when needed.</p></div></section>
  <section class="rep-sec"><p class="honest-note">Current storage is in this browser, not an automatic cloud archive. Download reports and keep backups. WhatsApp messages are not scheduled or sent by the app.${current.segment==='college'?' Share an adult student’s report only with their permission.':''}</p>${contactBlock()}</section>${productFooter()}`);
}
function poster(){
 const details=segments[current.segment],stage=$('renderStage');
 stage.innerHTML=`<article class="marketing-poster" data-academy-demo><div class="poster-content"><div class="poster-top"><div class="poster-wordmark">Report Generator<span>By Stunity Tech</span></div><span class="poster-tag">${esc(details.name)} · Product demo</span></div>
  <div class="poster-hero"><div><div class="poster-kicker">Excel in. Clear reports out.</div><h1>${details.poster}</h1><p>Professional reports with your academy’s name, logo and a clear next step.</p></div><div class="poster-report"><img src="${esc(previewURLForReport())}" alt="Sample report"><p>Actual report layout · Fictional student data</p></div></div>
  <div class="poster-band"><strong>${updateHeading()}<br>More connected parents.</strong><span>Share each student’s PDF or report image privately through WhatsApp.</span></div>
  <div class="poster-benefits"><div><strong>Keep a digital history</strong><p>Save dated reports and workbook backups for future reviews.</p></div><div><strong>Use less paper</strong><p>Share routine updates digitally. Print when a copy is needed.</p></div><div><strong>Make progress visible</strong><p>Turn results into regular, useful conversations with parents.</p></div></div>
  <div class="poster-cta"><strong>See what it could look like for your academy.</strong><p>Demo prepared for ${esc(current.name)}</p>${current.contact?`<p>${esc(current.contact)}</p>`:''}<p>${esc(siteLabel())}</p></div>
  <p class="poster-legal">Fictional demo data. WhatsApp sharing is manual. Keep downloaded reports and backups for long-term records.</p></div><div class="stunity-credit"><span class="sc-dot"></span><span>Stunity Tech — by <b>Prateek</b></span></div></article>`;
 return stage.firstElementChild;
}
async function posterImage(){
 const root=poster();await document.fonts.ready;
 await Promise.all([...root.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
 const credit=root.querySelector('.stunity-credit'),content=root.querySelector('.poster-content');
 // Keep long academy names/contact details inside the fixed social canvas,
 // while the studio footer remains at the foot at its original size.
 let scale=1;
 while(root.querySelector('.poster-legal').getBoundingClientRect().bottom>credit.getBoundingClientRect().top-20&&scale>.72){scale-=.02;content.style.transformOrigin='top left';content.style.transform=`scale(${scale})`;}
 if(root.querySelector('.poster-legal').getBoundingClientRect().bottom>credit.getBoundingClientRect().top-12)throw Error('The contact or academy name is too long for this image. Shorten the demo details and update the preview.');
 const canvas=await html2canvas(root,{scale:1,width:1080,height:1350,windowWidth:1300,backgroundColor:'#f6f5ef',scrollX:0,scrollY:0});
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=canvas.height=1;
 if(!blob)throw Error('The promotional image could not be created. Please try again.');return blob;
}
async function getPreview(kind){
 if(!previews.has(kind))previews.set(kind,kind==='poster'?await posterImage():await A4Print.image(kind==='guide'?guide():brochure()));
 return previews.get(kind);
}
async function displayPreview(kind){
 const blob=await getPreview(kind);
 if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);
 $('demoPreview').src=previewURL;$('demoPreview').hidden=false;$('previewPlaceholder').hidden=true;
 activePreview=kind;
 for(const tab of document.querySelectorAll('[data-preview]')){const selected=tab.dataset.preview===kind;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
 $('previewPanel').setAttribute('aria-labelledby','tab-'+kind);
 const [title,description,format]=previewInfo[kind];$('previewTitle').textContent=title;$('previewDescription').textContent=description;$('previewFormat').textContent=format;$('demoPreview').alt=title+' for '+current.name;
}
async function selectPreview(kind){
 if(busy||!current)return;busy=true;enable(false);status('Preparing '+previewInfo[kind][0].toLowerCase()+'…');
 try{await displayPreview(kind);status('Sample ready. Preview each design or download the complete pack.');}catch(err){status(err.message);}
 finally{busy=false;enable(!!current);}
}
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function readme(){return `PRODUCT DEMONSTRATION — SAMPLE DATA\n${segments[current.segment].name}\nPrepared as a demo for ${current.name}.\n\nThe student names and results in this pack are sample data, not real academy records.\n\nSTART HERE\n1. product-introduction.pdf — one-page academy brochure.\n2. whatsapp-promotion.png — promotional image for introducing the tool to academies.\n3. parent-update-guide.pdf — monthly or twice-monthly reporting routine.\n4. sample-student-report.pdf / .png — fictional student report.\n5. sample-academy-overview.pdf — fictional class overview.\n6. academy-introduction.txt / sample-parent-message.txt — messages to adapt.\n\nLONG-TERM VALUE\nBuild a dated digital history by downloading reports and retaining source workbooks and app backups. Current browser storage is not an automatic cloud archive. Keep a second backup copy.\n\nREGULAR PARENT UPDATES\nSuggested schedule: ${cadence()}. Attach the child's own PDF or image manually in a private WhatsApp conversation with the appropriate parent or guardian. The app does not schedule or send WhatsApp messages. Digital routine updates can reduce paper use.\n\n${current.contact?'Sales contact: '+current.contact+'\n':''}Explore: ${siteURL()}\n\nStunity Tech — by Prateek\n`;}
function introduction(){return `Hello, I’m Prateek from Stunity Tech. Our reporting tool turns an Excel workbook into academy-branded, single-page A4 student reports and class overviews for ${segments[current.segment].name}.\n\nBeyond report day, you can build a useful digital history by keeping dated reports and workbook backups. Share a progress report monthly or twice a month through WhatsApp to keep parents involved and reduce routine printing. Sharing is manual.\n\nThis sample is prepared for ${current.name}; all student data is fictional. Would you like a short demonstration with your academy’s branding?\n\n${current.contact?current.contact+'\n':''}${siteURL()}`;}
async function exportFile(kind){
 if(busy||!current)return;busy=true;enable(false);status('Preparing your '+(kind==='pack'?'demo pack':'download')+'…');
 try{
  const prefix=slug(current.name)+'_'+current.segment;
  if(kind==='png')save(previewBlob,prefix+'_sample-report.png');
  else if(kind==='poster')save(await getPreview('poster'),prefix+'_whatsapp-promotion.png');
  else if(kind==='brochure'||kind==='guide')save(await A4Print.pdf(kind==='guide'?guide():brochure()),prefix+'_'+(kind==='guide'?'parent-update-guide':'introduction')+'.pdf');
  else if(kind==='pack'){
   const student=await renderReport('report','pdf'),overview=await renderReport('overview','pdf'),intro=await A4Print.pdf(brochure()),parentGuide=await A4Print.pdf(guide()),promotion=await getPreview('poster');
   const zip=XLSX.CFB.utils.cfb_new();
   for(const [name,blob] of [['sample-student-report.pdf',student],['sample-student-report.png',previewBlob],['sample-academy-overview.pdf',overview],['product-introduction.pdf',intro],['parent-update-guide.pdf',parentGuide],['whatsapp-promotion.png',promotion]])XLSX.CFB.utils.cfb_add(zip,name,new Uint8Array(await blob.arrayBuffer()));
   for(const [name,text] of [['READ-ME.txt',readme()],['academy-introduction.txt',introduction()],['sample-parent-message.txt',parentMessage()]])XLSX.CFB.utils.cfb_add(zip,name,new TextEncoder().encode(text));
   save(new Blob([XLSX.CFB.write(zip,{type:'array',fileType:'zip',compression:true})],{type:'application/zip'}),prefix+'_demo-pack.zip');
  }else save(await renderReport(kind==='overview'?'overview':'report','pdf'),prefix+'_sample-'+(kind==='overview'?'overview':'report')+'.pdf');
  status('Download ready. Your saved academy settings and student records were kept.');
 }catch(err){status(err.message);}
 finally{busy=false;enable(!!current);}
}
$('demoForm').addEventListener('submit',e=>{e.preventDefault();build();});
$('demoLogo').addEventListener('change',async e=>{
 if(!e.target.files[0])return;busy=true;enable(false);
 try{logo=await AcademySettings.resizeLogo(e.target.files[0]);status('Demo logo ready. Update the preview to apply it.');}catch(err){status(err.message);}
 finally{e.target.value='';busy=false;enable(false);}
});
$('demoForm').addEventListener('input',()=>{if(!busy){enable(false);status('Update the preview to use these demo details.');}});
for(const [id,kind] of [['demoPack','pack'],['reportPDF','report'],['reportPNG','png'],['overviewPDF','overview'],['brochurePDF','brochure'],['posterPNG','poster'],['guidePDF','guide']])$(id).addEventListener('click',()=>exportFile(kind));
for(const tab of document.querySelectorAll('[data-preview]')){
 tab.addEventListener('click',()=>selectPreview(tab.dataset.preview));
 tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-preview]')];const index=tabs.indexOf(tab);const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();selectPreview(tabs[next].dataset.preview);});
}
for(const [id,makeMessage] of [['copyPitch',introduction],['copyParent',parentMessage]])$(id).onclick=async()=>{if(!current)return;const text=makeMessage();try{await navigator.clipboard.writeText(text);status(id==='copyPitch'?'Academy introduction copied.':'Sample parent message copied. Replace the placeholders before sharing.');}catch{status(text);}};
const saved=AcademySettings.read('spdMarketingSettings_v1',{});if(segments[saved.segment])$('segment').value=saved.segment;$('demoAcademy').value=AcademySettings.profile().name;
build();
})();

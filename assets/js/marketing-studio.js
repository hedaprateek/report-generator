(function(){
'use strict';
const segments={
 'pre-primary':{name:'Pre-Primary',headline:'Make early growth visible.',features:['Development areas, milestones and observations','Parent-friendly progress stories and next steps','Attendance and term-by-term development'],intro:'Give parents a clear, thoughtful view of their child’s development beyond marks.'},
 primary:{name:'Primary School',headline:'Bring marks and learning habits together.',features:['Subject marks alongside holistic learning habits','Teacher notes, attendance and progress over time','A clear report for every parent conversation'],intro:'Combine classroom performance and everyday learning habits in one parent-friendly report.'},
 secondary:{name:'Secondary School',headline:'Turn each assessment into a clearer next step.',features:['Subject-wise marks, trends and class comparison','Strengths, focus areas and teacher observations','Class overview, rankings and individual reports'],intro:'Help teachers and parents understand performance across subjects and assessments.'},
 'junior-college':{name:'Junior College',headline:'See board and entrance preparation together.',features:['Multiple test types, including board and entrance practice','Subject performance and test-by-test comparisons','Class rankings, progress insights and parent reports'],intro:'Bring the different assessments of a busy junior-college classroom into one consistent view.'},
 college:{name:'College',headline:'Make semester progress easy to understand.',features:['Semester results, subjects and credit-aware summaries','Subject-wise attendance and mentor observations','Individual progress reports and an academic overview'],intro:'Present academic progress across semesters in a structured, readable format.'}
};
const cardTitles={
 'pre-primary':['Development beyond marks','Parent conversations','Growth across terms'],
 primary:['Marks and learning habits','Progress over time','Parent communication'],
 secondary:['Every subject in view','Clear areas to work on','The classroom picture'],
 'junior-college':['One view of every test','Subject and test comparison','Progress for parents'],
 college:['Semester outcomes','Attendance and mentoring','The academic picture']
};
const $=id=>document.getElementById(id),frame=$('demoFrame'),pending=new Map();let token='',sequence=0,frameReady=null,resolveReady=null,current=null,logo=null,previewBlob=null,previewURL=null,busy=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'academy';
function status(text){$('demoStatus').textContent=text;}
function enable(on){document.querySelectorAll('.export').forEach(button=>button.disabled=!on);$('buildDemo').disabled=busy;document.querySelectorAll('#demoForm input,#demoForm select').forEach(input=>input.disabled=busy);}
window.addEventListener('message',event=>{
 if(event.source!==frame.contentWindow||!event.data)return;
 if(event.data.type==='academy-showcase-ready'){resolveReady?.();return;}
 const message=event.data;if(message.type!=='academy-showcase-result'||message.token!==token)return;
 const task=pending.get(message.id);if(!task)return;pending.delete(message.id);clearTimeout(task.timer);message.error?task.reject(Error(message.error)):task.resolve(message);
});
async function request(options){
 const id=++sequence;
 return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('The demo took too long to prepare. Update the preview and try again.'));},90000);pending.set(id,{resolve,reject,timer});frame.contentWindow.postMessage({type:'academy-showcase',token,id,...options},'*');});
}
function initialsLogo(name){const letters=name.split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" rx="24" fill="#1f2a44"/><text x="80" y="98" font-family="Georgia,serif" font-size="54" text-anchor="middle" fill="#fff">${esc(letters)}</text></svg>`);}
async function inlineLogo(url){if(url.startsWith('data:'))return url;const r=await fetch(url);if(!r.ok)throw Error('Logo unavailable');const blob=await r.blob();return await new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=reject;f.readAsDataURL(blob);});}
async function renderReport(view,format){
 const sample=await request({action:'export',format:'markup',view});
 // This second frame can be measured by the canvas library but cannot run
 // scripts. The source frame alone runs the sample-data parser, without an
 // origin and therefore without access to the academy's browser storage.
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
 try{
  const segment=$('segment').value,name=$('demoAcademy').value.trim()||AcademySettings.defaults.name,p=AcademySettings.profile();
  let demoLogo=logo;if(!demoLogo){try{demoLogo=name===p.name?await inlineLogo(p.logoEmblem):initialsLogo(name);}catch{demoLogo=initialsLogo(name);}}
  current={segment,name,profile:{name,logoFull:demoLogo,logoEmblem:demoLogo,tagline:'',address:'',phone:'',email:'',website:''}};
  $('segmentFeatures').innerHTML=segments[segment].features.map(f=>`<li>${esc(f)}</li>`).join('');$('previewTitle').textContent=segments[segment].name+' · sample report';
  for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('A new demo was selected.'));}pending.clear();
  token=crypto.randomUUID();frameReady=new Promise(resolve=>resolveReady=resolve);frame.src=new URL('segments/'+segment+'-reports.html?showcase=1',AcademySettings.base).href;
  await Promise.race([frameReady,new Promise((_,reject)=>setTimeout(()=>reject(Error('The sample renderer could not open. Please try again.')),30000))]);
  await request({action:'init',profile:current.profile});
  previewBlob=await renderReport('report','png');
  if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(previewBlob);$('demoPreview').src=previewURL;$('demoPreview').hidden=false;$('previewPlaceholder').hidden=true;
  try{AcademySettings.write('spdMarketingSettings_v1',{segment});}catch{}
  status('Sample ready. Download a report, a snapshot, or the complete demo pack.');
 }catch(err){current=null;status(err.message);$('previewPlaceholder').textContent=err.message;}
 finally{busy=false;enable(!!current&&!!previewBlob);}
}
function brochure(){
 const details=segments[current.segment],stage=$('renderStage');
 stage.innerHTML=`<article class="sheet marketing-sheet" data-academy-demo><div class="sheet-inner"><header class="rep-head"><img src="${esc(current.profile.logoEmblem)}" alt=""><div><div class="acad">${esc(current.name)}</div><div class="doc">${esc(details.name)} · product demonstration</div></div></header><section class="rep-sec"><h1>${esc(details.headline)}</h1><p>${esc(details.intro)}</p></section><section class="rep-sec demo-intro"><h2>One workbook. A complete reporting view.</h2><p>Enter your academy’s data in a structured Excel template. Build an individual report for each student and a useful overview for the class.</p></section><section class="rep-sec"><div class="feature-grid">${details.features.map((f,i)=>`<div class="feature-box"><h3>0${i+1} · ${esc(cardTitles[current.segment][i])}</h3><p>${esc(f)}</p></div>`).join('')}<div class="feature-box"><h3>04 · Your academy’s identity</h3><p>Your name, logo, contact details, report wording and signatures, remembered on the device.</p></div><div class="feature-box"><h3>05 · Ready to share</h3><p>One A4 page per student report, downloadable PDFs and shareable report images.</p></div><div class="feature-box"><h3>06 · A practical daily workflow</h3><p>Structured Excel templates, saved workbooks and portable backups.</p></div></div></section><section class="rep-sec"><h2>Try it with a sample. Make it your own.</h2><p>Explore the demo, then set up your academy profile and class workbook.</p><p style="font-size:12px;color:#0e7c7b;overflow-wrap:anywhere">${esc(new URL('index.html',AcademySettings.base).href)}</p></section><footer class="rep-foot">Product demonstration · ${esc(details.name)} · All student reports in this pack use sample data.</footer></div></article>`;
 return stage.querySelector('.sheet');
}
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function exportFile(kind){
 if(busy||!current)return;busy=true;enable(false);status('Preparing your '+(kind==='pack'?'demo pack':'download')+'…');
 try{
  const prefix=slug(current.name)+'_'+current.segment;
  if(kind==='png')save(previewBlob,prefix+'_sample-report.png');
  else if(kind==='brochure')save(await A4Print.pdf(brochure()),prefix+'_introduction.pdf');
  else if(kind==='pack'){
   const student=await renderReport('report','pdf'),overview=await renderReport('overview','pdf'),intro=await A4Print.pdf(brochure());
   const zip=XLSX.CFB.utils.cfb_new();
   XLSX.CFB.utils.cfb_add(zip,'sample-student-report.pdf',new Uint8Array(await student.arrayBuffer()));XLSX.CFB.utils.cfb_add(zip,'sample-student-report.png',new Uint8Array(await previewBlob.arrayBuffer()));XLSX.CFB.utils.cfb_add(zip,'sample-academy-overview.pdf',new Uint8Array(await overview.arrayBuffer()));XLSX.CFB.utils.cfb_add(zip,'product-introduction.pdf',new Uint8Array(await intro.arrayBuffer()));
   const readme='PRODUCT DEMONSTRATION — SAMPLE DATA\n'+segments[current.segment].name+'\nPrepared as a demo for '+current.name+'.\n\nThe student names and results in this pack are sample data, not real academy records.\n\nOpen the PDFs or share the PNG snapshot. To try the tool: '+new URL('index.html',AcademySettings.base).href+'\n\nStunity Tech — by Prateek\n';XLSX.CFB.utils.cfb_add(zip,'READ-ME.txt',new TextEncoder().encode(readme));
   save(new Blob([XLSX.CFB.write(zip,{type:'array',fileType:'zip',compression:true})],{type:'application/zip'}),prefix+'_demo-pack.zip');
  }else {const view=kind==='overview'?'overview':'report';save(await renderReport(view,'pdf'),prefix+'_sample-'+view+'.pdf');}
  status('Download ready. Your saved academy settings and student records were kept.');
 }catch(err){status(err.message);}
 finally{busy=false;enable(!!current);}
}
$('demoForm').addEventListener('submit',e=>{e.preventDefault();build();});$('demoLogo').addEventListener('change',async e=>{try{logo=await AcademySettings.resizeLogo(e.target.files[0]);status('Demo logo ready. Update the preview to apply it.');}catch(err){status(err.message);}e.target.value='';});
$('demoForm').addEventListener('input',()=>{if(!busy){enable(false);status('Update the preview to use these demo details.');}});
for(const [id,kind]of [['demoPack','pack'],['reportPDF','report'],['reportPNG','png'],['overviewPDF','overview'],['brochurePDF','brochure']])$(id).addEventListener('click',()=>exportFile(kind));
$('copyPitch').onclick=async()=>{const segment=segments[$('segment').value];const text=`Hello, I’d like to show you a ${segment.name} demo of our academy reporting tool. It turns an Excel workbook into individual A4 student reports and class overviews, with your academy’s name and logo. The attached reports use sample data. You can explore the tool here: ${new URL('marketing.html',AcademySettings.base).href} — Stunity Tech, by Prateek.`;try{await navigator.clipboard.writeText(text);status('Introduction message copied.');}catch{status(text);}};
const saved=AcademySettings.read('spdMarketingSettings_v1',{});if(segments[saved.segment])$('segment').value=saved.segment;$('demoAcademy').value=AcademySettings.profile().name;
build();
})();

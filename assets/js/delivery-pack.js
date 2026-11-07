/* Real class report delivery: one capture per student, individual + combined PDFs. */
(function(){
'use strict';
let running=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// SheetJS's bundled ZIP writer cannot preserve non-ASCII entry names. Keep
// paths portable; the UTF-8 CSV index retains every student's full name.
const filename=(v,fallback='report')=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^[._-]+|[._-]+$/g,'').slice(0,65)||fallback;
const csvCell=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
function css(){
 if(document.getElementById('deliveryCSS'))return;
 const node=document.createElement('style');node.id='deliveryCSS';node.textContent=`
 #deliveryDialog{border:1px solid #d6dfdb;border-radius:14px;padding:24px;color:#1f2a44;width:min(520px,calc(100% - 32px));font:14px/1.6 system-ui}#deliveryDialog::backdrop{background:#0f14239c}#deliveryDialog h2{font:600 24px Georgia,serif;margin:0 0 12px}#deliveryDialog progress{width:100%;accent-color:#0e7c7b}#deliveryDialog .delivery-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}#deliveryDialog button{padding:10px 14px;border:1px solid #ccd6d0;border-radius:8px;background:#fff;color:#1f2a44;cursor:pointer}#deliveryDialog button:disabled{opacity:.5;cursor:wait}#deliveryDialog .delivery-note{font-size:12px;color:#566578}#deliveryDialog [hidden]{display:none!important}.delivery-stage{position:absolute;left:-100000px;top:0;width:210mm}.delivery-summary .rep-head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #0e7c7b;padding-bottom:14px}.delivery-summary .delivery-academy{font:700 22px Georgia,serif}.delivery-summary .delivery-subtitle{font-size:11px;color:#0e7c7b}.delivery-summary .rep-foot{font-size:9px;text-align:center;color:#656e82;border-top:1px solid #dfe5ed;padding-top:9px}.delivery-summary .kpis{margin-top:14px}.delivery-status{font-size:12px;color:#0e7c7b}.spdg-btn:disabled{opacity:.45;cursor:default}@media print{#deliveryDialog,.delivery-stage{display:none!important}}
 `;document.head.appendChild(node);
}
function dialog(){
 css();let node=document.getElementById('deliveryDialog');if(node)return node;
 node=document.createElement('dialog');node.id='deliveryDialog';node.className='no-print';node.setAttribute('aria-labelledby','deliveryTitle');
 node.innerHTML='<h2 id="deliveryTitle">Prepare report delivery pack</h2><p id="deliveryMessage" role="status" aria-live="polite"></p><progress id="deliveryProgress" max="1" value="0" aria-label="Report generation progress"></progress><p class="delivery-note">Each student PDF fits one A4 page. The combined file has one page per student. Keep the class summary and complete pack with authorised academy staff.</p><div class="delivery-actions"><button id="deliveryReview" hidden>Review Excel problems</button><button id="deliveryProceed" hidden>Continue with warnings</button><button id="deliveryCancel">Cancel</button></div>';
 document.body.appendChild(node);return node;
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function prepare(root,context){
 if(window.ReportSections)ReportSections.apply(root,context.segment);
 if(window.VendorFooter)VendorFooter.stampReports(root);
 if(window.I18N)root.querySelectorAll('.sheet').forEach(el=>I18N.apply(el,context.language));
}
function summary(context){
 const source=document.createElement('div');source.innerHTML=context.overviewHTML();
 source.querySelectorAll('.view-head,.print-head,.no-print,button,select,input').forEach(n=>n.remove());
 const root=document.createElement('article');root.className='sheet delivery-summary';
 root.innerHTML=`<div class="sheet-inner"><header class="rep-head"><div><div class="delivery-academy">${esc(context.academy)}</div><div class="delivery-subtitle">Class summary · ${esc(context.batch)} · ${esc(context.year)}</div></div></header><div class="rep-sec">${source.innerHTML}</div><footer class="rep-foot">Class-level summary · ${esc(context.periods)} · Generated ${esc(new Date().toLocaleDateString())}</footer></div>`;
 return root;
}
async function build(context,{onProgress=()=>{},cancelled=()=>false}={}){
 if(!window.A4Print?.bundle||!window.XLSX?.CFB)throw Error('The report export libraries are unavailable. Reload the page and try again.');
 if(!context.students?.length)throw Error('This class has no students to export.');
 const stage=document.createElement('div');stage.className='delivery-stage no-print';stage.setAttribute('aria-hidden','true');document.body.appendChild(stage);
 let safe=null;
 try{
  const students=context.students.slice(),entries=[];
  students.forEach((student,i)=>{
   const holder=document.createElement('div');holder.innerHTML=context.reportHTML(student,'deliveryStudent'+i);
   const report=holder.querySelector('.sheet');if(!report)throw Error('Could not prepare the report for '+student.name+'.');
   report.id='deliveryStudent'+i;stage.appendChild(report);
   entries.push({student,file:`students/${String(i+1).padStart(4,'0')}_${student.roll!=null?'roll-'+filename(student.roll)+'_':''}${filename(student.name,'student')}.pdf`});
  });
  prepare(stage,context);
  if(window.PdfSafe)safe=await PdfSafe.inlineImages(stage);
  const reports=await A4Print.bundle(stage,{cancelled,onPage:(n,total)=>onProgress(n,total+1,`Preparing student report ${n} of ${total}…`)});
  if(cancelled())throw Error('Export cancelled. No incomplete pack was downloaded.');
  stage.replaceChildren(summary(context));prepare(stage,context);
  const summarySafe=window.PdfSafe?await PdfSafe.inlineImages(stage):null;
  let overview;try{overview=await A4Print.pdf(stage);}finally{summarySafe?.restore();}
  if(cancelled())throw Error('Export cancelled. No incomplete pack was downloaded.');
  onProgress(students.length+1,students.length+1,'Assembling your delivery ZIP…');
  const zip=XLSX.CFB.utils.cfb_new();
  const add=async(name,blob)=>XLSX.CFB.utils.cfb_add(zip,name,new Uint8Array(await blob.arrayBuffer()));
  for(let i=0;i<entries.length;i++)await add(entries[i].file,reports.individual[i]);
  await add('all-student-reports.pdf',reports.combined);await add('class-summary.pdf',overview);
  const index=[['No','Roll','Student','Class','Language','PDF file'],...entries.map((entry,i)=>[i+1,entry.student.roll??'',entry.student.name,context.batch,context.language,entry.file])];
  XLSX.CFB.utils.cfb_add(zip,'report-index.csv',new TextEncoder().encode('\uFEFF'+index.map(row=>row.map(csvCell).join(',')).join('\r\n')));
  const issues=context.issues||[];
  if(issues.length&&window.WorkbookChecks)XLSX.CFB.utils.cfb_add(zip,'workbook-problems.csv',new TextEncoder().encode(WorkbookChecks.csv(issues)));
  const readme=`REPORT DELIVERY PACK\n${context.demo?'DEMO — SAMPLE DATA\n':''}Academy: ${context.academy}\nClass / batch: ${context.batch}\nAcademic year: ${context.year}\nSegment: ${context.segment}\nReporting scope: ${context.periods}\nLanguage: ${context.language}\nStudents: ${students.length}\nGenerated: ${new Date().toISOString()}\n\nCONTENTS\n- students/: one single-page A4 PDF per student.\n- all-student-reports.pdf: the same reports in index order, one A4 page per student.\n- class-summary.pdf: one A4 class overview for academy staff.\n- report-index.csv: maps every student to their exact PDF filename.\n${issues.length?'- workbook-problems.csv: warnings to review before delivery.\n':''}\nDELIVERY\nCheck the reports before sharing. Send each family only their own student's PDF. The combined PDF, index, class summary and complete ZIP contain class records and are for authorised academy staff. Sharing is manual.\n\nRECORD KEEPING\nKeep a dated copy of this pack and the source workbook, with a separate backup. The app does not automatically archive this ZIP in cloud storage.\n${safe?.dropped?'\nIMAGE NOTE\n'+safe.dropped+' image(s) could not be embedded. Check logos/photos before delivery.\n':''}\nStunity Tech — by Prateek\n`;
  XLSX.CFB.utils.cfb_add(zip,'READ-ME.txt',new TextEncoder().encode(readme));
  const blob=new Blob([XLSX.CFB.write(zip,{type:'array',fileType:'zip',compression:true})],{type:'application/zip'});
  return {blob,filename:filename(context.academy,'academy')+'_'+filename(context.batch,'class')+'_'+context.segment+'_'+new Date().toISOString().slice(0,10)+'_report-pack.zip',count:students.length};
 }finally{safe?.restore();stage.remove();}
}
function mount(toolbar,getContext){
 if(!toolbar||toolbar.querySelector('[data-delivery-pack]'))return;css();
 const button=document.createElement('button');button.className='btn btn-primary';button.type='button';button.dataset.deliveryPack='';button.textContent='Download report pack (ZIP)';toolbar.appendChild(button);
 button.onclick=async()=>{
  if(running)return;const context=getContext(),node=dialog(),message=document.getElementById('deliveryMessage'),progress=document.getElementById('deliveryProgress'),cancel=document.getElementById('deliveryCancel'),review=document.getElementById('deliveryReview'),proceed=document.getElementById('deliveryProceed');
  context.issues=window.SPDGrid?SPDGrid.audit(context.sheets,context.warnings||[]):[];
  let cancelled=false,started=false;running=true;button.disabled=true;review.hidden=true;proceed.hidden=true;cancel.disabled=false;cancel.textContent='Cancel';progress.value=0;
  const finish=()=>{running=false;button.disabled=false;};
  cancel.onclick=()=>{if(started){cancelled=true;cancel.disabled=true;message.textContent='Cancelling after the current report…';}else{node.close();finish();}};
  node.oncancel=e=>{e.preventDefault();cancel.click();};
  review.onclick=()=>{node.close();finish();document.getElementById('editDataBtn')?.click();};
  async function start(){
   if(started)return;started=true;review.hidden=true;proceed.hidden=true;message.textContent='Preparing '+context.students.length+' student reports…';
   try{const result=await build(context,{cancelled:()=>cancelled,onProgress:(n,total,text)=>{progress.max=total;progress.value=n;message.textContent=text;}});if(cancelled)throw Error('Export cancelled. No incomplete pack was downloaded.');download(result.blob,result.filename);message.textContent=`Download ready: ${result.count} student PDFs, combined print file, class summary and index.`;}
   catch(err){message.textContent=err.message;}
   finally{started=false;cancel.disabled=false;cancel.textContent='Close';cancel.onclick=()=>node.close();node.oncancel=()=>{};finish();}
  }
  node.showModal();
  const errors=context.issues.filter(i=>i.level==='error').length;
  if(errors){message.textContent=`Fix ${errors} Excel error${errors===1?'':'s'} before creating this pack. The review shows the exact worksheets and cells.`;review.hidden=false;return;}
  if(context.issues.length){message.textContent=`There are ${context.issues.length} workbook warnings. Review them, or continue if the missing entries or other flagged values are intentional. The pack will include the issue list.`;review.hidden=false;proceed.hidden=false;proceed.onclick=start;return;}
  await start();
 };
}
window.DeliveryPack={mount,build,filename};
})();

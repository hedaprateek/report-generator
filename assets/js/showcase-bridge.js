/* Marketing frames have an opaque origin: they cannot access the academy cache. */
(function(){
'use strict';
if(!new URLSearchParams(location.search).has('showcase')||parent===window)return;
let token=null,busy=false,demoProfile=null;
const send=value=>parent.postMessage(value,'*');
function sanitize(source){
 const sheets=JSON.parse(JSON.stringify(source)),students=sheets.Students||[];
 const header=students.find(r=>r.some(v=>/^(Student Name|Name)$/i.test(String(v||''))));
 const names=[];if(header){const nameCol=header.findIndex(v=>/^(Student Name|Name)$/i.test(String(v||'')));for(const row of students.slice(students.indexOf(header)+1))if(row[nameCol])names.push(String(row[nameCol]));}
 const examples=['Asha Example','Rahul Example','Neha Example','Kabir Example','Meera Example','Arjun Example','Diya Example','Riya Example'];
 const replacements=names.map((name,i)=>[name,examples[i]||'Student '+(i+1)+' Example']).sort((a,b)=>b[0].length-a[0].length);
 for(const rows of Object.values(sheets))for(const row of rows)for(let i=0;i<row.length;i++)if(typeof row[i]==='string'){for(const [from,to]of replacements)row[i]=row[i].split(from).join(to);if(row[i]==='ACADEMY'&&i===0)row[1]=demoProfile.name;}
 if(header){const h=students.find(r=>r===header)||header;for(const row of students.slice(students.indexOf(h)+1))for(let c=0;c<h.length;c++){if(/photo|phone|email/i.test(String(h[c]||'')))row[c]=null;else if(/parent|guardian/i.test(String(h[c]||'')))row[c]='Example Family';}}
 return sheets;
}
function label(){
 document.querySelectorAll('.rep-head .doc,.print-head .doc').forEach(el=>{if(!el.textContent.includes('Sample data'))el.textContent+=' · Sample data';});
 document.querySelectorAll('.rep-foot').forEach(el=>el.textContent='Sample data for demonstration · '+demoProfile.name);
 document.querySelectorAll('.academy-contact').forEach(el=>el.remove());
}
window.addEventListener('message',async event=>{
 if(event.source!==parent||!event.data||event.data.type!=='academy-showcase')return;
 const message=event.data;
 if(message.action==='init'){
  token=message.token;demoProfile=message.profile;
  try{
   BRANDING={...demoProfile};AcademySettings.profile=()=>({...demoProfile});AcademySettings.decorate=()=>{};
   WORKBOOK_IS_DEMO=true;WORKBOOK_USER_STARTED=true;
   LAST_SHEETS=sanitize(SAMPLE_SHEETS);boot(detectBatches(LAST_SHEETS));
   switchView(message.view||'report');label();
   send({type:'academy-showcase-result',token,id:message.id,ready:true});
  }catch(err){send({type:'academy-showcase-result',token,id:message.id,error:err.message});}
  return;
 }
 if(message.token!==token||!demoProfile||busy)return;
 busy=true;
 try{
  switchView(message.view||'report');label();
  // Off-screen, cross-origin frames pause animation callbacks in Chromium.
  // Layout is measured synchronously; a timer lets the rendered DOM settle.
  await new Promise(resolve=>setTimeout(resolve,20));
  const root=document.querySelector(message.view==='overview'?'#v-overview':'#v-report .sheet');
  if(!root)throw Error('The sample report is not ready.');
  const styles=[...document.querySelectorAll('style,link[rel="stylesheet"]')].map(node=>node.outerHTML).join('\n');
  send({type:'academy-showcase-result',token,id:message.id,html:root.outerHTML,styles});
 }catch(err){send({type:'academy-showcase-result',token,id:message.id,error:err.message});}
 finally{busy=false;}
});
send({type:'academy-showcase-ready'});
})();

/* Change only explicit workbook colours. Never re-serialize spreadsheet data. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 else {root.TemplateThemes=api;api.install();}
})(typeof window==='object'?window:globalThis,function(){
'use strict';
const palettes={
 ocean:{name:'Ocean',description:'Blue, teal and violet',colours:['1D4ED8','0F766E','7C3AED','B45309','EFF6FF','F0FDFA','FAF5FF','FFFBEB','DBEAFE','CCFBF1','F3E8FF','FEF3C7']},
 forest:{name:'Forest',description:'Green, sky and rose',colours:['166534','0369A1','9F1239','854D0E','F0FDF4','F0F9FF','FFF1F2','FEFCE8','DCFCE7','E0F2FE','FFE4E6','FEF9C3']},
 plum:{name:'Plum',description:'Purple, rose and indigo',colours:['7E22CE','BE185D','4338CA','B45309','FAF5FF','FDF2F8','EEF2FF','FFFBEB','F3E8FF','FCE7F3','E0E7FF','FEF3C7']}
};
function recolour(bytes,theme,X){
 if(!palettes[theme])throw Error('Choose a template colour.');
 if(theme==='ocean')return new Uint8Array(bytes);
 if(!X?.CFB)throw Error('The Excel library is unavailable.');
 const zip=X.CFB.read(bytes,{type:'array'}),decoder=new TextDecoder(),encoder=new TextEncoder();
 const colours=new Map(palettes.ocean.colours.map((c,i)=>[c,palettes[theme].colours[i]]));
 zip.FileIndex.forEach((entry,i)=>{
  if(!/\/xl\/(?:styles\.xml|worksheets\/[^/]+\.xml)$/.test(zip.FullPaths[i]))return;
  const original=decoder.decode(new Uint8Array(entry.content));
  const xml=original.replace(/\brgb="([A-F\d]{2})([A-F\d]{6})"/gi,(all,alpha,rgb)=>colours.has(rgb.toUpperCase())?'rgb="'+alpha+colours.get(rgb.toUpperCase())+'"':all);
  if(xml!==original){entry.content=encoder.encode(xml);entry.size=entry.content.length;}
 });
 return new Uint8Array(X.CFB.write(zip,{type:'array',fileType:'zip',compression:true}));
}
function install(){
 const script=document.currentScript,library=script?.src?new URL('../vendor/xlsx.full.min.js',script.src).href:null;
 let dialog,source,previous,loading=null;
 function close(){if(dialog?.open)dialog.close();previous?.focus();}
 function mount(){
  if(dialog)return;
  const css=document.createElement('style');css.textContent=`
  .template-colours{box-sizing:border-box;width:min(560px,calc(100% - 28px));max-height:90vh;overflow:auto;padding:28px;border:1px solid #d8dfe8;border-radius:20px;background:#fff;color:#1f2a44;box-shadow:0 24px 80px #12243c33;font:14px/1.5 system-ui,sans-serif}
  .template-colours::backdrop{background:#17243880;backdrop-filter:blur(3px)}
  .template-colours h2{font:700 25px/1.2 Georgia,serif;margin:0 0 8px}.template-colours p{color:#556074;margin:0 0 20px}
  .tc-choices{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;border:0;margin:0;padding:0}.tc-choices legend{font-weight:650;margin-bottom:10px}
  .tc-option{display:block;position:relative;padding:12px 10px;border:2px solid #e2e8f0;border-radius:12px;cursor:pointer;text-align:center;background:#f8fafc}
  .tc-option:has(input:checked){border-color:#1d4ed8;background:#eff6ff}.tc-option:focus-within{outline:3px solid #93c5fd;outline-offset:2px}
  .tc-option input{position:absolute;top:8px;left:8px;accent-color:#1d4ed8}.tc-option b{display:block;margin:9px 0 2px}.tc-option small{display:block;font-size:11px;color:#556074;line-height:1.35}
  .tc-swatches{display:flex;height:40px;margin-top:14px;overflow:hidden;border-radius:6px}.tc-swatches i{flex:1}
  .tc-preview{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:22px 0 16px}.tc-block{border:1px solid #dce3ee;border-radius:8px;overflow:hidden}.tc-block strong{display:block;padding:8px 10px;font-size:12px;color:#fff}.tc-row{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;padding:9px 7px;font-size:9px;text-align:center;color:#243247}
  .tc-note{font-size:12px!important;margin-bottom:16px!important}.tc-actions{display:flex;justify-content:flex-end;gap:10px}.tc-actions button{font:600 14px system-ui,sans-serif;padding:11px 18px;border-radius:9px;border:1px solid #d8dfe8;cursor:pointer;background:#fff;color:#1f2a44}.tc-actions button[type=submit]{background:#1f2a44;color:#fff;border-color:#1f2a44}.tc-actions button:disabled{opacity:.6;cursor:wait}
  .tc-status{margin:12px 0 0!important;font-size:12px;min-height:18px}.tc-status:empty{display:none}
  @media(max-width:400px){.template-colours{padding:20px}.tc-option{padding:10px 6px}.tc-option small{font-size:10px}}
  @media print{.template-colours{display:none!important}}
  `;document.head.appendChild(css);
  dialog=document.createElement('dialog');dialog.className='template-colours no-print';dialog.setAttribute('aria-labelledby','tcTitle');
  dialog.innerHTML=`<form><h2 id="tcTitle">Choose your Excel colours</h2><p>Clear blocks for each test. A little colour to make filling marks easier.</p><fieldset class="tc-choices"><legend>Colour palette</legend>${Object.entries(palettes).map(([key,p])=>`<label class="tc-option"><input type="radio" name="theme" value="${key}" ${key==='ocean'?'checked':''}><span class="tc-swatches" aria-hidden="true">${p.colours.slice(0,3).map(c=>`<i style="background:#${c}"></i>`).join('')}</span><b>${p.name}</b><small>${p.description}</small></label>`).join('')}</fieldset><div class="tc-preview" aria-label="Preview of two test blocks"></div><p class="tc-note">Four subjects per test. Copy a subject column to add more. Fixed headings and totals stay protected.</p><div class="tc-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Download Excel</button></div><p class="tc-status" role="status" aria-live="polite"></p></form>`;
  document.body.appendChild(dialog);
  function preview(){const p=palettes[dialog.querySelector('input:checked').value];dialog.querySelector('.tc-preview').innerHTML=[0,1].map(i=>`<div class="tc-block"><strong style="background:#${p.colours[i]}">Test ${i+1}</strong><div class="tc-row" style="background:#${p.colours[i+4]}"><span>Subject 1</span><span>Subject 2</span><span>Subject 3</span><span>Subject 4</span></div></div>`).join('');}
  dialog.addEventListener('change',preview);preview();
  dialog.querySelector('[data-cancel]').addEventListener('click',close);
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
  dialog.addEventListener('close',()=>previous?.focus());
  dialog.querySelector('form').addEventListener('submit',async e=>{
   e.preventDefault();const button=dialog.querySelector('[type=submit]'),status=dialog.querySelector('.tc-status');button.disabled=true;button.textContent='Preparing…';status.textContent='';
   try{
    const theme=dialog.querySelector('input:checked').value;
    const response=await fetch(source);if(!response.ok)throw Error('The template could not be downloaded. Please try again.');
    let bytes=new Uint8Array(await response.arrayBuffer());
    if(theme!=='ocean'){
     if(!window.XLSX){
      if(!library)throw Error('The Excel library is unavailable.');
      if(!loading)loading=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=library;s.onload=resolve;s.onerror=()=>{loading=null;reject(Error('Could not load Excel colours. Try again or choose Ocean.'));};document.head.appendChild(s);});
      await loading;
     }
     bytes=recolour(bytes,theme,window.XLSX);
    }
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const a=document.createElement('a');a.href=url;a.download=decodeURIComponent(new URL(source).pathname.split('/').pop()).replace(/\.xlsx$/i,'_'+palettes[theme].name+'.xlsx');
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    try{localStorage.setItem('tesa-template-colour',theme);}catch{}close();
   }catch(err){status.textContent=err.message;}
   finally{button.disabled=false;button.textContent='Download Excel';}
  });
 }
 document.addEventListener('click',e=>{
  const link=e.target.closest?.('a[download]');
  if(!link||!new URL(link.href).pathname.includes('/assets/templates/')||!link.href.match(/\.xlsx(?:[?#]|$)/i)||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  if(typeof HTMLDialogElement==='undefined')return;
  e.preventDefault();mount();source=link.href;previous=link;
  const office=/\/office\//.test(new URL(source).pathname),early=/Pre_Primary/i.test(source);
  dialog.querySelector('.tc-note').textContent=office?'Coloured entry cells and clear headings. Fixed labels stay protected.':early?'Each evaluation cycle has its own coloured block. Fixed labels stay protected.':'Four subjects per test. Copy a subject column to add more. Fixed headings and totals stay protected.';
  let theme='ocean';try{theme=localStorage.getItem('tesa-template-colour')||theme;}catch{}
  const radio=dialog.querySelector('input[value="'+(palettes[theme]?theme:'ocean')+'"]');radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));
  dialog.querySelector('.tc-status').textContent='';dialog.showModal();
 });
}
return {palettes,recolour,install};
});

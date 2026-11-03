/* One academy profile for this browser. Legacy branding stays readable. */
(function(){
'use strict';
const base=new URL('../../',document.currentScript.src),PROFILE_KEY='spdAcademyProfile_v1',BRAND_KEY='spdBrandingOverrides_v1';
const showcase=new URLSearchParams(location.search).has('showcase');
const defaults={name:'The Extra Step Academy',shortName:'TESA',address:'Ichalkaranji',tagline:'',phone:'',email:'',website:'',logoFull:new URL('assets/images/tesa-logo-full.png',base).href,logoEmblem:new URL('assets/images/tesa-emblem.png',base).href};
function read(key,fallback){if(showcase)return fallback;try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'&&!Array.isArray(v)?v:fallback;}catch{return fallback;}}
function imageURL(value,fallback){if(typeof value!=='string'||!value)return fallback;if(/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/i.test(value))return value;try{const url=new URL(value.replace(/^\.\.\/assets\//,'assets/'),base);return /^(https?:|file:)$/.test(url.protocol)?url.href:fallback;}catch{return fallback;}}
function profile(){
 const legacy=read(BRAND_KEY,{}),saved=read(PROFILE_KEY,{}),p={...defaults,...legacy,...saved};
 for(const key of ['name','shortName','address','tagline','phone','email','website'])p[key]=typeof p[key]==='string'?p[key].trim().slice(0,key==='address'?400:160):defaults[key];
 p.name=p.name||defaults.name;p.logoFull=imageURL(p.logoFull,defaults.logoFull);p.logoEmblem=imageURL(p.logoEmblem,defaults.logoEmblem);return p;
}
function write(key,value){if(showcase)return;localStorage.setItem(key,JSON.stringify(value));}
function saveProfile(changes){
 const p={...profile(),...changes};if(!String(p.name||'').trim())throw Error('Enter an academy name.');
 for(const key of ['name','shortName','address','tagline','phone','email','website'])p[key]=String(p[key]||'').trim().slice(0,key==='address'?400:160);
 p.logoFull=imageURL(p.logoFull,defaults.logoFull);p.logoEmblem=imageURL(p.logoEmblem,defaults.logoEmblem);
 // A failed save must leave the previous profile available.
 const oldBrand=showcase?null:localStorage.getItem(BRAND_KEY);
 try{write(BRAND_KEY,{name:p.name,logoFull:p.logoFull,logoEmblem:p.logoEmblem});write(PROFILE_KEY,p);}
 catch(err){try{if(oldBrand===null)localStorage.removeItem(BRAND_KEY);else localStorage.setItem(BRAND_KEY,oldBrand);}catch{}throw Error('Could not save academy settings on this browser. Please free some storage and try again.');}
 window.dispatchEvent(new CustomEvent('academy-settings-changed',{detail:p}));return p;
}
function loadLabels(segment,defaults){const saved=read('spdSegmentSettings_v1:'+segment,{});return Object.fromEntries(Object.entries(saved).filter(([key,v])=>Object.hasOwn(defaults,key)&&typeof v===typeof defaults[key]));}
function saveLabels(segment,labels){try{write('spdSegmentSettings_v1:'+segment,labels);}catch{throw Error('Could not save report wording on this browser.');}}
async function resizeLogo(file){
 if(!file||!file.type.startsWith('image/'))throw Error('Choose an image for your academy logo.');
 const url=URL.createObjectURL(file);
 try{const img=new Image();img.src=url;await img.decode();const s=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*s);c.height=Math.round(img.naturalHeight*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/png');}finally{URL.revokeObjectURL(url);}
}
function contact(p=profile()){return [p.tagline,p.address,p.phone,p.email,p.website].filter(Boolean).join(' · ');}
function decorate(scope=document){
 const text=contact();scope.querySelectorAll('.rep-head .acad,.print-head .acad,.of-print-head .acad').forEach(acad=>{if(acad.closest('[data-academy-demo]'))return;let node=acad.parentElement.querySelector('.academy-contact');if(!text){node?.remove();return;}if(!node){node=document.createElement('div');node.className='academy-contact';node.style.cssText='font-size:9px;line-height:1.45;font-weight:400;color:#556074;margin-top:3px;max-width:115mm;overflow-wrap:anywhere';acad.parentElement.appendChild(node);}node.textContent=text;});
}
async function requestPersistence(){try{return !!(navigator.storage?.persist&&await navigator.storage.persist());}catch{return false;}}
function failure(message){let status=document.getElementById('academySaveStatus');if(!status){status=document.createElement('div');status.id='academySaveStatus';status.className='no-print';status.setAttribute('role','status');status.style.cssText='position:fixed;bottom:15px;left:15px;right:15px;padding:12px 16px;background:#fff7ed;border:1px solid #fdba74;color:#7c2d12;z-index:10000;border-radius:10px;font:13px/1.5 system-ui';document.body.appendChild(status);}status.textContent=message;}
function navigation(){
 const p=profile();document.querySelectorAll('#hubLogo').forEach(el=>{el.src=p.logoFull;el.alt=p.name+' logo';});
 document.querySelectorAll('[data-academy-name]').forEach(el=>el.textContent=p.name);
 if(showcase)return;
 const destinations=[document.querySelector('.topbar .top-right,.of-top-right'),document.querySelector('#landing .land-body,#landing .land-card,#ofLanding .of-land-body')].filter(Boolean);
 destinations.forEach(el=>{if(el.querySelector('.academy-settings-link'))return;const a=document.createElement('a');a.href=new URL('settings.html',base).href;a.className='mini-btn academy-settings-link no-print';a.textContent='Academy settings';a.style.cssText='display:inline-flex;margin:8px 4px;align-items:center';el.appendChild(a);});
}
window.AcademySettings={base:base.href,showcase,defaults,profile,saveProfile,loadLabels,saveLabels,resizeLogo,contact,decorate,requestPersistence,failure,read,write};
window.addEventListener('academy-settings-changed',()=>{navigation();decorate();});
window.addEventListener('storage',e=>{if(e.key===PROFILE_KEY||e.key===BRAND_KEY)window.dispatchEvent(new CustomEvent('academy-settings-changed',{detail:profile()}));});
function ready(){navigation();decorate();if(!showcase&&navigator.storage?.persisted)navigator.storage.persisted().then(ok=>{if(ok)return;/* Requested only by the explicit Save action. */}).catch(()=>{});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();

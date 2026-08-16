/* =====================================================================
   SPDBackup — one file that holds everything this device knows.

   The whole suite keeps its data in the browser, which is what makes the
   privacy promise real: nothing is uploaded. The cost is that a cleared
   cache, a reinstalled laptop or a dead hard disk takes a year of records
   with it, and there is nothing to restore from.

   This module turns all of that into a single portable file:

     · spdStudentMaster_v1   IndexedDB  the roster
     · spdWorkbookCache_v1   IndexedDB  every cached workbook + student photos
     · spdBrandingOverrides_v1  localStorage  logo / academy name / labels
     · tesaMeet_v1              localStorage  the sports meet in progress
     · pfSent_v1                localStorage  which parents have been sent files

   Deliberately plain JSON, not a zip: it needs no library, it can be opened
   and inspected in Notepad, and a file an academy cannot read is a file an
   academy will not trust. Workbook bytes are base64 — about a third larger
   than the raw file, which is a fair price for that.
   ===================================================================== */
(function(){
"use strict";

const FORMAT="tesa-academy-backup";
const VERSION=1;
const LAST_KEY="spdLastBackup_v1";

const MASTER_DB="spdStudentMaster_v1",MASTER_STORE="roster";
const CACHE_DB="spdWorkbookCache_v1",CACHE_STORE="workbooks",PHOTO_STORE="photoOverrides";
const LOCAL_KEYS=["spdBrandingOverrides_v1","tesaMeet_v1","pfSent_v1"];

/* ------------------------------------------------------------ encoding */
// Chunked: String.fromCharCode.apply blows the call stack somewhere around a
// hundred thousand arguments, and a cached workbook is comfortably larger.
function bytesToB64(buf){
  const b=buf instanceof Uint8Array?buf:new Uint8Array(buf);
  let s="";const CH=0x8000;
  for(let i=0;i<b.length;i+=CH)s+=String.fromCharCode.apply(null,b.subarray(i,i+CH));
  return btoa(s);
}
function b64ToBytes(str){
  const s=atob(str);const b=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);
  return b;
}
const isBinary=v=>v instanceof Uint8Array||v instanceof ArrayBuffer;

/* ------------------------------------------------------------- indexeddb */
function openDb(name,version,stores){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(name,version);
    req.onupgradeneeded=()=>{
      stores.forEach(s=>{if(!req.result.objectStoreNames.contains(s))req.result.createObjectStore(s);});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
// Returns [] rather than throwing when a store has never been created — a fresh
// device simply has nothing to back up, which is not an error.
function readStore(db,store){
  return new Promise(resolve=>{
    if(!db.objectStoreNames.contains(store))return resolve([]);
    try{
      const tx=db.transaction(store,"readonly"),os=tx.objectStore(store);
      const ks=os.getAllKeys(),vs=os.getAll();
      tx.oncomplete=()=>{
        const keys=ks.result||[],vals=vs.result||[];
        resolve(keys.map((k,i)=>({key:k,value:vals[i]})));
      };
      tx.onerror=()=>resolve([]);
    }catch(e){resolve([]);}
  });
}
function writeStore(db,store,rows){
  return new Promise((resolve,reject)=>{
    if(!db.objectStoreNames.contains(store))return resolve(0);
    const tx=db.transaction(store,"readwrite"),os=tx.objectStore(store);
    rows.forEach(r=>os.put(r.value,r.key));
    tx.oncomplete=()=>resolve(rows.length);
    tx.onerror=()=>reject(tx.error);
  });
}
function clearStore(db,store){
  return new Promise(resolve=>{
    if(!db.objectStoreNames.contains(store))return resolve();
    const tx=db.transaction(store,"readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete=resolve;tx.onerror=resolve;
  });
}

/* Workbook records are {filename,savedAt,bytes}; only `bytes` is binary.

   The type matters: an upload arrives from FileReader.readAsArrayBuffer, so the
   app caches an ArrayBuffer, while anything built in code tends to be a
   Uint8Array. Both read back fine, but a restore should hand back what it was
   given rather than quietly changing the shape of the record. */
const isAB=v=>v instanceof ArrayBuffer;
function encodeRow(r){
  const v=r.value;
  if(v&&typeof v==="object"&&isBinary(v.bytes))
    return {key:r.key,value:Object.assign({},v,
      {bytes:bytesToB64(v.bytes),_b64:true,_ab:isAB(v.bytes)})};
  if(isBinary(v))return {key:r.key,value:{_rawB64:bytesToB64(v),_ab:isAB(v)}};
  return r;
}
function decodeRow(r){
  const v=r.value;
  if(v&&typeof v==="object"&&v._b64){
    const u=b64ToBytes(v.bytes);
    const out=Object.assign({},v,{bytes:v._ab?u.buffer:u});
    delete out._b64;delete out._ab;
    return {key:r.key,value:out};
  }
  if(v&&typeof v==="object"&&v._rawB64){
    const u=b64ToBytes(v._rawB64);
    return {key:r.key,value:v._ab?u.buffer:u};
  }
  return r;
}

/* ---------------------------------------------------------------- read */
async function snapshot(){
  const out={
    format:FORMAT,version:VERSION,
    createdAt:new Date().toISOString(),
    origin:location.origin==="null"?"local file":location.origin,
    roster:[],workbooks:[],photos:[],local:{}
  };
  try{
    const db=await openDb(MASTER_DB,1,[MASTER_STORE]);
    out.roster=await readStore(db,MASTER_STORE);
    db.close();
  }catch(e){}
  try{
    const db=await openDb(CACHE_DB,2,[CACHE_STORE,PHOTO_STORE]);
    out.workbooks=(await readStore(db,CACHE_STORE)).map(encodeRow);
    out.photos=(await readStore(db,PHOTO_STORE)).map(encodeRow);
    db.close();
  }catch(e){}
  LOCAL_KEYS.forEach(k=>{
    try{const v=localStorage.getItem(k);if(v!=null)out.local[k]=v;}catch(e){}
  });
  return out;
}

/* Human-readable counts — used both to describe this device and to describe a
   backup file before it is allowed to overwrite anything. */
function summarize(snap){
  const s={students:0,workbooks:0,photos:0,branding:false,meet:null,sentTicks:0,bytes:0};
  if(!snap)return s;
  try{
    const rec=(snap.roster||[]).find(r=>r.key==="master");
    s.students=rec&&rec.value&&Array.isArray(rec.value.students)?rec.value.students.length:0;
  }catch(e){}
  s.workbooks=(snap.workbooks||[]).length;
  s.photos=(snap.photos||[]).length;
  s.workbookNames=(snap.workbooks||[]).map(r=>({
    key:r.key,
    filename:(r.value&&r.value.filename)||"(unnamed)",
    savedAt:(r.value&&r.value.savedAt)||null
  }));
  const L=snap.local||{};
  s.branding=!!L.spdBrandingOverrides_v1;
  if(L.tesaMeet_v1){
    try{const m=JSON.parse(L.tesaMeet_v1);s.meet=m&&m.name?m.name:"a meet";}catch(e){s.meet="a meet";}
  }
  if(L.pfSent_v1){
    try{const o=JSON.parse(L.pfSent_v1);s.sentTicks=Object.keys(o||{}).length;}catch(e){}
  }
  (snap.workbooks||[]).forEach(r=>{
    const b=r.value&&r.value.bytes;
    if(typeof b==="string")s.bytes+=Math.floor(b.length*0.75);
  });
  return s;
}

/* --------------------------------------------------------------- write */
function validate(snap){
  if(!snap||typeof snap!=="object")return "That file isn't readable.";
  if(snap.format!==FORMAT)return "That doesn't look like an academy backup file.";
  if(typeof snap.version!=="number"||snap.version>VERSION)
    return "That backup was made by a newer version of this tool.";
  return null;
}

// replace:true wipes each store first, so a restore leaves the device exactly as
// the file describes. Without it the file is merged over what is already here.
async function restore(snap,opts){
  opts=opts||{};
  const err=validate(snap);
  if(err)throw new Error(err);
  const done={roster:0,workbooks:0,photos:0,local:0};

  if((snap.roster||[]).length){
    const db=await openDb(MASTER_DB,1,[MASTER_STORE]);
    if(opts.replace)await clearStore(db,MASTER_STORE);
    done.roster=await writeStore(db,MASTER_STORE,snap.roster);
    db.close();
  }
  if((snap.workbooks||[]).length||(snap.photos||[]).length){
    const db=await openDb(CACHE_DB,2,[CACHE_STORE,PHOTO_STORE]);
    if(opts.replace){await clearStore(db,CACHE_STORE);await clearStore(db,PHOTO_STORE);}
    done.workbooks=await writeStore(db,CACHE_STORE,(snap.workbooks||[]).map(decodeRow));
    done.photos=await writeStore(db,PHOTO_STORE,(snap.photos||[]).map(decodeRow));
    db.close();
  }
  Object.keys(snap.local||{}).forEach(k=>{
    if(LOCAL_KEYS.indexOf(k)<0)return;          // never write a key we don't own
    try{localStorage.setItem(k,snap.local[k]);done.local++;}catch(e){}
  });
  return done;
}

/* --------------------------------------------------------------- files */
function suggestName(brandName){
  const d=new Date();
  const stamp=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const who=(brandName||"Academy").replace(/[^A-Za-z0-9]+/g,"_").replace(/^_|_$/g,"");
  return `${who}_Backup_${stamp}.json`;
}
async function download(brandName){
  const snap=await snapshot();
  const blob=new Blob([JSON.stringify(snap)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=suggestName(brandName);
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  try{localStorage.setItem(LAST_KEY,String(Date.now()));}catch(e){}
  return summarize(snap);
}
function readFile(file){
  return new Promise((resolve,reject)=>{
    const fr=new FileReader();
    fr.onload=()=>{
      try{resolve(JSON.parse(fr.result));}
      catch(e){reject(new Error("That file isn't valid JSON — it may have been edited or partly downloaded."));}
    };
    fr.onerror=()=>reject(new Error("Could not read that file."));
    fr.readAsText(file);
  });
}

/* Counts keys only — never touches workbook bytes. The hub calls this on every
   load to decide whether to warn, and must not pay for base64-encoding megabytes
   of cached spreadsheets to do it. */
async function quickStatus(){
  const out={students:0,workbooks:0,lastBackup:lastBackup()};
  const countKeys=(db,store)=>new Promise(resolve=>{
    if(!db.objectStoreNames.contains(store))return resolve(0);
    try{
      const r=db.transaction(store,"readonly").objectStore(store).getAllKeys();
      r.onsuccess=()=>resolve((r.result||[]).length);
      r.onerror=()=>resolve(0);
    }catch(e){resolve(0);}
  });
  try{
    const db=await openDb(MASTER_DB,1,[MASTER_STORE]);
    const rec=await new Promise(res=>{
      const r=db.transaction(MASTER_STORE,"readonly").objectStore(MASTER_STORE).get("master");
      r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null);
    });
    out.students=rec&&Array.isArray(rec.students)?rec.students.length:0;
    db.close();
  }catch(e){}
  try{
    const db=await openDb(CACHE_DB,2,[CACHE_STORE,PHOTO_STORE]);
    out.workbooks=await countKeys(db,CACHE_STORE);
    db.close();
  }catch(e){}
  out.hasData=out.students>0||out.workbooks>0;
  return out;
}

function lastBackup(){
  try{const v=localStorage.getItem(LAST_KEY);return v?Number(v):null;}catch(e){return null;}
}
function daysSinceBackup(){
  const t=lastBackup();
  return t?Math.floor((Date.now()-t)/86400000):null;
}

window.SPDBackup={
  FORMAT,VERSION,LAST_KEY,LOCAL_KEYS,
  snapshot,summarize,restore,validate,download,readFile,suggestName,
  quickStatus,lastBackup,daysSinceBackup
};
})();

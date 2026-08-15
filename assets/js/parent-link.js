/* =====================================================================
   ParentLink — a report as a link, without a server.

   The parent file works, but sending an .html attachment on WhatsApp is the
   weakest part of the whole suite: iPhones often open it in a preview that
   refuses to run scripts, and parents are wary of opening attachments at all.

   A link solves that — but a normal link means putting a child's marks on
   somebody's server, which is exactly what this suite refuses to do.

   The way out is the URL fragment. Everything after '#' is handled only by
   the browser and is NEVER sent to the web server: it does not appear in
   request logs, in access logs, or in the hosting provider's records. So the
   report travels inside the link itself, the page that renders it is a plain
   static file that receives nothing, and the privacy promise holds.

   What that costs, honestly:
     · the link is long — a few thousand characters
     · anyone who has the link can read the report, so it is exactly as
       private as the WhatsApp message it was sent in
     · nothing expires; a link works until the data in it is stale

   Compression uses the browser's built-in CompressionStream, so there is no
   library to load and nothing extra to keep offline.
   ===================================================================== */
(function(){
"use strict";

const PREFIX="r1";           // bumped if the payload shape ever changes
const canCompress=typeof CompressionStream!=="undefined";

/* base64url: '+/=' are all mangled or ambiguous inside a URL. */
function b64urlEncode(bytes){
  let s="";const CH=0x8000;
  for(let i=0;i<bytes.length;i+=CH)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+CH));
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64urlDecode(str){
  const s=atob(str.replace(/-/g,"+").replace(/_/g,"/"));
  const b=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);
  return b;
}
async function streamThrough(bytes,stream){
  const blob=new Blob([bytes]);
  const out=blob.stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/* The logo is a data URL and can be hundreds of kilobytes — ruinous in a link.
   The hosted viewer loads the academy logo from its own folder instead, so it
   is dropped here rather than carried. */
function slim(data){
  const d=Object.assign({},data);
  delete d.logo;
  return d;
}

async function encode(data){
  const json=JSON.stringify(slim(data));
  const raw=new TextEncoder().encode(json);
  let payload=raw,tag="u";                       // u = uncompressed
  if(canCompress){
    try{
      const z=await streamThrough(raw,new CompressionStream("deflate-raw"));
      if(z.length<raw.length){payload=z;tag="z";}
    }catch(e){/* fall back to uncompressed rather than fail to share */}
  }
  return PREFIX+tag+"."+b64urlEncode(payload);
}

async function decode(fragment){
  let s=String(fragment||"").replace(/^#/,"");
  if(!s)throw new Error("This link has no report in it.");
  if(s.slice(0,2)!==PREFIX)throw new Error("This link was made by a different version of the tool.");
  const tag=s[2],dot=s.indexOf(".");
  if(dot<0)throw new Error("This link looks incomplete — it may have been cut short when it was sent.");
  let bytes;
  try{bytes=b64urlDecode(s.slice(dot+1));}
  catch(e){throw new Error("This link looks incomplete — it may have been cut short when it was sent.");}
  if(tag==="z"){
    if(typeof DecompressionStream==="undefined")
      throw new Error("This browser is too old to open this link. Please try Chrome or Safari.");
    try{bytes=await streamThrough(bytes,new DecompressionStream("deflate-raw"));}
    catch(e){throw new Error("This link looks incomplete — it may have been cut short when it was sent.");}
  }
  try{return JSON.parse(new TextDecoder().decode(bytes));}
  catch(e){throw new Error("This link looks incomplete — it may have been cut short when it was sent.");}
}

/* Where the viewer lives. Running from a folder there is no address to give a
   parent, and the caller needs to be told that rather than handed a dead link. */
function viewerBase(){
  if(location.protocol==="file:")return null;
  // tools/parent-file.html -> parent.html at the site root
  return location.origin+location.pathname.replace(/\/tools\/[^/]*$/,"")+"/parent.html";
}
async function buildLink(data,baseOverride){
  const base=baseOverride||viewerBase();
  if(!base)throw new Error("no-host");
  return base+"#"+await encode(data);
}

// Long URLs survive browsers fine but some chat apps truncate or mangle them.
function lengthAdvice(url){
  const n=url.length;
  if(n<2000)return{level:"good",text:`${n.toLocaleString()} characters — safe everywhere.`};
  if(n<8000)return{level:"ok",text:`${n.toLocaleString()} characters — fine on WhatsApp, but long. Test it once before sending to many parents.`};
  return{level:"warn",text:`${n.toLocaleString()} characters — very long. Some apps may cut it. Send the file instead, or turn off the study plan and topic list.`};
}

window.ParentLink={encode,decode,buildLink,viewerBase,lengthAdvice,canCompress,PREFIX};
})();

/* =====================================================================
   TestCodec — how a student's answers travel back to the teacher.

   There is no server in this suite, so a submitted test cannot be POSTed
   anywhere. The return path is a short text code the student copies into
   WhatsApp, plus an optional answer file for anyone who prefers files.
   A code survives being pasted into any chat app on any phone, which a
   file attachment often does not.

   Two rules make this safe enough to grade on:

     Canonical form — the student may see questions and options shuffled,
     but answers are always mapped back to the original order and the
     original option letters before encoding. The evaluator therefore
     needs no seed, no shuffle map, nothing but the code.

     Checksum — a mangled or hand-edited paste is rejected rather than
     silently mis-scored. It is a typo guard, not security: anyone can
     craft a valid code, so exam-mode files never contain the key.

   The encoder is inlined verbatim into every generated test file via
   SOURCE, so the file and the evaluator cannot drift apart.
   ===================================================================== */
(function(){
"use strict";

function tcChecksum(str){
  // FNV-1a, 32-bit. Small, dependency-free, and plenty for catching a bad paste.
  let h=0x811c9dc5;
  for(let i=0;i<str.length;i++){
    h^=str.charCodeAt(i);
    h=Math.imul(h,0x01000193)>>>0;
  }
  return h.toString(36).slice(-4).padStart(4,"0");
}

function tcEncode(name,letters){
  const nm=String(name||"").trim().replace(/[~|]/g," ").slice(0,40);
  const ans=String(letters||"").toUpperCase().replace(/[^A-E-]/g,"");
  return "TQ1~"+nm+"~"+ans+"~"+tcChecksum(nm+"|"+ans);
}

function tcDecode(code){
  const raw=String(code||"").trim();
  // tolerate whatever a chat app does to it: line breaks, stray spaces, quotes
  const cleaned=raw.replace(/[\r\n]+/g," ").replace(/^["'\s]+|["'\s]+$/g,"");
  const m=cleaned.match(/TQ1~([^~]*)~([A-Ea-e-]*)~([0-9a-zA-Z]{4})/);
  if(!m)return{ok:false,reason:"That doesn't look like an answer code."};
  const nm=m[1].trim(),ans=m[2].toUpperCase(),sum=m[3];
  if(tcChecksum(nm+"|"+ans)!==sum)
    return{ok:false,reason:"This code looks damaged — it may have been cut short or edited."};
  return{ok:true,name:nm,letters:ans,answers:ans.split("").map(c=>c==="-"?null:c)};
}

const SOURCE=[tcChecksum,tcEncode,tcDecode].map(f=>f.toString()).join("\n");

window.TestCodec={checksum:tcChecksum,encode:tcEncode,decode:tcDecode,SOURCE};
})();

/* =====================================================================
   I18N — Hindi for the documents parents actually read.

   Scope, stated plainly: this translates the REPORT, not the whole app.
   Teachers and office staff drive the tools in English; the report card,
   its print, its PDF and its shared web page are what a family reads. That
   is where the language matters, and it is where the wording is stable
   enough to translate well.

   How it works, and why this way: the report markup lives across a dozen
   template functions in each of five ~1900-line segment files. Rewriting
   every one of them to call a translate() would be a large and risky edit.
   Instead this walks the RENDERED report and swaps whole strings it
   recognises. That means:
     · print, PDF and the exported web page are all translated for free,
       because each is built from this same DOM
     · switching back to English is just a re-render — nothing is lost
     · a student's name, a teacher's comment or a mark is never touched,
       because only exact matches of known interface phrases are replaced

   Devanagari needs a font that has it. Nirmala UI ships with Windows and
   Noto Sans Devanagari with most Android — both are already on the device,
   so nothing is downloaded and the offline promise holds.
   ===================================================================== */
(function(){
"use strict";

const KEY="spdReportLang_v1";

const LANGS=[
  {code:"en",label:"English"},
  {code:"hi",label:"हिंदी"},
  {code:"mr",label:"मराठी"}
];

/* Whole-phrase matches only. Nothing here is a word that could plausibly be a
   child's name, a subject, or something a teacher typed. */
const HI={
  // --- identity block ---
  "Student":"विद्यार्थी",
  "Roll No":"क्रमांक",
  "Class":"कक्षा",
  "Parent / Guardian":"अभिभावक",
  "Attendance":"उपस्थिति",
  "Generated":"तैयार",

  // --- document titles ---
  "Early Years Development Report":"प्रारंभिक बाल विकास रिपोर्ट",
  "Primary Progress Report":"प्राथमिक प्रगति रिपोर्ट",
  "Progress Report":"प्रगति रिपोर्ट",

  // --- section headings ---
  "What we covered this term":"इस सत्र में क्या पढ़ाया गया",
  "This term's snapshot":"इस सत्र का सारांश",
  "This term’s snapshot":"इस सत्र का सारांश",
  "Milestones":"विकास के पड़ाव",
  "Goals for next term":"अगले सत्र के लक्ष्य",
  "Skill checks":"कौशल आकलन",
  "Skill Checks":"कौशल आकलन",
  "Academic snapshot":"शैक्षणिक सारांश",
  "Beyond academics":"शिक्षा से परे",
  "Marks by test":"परीक्षावार अंक",
  "Progress Over Time":"समय के साथ प्रगति",
  "Note from the Teacher":"शिक्षक की टिप्पणी",
  "Teacher’s Note":"शिक्षक की टिप्पणी",
  "Teacher's Note":"शिक्षक की टिप्पणी",
  "Mentor’s Note":"मार्गदर्शक की टिप्पणी",
  "Mentor's Note":"मार्गदर्शक की टिप्पणी",
  "AI Evaluation":"स्वचालित मूल्यांकन",
  "How you can help at home":"घर पर आप कैसे सहयोग कर सकते हैं",

  // --- spotlights ---
  "Best At":"सबसे अच्छा",
  "Needs Attention":"ध्यान देने योग्य",
  "Teacher:":"शिक्षक:",
  "Teacher":"शिक्षक",
  "Suggestion:":"सुझाव:",
  "Suggestion":"सुझाव",

  // --- rating bands ---
  "Excellent":"उत्कृष्ट",
  "Good":"अच्छा",
  "Satisfactory":"संतोषजनक",
  "Needs Practice":"अभ्यास आवश्यक",
  "Not yet rated":"अभी मूल्यांकन नहीं",
  "Not yet assessed this cycle.":"इस चक्र में अभी आकलन नहीं हुआ।",

  // --- trends ---
  "Improving":"प्रगति पर",
  "Steady":"स्थिर",
  "Slipping":"गिरावट",

  // --- milestones ---
  "Achieved":"प्राप्त",
  "Not yet":"अभी नहीं",

  // --- signatures ---
  "Class Teacher":"कक्षा शिक्षक",
  "Academy Head":"प्राचार्य",
  "Subject Teacher":"विषय शिक्षक",
  "Principal":"प्राचार्य",

  // --- physical & health ---
  "Physical & health":"शारीरिक और स्वास्थ्य",
  "Height":"ऊँचाई",
  "Weight":"वज़न",
  "Blood group":"रक्त समूह",
  "Vision":"दृष्टि",
  "Allergies":"एलर्जी",
  "House":"सदन",
  "Date of birth":"जन्म तिथि",

  // --- projects ---
  "Projects & activities":"परियोजनाएँ और गतिविधियाँ",
  "Recently completed":"हाल ही में पूर्ण",
  "Coming up":"आगामी",

  // --- notes timeline (the Type column is teacher-typed, so the common ones) ---
  "Through the term":"पूरे सत्र में",
  "Observation":"अवलोकन",
  "Parent call":"अभिभावक से बातचीत",
  "Achievement":"उपलब्धि",
  "Concern":"चिंता",

  // --- the exported page's own furniture ---
  "Tap any area to see more detail.":"अधिक जानकारी के लिए किसी भी क्षेत्र पर टैप करें।"
};

/* Marathi is not Hindi with a different label. The vocabulary genuinely differs
   — a report is अहवाल not रिपोर्ट, a class इयत्ता not कक्षा, a parent पालक not
   अभिभावक — so this is a separate dictionary, not a copy with edits. */
const MR={
  // --- identity block ---
  "Student":"विद्यार्थी",
  "Roll No":"क्रमांक",
  "Class":"इयत्ता",
  "Parent / Guardian":"पालक",
  "Attendance":"उपस्थिती",
  "Generated":"तयार",

  // --- document titles ---
  "Early Years Development Report":"पूर्व-प्राथमिक विकास अहवाल",
  "Primary Progress Report":"प्राथमिक प्रगती अहवाल",
  "Progress Report":"प्रगती अहवाल",

  // --- section headings ---
  "What we covered this term":"या सत्रात काय शिकवले",
  "This term's snapshot":"या सत्राचा आढावा",
  "This term’s snapshot":"या सत्राचा आढावा",
  "Milestones":"विकासाचे टप्पे",
  "Goals for next term":"पुढील सत्राची उद्दिष्टे",
  "Skill checks":"कौशल्य तपासणी",
  "Skill Checks":"कौशल्य तपासणी",
  "Academic snapshot":"शैक्षणिक आढावा",
  "Beyond academics":"शिक्षणापलीकडे",
  "Marks by test":"चाचणीनुसार गुण",
  "Progress Over Time":"कालानुरूप प्रगती",
  "Note from the Teacher":"शिक्षकांची टिप्पणी",
  "Teacher’s Note":"शिक्षकांची टिप्पणी",
  "Teacher's Note":"शिक्षकांची टिप्पणी",
  "Mentor’s Note":"मार्गदर्शकांची टिप्पणी",
  "Mentor's Note":"मार्गदर्शकांची टिप्पणी",
  "AI Evaluation":"स्वयंचलित मूल्यांकन",
  "How you can help at home":"घरी तुम्ही कशी मदत करू शकता",

  // --- spotlights ---
  "Best At":"सर्वोत्तम",
  "Needs Attention":"लक्ष देण्याजोगे",
  "Teacher:":"शिक्षक:",
  "Teacher":"शिक्षक",
  "Suggestion:":"सूचना:",
  "Suggestion":"सूचना",

  // --- rating bands ---
  "Excellent":"उत्कृष्ट",
  "Good":"चांगले",
  "Satisfactory":"समाधानकारक",
  "Needs Practice":"सरावाची गरज",
  "Not yet rated":"अद्याप मूल्यांकन नाही",
  "Not yet assessed this cycle.":"या चक्रात अद्याप मूल्यांकन झालेले नाही.",

  // --- trends ---
  "Improving":"प्रगती होत आहे",
  "Steady":"स्थिर",
  "Slipping":"घसरण",

  // --- milestones ---
  "Achieved":"साध्य",
  "Not yet":"अद्याप नाही",

  // --- signatures ---
  "Class Teacher":"वर्गशिक्षक",
  "Academy Head":"मुख्याध्यापक",
  "Subject Teacher":"विषय शिक्षक",
  "Principal":"मुख्याध्यापक",

  // --- physical & health ---
  "Physical & health":"शारीरिक व आरोग्य",
  "Height":"उंची",
  "Weight":"वजन",
  "Blood group":"रक्तगट",
  "Vision":"दृष्टी",
  "Allergies":"ॲलर्जी",
  "House":"सदन",
  "Date of birth":"जन्मतारीख",

  // --- projects ---
  "Projects & activities":"प्रकल्प आणि उपक्रम",
  "Recently completed":"नुकतेच पूर्ण झालेले",
  "Coming up":"येणारे",

  // --- notes timeline (the Type column is teacher-typed, so the common ones) ---
  "Through the term":"सत्रभर",
  "Observation":"निरीक्षण",
  "Parent call":"पालकांशी संवाद",
  "Achievement":"यश",
  "Concern":"काळजी",

  // --- the exported page's own furniture ---
  "Tap any area to see more detail.":"अधिक माहितीसाठी कोणत्याही भागावर टॅप करा."
};

const DICT={hi:HI,mr:MR};

/* Devanagari fallbacks appended to whatever the report already uses, so the
   English typography is untouched and only missing glyphs fall through. */
/* Written against "any language that isn't English" rather than naming each
   one, so adding a third Devanagari language needs no CSS change. Hindi and
   Marathi share the script. */
const FONT_CSS=`
[data-lang]:not([data-lang="en"]),
[data-lang]:not([data-lang="en"]) *{
  font-family:"Nirmala UI","Noto Sans Devanagari","Mangal",
    system-ui,-apple-system,"Segoe UI",Roboto,sans-serif !important;
}
[data-lang]:not([data-lang="en"]) .serif,
[data-lang]:not([data-lang="en"]) h1,
[data-lang]:not([data-lang="en"]) h2,
[data-lang]:not([data-lang="en"]) .acad,
[data-lang]:not([data-lang="en"]) .doc{
  font-family:"Nirmala UI","Noto Sans Devanagari","Mangal",Georgia,serif !important;
}
/* Devanagari sits taller than Latin; a touch more leading stops it clipping */
[data-lang]:not([data-lang="en"]){line-height:1.65}
`;
function injectFont(){
  if(document.getElementById("i18nFont"))return;
  const s=document.createElement("style");
  s.id="i18nFont";s.textContent=FONT_CSS;
  document.head.appendChild(s);
}

function getLang(){
  try{return localStorage.getItem(KEY)||"en";}catch(e){return"en";}
}
function setLang(code){
  try{localStorage.setItem(KEY,code||"en");}catch(e){}
}

// "Best At: Reading" -> heading plus a value; translate only the part we know
function lookup(dict,text){
  const t=text.trim();
  if(!t)return null;
  if(dict[t])return text.replace(t,dict[t]);
  const c=t.indexOf(":");
  if(c>0){
    const head=t.slice(0,c).trim(),rest=t.slice(c+1);
    if(dict[head])return text.replace(t,dict[head]+":"+rest);
  }
  return null;
}

/* Walks text nodes under `root`. Skips <script>/<style>, and anything a user
   typed (contenteditable), which must never be rewritten. */
function apply(root,lang){
  if(!root)return 0;
  const dict=DICT[lang];
  root.setAttribute&&root.setAttribute("data-lang",lang||"en");
  if(!dict)return 0;                     // English: markup is already English
  injectFont();

  let n=0;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
    acceptNode(node){
      const p=node.parentNode;
      if(!p)return NodeFilter.FILTER_REJECT;
      const tag=p.nodeName;
      if(tag==="SCRIPT"||tag==="STYLE")return NodeFilter.FILTER_REJECT;
      if(p.closest&&p.closest("[contenteditable='true']"))return NodeFilter.FILTER_REJECT;
      return node.nodeValue.trim()?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;
    }
  });
  const jobs=[];
  let node;
  while((node=walker.nextNode()))jobs.push(node);
  for(const t of jobs){
    const out=lookup(dict,t.nodeValue);
    if(out!=null&&out!==t.nodeValue){t.nodeValue=out;n++;}
  }
  // labels a screen reader or tooltip would read
  root.querySelectorAll&&root.querySelectorAll("[title],[aria-label],[placeholder]").forEach(el=>{
    ["title","aria-label","placeholder"].forEach(a=>{
      const v=el.getAttribute(a);
      if(!v)return;
      const out=lookup(dict,v);
      if(out!=null&&out!==v){el.setAttribute(a,out);n++;}
    });
  });
  return n;
}

/* Which known phrases are still missing from a dictionary — used by the
   coverage check so gaps are visible rather than silently English. */
function missing(root,lang){
  const dict=DICT[lang]||{};
  const out=new Set();
  if(!root||!root.querySelectorAll)return[];
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null);
  let node;
  while((node=w.nextNode())){
    const t=(node.nodeValue||"").trim();
    if(t.length<3||t.length>60)continue;
    if(!/[A-Za-z]/.test(t))continue;          // already translated, or a number
    if(!dict[t])out.add(t);
  }
  return[...out];
}

window.I18N={LANGS,DICT,apply,missing,getLang,setLang,injectFont};
})();

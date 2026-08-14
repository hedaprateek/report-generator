/* =====================================================================
   RevisionPlan — turns "here is where you are weak" into "here is what to
   do on Tuesday".

   Every other tool in this suite diagnoses. This one prescribes, which is
   the part parents actually value and the part competitors can't copy
   without topic-level marks.

   Two ideas do the real work:

     Weakness weighting — study time is finite, so it is handed out in
     proportion to how far below par a topic sits, not evenly. A topic at
     40% earns roughly three times the slots of one at 80%.

     Spaced repetition — the weakest topics are deliberately scheduled
     twice: once early enough to fix, and again close to the exam so it
     survives. Cramming a topic once and never returning to it is exactly
     how students lose marks they had already recovered.
   ===================================================================== */
(function(){
"use strict";

const MS_DAY=86400000;
function startOfDay(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}

/* topics: [{subject,topic,avg,n}]  (avg 0-100, lower = weaker)
   opts: {from, examDate, sessionsPerWeek, maxWeeks, target}
   returns {weeks:[{n,start,end,label,items:[...],focus}], summary:{...}} */
function build(topics,opts){
  opts=opts||{};
  const from=startOfDay(opts.from||new Date());
  const exam=opts.examDate?startOfDay(opts.examDate):null;
  const sessionsPerWeek=Math.max(1,Math.min(14,opts.sessionsPerWeek||4));
  const target=opts.target!=null?opts.target:80;

  const list=(topics||[]).filter(t=>t&&t.topic&&t.avg!=null);
  if(!list.length)return{weeks:[],summary:{reason:"no-topics"}};

  // how many whole weeks we actually have; the final week is reserved for
  // consolidation rather than new ground
  let weeks;
  if(exam){
    const days=Math.ceil((exam-from)/MS_DAY);
    if(days<=0)return{weeks:[],summary:{reason:"exam-passed"}};
    weeks=Math.max(1,Math.min(opts.maxWeeks||12,Math.ceil(days/7)));
  }else weeks=Math.min(opts.maxWeeks||6,6);

  // A topic already at or above target still deserves a light touch, hence the
  // floor — otherwise a strong student gets an empty plan, which reads as neglect.
  const weighted=list.map(t=>({...t,gap:Math.max(4,target-t.avg)}));
  const totalGap=weighted.reduce((a,t)=>a+t.gap,0);

  const planningWeeks=weeks>1?weeks-1:1;   // last week = consolidation
  const slots=planningWeeks*sessionsPerWeek;

  // proportional allocation, then hand out the rounding remainder to the weakest
  let alloc=weighted.map(t=>{
    const exact=slots*(t.gap/totalGap);
    return{...t,exact,count:Math.floor(exact)};
  });
  let used=alloc.reduce((a,t)=>a+t.count,0);
  alloc.sort((a,b)=>(b.exact-b.count)-(a.exact-a.count)||a.avg-b.avg);
  let i=0;
  while(used<slots&&alloc.length){alloc[i%alloc.length].count++;used++;i++;}
  // everything gets at least one look
  alloc.forEach(t=>{if(t.count<1)t.count=1;});

  // Build the queue weakest-first, but interleave subjects so a week is never
  // three hours of the same paper — variety is what makes a plan survivable.
  alloc.sort((a,b)=>a.avg-b.avg);
  const queues={};
  alloc.forEach(t=>{
    (queues[t.subject]=queues[t.subject]||[]).push(...Array(t.count).fill(t));
  });
  const subjectOrder=Object.keys(queues).sort((a,b)=>{
    const wa=Math.min(...queues[a].map(t=>t.avg)),wb=Math.min(...queues[b].map(t=>t.avg));
    return wa-wb;
  });
  const queue=[];
  let more=true;
  while(more){
    more=false;
    subjectOrder.forEach(s=>{if(queues[s].length){queue.push(queues[s].shift());more=true;}});
  }

  // the weakest few come back in the final week
  const revisit=[...alloc].sort((a,b)=>a.avg-b.avg).slice(0,Math.min(4,alloc.length));

  const out=[];
  for(let w=0;w<weeks;w++){
    const start=addDays(from,w*7),end=addDays(start,6);
    const isLast=w===weeks-1&&weeks>1;
    const items=[];
    if(isLast){
      revisit.forEach(t=>items.push({subject:t.subject,topic:t.topic,avg:t.avg,
        kind:"revisit",note:"Second pass — check it has stuck"}));
      items.push({subject:"All subjects",topic:"Full-length practice paper under timed conditions",
        avg:null,kind:"mock",note:"Simulate the real exam, then mark it honestly"});
    }else{
      for(let s=0;s<sessionsPerWeek;s++){
        const t=queue.shift();
        if(!t)break;
        items.push({subject:t.subject,topic:t.topic,avg:t.avg,kind:"study",
          note:t.avg<40?"Start from the basics — this one needs rebuilding, not revising"
             :t.avg<60?"Work through solved examples, then attempt past questions"
             :t.avg<target?"Mostly there — drill the question types that catch you out"
             :"Quick confidence pass"});
      }
    }
    out.push({n:w+1,start,end,
      label:isLast?"Final week — consolidate":`Week ${w+1}`,
      focus:isLast?"Revisit and rehearse":items.length?items[0].subject:"—",
      items});
  }

  const weakest=alloc[0];
  return{weeks:out,
    summary:{topics:list.length,weeks,sessionsPerWeek,target,
      weakest:weakest?{subject:weakest.subject,topic:weakest.topic,avg:weakest.avg}:null,
      totalSessions:out.reduce((a,w)=>a+w.items.filter(i=>i.kind!=="mock").length,0),
      examDate:exam}};
}

window.RevisionPlan={build};
})();

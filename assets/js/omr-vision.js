/* =====================================================================
   OMRVision — reads a filled answer sheet from a photo or scan.

   The trick that makes this tractable: the designer exports the exact
   millimetre coordinate of every bubble it drew. So this module never has
   to *find* bubbles or infer a grid. It only has to work out where the
   page sits inside the image, and then look each coordinate up.

   Pipeline
     1. greyscale + integral image (for fast local statistics)
     2. Otsu threshold -> binary
     3. locate the four corner fiducial squares by connected components
     4. solve the homography page-mm -> image-pixels
     5. sample a disc at each bubble centre, measure darkness
     6. per question: pick the darkest option, judge it against its
        siblings, and say honestly when the answer is not clear

   Everything is deliberately explicit about uncertainty: a sheet that
   cannot be read reliably must say so, not invent a score.
   ===================================================================== */
(function(){
"use strict";

/* --------------------------------------------------------- image basics */
function toGray(imgData){
  const {width:w,height:h,data:d}=imgData;
  const g=new Uint8ClampedArray(w*h);
  for(let i=0,p=0;i<d.length;i+=4,p++){
    // luma weights — a blue ballpoint mark must read as dark as a pencil one
    g[p]=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)|0;
  }
  return{w,h,g};
}
function otsu(g){
  const hist=new Array(256).fill(0);
  for(let i=0;i<g.length;i++)hist[g[i]]++;
  const total=g.length;
  let sum=0;for(let t=0;t<256;t++)sum+=t*hist[t];
  let sumB=0,wB=0,best=0,thr=128;
  for(let t=0;t<256;t++){
    wB+=hist[t];if(!wB)continue;
    const wF=total-wB;if(!wF)break;
    sumB+=t*hist[t];
    const mB=sumB/wB,mF=(sum-sumB)/wF;
    const between=wB*wF*(mB-mF)*(mB-mF);
    if(between>best){best=between;thr=t;}
  }
  return thr;
}
function downscale(gray,maxDim){
  const{w,h,g}=gray;
  const scale=Math.min(1,maxDim/Math.max(w,h));
  if(scale>=1)return{w,h,g,scale:1};
  const nw=Math.max(1,Math.round(w*scale)),nh=Math.max(1,Math.round(h*scale));
  const out=new Uint8ClampedArray(nw*nh);
  const bx=w/nw,by=h/nh;
  for(let y=0;y<nh;y++){
    const y0=Math.floor(y*by),y1=Math.min(h,Math.max(y0+1,Math.floor((y+1)*by)));
    for(let x=0;x<nw;x++){
      const x0=Math.floor(x*bx),x1=Math.min(w,Math.max(x0+1,Math.floor((x+1)*bx)));
      let s=0,n=0;
      for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){s+=g[yy*w+xx];n++;}
      out[y*nw+x]=n?(s/n)|0:255;
    }
  }
  return{w:nw,h:nh,g:out,scale:nw/w};
}

/* ------------------------------------------------- fiducial detection */
// Connected components over dark pixels, then keep blobs that look like a
// filled square: plausible size, roughly square, and mostly solid.
function findBlobs(bin,w,h,minPx,maxPx){
  const seen=new Uint8Array(w*h),blobs=[];
  const qx=new Int32Array(w*h),qy=new Int32Array(w*h);
  for(let sy=0;sy<h;sy++){
    for(let sx=0;sx<w;sx++){
      const si=sy*w+sx;
      if(seen[si]||!bin[si])continue;
      let head=0,tail=0;
      qx[tail]=sx;qy[tail]=sy;tail++;seen[si]=1;
      let minX=sx,maxX=sx,minY=sy,maxY=sy,count=0,sumX=0,sumY=0;
      while(head<tail){
        const x=qx[head],y=qy[head];head++;
        count++;sumX+=x;sumY+=y;
        if(x<minX)minX=x;if(x>maxX)maxX=x;
        if(y<minY)minY=y;if(y>maxY)maxY=y;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;
          const nx=x+dx,ny=y+dy;
          if(nx<0||ny<0||nx>=w||ny>=h)continue;
          const ni=ny*w+nx;
          if(seen[ni]||!bin[ni])continue;
          seen[ni]=1;qx[tail]=nx;qy[tail]=ny;tail++;
        }
      }
      if(count<minPx||count>maxPx)continue;
      const bw=maxX-minX+1,bh=maxY-minY+1;
      const aspect=bw/bh, fill=count/(bw*bh);
      if(aspect<0.55||aspect>1.8)continue;   // squarish
      if(fill<0.6)continue;                  // solid, not an outline or letter
      blobs.push({cx:sumX/count,cy:sumY/count,count,bw,bh,fill});
    }
  }
  return blobs;
}
function pickCorners(blobs,w,h){
  if(blobs.length<4)return null;
  const corners=[[0,0],[w,0],[0,h],[w,h]];
  const chosen=[],used=new Set();
  for(const[cxT,cyT]of corners){
    let best=-1,bestD=Infinity;
    blobs.forEach((b,i)=>{
      if(used.has(i))return;
      const d=(b.cx-cxT)**2+(b.cy-cyT)**2;
      if(d<bestD){bestD=d;best=i;}
    });
    if(best<0)return null;
    used.add(best);chosen.push(blobs[best]);
  }
  // sanity: the four picks must actually straddle the frame, otherwise we
  // locked onto four blobs clustered in one region and the read would be garbage
  const xs=chosen.map(c=>c.cx),ys=chosen.map(c=>c.cy);
  if(Math.max(...xs)-Math.min(...xs)<w*0.35)return null;
  if(Math.max(...ys)-Math.min(...ys)<h*0.35)return null;
  return chosen; // TL,TR,BL,BR
}

/* ------------------------------------------------------- homography */
// Solve the 8 unknowns of a plane-to-plane projective map with Gaussian
// elimination. src/dst are 4 points each, in matching order.
function solveHomography(src,dst){
  const A=[],b=[];
  for(let i=0;i<4;i++){
    const{x:sx,y:sy}=src[i],{x:dx,y:dy}=dst[i];
    A.push([sx,sy,1,0,0,0,-sx*dx,-sy*dx]);b.push(dx);
    A.push([0,0,0,sx,sy,1,-sx*dy,-sy*dy]);b.push(dy);
  }
  const n=8;
  for(let col=0;col<n;col++){
    let piv=col;
    for(let r=col+1;r<n;r++)if(Math.abs(A[r][col])>Math.abs(A[piv][col]))piv=r;
    if(Math.abs(A[piv][col])<1e-9)return null;
    if(piv!==col){const t=A[piv];A[piv]=A[col];A[col]=t;const tb=b[piv];b[piv]=b[col];b[col]=tb;}
    for(let r=0;r<n;r++){
      if(r===col)continue;
      const f=A[r][col]/A[col][col];
      if(!f)continue;
      for(let c=col;c<n;c++)A[r][c]-=f*A[col][c];
      b[r]-=f*b[col];
    }
  }
  const hv=[];
  for(let i=0;i<n;i++)hv.push(b[i]/A[i][i]);
  hv.push(1);
  return hv; // [h0..h8]
}
function applyH(H,x,y){
  const d=H[6]*x+H[7]*y+H[8];
  return{x:(H[0]*x+H[1]*y+H[2])/d,y:(H[3]*x+H[4]*y+H[5])/d};
}

/* --------------------------------------------------------- sampling */
// Mean intensity over a disc, slightly inset so a heavy printed outline
// doesn't get mistaken for a pencil mark.
function sampleDisc(gray,cx,cy,r){
  const{w,h,g}=gray;
  const rr=Math.max(1.2,r);
  const x0=Math.max(0,Math.floor(cx-rr)),x1=Math.min(w-1,Math.ceil(cx+rr));
  const y0=Math.max(0,Math.floor(cy-rr)),y1=Math.min(h-1,Math.ceil(cy+rr));
  let sum=0,n=0,dark=0;
  const r2=rr*rr;
  for(let y=y0;y<=y1;y++){
    for(let x=x0;x<=x1;x++){
      const dx=x-cx,dy=y-cy;
      if(dx*dx+dy*dy>r2)continue;
      const v=g[y*w+x];sum+=v;n++;
      if(v<128)dark++;
    }
  }
  return n?{mean:sum/n,coverage:dark/n,n}:{mean:255,coverage:0,n:0};
}

/* ------------------------------------------------------------ read */
/* opts:
     fillThreshold  0..1 how much of the disc must be dark to count as filled
     marginRatio    how much clearer the winner must be than the runner-up
*/
function readSheet(imgData,def,opts){
  opts=opts||{};
  const fillThreshold=opts.fillThreshold!=null?opts.fillThreshold:0.35;
  const marginRatio=opts.marginRatio!=null?opts.marginRatio:0.55;

  const grayFull=toGray(imgData);
  const small=downscale(grayFull,900);
  const thr=otsu(small.g);
  const bin=new Uint8Array(small.w*small.h);
  for(let i=0;i<small.g.length;i++)bin[i]=small.g[i]<thr?1:0;

  // A fiducial is ~5mm on a 210mm page; allow a wide band for zoom/crop variation.
  const pageMin=Math.min(small.w,small.h);
  const expected=(def.fiducialSize||5)/Math.max(def.page.w,def.page.h)*Math.max(small.w,small.h);
  const area=expected*expected;
  const blobs=findBlobs(bin,small.w,small.h,Math.max(6,area*0.15),Math.max(400,area*12));
  const corners=pickCorners(blobs,small.w,small.h);
  if(!corners)return{ok:false,reason:"Could not find the four corner marks. Make sure the whole sheet is in frame, reasonably lit, and printed from the current designer."};

  const s=1/small.scale;
  const dst=corners.map(c=>({x:c.cx*s,y:c.cy*s}));
  const src=def.fiducials.map(f=>({x:f.x,y:f.y}));
  const H=solveHomography(src,dst);
  if(!H)return{ok:false,reason:"The corner marks were found but don't form a readable page shape — try a straighter photo."};

  // millimetre -> pixel scale, for turning bubble radius into a sampling disc
  const p0=applyH(H,0,0),p1=applyH(H,10,0),p2=applyH(H,0,10);
  const mmPxX=Math.hypot(p1.x-p0.x,p1.y-p0.y)/10;
  const mmPxY=Math.hypot(p2.x-p0.x,p2.y-p0.y)/10;
  const mmPx=(mmPxX+mmPxY)/2;
  if(!isFinite(mmPx)||mmPx<=0.3)return{ok:false,reason:"The sheet appears too small in this image to read reliably. Move closer or scan at a higher resolution."};

  // Group by qid, not the printed number: question numbering restarts in every
  // subject, so "Q1" alone names three different questions on a three-subject sheet.
  const byQ={};
  def.bubbles.forEach((b,i)=>{
    const id=b.qid!=null?b.qid:(b.subject+"|"+b.q);
    (byQ[id]=byQ[id]||[]).push(b);
  });
  const order=Object.keys(byQ).sort((a,b)=>{
    const na=Number(a),nb=Number(b);
    return (isFinite(na)&&isFinite(nb))?na-nb:String(a).localeCompare(String(b));
  });

  const answers={},detail={},flags=[];
  let lowContrast=0,totalQ=0;
  order.forEach(q=>{
    totalQ++;
    const list=byQ[q];
    const reads=list.map(b=>{
      const p=applyH(H,b.x,b.y);
      const r=Math.max(1.5,b.r*mmPx*0.72); // inset from the printed ring
      const sm=sampleDisc(grayFull,p.x,p.y,r);
      return{option:b.option,subject:b.subject,coverage:sm.coverage,mean:sm.mean};
    });
    const sorted=[...reads].sort((a,b)=>b.coverage-a.coverage);
    const top=sorted[0],second=sorted[1]||{coverage:0};
    let picked=null,state="blank";
    if(top.coverage>=fillThreshold){
      // a clear winner must beat the runner-up by a decent margin, otherwise the
      // student has shaded two bubbles or erased badly — either way, don't guess
      if(second.coverage>=fillThreshold&&second.coverage>top.coverage*marginRatio){
        state="multiple";
        flags.push({q,type:"multiple",detail:`${top.option} and ${second.option} both marked`});
      }else{
        state="ok";picked=top.option;
      }
    }else if(top.coverage>=fillThreshold*0.55){
      state="faint";
      flags.push({q,type:"faint",detail:`faint mark on ${top.option}`});
      lowContrast++;
    }
    answers[q]=picked;
    detail[q]={state,picked,subject:list[0].subject,label:list[0].q,
      reads:reads.map(r=>({option:r.option,coverage:+r.coverage.toFixed(3)}))};
  });

  const unreadable=flags.filter(f=>f.type==="multiple").length;
  const confidence=totalQ?Math.max(0,1-(unreadable*1.5+lowContrast)/totalQ):0;
  return{ok:true,answers,detail,flags,confidence,
    corners:dst,mmPx,
    stats:{questions:totalQ,answered:Object.values(answers).filter(Boolean).length,
      multiple:unreadable,faint:lowContrast}};
}

/* --------------------------------------------------------- scoring */
function score(read,key,subjects,marking){
  marking=marking||{correct:null,wrong:0,blank:0};
  const perSubject={};
  let correct=0,wrong=0,blank=0,total=0;
  const marksOf={};(subjects||[]).forEach(s=>{marksOf[s.name]=s.marks||1;});
  Object.keys(read.answers).map(Number).sort((a,b)=>a-b).forEach(q=>{
    const given=read.answers[q],want=key[q];
    const subj=read.detail[q].subject||"—";
    if(!perSubject[subj])perSubject[subj]={correct:0,wrong:0,blank:0,marks:0,max:0};
    const per=marking.correct!=null?marking.correct:(marksOf[subj]||1);
    perSubject[subj].max+=per;
    if(!want){ // no key for this question — cannot be judged either way
      perSubject[subj].max-=per;
      return;
    }
    total++;
    if(!given){blank++;perSubject[subj].blank++;perSubject[subj].marks+=marking.blank||0;}
    else if(given===want){correct++;perSubject[subj].correct++;perSubject[subj].marks+=per;}
    else{wrong++;perSubject[subj].wrong++;perSubject[subj].marks+=marking.wrong||0;}
  });
  const marks=Object.values(perSubject).reduce((a,s)=>a+s.marks,0);
  const max=Object.values(perSubject).reduce((a,s)=>a+s.max,0);
  return{correct,wrong,blank,total,marks,max,
    pct:max>0?marks/max*100:null,perSubject};
}

window.OMRVision={readSheet,score,solveHomography,applyH,toGray,otsu,downscale,findBlobs,pickCorners};
})();

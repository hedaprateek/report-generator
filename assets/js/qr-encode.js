/* =====================================================================
   QREncode — QR codes generated on this device, by this file.

   Every easy way to make a QR code betrays the promise the rest of this
   suite makes. The popular image endpoints (api.qrserver.com, Google's old
   chart API) work by sending your text to somebody else's server and
   getting a picture back — so a parent's phone number, a fee link or a
   child's report URL would leave the device just to become a square.

   So this encodes QR symbols from scratch: ISO/IEC 18004, versions 1-40,
   all four error-correction levels, numeric / alphanumeric / byte modes,
   Reed-Solomon over GF(256), all eight masks scored by the standard
   penalty rules. About 10KB, no network, no library, works offline.

   Nothing here is clever — it is the specification, written out. The parts
   worth knowing:

     · The tables are only TWO numbers per (version, level): how many EC
       codewords each block carries and how many blocks there are. The
       usual five-column capacity table is redundant — the block split is
       arithmetic, and the total codeword count is derivable by counting
       the modules no function pattern claimed. Fewer numbers typed by
       hand means fewer numbers typed wrong.

     · Mode is chosen for the whole payload rather than per segment. Mixed
       segment optimisation would squeeze a few versions smaller on some
       inputs; it is a lot of subtle code for a gain nobody scanning a
       poster will notice.
   ===================================================================== */
(function(){
"use strict";

/* ---------------------------------------------------------------- tables */
/* EC codewords per block, and number of blocks, for versions 1..40.
   Cross-checked in the tests against the published data-codeword counts:
   any typo here shows up as a capacity mismatch rather than a bad QR. */
const ECB={
 L:[ 7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,
    28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
 M:[10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,
    26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
 Q:[13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,
    28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
 H:[17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,
    30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
};
const NB={
 L:[1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,
    8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
 M:[1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,
    17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
 Q:[1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,
    23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
 H:[1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,
    25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
};
/* Centre coordinates of the alignment patterns, per version. */
const ALIGN=[
 [],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50],
 [6,30,54],[6,32,58],[6,34,62],[6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],
 [6,30,56,82],[6,30,58,86],[6,34,62,90],[6,28,50,72,94],[6,26,50,74,98],
 [6,30,54,78,102],[6,28,54,80,106],[6,32,58,84,110],[6,30,58,86,114],
 [6,34,62,90,118],[6,26,50,74,98,122],[6,30,54,78,102,126],[6,26,52,78,104,130],
 [6,30,56,82,108,134],[6,34,60,86,112,138],[6,30,58,86,114,142],[6,34,62,90,118,146],
 [6,30,54,78,102,126,150],[6,24,50,76,102,128,154],[6,28,54,80,106,132,158],
 [6,32,58,84,110,136,162],[6,26,54,82,110,138,166],[6,30,58,86,114,142,170]
];
const FMT_EC={L:1,M:0,Q:3,H:2};          // the 2-bit level field, not 0..3
const ALNUM="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

/* ------------------------------------------------------------- GF(256) */
const EXP=new Uint8Array(512),LOG=new Uint8Array(256);
(function(){
  let x=1;
  for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&0x100)x^=0x11D;}
  for(let i=255;i<512;i++)EXP[i]=EXP[i-255];
})();
const gmul=(a,b)=>(a&&b)?EXP[LOG[a]+LOG[b]]:0;

/* Generator polynomial for n EC codewords: product of (x - a^i). */
function rsGen(n){
  let g=[1];
  for(let i=0;i<n;i++){
    const out=new Array(g.length+1).fill(0);
    for(let j=0;j<g.length;j++){
      out[j]^=g[j];                     // g[j] * x
      out[j+1]^=gmul(g[j],EXP[i]);      // g[j] * a^i
    }
    g=out;
  }
  return g;
}
const GEN_CACHE={};
function rsEncode(data,n){
  const g=GEN_CACHE[n]||(GEN_CACHE[n]=rsGen(n));
  const buf=new Uint8Array(data.length+n);
  buf.set(data);
  for(let i=0;i<data.length;i++){
    const f=buf[i];
    if(!f)continue;
    for(let j=0;j<=n;j++)buf[i+j]^=gmul(g[j],f);
  }
  return buf.slice(data.length);
}

/* -------------------------------------------------------- function map */
/* Which modules are claimed by finders, timing, alignment, format and
   version information — and what they hold. Everything not claimed here
   carries data, so this is also how the codeword capacity is counted. */
const MAP_CACHE={};
function functionMap(version){
  if(MAP_CACHE[version])return MAP_CACHE[version];
  const size=17+4*version;
  const m=[],res=[];
  for(let i=0;i<size;i++){m.push(new Uint8Array(size));res.push(new Uint8Array(size));}

  // finder patterns, with their separators
  const finder=(r,c)=>{
    for(let dr=-1;dr<=7;dr++)for(let dc=-1;dc<=7;dc++){
      const rr=r+dr,cc=c+dc;
      if(rr<0||rr>=size||cc<0||cc>=size)continue;
      const ring=(dr>=0&&dr<=6&&(dc===0||dc===6))||(dc>=0&&dc<=6&&(dr===0||dr===6));
      const core=dr>=2&&dr<=4&&dc>=2&&dc<=4;
      m[rr][cc]=(ring||core)?1:0;
      res[rr][cc]=1;
    }
  };
  finder(0,0);finder(0,size-7);finder(size-7,0);

  // timing patterns
  for(let i=8;i<size-8;i++){
    m[6][i]=m[i][6]=(i%2===0)?1:0;
    res[6][i]=res[i][6]=1;
  }

  // alignment patterns, except where a finder already sits
  const ap=ALIGN[version-1];
  for(const r of ap)for(const c of ap){
    if((r<=7&&c<=7)||(r<=7&&c>=size-8)||(r>=size-8&&c<=7))continue;
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
      m[r+dr][c+dc]=(Math.max(Math.abs(dr),Math.abs(dc))!==1)?1:0;
      res[r+dr][c+dc]=1;
    }
  }

  // the module that is always dark
  m[size-8][8]=1;res[size-8][8]=1;

  // reserve the two format-information strips
  for(let i=0;i<=8;i++){
    if(i!==6){res[8][i]=1;res[i][8]=1;}
  }
  for(let i=0;i<8;i++)res[size-1-i][8]=1;
  for(let i=0;i<8;i++)res[8][size-1-i]=1;

  // reserve version information
  if(version>=7){
    for(let i=0;i<18;i++){
      const a=Math.floor(i/3),b=i%3;
      res[size-11+b][a]=1;res[a][size-11+b]=1;
    }
  }

  let free=0;
  for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(!res[r][c])free++;

  return MAP_CACHE[version]={size,m,res,free,totalCodewords:Math.floor(free/8)};
}

const totalCodewords=v=>functionMap(v).totalCodewords;
const dataCodewords=(v,ec)=>totalCodewords(v)-ECB[ec][v-1]*NB[ec][v-1];

/* ------------------------------------------------------------ bitstream */
function pickMode(text){
  let num=true,aln=true;
  for(const ch of text){
    if(ch<"0"||ch>"9")num=false;
    if(ALNUM.indexOf(ch)<0)aln=false;
    if(!num&&!aln)break;
  }
  return num?"numeric":aln?"alnum":"byte";
}
function countBits(mode,v){
  const i=v<=9?0:v<=26?1:2;
  return{numeric:[10,12,14],alnum:[9,11,13],byte:[8,16,16]}[mode][i];
}
function utf8(text){return new TextEncoder().encode(text);}

function buildBits(text,mode,version){
  const bits=[];
  const push=(val,len)=>{for(let i=len-1;i>=0;i--)bits.push((val>>>i)&1);};
  if(mode==="numeric"){
    push(1,4);push(text.length,countBits(mode,version));
    for(let i=0;i<text.length;i+=3){
      const c=text.substr(i,3);
      push(parseInt(c,10),c.length*3+1);      // 3->10, 2->7, 1->4
    }
  }else if(mode==="alnum"){
    push(2,4);push(text.length,countBits(mode,version));
    for(let i=0;i<text.length;i+=2){
      if(i+1<text.length)push(ALNUM.indexOf(text[i])*45+ALNUM.indexOf(text[i+1]),11);
      else push(ALNUM.indexOf(text[i]),6);
    }
  }else{
    const b=utf8(text);
    push(4,4);push(b.length,countBits(mode,version));
    for(const v of b)push(v,8);
  }
  return bits;
}
/* Length in bits before any version is chosen — the count indicator is the
   only version-dependent part, so this is exact for a given indicator size. */
function bitLength(text,mode,version){
  if(mode==="byte")return 4+countBits(mode,version)+utf8(text).length*8;
  if(mode==="numeric"){
    const n=text.length;
    return 4+countBits(mode,version)+Math.floor(n/3)*10+[0,4,7][n%3];
  }
  const n=text.length;
  return 4+countBits(mode,version)+Math.floor(n/2)*11+(n%2)*6;
}

/* ------------------------------------------------------------- assembly */
function codewords(text,mode,version,ec){
  const cap=dataCodewords(version,ec)*8;
  const bits=buildBits(text,mode,version);
  if(bits.length>cap)throw new Error("too long for this version");
  for(let i=0;i<4&&bits.length<cap;i++)bits.push(0);   // terminator, may be short
  while(bits.length%8)bits.push(0);
  const out=[];
  for(let i=0;i<bits.length;i+=8){
    let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];
    out.push(b);
  }
  // alternating pad bytes until the data area is full
  const PAD=[0xEC,0x11];
  for(let i=0;out.length<cap/8;i++)out.push(PAD[i%2]);
  return Uint8Array.from(out);
}

/* Split into blocks, add EC to each, then interleave both — the standard
   order, which is what lets a scanner survive a torn corner. */
function interleave(data,version,ec){
  const nb=NB[ec][version-1],ecb=ECB[ec][version-1];
  const numLong=data.length%nb,numShort=nb-numLong;
  const shortLen=Math.floor(data.length/nb);
  const blocks=[],ecs=[];
  let at=0;
  for(let i=0;i<nb;i++){
    const len=shortLen+(i<numShort?0:1);
    const blk=data.subarray(at,at+len);at+=len;
    blocks.push(blk);ecs.push(rsEncode(blk,ecb));
  }
  const out=[];
  const maxLen=shortLen+(numLong?1:0);
  for(let i=0;i<maxLen;i++)for(const b of blocks)if(i<b.length)out.push(b[i]);
  for(let i=0;i<ecb;i++)for(const e of ecs)out.push(e[i]);
  return Uint8Array.from(out);
}

/* Two columns at a time, right to left, snaking up then down, skipping the
   vertical timing line. */
function placeData(m,res,size,bytes){
  let dir=-1,row=size-1,bit=0;
  const next=()=>{
    if(bit>=bytes.length*8)return 0;               // remainder bits stay light
    const v=(bytes[bit>>3]>>>(7-(bit&7)))&1;bit++;return v;
  };
  for(let col=size-1;col>0;col-=2){
    if(col===6)col--;
    for(;;){
      for(let k=0;k<2;k++){
        const c=col-k;
        if(!res[row][c])m[row][c]=next();
      }
      row+=dir;
      if(row<0||row>=size){row-=dir;dir=-dir;break;}
    }
  }
  return bit;
}

const MASKS=[
  (r,c)=>((r+c)%2)===0,
  (r,c)=>(r%2)===0,
  (r,c)=>(c%3)===0,
  (r,c)=>((r+c)%3)===0,
  (r,c)=>((Math.floor(r/2)+Math.floor(c/3))%2)===0,
  (r,c)=>((r*c)%2+(r*c)%3)===0,
  (r,c)=>(((r*c)%2+(r*c)%3)%2)===0,
  (r,c)=>(((r+c)%2+(r*c)%3)%2)===0
];

function formatBits(ec,mask){
  const d=(FMT_EC[ec]<<3)|mask;
  let v=d<<10;
  for(let i=14;i>=10;i--)if((v>>>i)&1)v^=0x537<<(i-10);
  return ((d<<10)|(v&0x3FF))^0x5412;
}
function versionBits(version){
  let r=version<<12;
  for(let i=17;i>=12;i--)if((r>>>i)&1)r^=0x1F25<<(i-12);
  return (version<<12)|(r&0xFFF);
}
/* The 15 format bits, twice. Getting the two copies the right way round
   matters more than it looks: transposed, the second copy runs down column 8
   and lands on the always-dark module at (size-8, 8). The correct layout runs
   it along row 8 and touches nothing else, which is the tell. */
function writeFormat(m,size,ec,mask){
  const f=formatBits(ec,mask);
  const bit=i=>(f>>>i)&1;
  // copy 1: down column 8, then left along row 8, skipping the timing line
  for(let i=0;i<=5;i++)m[i][8]=bit(i);
  m[7][8]=bit(6);m[8][8]=bit(7);m[8][7]=bit(8);
  for(let i=9;i<=14;i++)m[8][14-i]=bit(i);
  // copy 2: in from the right along row 8, then up column 8 from the bottom
  for(let i=0;i<=7;i++)m[8][size-1-i]=bit(i);
  for(let i=8;i<=14;i++)m[size-15+i][8]=bit(i);
  m[size-8][8]=1;              // restate the dark module: never a format bit
}
function writeVersion(m,size,version){
  if(version<7)return;
  const v=versionBits(version);
  for(let i=0;i<18;i++){
    const b=(v>>>i)&1,a=Math.floor(i/3),o=i%3;
    m[size-11+o][a]=b;m[a][size-11+o]=b;
  }
}

/* The four penalty rules, straight from the standard. Lower is better. */
function penalty(m,size){
  let p=0;
  // rule 1: runs of five or more
  for(let i=0;i<size;i++){
    let runR=1,runC=1;
    for(let j=1;j<size;j++){
      if(m[i][j]===m[i][j-1]){runR++;}else{if(runR>=5)p+=3+runR-5;runR=1;}
      if(m[j][i]===m[j-1][i]){runC++;}else{if(runC>=5)p+=3+runC-5;runC=1;}
    }
    if(runR>=5)p+=3+runR-5;
    if(runC>=5)p+=3+runC-5;
  }
  // rule 2: 2x2 blocks of one colour
  for(let r=0;r<size-1;r++)for(let c=0;c<size-1;c++){
    const v=m[r][c];
    if(v===m[r][c+1]&&v===m[r+1][c]&&v===m[r+1][c+1])p+=3;
  }
  // rule 3: the finder-lookalike, either way round, in rows and columns
  const A=[1,0,1,1,1,0,1,0,0,0,0],B=[0,0,0,0,1,0,1,1,1,0,1];
  const runs=(get)=>{
    for(let i=0;i<size;i++)for(let j=0;j+11<=size;j++){
      let a=true,b=true;
      for(let k=0;k<11;k++){
        const v=get(i,j+k);
        if(v!==A[k])a=false;
        if(v!==B[k])b=false;
        if(!a&&!b)break;
      }
      if(a)p+=40;
      if(b)p+=40;
    }
  };
  runs((i,j)=>m[i][j]);
  runs((i,j)=>m[j][i]);
  // rule 4: drift away from half dark
  let dark=0;
  for(let r=0;r<size;r++)for(let c=0;c<size;c++)dark+=m[r][c];
  const pct=dark*100/(size*size);
  p+=10*Math.floor(Math.abs(pct-50)/5);
  return p;
}

/* ----------------------------------------------------------------- make */
/* Returns {size, version, ec, mode, mask, modules} where modules[r][c] is
   1 for dark. Throws only if the text cannot fit in a version-40 symbol. */
function make(text,opts){
  opts=opts||{};
  text=String(text==null?"":text);
  if(!text)throw new Error("Nothing to encode");
  const ec=(opts.ec||"M").toUpperCase();
  if(!ECB[ec])throw new Error("Unknown error-correction level: "+opts.ec);
  const mode=opts.mode||pickMode(text);
  const minV=Math.max(1,opts.minVersion||1),maxV=Math.min(40,opts.maxVersion||40);

  let version=0;
  for(let v=minV;v<=maxV;v++){
    if(bitLength(text,mode,v)<=dataCodewords(v,ec)*8){version=v;break;}
  }
  if(!version)throw new Error(
    "This is too long for a QR code at level "+ec+". Shorten the text, or use a lower error-correction level.");

  const fm=functionMap(version),size=fm.size;
  const base=fm.m.map(r=>Uint8Array.from(r)),res=fm.res;
  placeData(base,res,size,interleave(codewords(text,mode,version,ec),version,ec));
  writeVersion(base,size,version);

  // try every mask, keep the one the standard likes best
  let best=null,bestScore=Infinity,bestMask=0;
  for(let k=0;k<8;k++){
    const m=base.map(r=>Uint8Array.from(r));
    for(let r=0;r<size;r++)for(let c=0;c<size;c++)
      if(!res[r][c]&&MASKS[k](r,c))m[r][c]^=1;
    writeFormat(m,size,ec,k);
    const s=penalty(m,size);
    if(s<bestScore){bestScore=s;best=m;bestMask=k;}
  }
  return{size,version,ec,mode,mask:bestMask,score:bestScore,modules:best};
}

/* Largest payload that still fits, so the UI can warn before it throws. */
function capacity(version,ec,mode){
  const bits=dataCodewords(version,ec)*8-4-countBits(mode||"byte",version);
  if(bits<0)return 0;
  // the leftover bits matter: a trailing 1 digit costs 4 and 2 digits cost 7,
  // so a remainder of 4 still buys a character that flooring would throw away
  if(mode==="numeric"){
    const r=bits%10;
    return Math.floor(bits/10)*3+(r>=7?2:r>=4?1:0);
  }
  if(mode==="alnum")return Math.floor(bits/11)*2+(bits%11>=6?1:0);
  return Math.floor(bits/8);
}

/* --------------------------------------------------------------- render */
/* One <rect> per horizontal run rather than per module: a version-40 code
   is 31,329 modules and a rect each makes a file no browser enjoys. */
function toSVG(qr,opts){
  opts=opts||{};
  const scale=opts.scale||8,margin=opts.margin==null?4:opts.margin;
  const dark=opts.dark||"#000000",light=opts.light||"#FFFFFF";
  const n=qr.size,dim=(n+margin*2)*scale;
  let path="";
  for(let r=0;r<n;r++){
    let c=0;
    while(c<n){
      if(!qr.modules[r][c]){c++;continue;}
      let end=c;
      while(end<n&&qr.modules[r][end])end++;
      path+=`M${c+margin} ${r+margin}h${end-c}v1h-${end-c}z`;
      c=end;
    }
  }
  const bg=opts.transparent?"":`<rect width="${n+margin*2}" height="${n+margin*2}" fill="${light}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" `+
    `viewBox="0 0 ${n+margin*2} ${n+margin*2}" shape-rendering="crispEdges" role="img" `+
    `aria-label="${(opts.label||"QR code").replace(/[&<>"]/g,"")}">`+
    bg+`<path d="${path}" fill="${dark}"/></svg>`;
}

function toCanvas(qr,canvas,opts){
  opts=opts||{};
  const scale=opts.scale||8,margin=opts.margin==null?4:opts.margin;
  const n=qr.size,dim=(n+margin*2)*scale;
  canvas.width=dim;canvas.height=dim;
  const g=canvas.getContext("2d");
  g.fillStyle=opts.light||"#FFFFFF";
  if(!opts.transparent)g.fillRect(0,0,dim,dim);else g.clearRect(0,0,dim,dim);
  g.fillStyle=opts.dark||"#000000";
  for(let r=0;r<n;r++){
    let c=0;
    while(c<n){
      if(!qr.modules[r][c]){c++;continue;}
      let end=c;
      while(end<n&&qr.modules[r][end])end++;
      g.fillRect((c+margin)*scale,(r+margin)*scale,(end-c)*scale,scale);
      c=end;
    }
  }
  return canvas;
}

window.QREncode={
  make,capacity,toSVG,toCanvas,pickMode,
  totalCodewords,dataCodewords,formatBits,versionBits,penalty,
  // exposed for the test suite
  _rsEncode:rsEncode,_rsGen:rsGen,_functionMap:functionMap,_codewords:codewords,
  _interleave:interleave,_ECB:ECB,_NB:NB,_ALIGN:ALIGN,_MASKS:MASKS,_countBits:countBits
};
})();

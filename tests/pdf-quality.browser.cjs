const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),run=require('./browser-session.cjs');
const countPages=b=>(b.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
function rgbImage(pdf){
 const text=pdf.toString('latin1');let offset=0;
 while((offset=text.indexOf('/Subtype /Image',offset))>=0){
  const stream=text.indexOf('stream\n',offset),header=text.slice(offset,stream);offset=stream+7;
  if(!header.includes('/ColorSpace /DeviceRGB'))continue;
  const width=Number(header.match(/\/Width\s+(\d+)/)[1]),height=Number(header.match(/\/Height\s+(\d+)/)[1]);
  assert.match(header,/\/Filter \/FlateDecode/,'PDF page uses lossless compression');
  assert.doesNotMatch(header,/DCTDecode/,'PDF page has no JPEG quantisation');
  const length=Number(header.match(/\/Length\s+(\d+)/)[1]),bytes=zlib.inflateSync(pdf.subarray(stream+7,stream+7+length)),stride=width*3;
  assert.equal(bytes.length,(stride+1)*height,'RGB scanlines have predictable dimensions');
  let previous=new Uint8Array(stride),hash=2166136261;
  for(let r=0;r<height;r++){
   const type=bytes[r*(stride+1)],row=Uint8Array.from(bytes.subarray(r*(stride+1)+1,(r+1)*(stride+1)));
   for(let c=0;c<stride;c++){
    const a=c>=3?row[c-3]:0,b=previous[c],u=c>=3?previous[c-3]:0;
    if(type===1)row[c]+=a;else if(type===2)row[c]+=b;else if(type===3)row[c]+=Math.floor((a+b)/2);else if(type===4){const p=a+b-u,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-u);row[c]+=pa<=pb&&pa<=pc?a:pb<=pc?b:u;}else assert.equal(type,0);
    hash=Math.imul(hash^row[c],16777619);
   }
   previous=row;
  }
  return {width,height,hash:hash>>>0};
 }
 throw Error('No RGB page image found in PDF');
}
run('report-pdf-quality',async({out,evaluate:e,until,navigate,send})=>{
 const segments=process.env.QUALITY_QUICK?['secondary']:['pre-primary','primary','secondary','junior-college','college'];
 for(const segment of segments){
  await navigate('/segments/'+segment+'-reports.html');await e(`document.getElementById('demo').click();switchView('report')`);await until(`!!document.querySelector('#v-report .sheet')&&!!window.A4Print`);
  await e(`(async()=>{await A4Print.image(document.querySelector('#v-report .sheet'));window.canvasOriginal=html2canvas;window.html2canvas=async(...args)=>{const canvas=await canvasOriginal(...args),data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let hash=2166136261;for(let i=0;i<data.length;i+=4){hash=Math.imul(hash^data[i],16777619);hash=Math.imul(hash^data[i+1],16777619);hash=Math.imul(hash^data[i+2],16777619);}window.lastCapture={width:canvas.width,height:canvas.height,hash:hash>>>0};return canvas;};})()`);
  const encoded=await e(`(async()=>{const blob=await A4Print.pdf(document.querySelector('#v-report .sheet'));return await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.readAsDataURL(blob)})})()`),pdf=Buffer.from(encoded,'base64');
  fs.writeFileSync(path.join(out,segment+'-300dpi.pdf'),pdf);assert.equal(countPages(pdf),1);
  const source=await e('lastCapture'),decoded=rgbImage(pdf);assert.ok(decoded.width>=2480&&decoded.height>=3507,'at least 300-DPI A4 image');assert.deepEqual(decoded,source,'PDF RGB pixels match the original capture exactly');
  const native=await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});assert.equal(countPages(Buffer.from(native.data,'base64')),1,'native print remains one A4 page');
  console.log('PASS '+segment+': '+decoded.width+' × '+decoded.height+', lossless pixel match, single A4 page');
 }
 // A real multi-page download must apply the same policy to the combined
 // document and to each individual file made from the shared captures.
 await e(`html2canvas=canvasOriginal;window.qualityGroup=document.createElement('div');qualityGroup.innerHTML=document.querySelector('#v-report .sheet').outerHTML.repeat(2);qualityGroup.style.cssText='position:absolute;left:-100000px;top:0';document.body.appendChild(qualityGroup)`);
 const bundle=await e(`(async()=>{const result=await A4Print.bundle(qualityGroup),encode=b=>new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.readAsDataURL(b)});try{return {combined:await encode(result.combined),individual:await Promise.all(result.individual.map(encode))}}finally{qualityGroup.remove()}})()`);
 const combined=Buffer.from(bundle.combined,'base64');assert.equal(countPages(combined),2);assert.ok(rgbImage(combined).width>=2480);assert.equal(bundle.individual.length,2);
 for(const data of bundle.individual){const pdf=Buffer.from(data,'base64');assert.equal(countPages(pdf),1);assert.ok(rgbImage(pdf).width>=2480);}
 console.log('PASS combined and individual bundle PDFs retain 300-DPI lossless pages');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 const mobile=await e(`(async()=>{const blob=await A4Print.pdf(document.querySelector('#v-report .sheet'));return await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.readAsDataURL(blob)})})()`),mobilePDF=Buffer.from(mobile,'base64');
 assert.equal(countPages(mobilePDF),1);const image=rgbImage(mobilePDF);assert.ok(image.width>=2480&&image.height>=3507,'mobile exports retain full print resolution');fs.writeFileSync(path.join(out,'mobile-300dpi.pdf'),mobilePDF);
 console.log('PASS mobile downloads retain 300-DPI resolution on low-DPI screens');
}).catch(err=>{console.error(err);process.exitCode=1});

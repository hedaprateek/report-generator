const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.join(__dirname,'..'),out=path.resolve(root,'../.scratch/report-a4-check');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
 const file=path.resolve(root,relative);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(b);});
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let browser,socket,seq=0;
const pending=new Map(),errors=[];
const watchdog=setTimeout(()=>{console.error('A4 browser checks exceeded five minutes');browser?.kill();server.close();server.closeAllConnections();process.exit(1)},300000);watchdog.unref();
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timed out '+method))},60000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<150;i++){if(await evaluate(`(()=>{try{return (${expression})}catch{return false}})()`))return;await sleep(100)}throw Error('Timed out '+expression);}
function pages(bytes){return (bytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;}
async function nativePDF(name,count){
 if(process.env.A4_DEBUG){console.log(await evaluate(`JSON.stringify({body:document.body.getBoundingClientRect().toJSON(),pages:[...document.querySelectorAll('.a4-page')].map(e=>({box:e.getBoundingClientRect().toJSON(),scale:e.dataset.a4Scale})),flow:[...document.body.children].map(e=>({tag:e.tagName,id:e.id,cls:e.className,box:e.getBoundingClientRect().toJSON(),position:getComputedStyle(e).position,display:getComputedStyle(e).display}))})`));fs.writeFileSync(path.join(out,name+'.html'),await evaluate('document.documentElement.outerHTML'));}
 const r=await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
 const bytes=Buffer.from(r.data,'base64');fs.writeFileSync(path.join(out,name+'.pdf'),bytes);
 assert.equal(pages(bytes),count,name+': exactly one page per report, including footer');
 const boxes=[...bytes.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
 assert.ok(boxes.length);for(const b of boxes){assert.ok(Math.abs(Number(b[1])-595.28)<1,'A4 width');assert.ok(Math.abs(Number(b[2])-841.89)<1,'A4 height');}
 console.log('PASS '+name+': '+count+' A4 page(s)');
}
async function geometry(){
 await send('Emulation.setEmulatedMedia',{media:'print'});
 const result=await evaluate(`(()=>{A4Print.prepare();return [...document.querySelectorAll('.a4-page')].map(p=>{const c=p.querySelector('.a4-content'),r=p.getBoundingClientRect(),box=c.getBoundingClientRect(),scale=Number(p.dataset.a4Scale),cs=getComputedStyle(p);const footer=p.querySelector('.rep-foot,.vf-stamp');return {scale,bottom:box.bottom,limit:r.bottom-parseFloat(cs.paddingBottom),right:box.left+c.scrollWidth*scale,rightLimit:r.right-parseFloat(cs.paddingRight),footerBottom:footer?.getBoundingClientRect().bottom}})})()`);
 assert.ok(result.length);for(const box of result){assert.ok(box.scale>0&&box.scale<=1);assert.ok(box.bottom<=box.limit+1,JSON.stringify(box));assert.ok(box.right<=box.rightLimit+1,JSON.stringify(box));if(box.footerBottom)assert.ok(box.footerBottom<=box.limit+1,'footer stays inside content area');}
 assert.equal(await evaluate(`document.querySelectorAll('.a4-page>.stunity-credit').length`),result.length,'each page has its own studio footer');
 assert.ok(await evaluate(`Array.from(document.querySelectorAll('.a4-footing')).every(f=>Math.abs(f.getBoundingClientRect().bottom-(f.parentElement.getBoundingClientRect().bottom-parseFloat(getComputedStyle(f.parentElement).paddingBottom)))<2)`),'document footers anchored at the bottom');
 return result;
}
async function screen(){await evaluate('A4Print.restore()');await send('Emulation.setEmulatedMedia',{media:'screen'});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const profile=path.join(out,'profile-'+Date.now());
 browser=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();break}catch{}await sleep(100)}
 assert.ok(targets);socket=new WebSocket(targets.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(m.error):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBypassServiceWorker',{bypass:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1300,height:1000,deviceScaleFactor:1,mobile:false});
 for(const segment of (process.env.A4_EXTRAS_ONLY?[]:['pre-primary','primary','secondary','junior-college','college'])){
  await send('Page.navigate',{url:base+'/segments/'+segment+'-reports.html'});
  await until('!!window.A4Print&&!!document.getElementById("demo")');
  await evaluate('document.getElementById("demo").click()');await until('!!AN');
  await evaluate('switchView("report")');await until('!!document.querySelector("#v-report .sheet")');
  await geometry();await nativePDF(segment+'-single',1);await screen();
  // Stress the real report with long remarks, many marks rows, and a very
  // wide table: the final footer must still be on the same A4 page.
  await evaluate(`(()=>{const sheet=document.querySelector('#v-report .sheet'),inner=sheet.querySelector('.sheet-inner')||sheet,foot=sheet.querySelector('.rep-foot');const long=document.createElement('section');long.className='rep-sec';long.innerHTML='<h3>Complete extended assessment</h3>'+Array.from({length:75},(_,i)=>'<p>'+i+'. '+('Detailed observation and follow-up for this student. '.repeat(5))+'</p>').join('')+'<table style="min-width:1250px"><tr>'+Array.from({length:16},(_,i)=>'<th>Additional subject '+i+'</th>').join('')+'</tr></table>';inner.insertBefore(long,foot);foot.textContent+=' FINAL FOOTER MUST STAY ON THIS PAGE';})()`);
  const boxes=await geometry();assert.ok(boxes[0].scale<.8,'long report actually shrinks');await nativePDF(segment+'-long',1);await screen();
  assert.equal(await evaluate('document.querySelectorAll(".a4-content").length'),0,'screen DOM restored');
  // Exercise the direct download/share PDF path independently of browser printing.
  const data=await evaluate(`(async()=>{const blob=await A4Print.pdf(document.querySelector('#v-report .sheet'));return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob)})})()`);
  const blob=Buffer.from(data,'base64');assert.equal(pages(blob),1,segment+' direct PDF is one A4 page');fs.writeFileSync(path.join(out,segment+'-share.pdf'),blob);
  if(segment==='junior-college'){
   const html=await evaluate(`(async()=>{return (await ReportPage.build(document.querySelector('#v-report .sheet'),{student:'Print check',docTitle:'Report'})).html})()`);
   fs.writeFileSync(path.join(out,'standalone.html'),html);
   // Use a data URL to ensure exported reports need no script or network fetch.
   await send('Page.navigate',{url:'data:text/html;base64,'+Buffer.from(html).toString('base64')});await until('!!window.A4Print');await geometry();await nativePDF('standalone-long',1);await screen();
   await send('Page.navigate',{url:base+'/segments/'+segment+'-reports.html'});await until('!!window.A4Print&&!!document.getElementById("demo")');await evaluate('document.getElementById("demo").click()');await until('!!AN');
  }
  await evaluate(`window.print=()=>{};${['pre-primary','primary'].includes(segment)?'switchView("report-all")':'printAllReports()'}`);
  const count=await evaluate('document.querySelectorAll("#v-report-all .sheet").length');assert.ok(count>1);
  await geometry();await nativePDF(segment+'-all',count);await screen();
  await evaluate(`switchView("overview");document.querySelectorAll('.view').forEach(v=>v.classList.toggle('print-target',v.id==='v-overview'));document.getElementById('v-report-all')?.classList.add('hidden')`);await geometry();await nativePDF(segment+'-overview',1);await screen();
 }
 for(const tool of (process.env.A4_EXTRAS_ONLY?[]:['certificates','fees-and-dues','student-file','timetable','results-pack','id-cards'])){
  await send('Page.navigate',{url:base+'/tools/'+tool+'.html'});
  await until('!!window.A4Print&&!!document.getElementById("ofDemo")');
  await evaluate('document.getElementById("ofDemo").click()');await until('!!document.querySelector(".of-view")');
  const boxes=await geometry();await nativePDF(tool,boxes.length);await screen();
 }
 await send('Page.navigate',{url:base+'/segments/pre-primary-reports.html'});await until('!!window.A4Print&&!!document.getElementById("demo")');
 await evaluate('document.getElementById("demo").click()');await until('!!AN');await evaluate('switchView("report")');
 await evaluate(`(()=>{const inner=document.querySelector('#v-report .sheet-inner');let sections=0;[...inner.children].forEach(el=>{if(el.matches('.rep-sec')&&++sections>1)el.remove()})})()`);
 const short=await geometry();assert.equal(short[0].scale,1,'short report keeps full size type');await nativePDF('short-spaced',1);await screen();
 await evaluate(fs.readFileSync(path.join(root,'assets/js/parent-report.js'),'utf8'));
 const parent=await evaluate(`ParentReport.render({student:'A4 Parent Check',academy:'Sample Academy',batch:'Class 5',overall:82,tests:[],topics:[],subjects:[{name:'English',avg:82,cls:75}],generated:'Today',note:'Complete report with a bottom footer.'})`);
 await send('Page.navigate',{url:'data:text/html;base64,'+Buffer.from(parent).toString('base64')});await until('!!window.A4Print');await geometry();await nativePDF('parent-offline',1);await screen();
 await send('Page.navigate',{url:base+'/parent.html'});await until('!!window.ParentLink&&!!window.A4Print');
 const fragment=await evaluate(`ParentLink.encode({student:'Linked Sample',academy:'Generic Academy',batch:'Class 5',overall:82,tests:[],topics:[],subjects:[{name:'English',avg:82,cls:75}],generated:'Today'})`);
 await send('Page.navigate',{url:'about:blank'});await send('Page.navigate',{url:base+'/parent.html#'+fragment});await until('!!document.querySelector(".hero")&&!!window.A4Print');assert.ok(await evaluate(`document.querySelector('.hero img').src.startsWith('data:image/svg+xml')`),'another academy uses its own initials');await geometry();await nativePDF('parent-link',1);await screen();
 assert.deepEqual(errors,[]);console.log(process.env.A4_EXTRAS_ONLY?'PASS short reports and offline parent reports':'PASS all five segments, long content, batch printing, summaries, office documents, direct PDFs and offline exported HTML');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{clearTimeout(watchdog);socket?.close();browser?.kill();server.close();server.closeAllConnections()});

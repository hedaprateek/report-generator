const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const X=require('../assets/vendor/xlsx.full.min.js'),Themes=require('../assets/js/template-themes.js');
const root=path.join(__dirname,'..'),out=path.resolve(root,'../.scratch/report-template-picker');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(root,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html');if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(f)]||'application/octet-stream');res.end(b);});});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let browser,socket,seq=0;const pending=new Map(),errors=[];
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timed out '+method))},30000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<150;i++){if(await evaluate(`(()=>{try{return (${expression})}catch{return false}})()`))return;await sleep(100)}throw Error('Timed out '+expression);}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,profile=path.join(out,'profile-'+Date.now());
 browser=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--disable-extensions','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
 let targets;for(let i=0;i<80;i++){try{const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();break}catch{}await sleep(100)}assert.ok(targets);
 socket=new WebSocket(targets.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(m.error):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text)};
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setBypassServiceWorker',{bypass:true});await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/'});await until('!!window.TemplateThemes');
 await evaluate(`document.querySelector('a[download]').click()`);await until('document.querySelector("dialog.template-colours")?.open');
 assert.equal(await evaluate(`document.querySelectorAll('.tc-option').length`),3);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await until('!document.querySelector("dialog.template-colours").open');await until(`document.activeElement.matches('a[download]')`);
 for(const [theme,url,filename] of [
  ['forest','/','TESA_Master_Pre_Primary_Forest.xlsx'],
  ['plum','/segments/junior-college-reports.html','Student_Progress_Template_Plum.xlsx'],
  ['ocean','/tools/certificates.html','Office_Roster_Template_Ocean.xlsx']
 ]){
  if(url!=='/'){await send('Page.navigate',{url:base+url});await until('!!window.TemplateThemes&&!!document.querySelector("a[download]")');}
  await evaluate(`document.querySelector('a[download]').click();document.querySelector('input[value="${theme}"]').click()`);
  assert.equal(await evaluate(`document.querySelector('.tc-preview strong').style.backgroundColor`),'rgb('+Themes.palettes[theme].colours[0].match(/../g).map(h=>parseInt(h,16)).join(', ')+')');
  await screenshot(theme+'-desktop');
  const file=path.join(out,filename);if(fs.existsSync(file))fs.unlinkSync(file);
  await evaluate(`document.querySelector('.template-colours button[type=submit]').click()`);
  for(let i=0;i<150&&!fs.existsSync(file);i++)await sleep(100);assert.ok(fs.existsSync(file),'downloaded '+filename);
  const bytes=fs.readFileSync(file),wb=X.read(bytes);assert.ok(wb.SheetNames.includes('Instructions'));
  const zip=X.CFB.read(bytes,{type:'buffer'}),entry=zip.FileIndex[zip.FullPaths.indexOf('Root Entry/xl/styles.xml')];assert.ok(Buffer.from(entry.content).toString().toUpperCase().includes('FF'+Themes.palettes[theme].colours[0]));
  await until('!document.querySelector("dialog.template-colours").open');console.log('PASS '+theme+': preview and real Excel download');
 }
 await send('Emulation.setDeviceMetricsOverride',{width:360,height:780,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:base+'/segments/junior-college-reports.html'});await until('!!window.TemplateThemes');await evaluate(`document.querySelector('a[download]').click()`);
 assert.ok(await evaluate(`(()=>{const r=document.querySelector('.template-colours').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.querySelector('.template-colours').scrollWidth<=r.width+1})()`),'mobile dialog fits');await screenshot('mobile');
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await evaluate(`document.querySelector('.template-colours button[type=submit]').click()`);
 await until('!!document.querySelector(".tc-status").textContent');assert.ok(await evaluate(`document.querySelector('dialog').open&&!document.querySelector('button[type=submit]').disabled`),'failed download stays open and can retry');
 await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 assert.deepEqual(errors,[]);console.log('PASS keyboard dismissal, mobile layout and recoverable download errors');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{socket?.close();browser?.kill();server.close();server.closeAllConnections()});

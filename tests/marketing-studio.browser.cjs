const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),X=require('../assets/vendor/xlsx.full.min.js'),run=require('./browser-session.cjs');
const pageCount=b=>(b.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
run('report-marketing-studio',async({out,evaluate:e,until,navigate,screenshot,send,sleep})=>{
 await navigate('/index.html');await e(`AcademySettings.saveProfile({name:'Real Cached Academy',address:'Private campus'});AcademySettings.saveLabels('primary',{sign1:'Keep this signature'})`);
 await e(`(async()=>{const bytes=await(await fetch('assets/templates/primary/Primary_Progress_Template.xlsx')).arrayBuffer();const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('spdWorkbookCache_v1',2);r.onupgradeneeded=()=>{for(const s of ['workbooks','photoOverrides'])if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});await new Promise((resolve,reject)=>{const t=db.transaction('workbooks','readwrite');t.objectStore('workbooks').put({filename:'PRIVATE_REAL_CLASS.xlsx',savedAt:123456,bytes},'primary');t.oncomplete=resolve;t.onerror=reject});db.close()})()`);
 const before=await e('(async()=>await SPDBackup.snapshot())()');
 await navigate('/marketing.html');await until(`!document.getElementById('buildDemo').disabled`,95);assert.ok((await e(`document.getElementById('demoStatus').textContent`)).includes('Sample ready'),await e(`document.getElementById('demoStatus').textContent`));
 assert.equal(await e(`document.getElementById('demoFrame').sandbox.contains('allow-same-origin')`),false,'sample renderer has an opaque origin');
 const cases=process.env.MARKETING_QUICK?['pre-primary']:['pre-primary','primary','secondary','junior-college','college'];
 for(const segment of cases){
  await e(`document.getElementById('segment').value='${segment}';document.getElementById('demoAcademy').value='Prospect Academy';document.getElementById('updateCadence').value='${segment==='pre-primary'?'monthly':'twice-monthly'}';document.getElementById('demoContact').value='Prateek · demo@example.com';document.getElementById('demoForm').requestSubmit()`);
  await until(`document.getElementById('demoStatus').textContent.includes('Sample ready')&&!document.getElementById('buildDemo').disabled`,90);
  const dimensions=await e(`(()=>{const i=document.getElementById('demoPreview');return {width:i.naturalWidth,height:i.naturalHeight}})()`);assert.ok(dimensions.width>1000);assert.ok(Math.abs(dimensions.width/dimensions.height-210/297)<.01,'snapshot is A4');
  if(segment==='pre-primary')await screenshot('demo-desktop');
  const file=path.join(out,'prospect-academy_'+segment+'_demo-pack.zip');if(fs.existsSync(file))fs.unlinkSync(file);
  await e(`document.getElementById('demoPack').click()`);for(let i=0;i<1000&&!fs.existsSync(file);i++){await sleep(100);if(i%20===0){const s=await e(`document.getElementById('demoStatus').textContent`);if(!s.includes('Preparing')&&!s.includes('Download ready'))throw Error(s);}}
  assert.ok(fs.existsSync(file),'downloaded '+segment+' demo pack');
  const zip=X.CFB.read(fs.readFileSync(file),{type:'buffer'}),entries=new Map(zip.FullPaths.map((n,i)=>[n.replace('Root Entry/',''),zip.FileIndex[i]]).filter(([,v])=>v.type===2&&!v.name.includes('Sh33tJ5')).map(([n,v])=>[n,Buffer.from(v.content)]));
  assert.deepEqual([...entries.keys()].sort(),['READ-ME.txt','product-introduction.pdf','sample-academy-overview.pdf','sample-student-report.pdf','sample-student-report.png','parent-update-guide.pdf','whatsapp-promotion.png','academy-introduction.txt','sample-parent-message.txt'].sort());
  for(const name of ['product-introduction.pdf','sample-academy-overview.pdf','sample-student-report.pdf','parent-update-guide.pdf'])assert.equal(pageCount(entries.get(name)),1,segment+' '+name+' is one A4 page');
  assert.equal(entries.get('sample-student-report.png').subarray(1,4).toString(),'PNG');assert.match(entries.get('READ-ME.txt').toString(),/sample data, not real academy records/);
  const poster=entries.get('whatsapp-promotion.png');assert.equal(poster.subarray(1,4).toString(),'PNG');assert.equal(poster.readUInt32BE(16),1080);assert.equal(poster.readUInt32BE(20),1350);
  const pitch=entries.get('academy-introduction.txt').toString();assert.match(pitch,/digital history/);assert.match(pitch,/monthly or twice a month/);assert.match(pitch,/WhatsApp/);assert.match(pitch,/reduce routine printing/);assert.match(pitch,/Prateek · demo@example.com/);assert.match(pitch,/https:\/\/hedaprateek.github.io\/report-generator\//);assert.doesNotMatch(pitch,/127\.0\.0\.1/);
  assert.match(entries.get('sample-parent-message.txt').toString(),/\[Student name\]/);assert.match(entries.get('READ-ME.txt').toString(),/not an automatic cloud archive/);assert.match(entries.get('READ-ME.txt').toString(),/does not schedule or send/);
  for(const [name,bytes]of entries)fs.writeFileSync(path.join(out,segment+'_'+name),bytes);
  if(segment==='pre-primary'){
   for(const kind of ['brochure','poster','guide']){
    await e(`document.getElementById('tab-${kind}').click()`);await until(`document.getElementById('tab-${kind}').getAttribute('aria-selected')==='true'&&!document.getElementById('buildDemo').disabled&&document.getElementById('demoPreview').complete`,40);
    if(kind!=='poster'){const content=await e(`document.getElementById('renderStage').textContent`);assert.match(content,/WhatsApp/);assert.match(content,/backups/);assert.match(content,/Monthly/);assert.match(content,/Prateek · demo@example.com/);}
    await e(`document.querySelector('.preview-area').scrollIntoView({block:'start'})`);await screenshot('preview-'+kind);
    const printed=await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});assert.equal(pageCount(Buffer.from(printed.data,'base64')),1,kind+' native preview fits one A4');
   }
   await e(`window.__copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.__copied.push(text)}});document.getElementById('copyPitch').click();document.getElementById('copyParent').click()`);
   assert.equal((await e('window.__copied')).length,2);assert.match((await e('window.__copied'))[0],/digital history/);assert.match((await e('window.__copied'))[1],/Prospect Academy/);
   await e(`document.getElementById('tab-report').click()`);await until(`document.getElementById('tab-report').getAttribute('aria-selected')==='true'&&!document.getElementById('buildDemo').disabled`,30);
   // Retaining another tab across rebuilds must embed the new report, not a
   // revoked URL or a previous prospect's image.
   await e(`document.getElementById('tab-brochure').click()`);await until(`document.getElementById('tab-brochure').getAttribute('aria-selected')==='true'&&!document.getElementById('buildDemo').disabled`,30);
  }
  if(segment!=='pre-primary'){
   await e(`document.getElementById('tab-guide').click()`);await until(`document.getElementById('tab-guide').getAttribute('aria-selected')==='true'&&!document.getElementById('buildDemo').disabled`,30);
   assert.equal(await e(`document.querySelector('.schedule .chosen strong').textContent`),'Twice a month');
  }
  await e(`document.getElementById('tab-report').click()`);await until(`document.getElementById('tab-report').getAttribute('aria-selected')==='true'&&!document.getElementById('buildDemo').disabled`,30);
  console.log('PASS '+segment+': isolated demo, A4 snapshot and complete shareable pack');
 }
 const native=await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});fs.writeFileSync(path.join(out,'marketing-preview.pdf'),Buffer.from(native.data,'base64'));assert.equal(pageCount(Buffer.from(native.data,'base64')),1,'marketing preview also prints on one A4 sheet');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('demo-mobile');assert.ok(await e('document.documentElement.scrollWidth<=innerWidth+1'),'marketing studio fits mobile');
 await navigate('/index.html');const after=await e('(async()=>await SPDBackup.snapshot())()');assert.deepEqual(after.workbooks,before.workbooks,'real cached workbooks unchanged');assert.deepEqual(after.roster,before.roster,'real roster unchanged');assert.equal(after.local.spdAcademyProfile_v1,before.local.spdAcademyProfile_v1);assert.equal(after.local.spdBrandingOverrides_v1,before.local.spdBrandingOverrides_v1);assert.equal(after.local['spdSegmentSettings_v1:primary'],before.local['spdSegmentSettings_v1:primary']);console.log('PASS saved academy profile, report wording, real workbook and roster preserved');
 await navigate('/marketing.html');await until(`!document.getElementById('buildDemo').disabled`,95);
 await e(`document.getElementById('demoAcademy').value='A long academy name & <school> '.repeat(6).slice(0,160);document.getElementById('demoContact').value='contact'.repeat(23).slice(0,160);document.getElementById('demoForm').requestSubmit()`);
 await until(`!document.getElementById('buildDemo').disabled`,95);assert.match(await e(`document.getElementById('demoStatus').textContent`),/Sample ready/);
 assert.equal(await e(`document.querySelector('#renderStage school')`),null,'academy name is escaped');
 await e(`document.getElementById('tab-poster').click()`);await until(`!document.getElementById('buildDemo').disabled`,40);assert.match(await e(`document.getElementById('demoStatus').textContent`),/Sample ready/);
 assert.ok(await e(`document.querySelector('.poster-legal').getBoundingClientRect().bottom<document.querySelector('.marketing-poster>.stunity-credit').getBoundingClientRect().top-12`),'long details do not overlap studio credit');
 console.log('PASS long names, contact wrapping and escaped marketing content');
}).catch(err=>{console.error(err);process.exitCode=1});

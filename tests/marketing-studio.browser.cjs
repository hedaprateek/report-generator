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
  await e(`document.getElementById('segment').value='${segment}';document.getElementById('demoAcademy').value='Prospect Academy';document.getElementById('demoForm').requestSubmit()`);
  await until(`document.getElementById('demoStatus').textContent.includes('Sample ready')&&!document.getElementById('buildDemo').disabled`,90);
  const dimensions=await e(`(()=>{const i=document.getElementById('demoPreview');return {width:i.naturalWidth,height:i.naturalHeight}})()`);assert.ok(dimensions.width>1000);assert.ok(Math.abs(dimensions.width/dimensions.height-210/297)<.01,'snapshot is A4');
  if(segment==='pre-primary')await screenshot('demo-desktop');
  const file=path.join(out,'prospect-academy_'+segment+'_demo-pack.zip');if(fs.existsSync(file))fs.unlinkSync(file);
  await e(`document.getElementById('demoPack').click()`);for(let i=0;i<1000&&!fs.existsSync(file);i++){await sleep(100);if(i%20===0){const s=await e(`document.getElementById('demoStatus').textContent`);if(!s.includes('Preparing')&&!s.includes('Download ready'))throw Error(s);}}
  assert.ok(fs.existsSync(file),'downloaded '+segment+' demo pack');
  const zip=X.CFB.read(fs.readFileSync(file),{type:'buffer'}),entries=new Map(zip.FullPaths.map((n,i)=>[n.replace('Root Entry/',''),zip.FileIndex[i]]).filter(([,v])=>v.type===2&&!v.name.includes('Sh33tJ5')).map(([n,v])=>[n,Buffer.from(v.content)]));
  assert.deepEqual([...entries.keys()].sort(),['READ-ME.txt','product-introduction.pdf','sample-academy-overview.pdf','sample-student-report.pdf','sample-student-report.png'].sort());
  for(const name of ['product-introduction.pdf','sample-academy-overview.pdf','sample-student-report.pdf'])assert.equal(pageCount(entries.get(name)),1,segment+' '+name+' is one A4 page');
  assert.equal(entries.get('sample-student-report.png').subarray(1,4).toString(),'PNG');assert.match(entries.get('READ-ME.txt').toString(),/sample data, not real academy records/);
  console.log('PASS '+segment+': isolated demo, A4 snapshot and complete shareable pack');
 }
 const native=await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});fs.writeFileSync(path.join(out,'marketing-preview.pdf'),Buffer.from(native.data,'base64'));assert.equal(pageCount(Buffer.from(native.data,'base64')),1,'marketing preview also prints on one A4 sheet');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('demo-mobile');assert.ok(await e('document.documentElement.scrollWidth<=innerWidth+1'),'marketing studio fits mobile');
 await navigate('/index.html');const after=await e('(async()=>await SPDBackup.snapshot())()');assert.deepEqual(after.workbooks,before.workbooks,'real cached workbooks unchanged');assert.deepEqual(after.roster,before.roster,'real roster unchanged');assert.equal(after.local.spdAcademyProfile_v1,before.local.spdAcademyProfile_v1);assert.equal(after.local.spdBrandingOverrides_v1,before.local.spdBrandingOverrides_v1);assert.equal(after.local['spdSegmentSettings_v1:primary'],before.local['spdSegmentSettings_v1:primary']);console.log('PASS saved academy profile, report wording, real workbook and roster preserved');
}).catch(err=>{console.error(err);process.exitCode=1});

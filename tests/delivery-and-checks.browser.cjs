const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),X=require('../assets/vendor/xlsx.full.min.js'),run=require('./browser-session.cjs');
const pages=b=>(b.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
function unzip(bytes){const zip=X.CFB.read(bytes,{type:'buffer'});return new Map(zip.FullPaths.map((n,i)=>[n.replace('Root Entry/',''),zip.FileIndex[i]]).filter(([,v])=>v.type===2&&!v.name.includes('Sh33tJ5')).map(([n,v])=>[n,Buffer.from(v.content)]));}
run('report-delivery-checks',async({out,evaluate:e,until,navigate,screenshot,sleep,send})=>{
 const templates={'pre-primary':'pre-primary/Pre_Primary_Evaluation_Template.xlsx',primary:'primary/Primary_Progress_Template.xlsx',secondary:'secondary/Student_Progress_Template.xlsx','junior-college':'junior-college/Student_Progress_Template.xlsx',college:'college/College_Progress_Template.xlsx'};
 const segments=process.env.DELIVERY_QUICK?['secondary']:Object.keys(templates);
 for(const segment of segments){
  await navigate('/segments/'+segment+'-reports.html');
  await e(`(async()=>{const bytes=await(await fetch('../assets/templates/${templates[segment]}')).arrayBuffer();readFile(new File([bytes],'Delivery_Class.xlsx'))})()`);
  await until(`!!AN||!!document.querySelector('#spdGridOverlay:not(.hidden)')`,40);
  if(await e(`!!document.querySelector('#spdGridOverlay:not(.hidden)')`)){assert.equal(await e(`document.getElementById('spdgApply').disabled`),false,'template review contains only warnings');await e(`document.getElementById('spdgApply').click()`);}
  await until(`!!AN&&AN.S.length===2&&!document.querySelector('#spdGridOverlay:not(.hidden)')`,40);
  await e(`switchView('report')`);await until(`!!document.querySelector('[data-delivery-pack]')`);
  const before=await e(`JSON.stringify({student:curStudent,filter:typeof FILTER==='undefined'?null:FILTER,cache:LAST_WORKBOOK_NAME})`);
  for(const f of fs.readdirSync(out).filter(n=>n.includes('_'+segment+'_')&&n.endsWith('_report-pack.zip')))fs.unlinkSync(path.join(out,f));
  await e(`document.querySelector('[data-delivery-pack]').click()`);
  await until(`document.getElementById('deliveryDialog').open`,20);
  if(await e(`!document.getElementById('deliveryProceed').hidden`))await e(`document.getElementById('deliveryProceed').click()`);
  await until(`document.getElementById('deliveryMessage').textContent.startsWith('Download ready:')||document.getElementById('deliveryCancel').textContent==='Close'`,110);
  assert.match(await e(`document.getElementById('deliveryMessage').textContent`),/^Download ready:/);
  let file;for(let i=0;i<80;i++){file=fs.readdirSync(out).find(n=>n.includes('_'+segment+'_')&&n.endsWith('_report-pack.zip'));if(file)break;await sleep(100);}assert.ok(file,'ZIP downloaded');
  const entries=unzip(fs.readFileSync(path.join(out,file))),students=[...entries.keys()].filter(n=>n.startsWith('students/'));
  assert.equal(students.length,2);assert.equal(new Set(students).size,2);
  for(const student of students)assert.equal(pages(entries.get(student)),1,'single A4 PDF: '+student);
  assert.equal(pages(entries.get('all-student-reports.pdf')),2,'one combined A4 page per student');assert.equal(pages(entries.get('class-summary.pdf')),1);
  assert.match(entries.get('report-index.csv').toString(),/PDF file/);for(const student of students)assert.ok(entries.get('report-index.csv').toString().includes(student));
  assert.match(entries.get('READ-ME.txt').toString(),/Send each family only their own student's PDF/);
  fs.writeFileSync(path.join(out,segment+'-summary.pdf'),entries.get('class-summary.pdf'));fs.writeFileSync(path.join(out,segment+'-student.pdf'),entries.get(students[0]));
  assert.equal(await e(`JSON.stringify({student:curStudent,filter:typeof FILTER==='undefined'?null:FILTER,cache:LAST_WORKBOOK_NAME})`),before,'export preserves selection, filters and cached workbook');
  await e(`document.getElementById('deliveryCancel').click()`);
  if(segment==='secondary')await screenshot('report-toolbar');
  console.log('PASS '+segment+': individual PDFs, combined PDF, class summary, index and unchanged workspace');
 }
 await navigate('/segments/secondary-reports.html');await until('!!AN',40);
 await e(`window.cleanSheets=JSON.parse(JSON.stringify(LAST_SHEETS));window.badSheets=JSON.parse(JSON.stringify(cleanSheets));window.hr=badSheets.Marks.findIndex(r=>r.includes('Student Name'));badSheets.Marks[hr+1][2]=88;badSheets.Marks[hr+1][3]='8O';badSheets.Marks[hr+1][4]=null;badSheets.Marks[hr+2][1]='Wrong Student';window.oldWorkbookName=LAST_WORKBOOK_NAME;const wb=XLSX.utils.book_new();Object.entries(badSheets).forEach(([name,rows])=>XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),name));readFile(new File([XLSX.write(wb,{type:'array',bookType:'xlsx'})],'Needs_Fixing.xlsx'))`);
 await until(`!!document.querySelector('#spdGridOverlay:not(.hidden)')`);
 assert.ok(await e(`document.getElementById('spdgApply').disabled`),'hard errors block continuation');
 const issueText=await e(`document.getElementById('spdgIssues').textContent`);assert.match(issueText,/88 exceeds the maximum/);assert.match(issueText,/8O/);assert.match(issueText,/Wrong Student/);assert.match(issueText,/Correction:/);assert.match(issueText,/mark is missing/);
 assert.equal(await e('LAST_WORKBOOK_NAME'),await e('oldWorkbookName'),'pending corrupt upload does not replace cached data');
 await e(`document.querySelector('#spdgIssues [data-issue]').click()`);assert.ok(await e(`document.activeElement.matches('.spdg-cell')`),'problem link focuses exact cell');await screenshot('exact-excel-problems');
 const issueFile=path.join(out,'the_extra_step_academy_data_problems.csv');if(fs.existsSync(issueFile))fs.unlinkSync(issueFile);
 await e(`document.getElementById('spdgProblems').click()`);for(let i=0;i<100&&!fs.existsSync(issueFile);i++)await sleep(100);assert.ok(fs.existsSync(issueFile),'all issues can be downloaded');assert.match(fs.readFileSync(issueFile,'utf8'),/Marks/);assert.match(fs.readFileSync(issueFile,'utf8'),/88/);
 const reviewFile=path.join(out,'the_extra_step_academy_data_review.xlsx');if(fs.existsSync(reviewFile))fs.unlinkSync(reviewFile);await e(`document.getElementById('spdgProblemsExcel').click()`);for(let i=0;i<100&&!fs.existsSync(reviewFile);i++)await sleep(100);assert.ok(fs.existsSync(reviewFile),'Excel review copy downloads');const reviewBook=X.read(fs.readFileSync(reviewFile));assert.equal(reviewBook.SheetNames[0],'Problems');assert.ok(reviewBook.Sheets.Marks['C'+(await e('hr')+2)].c.length);
 // Fix the same cells using the actual grid, switching sheets as necessary.
 await e(`document.querySelector('#spdgTabs [data-sheet="Marks"]').click();for(const [r,c]of [[hr+1,2],[hr+1,3],[hr+1,4],[hr+2,1]]){const cell=document.querySelector('#spdgBody [data-r="'+r+'"][data-c="'+c+'"]');cell.textContent=cleanSheets.Marks[r][c]??'';cell.dispatchEvent(new Event('input',{bubbles:true}));}document.getElementById('spdgCheck').click()`);
 assert.equal(await e(`document.getElementById('spdgApply').disabled`),false,'corrected data passes fresh validation');assert.doesNotMatch(await e(`document.getElementById('spdgIssues').textContent`),/88 exceeds/);
 await e(`document.getElementById('spdgApply').click()`);await until(`!document.querySelector('#spdGridOverlay:not(.hidden)')&&LAST_WORKBOOK_NAME==='Needs_Fixing.xlsx'`);
 console.log('PASS precise issue locations, CSV export, editable corrections and cache protection');
 // Even a broken header reaches the cell review rather than a generic upload error.
 await e(`const broken=JSON.parse(JSON.stringify(cleanSheets));broken.Marks[hr][1]='Full Name';const w=XLSX.utils.book_new();Object.entries(broken).forEach(([n,r])=>XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(r),n));readFile(new File([XLSX.write(w,{type:'array',bookType:'xlsx'})],'Broken_Header.xlsx'))`);
 await until(`!!document.querySelector('#spdGridOverlay:not(.hidden)')`);assert.match(await e(`document.getElementById('spdgIssues').textContent`),/Student Name column header/);assert.ok(await e(`document.getElementById('spdgIssues').textContent.includes('Marks!B'+(hr+1))`),'broken header location is exact');await e(`document.getElementById('spdgCancel').click()`);
 // Rechecking after deleting a row must not read the removed DOM row back in.
 await e(`SPDGrid.open({Students:[['Roll No','Student Name'],[1,'First'],[2,'Second']]},{onApply:s=>window.deletedResult=s});document.querySelector('[data-del="1"]').click();document.getElementById('spdgApply').click()`);
 assert.deepEqual(await e('deletedResult.Students'),[['Roll No','Student Name'],[2,'Second']]);
 // Cancellation cleans up the renderer and never downloads a partial ZIP.
 await e(`switchView('report');window.bundleOriginal=A4Print.bundle;A4Print.bundle=async(root,opts)=>{document.getElementById('deliveryCancel').click();if(opts.cancelled())throw Error('Export cancelled. No incomplete pack was downloaded.');};document.querySelector('[data-delivery-pack]').click()`);
 await until(`document.getElementById('deliveryCancel').textContent==='Close'`);assert.match(await e(`document.getElementById('deliveryMessage').textContent`),/cancelled/);assert.equal(await e(`document.querySelectorAll('.delivery-stage').length`),0);await e(`A4Print.bundle=bundleOriginal;document.getElementById('deliveryCancel').click()`);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await e(`document.getElementById('editDataBtn').click()`);await screenshot('mobile-review');assert.ok(await e('document.documentElement.scrollWidth<=innerWidth+1'),'review fits mobile');
 console.log('PASS broken headers, row deletion, cancellation and mobile review');
}).catch(err=>{console.error(err);process.exitCode=1});

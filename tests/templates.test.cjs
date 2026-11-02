const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const XLSX = require('../assets/vendor/xlsx.full.min.js');
const root = path.join(__dirname, '..');
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(f => f.isDirectory() ? files(path.join(dir,f.name)) : [path.join(dir,f.name)]);
}
function xmlReader(bytes) {
  const zip = XLSX.CFB.read(bytes, {type:'buffer'});
  return name => {
    const i = zip.FullPaths.indexOf('Root Entry/' + name);
    assert.ok(i >= 0, name);
    return Buffer.from(zip.FileIndex[i].content).toString('utf8');
  };
}
const attr = (xml, name) => new RegExp('\\b'+name+'="([^"]*)"').exec(xml)?.[1];
const elements = (xml, tag) => [...xml.matchAll(new RegExp('<'+tag+'\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/'+tag+'>)', 'g'))].map(m => m[0]);
for (const file of files(path.join(root,'assets/templates')).filter(f => f.endsWith('.xlsx'))) {
  test(path.relative(root,file) + ': protection and usable input areas', () => {
    const bytes = fs.readFileSync(file), read = xmlReader(bytes);
    const book = read('xl/workbook.xml');
    assert.equal(attr(elements(book,'workbookProtection')[0], 'lockStructure'), '1');
    const workbookProtection=elements(book,'workbookProtection')[0];
    assert.ok(attr(workbookProtection,'workbookPassword') || attr(workbookProtection,'workbookHashValue'));
    const styles = elements(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(read('xl/styles.xml'))[1], 'xf');
    const rels = new Map(elements(read('xl/_rels/workbook.xml.rels'),'Relationship').map(r => [attr(r,'Id'),attr(r,'Target')]));
    const wb = XLSX.read(bytes, {cellFormula:true});
    for (const sheet of elements(book,'sheet')) {
      const name = attr(sheet,'name'), target = rels.get(attr(sheet,'r:id'));
      const xml = read(target.startsWith('/') ? target.slice(1) : 'xl/'+target);
      const sheetProtection=elements(xml,'sheetProtection')[0];
      assert.ok(attr(sheetProtection,'password') || attr(sheetProtection,'hashValue'), name);
      const cells = new Map(elements(xml,'c').map(c => [attr(c,'r'),c]));
      const rowNumbers = elements(xml,'row').map(r => Number(attr(r,'r')));
      assert.deepEqual(rowNumbers, [...new Set(rowNumbers)].sort((a,b)=>a-b), 'rows remain in Excel order');
      const locked = ref => !/locked="0"/.test(styles[Number(attr(cells.get(ref) || '', 's') || 0)]);
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1,defval:null});
      if (name === 'Instructions') {
        for (const ref of cells.keys()) assert.ok(locked(ref), `${name}!${ref} must be read only`);
        assert.match(JSON.stringify(rows), /PROTECTED TEMPLATE|Fixed labels and totals stay protected/);
        continue;
      }
      let hr = rows.findIndex(r => r.includes('Student Name'));
      if (hr < 0) hr = 0;
      const header = rows[hr];
      for (const label of ['Student Name','Roll No','Q No','Class','Semester','Project / Activity']) {
        const c = header.indexOf(label);
        if (c >= 0) assert.ok(locked(XLSX.utils.encode_cell({r:hr,c})), `${name}: ${label} is locked`);
      }
      assert.equal(locked('A'+(hr+2)), false, `${name}: first entry is editable`);
      assert.equal(locked('A'+(hr+500)), false, `${name}: blank rows are editable`);
      if (['Charges','Payments','Notes','Timetable','Questions'].includes(name)) assert.equal(locked('A2001'),false);
      for (let c=0;c<header.length;c++) {
        if (header[c] !== 'Total') continue;
        const ref = XLSX.utils.encode_cell({r:hr+1,c});
        assert.ok(locked(ref), ref+' total locked');
        assert.match(ws[ref].f, /^IF\(\$B\d+="","",SUM(?:IF)?\(/);
        assert.equal(typeof ws[ref].v, 'number', ref+' cached total remains numeric');
        assert.ok(Number.isFinite(ws[ref].v));
        const maxRow = rows.findIndex(r => /^MAX MARKS/.test(String(r[1] || '')));
        if (maxRow >= 0) {
          const maxRef = XLSX.utils.encode_cell({r:maxRow,c});
          assert.ok(locked(maxRef));
          assert.match(ws[maxRef].f, /^SUM(?:IF)?\(/, 'maximum total updates when subject maximums change');
        }
      }
      if ((name === 'Attendance' && hr === 0) || name === 'Homework') {
        const last = name === 'Attendance' ? 367 : 101;
        const ref = XLSX.utils.encode_cell({r:0,c:last});
        assert.equal(locked(ref),false, 'future heading editable');
        const col = elements(xml,'col').find(c => Number(attr(c,'min')) <= last+1 && Number(attr(c,'max')) >= last+1);
        assert.match(styles[Number(attr(col,'style'))], /locked="0"/, 'future date column accepts data');
        for (const ref of cells.keys()) {
          const address = XLSX.utils.decode_cell(ref);
          if (address.r > 0 && address.c >= 2 && address.c <= last) assert.equal(locked(ref), false, `${name}!${ref} accepts input`);
        }
      }
      // Inline instructions must not block a student row or become a phantom name.
      for (const row of rows.slice(hr+1)) {
        const filled = row.filter(v => v !== null && v !== '');
        assert.ok(!(filled.length === 1 && String(filled[0]).length > 60), `${name}: help belongs on Instructions`);
      }
    }
  });
}

test('protected Secondary template works with the actual report parser', () => {
  const html = fs.readFileSync(path.join(root,'segments/secondary-reports.html'),'utf8');
  const parser = html.slice(html.indexOf('function isAbsent('), html.indexOf('// detects one or more batches'));
  const context = vm.createContext({});
  vm.runInContext(parser,context);
  const wb = XLSX.read(fs.readFileSync(path.join(root,'assets/templates/secondary/Student_Progress_Template.xlsx')));
  const sheets = Object.fromEntries(wb.SheetNames.map(n => [n,XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:null,raw:true})]));
  const parsed = context.parseWorkbook(sheets);
  assert.equal(parsed.students.length,2);
  assert.equal(parsed.marks.length,2);
  assert.equal(parsed.tests.length,2);
  assert.equal(parsed.tests[0].totalMax,80);
  assert.equal(parsed.marks[0].tests['Unit Test 1'].obtained,70);
  assert.equal(parsed.attendance.days,4);
  assert.equal(parsed.homework.n,2);
  assert.equal(parsed.warnings.length,0);
});

for (const [segment, filename] of [
  ['pre-primary','Pre_Primary_Evaluation_Template.xlsx'],
  ['primary','Primary_Progress_Template.xlsx'],
  ['junior-college','Student_Progress_Template.xlsx'],
  ['college','College_Progress_Template.xlsx'],
]) {
  test(segment + ' protected template works with its report parser', () => {
    const html = fs.readFileSync(path.join(root,`segments/${segment}-reports.html`),'utf8');
    const start = html.indexOf('function isAbsent(') >= 0 ? html.indexOf('function isAbsent(') : html.indexOf('function norm(');
    const context = vm.createContext({});
    vm.runInContext(html.slice(start,html.indexOf('function detectBatches(')), context);
    const wb = XLSX.read(fs.readFileSync(path.join(root,`assets/templates/${segment}/${filename}`)));
    const sheets = Object.fromEntries(wb.SheetNames.map(n => [n,XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,defval:null,raw:true})]));
    const parsed = context.parseWorkbook(sheets);
    assert.equal(parsed.students.length,2);
    assert.equal((parsed.marks || parsed.evals).length,2);
    assert.ok((parsed.tests || parsed.cycles || parsed.semesters).length >= 2);
    assert.equal(parsed.warnings.length,0);
  });
}

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const X=require('../assets/vendor/xlsx.full.min.js'),Themes=require('../assets/js/template-themes.js');
const root=path.join(__dirname,'..'),out=path.resolve(root,'../.scratch/report-template-colours');fs.mkdirSync(out,{recursive:true});
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(path.join(dir,f.name)):[path.join(dir,f.name)]);}
function entries(bytes){const zip=X.CFB.read(bytes,{type:'array'});return new Map(zip.FullPaths.map((name,i)=>[name,zip.FileIndex[i]]).filter(([,e])=>e.type===2&&!e.name.includes('Sh33tJ5')).map(([n,e])=>[n,Buffer.from(e.content)]));}
for(const file of files(path.join(root,'assets/templates')).filter(f=>f.endsWith('.xlsx'))){
 const relative=path.relative(path.join(root,'assets/templates'),file);
 for(const theme of Object.keys(Themes.palettes))test(relative+': '+theme+' preserves data, formulas and protection',()=>{
  const source=fs.readFileSync(file),result=Themes.recolour(source,theme,X),before=entries(source),after=entries(result);
  assert.deepEqual([...after.keys()].sort(),[...before.keys()].sort(),'all package parts retained');
  for(const [name,bytes] of before){
   if(/\/xl\/(?:styles\.xml|worksheets\/[^/]+\.xml)$/.test(name)){
    const strip=s=>s.toString().replace(/\brgb="[A-F\d]{8}"/gi,'rgb="COLOUR"');
    assert.equal(strip(after.get(name)),strip(bytes),name+' changes colours only');
   }else assert.deepEqual(after.get(name),bytes,name+' unchanged');
  }
  const book=X.read(result,{cellFormula:true});assert.ok(book.SheetNames.includes('Instructions'));
  const styles=after.get('Root Entry/xl/styles.xml').toString();
  assert.ok(styles.toUpperCase().includes('FF'+Themes.palettes[theme].colours[0]));
  if(theme!=='ocean')assert.notDeepEqual(Buffer.from(result),source,'theme applied');
  if(relative.match(/Primary_Progress|Student_Progress|College_Progress|Master_(Primary|Secondary|Junior_College|College)/)){
   fs.writeFileSync(path.join(out,theme+'-'+relative.replaceAll(path.sep,'-')),result);
  }
 });
}
test('unknown palette is rejected',()=>assert.throws(()=>Themes.recolour(new Uint8Array(),'missing',X),/colour/));

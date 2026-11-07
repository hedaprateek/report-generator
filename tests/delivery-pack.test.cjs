const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),X=require('../assets/vendor/xlsx.full.min.js');
const ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(__dirname,'../assets/js/delivery-pack.js'),'utf8'),ctx);const safe=ctx.window.DeliveryPack.filename;
test('ZIP entry paths remain portable and preserve the numbered mapping for non-Latin names',()=>{
 const names=['आशा','राहुल','Zoë López','../Asha\\Test','Asha/Test','Asha:Test'],zip=X.CFB.utils.cfb_new();
 const paths=names.map((n,i)=>`students/${String(i+1).padStart(4,'0')}_${safe(n,'student')}.pdf`);
 assert.equal(new Set(paths).size,names.length);assert.ok(paths.every(p=>/^[\x20-\x7e]+$/.test(p)&&!p.includes('..')));assert.equal(safe('Zoë López'),'Zoe_Lopez');
 paths.forEach(p=>X.CFB.utils.cfb_add(zip,p,Buffer.from('PDF')));const result=X.CFB.read(X.CFB.write(zip,{type:'buffer',fileType:'zip'}),{type:'buffer'});
 for(const p of paths)assert.ok(result.FullPaths.includes('Root Entry/'+p));
});

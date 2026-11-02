// Local preview: node serve.cjs [port]
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const server = http.createServer((req,res) => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405).end();return;}
  let file;
  try {file = decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1) || 'index.html';}
  catch {res.writeHead(400).end();return;}
  const allowed = /^(?:index\.html|parent\.html|sw\.js|manifest\.webmanifest|(?:assets|segments|tools)\/.+)$/;
  const absolute = path.resolve(__dirname,file);
  if (!allowed.test(file) || !absolute.startsWith(__dirname+path.sep) || file.includes('\\')) {res.writeHead(404).end();return;}
  fs.readFile(absolute,(err,bytes) => {
    if (err) {res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  });
});
server.on('error',error => {console.error(error.message);process.exitCode=1;});
server.listen(Number(process.argv[2] || 4175),'127.0.0.1',() => console.log(`Report Generator: http://localhost:${server.address().port}`));

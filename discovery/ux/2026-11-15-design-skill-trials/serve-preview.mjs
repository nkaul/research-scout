import http from 'node:http';
import fs from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.SCOUT_MOCKUP_PORT||3215);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1');let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    const actual=await realpath(file);if(!actual.startsWith(root+path.sep))throw Error('Outside preview');
    const info=await stat(actual);if(!info.isFile())throw Error('Not a file');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'self'"});
    if(req.method==='HEAD')res.end();else fs.createReadStream(actual).pipe(res);
  }catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Preview file not found.');}
}).listen(port,'127.0.0.1',()=>console.log(`Research Scout mockup gallery: http://127.0.0.1:${port}`));

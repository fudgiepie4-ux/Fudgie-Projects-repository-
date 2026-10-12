import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './store.ts';
async function readBody(req:IncomingMessage,limit:number){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error('Upload exceeds size limit');chunks.push(chunk);}return Buffer.concat(chunks);}
type BasicAuth={username:string;password:string};
export function validateNetworkHost(host:string, env:Record<string,string|undefined>=process.env){
  const loopback=['127.0.0.1','::1','localhost'].includes(host);
  if(loopback)return;
  if(!env.FUDGIE_AUTH_USER||!env.FUDGIE_AUTH_PASSWORD||env.FUDGIE_AUTH_PASSWORD.length<16||env.FUDGIE_HTTPS_PROXY_CONFIRMED!=='YES')
    throw new Error('Network listening requires FUDGIE_AUTH_USER, a strong FUDGIE_AUTH_PASSWORD, and an HTTPS gateway with FUDGIE_HTTPS_PROXY_CONFIRMED=YES');
}
function authorized(value:string|undefined,auth:BasicAuth){
  if(!value?.startsWith('Basic ')||value.length>2048)return false;
  const raw=Buffer.from(value.slice(6),'base64').toString('utf8');
  const supplied=createHash('sha256').update(raw).digest();
  const expected=createHash('sha256').update(auth.username+':'+auth.password).digest();
  return timingSafeEqual(supplied,expected);
}
export function createApp(dataDir:string,options:{auth?:BasicAuth}={}){
if(process.env.VERCEL==='1')throw new Error('Local SQLite + uploaded originals require persistent storage; do not run this archive on ephemeral Vercel Functions');
const auth=options.auth??(process.env.FUDGIE_AUTH_USER&&process.env.FUDGIE_AUTH_PASSWORD?{username:process.env.FUDGIE_AUTH_USER,password:process.env.FUDGIE_AUTH_PASSWORD}:null);
mkdirSync(resolve(dataDir,'originals'),{recursive:true});const store=new Store(resolve(dataDir,'archive.sqlite'));
const server=createServer(async(req:IncomingMessage,res:ServerResponse)=>{try{const url=new URL(req.url??'/',`http://${req.headers.host??'localhost'}`),path=url.pathname,method=req.method??'GET';res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
if(auth&&!authorized(req.headers.authorization,auth)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="FudgiePie Private Research", charset="UTF-8"','Content-Type':'text/plain; charset=utf-8'});return res.end('Authentication required');}res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'");if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){res.writeHead(403);return res.end('Cross-origin requests are not allowed');}
const json=(value:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const body=async()=>JSON.parse((await readBody(req,1024*1024)).toString('utf8'));
if(method==='GET'&&path==='/api/archive')return json(store.snapshot());
if(method==='POST'&&path==='/api/records')return json(store.create(await body()),201);
let match=path.match(/^\/api\/records\/([^/]+)(?:\/(review|history))?$/);
if(match){const id=match[1];if(method==='PUT'&&!match[2])return json(store.update(id,await body()));if(method==='POST'&&match[2]==='review')return json(store.review(id,await body()));if(method==='GET'&&match[2]==='history'){store.get(id);return json(store.db.prepare('SELECT * FROM revisions WHERE record_id=? ORDER BY created DESC').all(id));}}
if(method==='POST'&&path==='/api/links')return json({id:store.link(await body())},201);
if(method==='POST'&&path==='/api/documents'){const name=basename(url.searchParams.get('name')??'').replace(/[\r\n]/g,'').slice(0,255);if(!name)throw new Error('A filename is required');const buffer=await readBody(req,25*1024*1024);if(!buffer.length)throw new Error('Choose a nonempty file');const hash=createHash('sha256').update(buffer).digest('hex'),found=store.db.prepare('SELECT * FROM documents WHERE hash=?').get(hash);if(found)return json(found);const location=resolve(dataDir,'originals',hash);if(existsSync(location)){if(createHash('sha256').update(readFileSync(location)).digest('hex')!==hash)throw new Error('Archive integrity check failed');}else writeFileSync(location,buffer,{flag:'wx'});const id=randomUUID();store.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?)').run(id,name,hash,buffer.length,new Date().toISOString());return json(store.db.prepare('SELECT * FROM documents WHERE id=?').get(id),201);}
match=path.match(/^\/api\/documents\/([^/]+)$/);if(method==='GET'&&match){const doc=store.db.prepare('SELECT * FROM documents WHERE id=?').get(match[1]);if(!doc){res.writeHead(404);return res.end('Document not found');}res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(String(doc.name))}`});return res.end(readFileSync(resolve(dataDir,'originals',String(doc.hash))));}
match=path.match(/^\/api\/export\/(chapters|timeline|sources)$/);if(method==='GET'&&match){res.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="fudgie-${match[1]}.md"`});return res.end(store.export(match[1]));}
if(method==='GET'&&!path.startsWith('/api/')){const relative=path==='/'?'index.html':decodeURIComponent(path).slice(1),location=resolve('dist',relative),base=resolve('dist')+'/';if(location.startsWith(base)&&existsSync(location)&&statSync(location).isFile()){const types:{[key:string]:string}={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};res.writeHead(200,{'Content-Type':types[extname(location)]??'application/octet-stream'});return res.end(readFileSync(location));}}
res.writeHead(404);res.end('Not found');}catch(e){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e instanceof Error?e.message:'Request failed'}));}});return {server,store};}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const host=process.env.HOST??'127.0.0.1';validateNetworkHost(host);const {server}=createApp(resolve(process.env.DATA_DIR??'data'));server.listen(Number(process.env.PORT??3000),host,()=>console.log('FudgiePie running on port '+(process.env.PORT??3000)));}

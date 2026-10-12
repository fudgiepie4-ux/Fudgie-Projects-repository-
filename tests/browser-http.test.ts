import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createApp, validateNetworkHost } from '../src/server.ts';

// Synthetic test data only. No private family names or original documents are stored in Git.
async function started(auth?:{username:string;password:string}) {
  const dir=mkdtempSync(join(tmpdir(),'fudgie-http-'));
  const instance=createApp(dir,auth?{auth}:{});
  try {
    await new Promise<void>((resolve,reject)=>{
      instance.server.once('error',reject);
      instance.server.listen(0,'127.0.0.1',()=>{instance.server.off('error',reject);resolve();});
    });
  }catch(e){instance.store.db.close();rmSync(dir,{recursive:true,force:true});throw e;}
  const address=instance.server.address();
  if(!address||typeof address==='string')throw new Error('Missing server port');
  return {base:'http://127.0.0.1:'+address.port,instance,close:async()=>{
    await new Promise<void>((resolve,reject)=>instance.server.close(err=>err?reject(err):resolve()));
    instance.store.db.close();rmSync(dir,{recursive:true,force:true});
  }};
}
async function post(base:string,path:string,value:unknown){
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  return {status:response.status,payload:await response.json()};
}
test('public network binding fails closed without authentication and HTTPS gateway',()=>{
  assert.doesNotThrow(()=>validateNetworkHost('127.0.0.1',{}));
  assert.throws(()=>validateNetworkHost('0.0.0.0',{}),/Network listening requires/);
  assert.throws(()=>validateNetworkHost('::',{'FUDGIE_AUTH_USER':'test','FUDGIE_AUTH_PASSWORD':'short','FUDGIE_HTTPS_PROXY_CONFIRMED':'YES'}),/Network listening requires/);
  assert.doesNotThrow(()=>validateNetworkHost('0.0.0.0',{'FUDGIE_AUTH_USER':'test','FUDGIE_AUTH_PASSWORD':'synthetic-long-password-1234','FUDGIE_HTTPS_PROXY_CONFIRMED':'YES'}));
});
test('Basic authentication protects UI and every API path on a gated server',async()=>{
  const username='test-only-user',password='synthetic-long-password-1234';
  const app=await started({username,password});
  try{
    for(const path of ['/', '/api/archive', '/api/export/chapters', '/api/documents/not-found']){
      const denied=await fetch(app.base+path,{redirect:'manual'});
      assert.equal(denied.status,401,path);
      assert.match(denied.headers.get('www-authenticate')??'',/Basic realm/);
    }
    const deniedPost=await fetch(app.base+'/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(deniedPost.status,401);
    const basic='Basic '+Buffer.from(username+':'+password).toString('base64');
    const archive=await fetch(app.base+'/api/archive',{headers:{Authorization:basic}});
    assert.equal(archive.status,200);
    const created=await fetch(app.base+'/api/records',{method:'POST',
      headers:{Authorization:basic,'Content-Type':'application/json'},
      body:JSON.stringify({kind:'Discovery',title:'TEST ONLY authorized',body:'Synthetic'})});
    assert.equal(created.status,201);
    const wrong=await fetch(app.base+'/api/archive',{headers:{Authorization:'Basic '+Buffer.from(username+':wrong').toString('base64')}});
    assert.equal(wrong.status,401);
  }finally{await app.close();}
});
test('real localhost HTTP requests exercise evidence, review and export gates',async()=>{
  const app=await started();
  try {
    const root=await fetch(app.base+'/');
    assert.equal(root.status,200);
    assert.match(await root.text(),/FudgiePie/);
    const source=await post(app.base,'/api/records',{kind:'Source',title:'TEST ONLY original source',body:'Synthetic citation document'});
    const discovery=await post(app.base,'/api/records',{kind:'Discovery',title:'TEST ONLY research finding',body:'Not a real family claim'});
    assert.equal(source.status,201);assert.equal(discovery.status,201);
    assert.equal(discovery.payload.status,'Unverified');
    const badReview=await post(app.base,'/api/records/'+discovery.payload.id+'/review',
      {status:'Confirmed',reviewer:'Synthetic tester',note:'Cannot confirm without evidence'});
    assert.equal(badReview.status,400);
    const upload=await fetch(app.base+'/api/documents?name=TEST-ONLY-source.txt',
      {method:'POST',headers:{'Content-Type':'application/octet-stream'},body:'Synthetic original file'});
    assert.equal(upload.status,201);
    const document=await upload.json();
    const sourceLink=await post(app.base,'/api/links',
      {from:source.payload.id,document:document.id,citation:'TEST ONLY archive, page 1'});
    assert.equal(sourceLink.status,201);
    const sourceReview=await post(app.base,'/api/records/'+source.payload.id+'/review',
      {status:'Confirmed',reviewer:'Synthetic tester',note:'Synthetic original linked'});
    assert.equal(sourceReview.status,200);
    const discoveryLink=await post(app.base,'/api/links',
      {from:discovery.payload.id,to:source.payload.id,citation:'TEST ONLY source, page 1'});
    assert.equal(discoveryLink.status,201);
    const discoveryReview=await post(app.base,'/api/records/'+discovery.payload.id+'/review',
      {status:'Confirmed',reviewer:'Synthetic tester',note:'Test-only evidence',approve:true});
    assert.equal(discoveryReview.status,200);
    assert.equal(discoveryReview.payload.book_approved,1);
    const snapshot=await (await fetch(app.base+'/api/archive')).json();
    assert.equal(snapshot.records.length,2);
    assert.equal(snapshot.documents.length,1);
    assert.equal(snapshot.links.length,2);
    const retrieved=await fetch(app.base+'/api/documents/'+document.id);
    assert.equal(await retrieved.text(),'Synthetic original file');
    const blocked=await fetch(app.base+'/api/records',
      {method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'});
    assert.equal(blocked.status,403);
  }finally{await app.close();}
});

function chromeBinary(){
  const candidates=[process.env.CHROME_BIN,process.env.CHROME_PATH,
    '/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
  return candidates.find(p=>p&&existsSync(p))??null;
}
async function dumpDom(binary:string,url:string){
  return await new Promise<{stdout:string;stderr:string;exit:number|null}>((resolve,reject)=>{
    const child=spawn(binary,['--headless=new','--no-sandbox','--disable-gpu',
      '--disable-dev-shm-usage','--disable-background-networking',
      '--no-first-run','--no-default-browser-check',
      '--virtual-time-budget=5000','--dump-dom',url],
      {stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';
    const watchdog=setTimeout(()=>child.kill('SIGKILL'),30000);
    child.stdout.on('data',d=>{stdout+=String(d);if(stdout.length>3000000)child.kill('SIGKILL');});
    child.stderr.on('data',d=>{stderr+=String(d);if(stderr.length>300000)stderr=stderr.slice(-300000);});
    child.once('error',e=>{clearTimeout(watchdog);reject(e);});
    child.once('close',code=>{clearTimeout(watchdog);resolve({stdout,stderr,exit:code});});
  });
}
test('real Chromium renders Family Research UI with only synthetic records',async t=>{
  const binary=chromeBinary();
  if(!binary){
    if(process.env.CI)throw new Error('Chrome/Chromium is required for CI browser acceptance');
    t.skip('Chrome/Chromium not installed');return;
  }
  const app=await started();
  try {
    const created=await post(app.base,'/api/records',
      {kind:'Discovery',title:'TEST ONLY CHROMIUM UI DISPLAY',body:'Synthetic research result'});
    assert.equal(created.status,201);
    const result=await dumpDom(binary,app.base+'/');
    assert.equal(result.exit,0,'Headless browser failed: '+result.stderr.slice(-1000));
    assert.match(result.stdout,/Family Research Center/);
    assert.match(result.stdout,/TEST ONLY CHROMIUM UI DISPLAY/);
    assert.match(result.stdout,/Discovery · Unverified/);
    assert.doesNotMatch(result.stdout,/Could not load the shared archive/);
  }finally{await app.close();}
});

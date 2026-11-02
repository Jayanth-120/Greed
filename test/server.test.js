const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
async function waitFor(url,child){for(let i=0;i<80;i++){if(child.exitCode!==null)throw new Error('server exited early');try{const r=await fetch(url+'/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('server did not become healthy')}
test('account, persistent character, movement, chat and session logout',async()=>{
  const port=await freePort(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'greed-web-')),dbPath=path.join(tmp,'test.sqlite'),url=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),DB_PATH:dbPath},stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',x=>stderr+=x);
  try{
    await waitFor(url,child);
    const reg=await fetch(url+'/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'TestPlayer',password:'a-strong-test-password'})});
    assert.equal(reg.status,200,await reg.text());const cookie=reg.headers.get('set-cookie').match(/greed_session=([^;]+)/)[1],headers={cookie:`greed_session=${cookie}`};
    let state=await fetch(url+'/api/state',{headers}).then(r=>r.json());assert.equal(state.character.name,'TestPlayer');assert.ok(state.character.job);assert.equal(state.character.location,'town');
    const move=await fetch(url+'/api/action',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({action:'travel',destination:'meadow'})});assert.equal(move.status,200,await move.text());
    state=await fetch(url+'/api/state',{headers}).then(r=>r.json());assert.equal(state.character.location,'meadow');assert.ok(Array.isArray(state.world.npcs));
    const chat=await fetch(url+'/api/chat',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({message:'hello frontier'})});assert.equal(chat.status,200);
    state=await fetch(url+'/api/state',{headers}).then(r=>r.json());assert.ok(state.chat.some(m=>m.message==='hello frontier'));
    await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGINT')});
    const child2=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),DB_PATH:dbPath},stdio:['ignore','pipe','pipe']});child2.stderr.on('data',x=>stderr+=x);
    try{
      await waitFor(url,child2);
      const login=await fetch(url+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'TestPlayer',password:'a-strong-test-password'})});
      assert.equal(login.status,200);
      const cookie2=login.headers.get('set-cookie').match(/greed_session=([^;]+)/)[1],authHeaders={cookie:`greed_session=${cookie2}`};
      const persisted=await fetch(url+'/api/state',{headers:authHeaders}).then(r=>r.json());assert.equal(persisted.character.location,'meadow');
      const loggedOut=await fetch(url+'/api/logout',{method:'POST',headers:authHeaders});assert.equal(loggedOut.status,200);
      const denied=await fetch(url+'/api/state',{headers:authHeaders});assert.equal(denied.status,401);
    }finally{await new Promise(resolve=>{child2.once('exit',resolve);child2.kill('SIGINT')})}
    assert.match(stderr,/^$/,'unexpected server error output');
  }finally{if(child.exitCode===null)child.kill('SIGINT');for(let i=0;i<15;i++){try{fs.rmSync(tmp,{recursive:true,force:true});break}catch(e){if(i===14)throw e;await new Promise(r=>setTimeout(r,100))}}}
});

test('browser client inline JavaScript parses',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length>0);
  for(const match of scripts)new vm.Script(match[1]);
});

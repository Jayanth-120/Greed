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
    const scene=await fetch(url+'/scene.js');assert.equal(scene.status,200);assert.match(await scene.text(),/requestAnimationFrame\(render\)/);
    const unauthMove=await fetch(url+'/api/move',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({direction:'right'})});assert.equal(unauthMove.status,401);
    const reg=await fetch(url+'/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'TestPlayer',password:'a-strong-test-password'})});
    assert.equal(reg.status,200,await reg.text());const cookie=reg.headers.get('set-cookie').match(/greed_session=([^;]+)/)[1],headers={cookie:`greed_session=${cookie}`};
    let state=await fetch(url+'/api/state',{headers}).then(r=>r.json());assert.equal(state.character.name,'TestPlayer');assert.ok(state.character.job);assert.equal(state.character.location,'town');assert.equal(state.character.pos_x,8);assert.equal(state.character.pos_y,6);
    const moveWorld=async(direction)=>fetch(url+'/api/move',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({direction})});
    let moved=await moveWorld('right');assert.equal(moved.status,200,await moved.text());state=await fetch(url+'/api/state',{headers}).then(r=>r.json());assert.equal(state.character.pos_x,9);assert.equal(state.world.turn,0);
    assert.equal((await moveWorld('teleport')).status,400);assert.equal((await fetch(url+'/api/move',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({direction:'right',steps:99})})).status,400);await new Promise(r=>setTimeout(r,120));for(let i=0;i<3;i++){const bounded=await fetch(url+'/api/move',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({direction:'right',steps:3})});assert.equal(bounded.status,200,await bounded.text());await new Promise(r=>setTimeout(r,120))}state=await fetch(url+'/api/state',{headers}).then(r=>r.json());assert.equal(state.character.pos_x,15);assert.equal(state.world.turn,0);
    const sqlite=require('node:sqlite'),db=new sqlite.DatabaseSync(dbPath);assert.ok(db.prepare('PRAGMA table_info(characters)').all().some(c=>c.name==='pos_x'));assert.ok(db.prepare('PRAGMA table_info(characters)').all().some(c=>c.name==='pos_y'));db.close();
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
       const persisted=await fetch(url+'/api/state',{headers:authHeaders}).then(r=>r.json());assert.equal(persisted.character.location,'meadow');assert.equal(persisted.character.pos_x,15);
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
  new vm.Script(fs.readFileSync(path.join(__dirname,'..','public','scene.js'),'utf8'));
});

test('existing character table receives coordinate migration at startup',async()=>{
  const {DatabaseSync}=require('node:sqlite'),port=await freePort(),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'greed-legacy-')),dbPath=path.join(tmp,'legacy.sqlite'),url=`http://127.0.0.1:${port}`,legacy=new DatabaseSync(dbPath);
  legacy.exec("CREATE TABLE characters(user_id INTEGER PRIMARY KEY, location TEXT NOT NULL DEFAULT 'town')");legacy.close();
  const child=spawn(process.execPath,[path.join(__dirname,'..','server.js')],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),DB_PATH:dbPath},stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',x=>stderr+=x);
  try{await waitFor(url,child);const db=new DatabaseSync(dbPath),columns=db.prepare('PRAGMA table_info(characters)').all().map(c=>c.name);db.close();assert.ok(columns.includes('pos_x'));assert.ok(columns.includes('pos_y'));assert.equal(stderr,'')}
  finally{await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);child.kill('SIGINT')});fs.rmSync(tmp,{recursive:true,force:true})}
});

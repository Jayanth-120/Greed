'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const COOKIE = 'greed_session';
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
const PUBLIC_DIR = path.join(__dirname, 'public');
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'world.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, passhash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states(state_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS characters(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, job TEXT NOT NULL, class_rating TEXT NOT NULL DEFAULT 'Normal', level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, stat_points INTEGER NOT NULL DEFAULT 0, hp INTEGER NOT NULL DEFAULT 30, max_hp INTEGER NOT NULL DEFAULT 30, stamina INTEGER NOT NULL DEFAULT 12, max_stamina INTEGER NOT NULL DEFAULT 12, mana INTEGER NOT NULL DEFAULT 0, max_mana INTEGER NOT NULL DEFAULT 0, gold INTEGER NOT NULL DEFAULT 10, fame INTEGER NOT NULL DEFAULT 0, location TEXT NOT NULL DEFAULT 'town', attributes TEXT NOT NULL, skills TEXT NOT NULL, cooldowns TEXT NOT NULL, bag TEXT NOT NULL, gear TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS quests(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, quest_key TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, required INTEGER NOT NULL, progress INTEGER NOT NULL DEFAULT 0, reward_gold INTEGER NOT NULL, reward_xp INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'available', UNIQUE(user_id, quest_key));
CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, username TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guilds(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, leader_id INTEGER NOT NULL REFERENCES users(id), level INTEGER NOT NULL DEFAULT 1, fame INTEGER NOT NULL DEFAULT 0, gold INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS guild_members(guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'member', contribution INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS world(id INTEGER PRIMARY KEY CHECK(id=1), turn INTEGER NOT NULL, threat REAL NOT NULL, prosperity REAL NOT NULL, stability REAL NOT NULL, active_event TEXT, event_progress INTEGER NOT NULL, event_need INTEGER NOT NULL, event_turns INTEGER NOT NULL, event_feed TEXT NOT NULL, npcs TEXT NOT NULL, updated_at INTEGER NOT NULL);
`);
const characterColumns=new Set(db.prepare('PRAGMA table_info(characters)').all().map(c=>c.name));
if(!characterColumns.has('pos_x'))db.exec('ALTER TABLE characters ADD COLUMN pos_x INTEGER NOT NULL DEFAULT 8');
if(!characterColumns.has('pos_y'))db.exec('ALTER TABLE characters ADD COLUMN pos_y INTEGER NOT NULL DEFAULT 6');
const existingUserColumns=new Set(db.prepare('PRAGMA table_info(users)').all().map(c=>c.name));
if(!existingUserColumns.has('email'))db.exec('ALTER TABLE users ADD COLUMN email TEXT');
if(!existingUserColumns.has('google_sub'))db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
if(!existingUserColumns.has('is_admin'))db.exec('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub) WHERE google_sub IS NOT NULL');
const npcSeed = [
  { id:'mira',name:'Mira Venn',job:'Blacksmith',place:'town',level:8,goal:'craft',gold:34,rep:2 },
  { id:'tovin',name:'Tovin Reed',job:'Hunter',place:'meadow',level:5,goal:'hunt',gold:17,rep:1 },
  { id:'sel',name:'Sel Arquen',job:'Mage',place:'ruins',level:12,goal:'research',gold:51,rep:4 },
  { id:'bram',name:'Bram Hollow',job:'Miner',place:'mine',level:6,goal:'gather',gold:12,rep:1 },
  { id:'nima',name:'Nima Sol',job:'Merchant',place:'town',level:9,goal:'trade',gold:82,rep:3 },
  { id:'kael',name:'Kael Dusk',job:'Swordsman',place:'woods',level:11,goal:'train',gold:26,rep:2 },
  { id:'orin',name:'Orin Bell',job:'Orator',place:'town',level:4,goal:'talk',gold:19,rep:5 },
  { id:'ves',name:'Ves Aster',job:'Scout',place:'woods',level:7,goal:'explore',gold:22,rep:2 }
];
const worldInit = db.prepare('INSERT OR IGNORE INTO world VALUES(1,0,16,54,84,NULL,0,3,0,?,?,?)');
worldInit.run(JSON.stringify(['Morpheus is observing the frontier.']), JSON.stringify(npcSeed), Date.now());

const locations = {
  town:{name:'Briarhold',links:['meadow','mine','ruins'],description:'A frontier settlement of traders, guild recruiters, and workshops.'},
  meadow:{name:'Windglass Meadow',links:['town','woods'],enemy:'Fang Hare',power:3,find:['herb','hide'],description:'Field creatures roam the grassland beyond the town road.'},
  woods:{name:'Ashpine Woods',links:['meadow','ruins'],enemy:'Thorn Wolf',power:6,find:['wood','hide'],description:'A dangerous forest with timber and hunting grounds.'},
  mine:{name:'Coppervein Mine',links:['town'],enemy:'Cave Crawler',power:5,find:['ore','coin'],description:'Copper seams and old tunnels attract miners and cave beasts.'},
  ruins:{name:'Sunken Watch',links:['town','woods'],enemy:'Stone Sentinel',power:9,find:['relic','ore'],description:'An uncharted ruin has drawn adventurers and scholars.'}
};
const itemNames={herb:'Moonleaf',wood:'Ashpine timber',ore:'Copper ore',hide:'Beast hide',relic:'Old relic',coin:'Old coin',fish:'River fish'};
const normalJobs=['Swordsman','Archer','Mage','Assassin','Blacksmith','Miner','Tailor','Chef','Merchant','Scout','Orator','Fisher','Spearman','Shield Warrior','Martial Artist','Priest','Necromancer','Alchemist','Hunter','Farmer','Carpenter','Bard','Druid','Ranger','Thief','Herbalist','Sailor','Cook','Trapper','Tactician'];
const secretLegendary=['Legendary Blacksmith','Sword Saint','Bow Saint','Legendary Assassin','Legendary Great Magician','Demon Slayer','Legendary Tailor','Legendary Miner'];
const abilitySets={
  Swordsman:[['Crescent Cut',7,2],['Guard Break',10,4],['Iron Stance',0,3],['Rising Edge',14,6],['World-Cleaving Arc',30,10,'ultimate']],
  Archer:[['Quick Shot',6,1],['Pinning Arrow',9,3],['Eagle Focus',0,3],['Piercing Volley',15,6],['Starfall Barrage',30,10,'ultimate']],
  Mage:[['Ember Bolt',8,2,'magic'],['Frost Bind',7,3,'magic'],['Mana Draw',0,3,'restore'],['Storm Lance',16,6,'magic'],['Cataclysm',32,11,'ultimateMagic']],
  Assassin:[['Backstep Strike',8,2],['Smoke Veil',0,3],['Venom Edge',11,4],['Shadow Lunge',16,6],['Nightfall Execution',34,11,'ultimate']],
  Blacksmith:[['Hammerfall',8,2],['Tempered Guard',0,3],['Sparksurge',12,4],['Anvil Crash',17,7],['Legendary Forge Art',32,11,'ultimate']],
  Miner:[['Pickaxe Swing',8,2],['Vein Sense',0,3],['Stonebreaker',12,4],['Deep Seam',15,6],['Mountain’s Heart',30,10,'ultimate']],
  Tailor:[['Thread Snare',7,2],['Quick Stitch',0,3],['Needle Flurry',11,4],['Woven Guard',14,6],['Grand Tapestry',28,10,'ultimate']],
  Chef:[['Pan Strike',8,2],['Nourishing Meal',0,3,'restore'],['Spice Burst',11,4],['Hearty Feast',0,6,'restore'],['Banquet of Legends',28,10,'ultimate']],
  Merchant:[['Haggle',0,2],['Appraise',0,3],['Trade Wind',8,4],['Call in a Favor',0,6,'restore'],['Market Dominion',20,10,'ultimate']],
  Orator:[['Cutting Remark',7,2],['Rallying Words',0,3,'restore'],['Disarm the Crowd',0,4],['Commanding Speech',14,6],['Voice of the Frontier',28,10,'ultimate']],
  Fisher:[['Net Cast',7,2],['Read the Current',0,3],['Harpoon Thrust',11,4],['Deepwater Haul',14,6],['Leviathan’s Bounty',27,10,'ultimate']],
  Gatherer:[['Forager’s Strike',7,2],['Identify Herb',0,3],['Quick Harvest',10,4],['Bountiful Gather',0,6,'restore'],['Nature’s Plenty',25,10,'ultimate']],
  Scout:[['Quick Shot',6,1],['Trail Mark',0,3],['Pinning Arrow',9,4],['Ambush Volley',15,6],['Far-Seer’s Barrage',30,10,'ultimate']],
  Spearman:[['Spear Thrust',8,2],['Brace',0,3],['Cyclone Sweep',12,4],['Impaling Charge',16,6],['Sky-Piercing Formation',30,10,'ultimate']],
  ShieldWarrior:[['Shield Bash',7,2],['Bulwark',0,3],['Counterwall',11,4],['Fortress Advance',14,6],['Unbreakable Bastion',28,10,'ultimate']],
  MartialArtist:[['Palm Strike',8,2],['Breath Control',0,3,'restore'],['Rising Knee',11,4],['Flowing Counter',15,6],['Hundred-Fist Zenith',30,10,'ultimate']],
  Farmer:[['Pitchfork Thrust',7,2],['Soil Reading',0,3],['Harvest Strength',10,4],['Field Dressing',0,6,'restore'],['Abundant Season',25,10,'ultimate']]
};
function getAbilities(job){
  if(abilitySets[job])return abilitySets[job];
  if(['Legendary Great Magician','Druid','Priest','Necromancer','Alchemist'].includes(job))return abilitySets.Mage;
  if(['Bow Saint','Ranger','Hunter','Trapper'].includes(job))return abilitySets.Scout;
  if(['Legendary Assassin','Thief'].includes(job))return abilitySets.Assassin;
  if(job==='Legendary Blacksmith')return abilitySets.Blacksmith;
  if(['Legendary Miner','Carpenter','Mason'].includes(job))return abilitySets.Miner;
  if(['Legendary Tailor','Weaver'].includes(job))return abilitySets.Tailor;
  if(['Cook','Brewer','Alchemist'].includes(job))return abilitySets.Chef;
  if(['Merchant','Tactician','Bard'].includes(job))return abilitySets.Merchant;
  if(job==='Orator')return abilitySets.Orator;
  if(['Fisher','Sailor'].includes(job))return abilitySets.Fisher;
  if(job==='Farmer')return abilitySets.Farmer;
  if(['Herbalist','Gatherer'].includes(job))return abilitySets.Gatherer;
  if(job==='Scout')return abilitySets.Scout;
  if(['Spearman','Lancer','Pikeman'].includes(job))return abilitySets.Spearman;
  if(job==='Shield Warrior'||job==='Knight')return abilitySets.ShieldWarrior;
  if(job==='Martial Artist'||job==='Brawler')return abilitySets.MartialArtist;
  if(job==='Farmer')return abilitySets.Farmer;
  return abilitySets.Swordsman;
}
function getPassives(job){if(['Mage','Legendary Great Magician','Druid','Priest','Necromancer','Alchemist'].includes(job))return ['Magic Control','Mana Sense'];if(['Archer','Bow Saint','Scout','Ranger','Hunter','Trapper'].includes(job))return ['Archery Mastery','Keen Sight'];if(['Assassin','Legendary Assassin','Thief'].includes(job))return ['Dagger Mastery','Stealth'];if(['Blacksmith','Legendary Blacksmith'].includes(job))return ['Blacksmithing','Material Insight'];if(['Miner','Legendary Miner'].includes(job))return ['Mining Proficiency','Ore Sense'];return [`${job} Proficiency`]}
function json(text,fallback){try{return JSON.parse(text)}catch{return fallback}}
function readBody(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',d=>{raw+=d;if(raw.length>32768){reject(new Error('Request body too large'));req.destroy()}});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)})}
function send(res,status,body,headers={}){const data=typeof body==='string'?body:JSON.stringify(body);res.writeHead(status,{'Content-Type':typeof body==='string'?'text/plain; charset=utf-8':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(data)}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}))}
function sessionUser(req){const raw=cookies(req)[COOKIE];if(!raw)return null;const hash=crypto.createHash('sha256').update(raw).digest('hex');const row=db.prepare('SELECT u.id,u.username,u.email,u.is_admin,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(hash);if(!row||row.expires_at<Date.now()){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash);return null}return row}
function makeSession(userId,req,res){const token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest('hex'),secure=Boolean(req.socket.encrypted||req.headers['x-forwarded-proto']==='https');db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash,userId,Date.now()+SESSION_MS);res.setHeader('Set-Cookie',`${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS/1000}${secure?'; Secure':''}`)}
function googleRedirectUri(){return process.env.GOOGLE_REDIRECT_URI||`${process.env.RENDER_EXTERNAL_URL||`http://localhost:${PORT}`}/auth/google/callback`}
function secureCookie(req,name,value,age){const secure=Boolean(req.socket.encrypted||req.headers['x-forwarded-proto']==='https');return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure?'; Secure':''}`}
function normalizeUsername(display,email){let base=String(display||email.split('@')[0]).normalize('NFKD').replace(/[^a-zA-Z0-9_]/g,'').slice(0,16);if(base.length<3)base=`player${base}`;let candidate=base,n=0;while(db.prepare('SELECT 1 FROM users WHERE username=? COLLATE NOCASE').get(candidate)){candidate=`${base.slice(0,15)}${String(++n).padStart(4,'0')}`.slice(0,20)}return candidate}
async function finishGoogleLogin(req,res,url){
  const queryState=url.searchParams.get('state'),cookieState=cookies(req).greed_oauth_state;
  if(!queryState||!cookieState||queryState!==cookieState)return send(res,400,'Google sign-in state validation failed. Please try again.');
  const stateHash=crypto.createHash('sha256').update(queryState).digest('hex'),saved=db.prepare('SELECT expires_at FROM oauth_states WHERE state_hash=?').get(stateHash);db.prepare('DELETE FROM oauth_states WHERE state_hash=?').run(stateHash);res.setHeader('Set-Cookie',secureCookie(req,'greed_oauth_state','',0));
  if(!saved||saved.expires_at<Date.now())return send(res,400,'Google sign-in expired. Please try again.');
  if(url.searchParams.has('error'))return send(res,401,'Google sign-in was cancelled or denied.');
  const form=new URLSearchParams({code:url.searchParams.get('code')||'',client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:googleRedirectUri(),grant_type:'authorization_code'});
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form});const tokenData=await tokenResponse.json();if(!tokenResponse.ok||!tokenData.access_token)return send(res,502,'Could not complete Google sign-in. Check the OAuth configuration.');
  const profileResponse=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:`Bearer ${tokenData.access_token}`}}),profile=await profileResponse.json();
  if(!profileResponse.ok||!profile.sub||!profile.email||profile.email_verified!==true)return send(res,403,'Google must provide a verified email address.');
  let account=db.prepare('SELECT id,username,email,google_sub,is_admin FROM users WHERE google_sub=?').get(profile.sub);
  if(!account)account=db.prepare('SELECT id,username,email,google_sub,is_admin FROM users WHERE email=? COLLATE NOCASE').get(profile.email);
  if(account){db.prepare('UPDATE users SET google_sub=?,email=? WHERE id=?').run(profile.sub,profile.email,account.id);account=db.prepare('SELECT id,username,email,google_sub,is_admin FROM users WHERE id=?').get(account.id)}
  else{const username=normalizeUsername(profile.name,profile.email),salt=crypto.randomBytes(16).toString('hex'),randomHash=crypto.randomBytes(64).toString('hex');const created=db.prepare('INSERT INTO users(username,salt,passhash,email,google_sub,created_at) VALUES(?,?,?,?,?,?)').run(username,salt,randomHash,profile.email,profile.sub,Date.now());createCharacter(Number(created.lastInsertRowid),username);account=db.prepare('SELECT id,username,email,google_sub,is_admin FROM users WHERE id=?').get(Number(created.lastInsertRowid))}
  const adminEmail=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();if(adminEmail&&profile.email.toLowerCase()===adminEmail){db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(account.id);account.is_admin=1}
  makeSession(account.id,req,res);res.writeHead(303,{Location:'/','Cache-Control':'no-store'});res.end();
}
function createCharacter(userId,name){
  const legendary=Math.random()<0.008,job=legendary?secretLegendary[Math.floor(Math.random()*secretLegendary.length)]:normalJobs[Math.floor(Math.random()*normalJobs.length)];
  const magic=['Mage','Legendary Great Magician','Druid','Priest','Necromancer','Alchemist'].includes(job),skills={};
  for(const [title] of getAbilities(job))skills[title]=1;
  for(const title of getPassives(job))skills[title]=1;
  skills.Exploration=0;
  const attributes={str:5,agi:5,int:5,vit:5,dex:5,insight:0};
  const bag={herb:1,wood:0,ore:0,hide:0,relic:0,coin:0,fish:0,stones:3};
  const gear={name:'Worn Frontier Weapon',grade:'Normal',enhance:0,power:2};
  db.prepare(`INSERT INTO characters(user_id,name,job,class_rating,level,xp,stat_points,hp,max_hp,stamina,max_stamina,mana,max_mana,gold,fame,location,attributes,skills,cooldowns,bag,gear,updated_at) VALUES(?,?,?,?,1,0,0,30,30,12,12,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId,name,job,legendary?'Legendary':'Normal',magic?1000:0,magic?1000:0,10,0,'town',JSON.stringify(attributes),JSON.stringify(skills),JSON.stringify({}),JSON.stringify(bag),JSON.stringify(gear),Date.now());
  const quests=[
    ['tracks','Tracks Beyond Briarhold','Defeat field creatures near town.','kill','field',3,12,35],
    ['ore','The Smith’s Supply Order','Collect copper ore and return to Briarhold.','gather','ore',2,15,45],
    ['ruin','Marks at Sunken Watch','Explore the old watch and report a relic.','gather','relic',1,25,70]
  ];
  const insert=db.prepare('INSERT INTO quests(user_id,quest_key,title,description,kind,target,required,reward_gold,reward_xp) VALUES(?,?,?,?,?,?,?,?,?)');
  for(const q of quests)insert.run(userId,...q);
}
function getCharacter(userId){const row=db.prepare('SELECT * FROM characters WHERE user_id=?').get(userId);if(!row)return null;return {...row,attributes:json(row.attributes,{}),skills:json(row.skills,{}),cooldowns:json(row.cooldowns,{}),bag:json(row.bag,{}),gear:json(row.gear,{})}}
function getWorld(){return db.prepare('SELECT * FROM world WHERE id=1').get()}
function getQuests(userId){return db.prepare('SELECT quest_key,title,description,kind,target,required,progress,reward_gold,reward_xp,status FROM quests WHERE user_id=? ORDER BY id').all(userId)}
function feed(text){const w=getWorld(),messages=json(w.event_feed,[]);messages.unshift(`${new Date().toLocaleTimeString()} · ${text}`);db.prepare('UPDATE world SET event_feed=?,updated_at=? WHERE id=1').run(JSON.stringify(messages.slice(0,18)),Date.now())}
function xp(character,amount){character.xp+=amount;let leveled=false;while(character.xp>=100+character.level*20){character.xp-=100+character.level*20;character.level++;character.max_hp+=4;character.hp=character.max_hp;leveled=true;character.stat_points=(character.stat_points||0)+10}return leveled}
function progressQuest(userId,kind,target,amount=1){const rows=db.prepare('SELECT * FROM quests WHERE user_id=? AND status IN (\'available\',\'accepted\') AND kind=? AND target=?').all(userId,kind,target);for(const q of rows){const n=Math.min(q.required,q.progress+amount),status=n>=q.required?'completed':q.status;db.prepare('UPDATE quests SET progress=?,status=? WHERE id=?').run(n,status,q.id)}}
function processAction(user,body){
  const c=getCharacter(user.id);if(!c)throw new Error('Character not found');const action=String(body.action||'');const w=getWorld();let result='';
  const cooldowns=c.cooldowns;for(const key of Object.keys(cooldowns))cooldowns[key]=Math.max(0,cooldowns[key]-1);
  if(action==='travel'){
    const dest=String(body.destination||''),here=locations[c.location];if(!here.links.includes(dest))throw new Error('That route is not connected.');if(c.stamina<1)throw new Error('You are exhausted; rest first.');c.stamina--;c.location=dest;c.skills.Exploration++;xp(c,2);progressQuest(user.id,'explore','frontier',1);result=`You travelled to ${locations[dest].name}.`;
  }else if(action==='explore'){
    if(c.stamina<1)throw new Error('You are exhausted; rest first.');c.stamina--;const pool=locations[c.location].find||['coin'],item=pool[Math.floor(Math.random()*pool.length)];if(item==='coin')c.gold++;else c.bag[item]=(c.bag[item]||0)+1;c.skills.Exploration++;xp(c,3);if(item==='ore'||item==='relic')progressQuest(user.id,'gather',item,1);progressQuest(user.id,'explore','frontier',1);result=`Exploration found ${itemNames[item]||'an old coin'}.`;
  }else if(action==='fight'){
    const place=locations[c.location];if(!place.enemy)throw new Error('There is no field creature in this location.');if(c.stamina<2)throw new Error('Combat requires 2 stamina.');c.stamina-=2;
    const power=(place.power||3)+Math.floor(Math.random()*4),attack=5+c.attributes.str+Math.floor((c.level-1)*1.5)+c.gear.power+c.gear.enhance*2;
    if(attack+Math.random()*12>=power+5){c.gold+=Math.floor(Math.random()*4)+1;c.skills['Combat Experience']=(c.skills['Combat Experience']||0)+1;const loot=place.find[Math.floor(Math.random()*place.find.length)];if(loot!=='coin')c.bag[loot]=(c.bag[loot]||0)+1;progressQuest(user.id,'kill','field',1);if(loot==='ore'||loot==='relic')progressQuest(user.id,'gather',loot,1);const leveled=xp(c,12+power);result=`Victory against ${place.enemy}! Found ${itemNames[loot]||'gold'} and gained experience.${leveled?' Level up!':''}`;if(Math.random()<.12)c.bag.stones++;
    }else{const damage=Math.max(1,power-Math.floor(c.attributes.vit/3));c.hp-=damage;result=`${place.enemy} hit you for ${damage}.`;if(c.hp<=0){c.hp=Math.ceil(c.max_hp*.5);c.gold=Math.max(0,c.gold-4);c.location='town';result+=' Defeated—you woke in Briarhold, 4 gold lost.'}}
    db.prepare('UPDATE world SET threat=MIN(100,threat+2) WHERE id=1').run();
  }else if(action==='rest'){
    c.hp=c.max_hp;c.stamina=c.max_stamina;c.mana=c.max_mana;result='Rested at the inn; health, stamina, and mana restored.';
  }else if(action==='craft'){
    if(c.job!=='Blacksmith'&&c.job!=='Legendary Blacksmith')throw new Error('Crafting techniques require a blacksmith class.');if(c.bag.ore<2||c.bag.wood<1)throw new Error('Need 2 Copper ore and 1 Ashpine timber.');c.bag.ore-=2;c.bag.wood--;const grade=rollGrade(),power={Normal:4,Rare:7,Epic:11,Unique:16,Legendary:24,Myth:36}[grade];c.gear={name:'Forged Frontier Blade',grade,enhance:0,power};c.skills.Blacksmithing=(c.skills.Blacksmithing||0)+1;xp(c,15);progressQuest(user.id,'craft','item',1);result=`Forged a ${grade}-grade Frontier Blade.`;
  }else if(action==='enhance'){
    if(c.bag.stones<1)throw new Error('You need an enhancement stone.');if(c.gear.enhance>=10)throw new Error('Enhancement limit reached (+10).');c.bag.stones--;const grades=['Normal','Rare','Epic','Unique','Legendary','Myth'],chance=Math.max(.08,.88-c.gear.enhance*.075-grades.indexOf(c.gear.grade)*.1);if(Math.random()<chance){c.gear.enhance++;result=`Success! ${c.gear.name} is now +${c.gear.enhance}.`}else{c.gear.enhance=Math.max(0,c.gear.enhance-3);result=`Enhancement failed; your item dropped to +${c.gear.enhance}.`}
  }else if(action==='useSkill'){
    const skill=String(body.skill||''),ability=getAbilities(c.job).find(x=>x[0]===skill);if(!ability)throw new Error('That skill is not compatible with your job.');if(cooldowns[skill]>0)throw new Error(`${skill} cooldown: ${cooldowns[skill]} turns.`);const isMagic=ability[3]==='magic'||ability[3]==='ultimateMagic',cost=ability[3]==='ultimateMagic'?1000:isMagic?150:0,dmg=ability[1]||0,isUtility=dmg===0||ability[3]==='restore';if(!isUtility&&!locations[c.location].enemy)throw new Error('There is no valid target here.');if(c.mana<cost)throw new Error('Not enough mana.');if(c.stamina<1)throw new Error('Not enough stamina.');c.mana-=cost;c.stamina--;cooldowns[skill]=ability[2];
    if(dmg){const effective=dmg+c.level+c.gear.power+c.gear.enhance*2;c.skills[skill]=(c.skills[skill]||0)+1;progressQuest(user.id,'kill','field',Math.random()<.25?1:0);xp(c,8);result=`${skill} dealt ${effective} power to ${locations[c.location].enemy}. The foe retreats; you gained experience.`;if(ability[3]==='ultimate'||ability[3]==='ultimateMagic')c.fame++}
    else if(ability[3]==='restore'){c.mana=Math.min(c.max_mana,c.mana+300);c.hp=Math.min(c.max_hp,c.hp+4);result=`${skill} restored mana and health.`}
    else if(['Haggle','Appraise','Trade Wind','Call in a Favor'].includes(skill)){c.gold+=skill==='Call in a Favor'?4:2;c.fame++;result=`${skill} succeeded; your reputation and purse improved.`}
    else if(['Identify Herb','Quick Harvest','Bountiful Gather','Soil Reading','Abundant Season','Deep Seam','Vein Sense'].includes(skill)){const item=c.job==='Miner'||c.job==='Legendary Miner'?'ore':c.job==='Farmer'||c.job==='Herbalist'||c.job==='Gatherer'?'herb':'wood';c.bag[item]=(c.bag[item]||0)+1;xp(c,3);result=`${skill} found ${itemNames[item]}.`}
    else if(['Nourishing Meal','Hearty Feast','Field Dressing'].includes(skill)){c.hp=Math.min(c.max_hp,c.hp+8);c.stamina=Math.min(c.max_stamina,c.stamina+3);result=`${skill} restored health and stamina.`}
    else{result=`${skill} stance active; cooldown started.`}
  }else if(action==='acceptQuest'){
    const key=String(body.questKey||'');const q=db.prepare('SELECT * FROM quests WHERE user_id=? AND quest_key=?').get(user.id,key);if(!q||q.status!=='available')throw new Error('Quest is not available.');db.prepare('UPDATE quests SET status=\'accepted\' WHERE id=?').run(q.id);result=`Accepted: ${q.title}.`;
  }else if(action==='claimQuest'){
    const key=String(body.questKey||'');const q=db.prepare('SELECT * FROM quests WHERE user_id=? AND quest_key=?').get(user.id,key);if(!q||q.status!=='completed')throw new Error('Finish the objectives before claiming.');c.gold+=q.reward_gold;const leveled=xp(c,q.reward_xp);db.prepare('UPDATE quests SET status=\'claimed\' WHERE id=?').run(q.id);result=`Claimed ${q.title}: +${q.reward_gold} gold and ${q.reward_xp} XP.${leveled?' Level up!':''}`;
  }else if(action==='contributeEvent'){
    if(!w.active_event)throw new Error('No active world event.');if(c.stamina<1)throw new Error('Not enough stamina.');c.stamina--;const next=w.event_progress+1;db.prepare('UPDATE world SET event_progress=? WHERE id=1').run(next);progressQuest(user.id,'event',w.active_event,1);c.fame++;c.gold+=2;result=`You contributed to ${w.active_event}. Community progress ${next}/${w.event_need}.`;
  }else if(action==='stat'){
    const stat=String(body.stat||'');if(!['str','agi','int','vit','dex'].includes(stat))throw new Error('Invalid spendable attribute.');if((c.stat_points||0)<1)throw new Error('No unspent stat points.');c.attributes[stat]++;c.stat_points--;result=`${stat.toUpperCase()} increased.`;
  }else if(action==='guildCreate'){
    const name=String(body.name||'').trim();if(!/^[\p{L}\p{N} _'-]{3,24}$/u.test(name))throw new Error('Guild name must be 3–24 letters/numbers.');if(c.gold<10)throw new Error('Guild registration costs 10 gold.');const created=db.prepare('INSERT INTO guilds(name,leader_id,created_at) VALUES(?,?,?)').run(name,user.id,Date.now());db.prepare('INSERT INTO guild_members(guild_id,user_id,role) VALUES(?,?,\'leader\')').run(created.lastInsertRowid,user.id);c.gold-=10;result=`Guild ${name} founded.`;
  }else throw new Error('Unknown action.');
  db.prepare('UPDATE characters SET level=?,xp=?,stat_points=?,hp=?,max_hp=?,stamina=?,max_stamina=?,mana=?,max_mana=?,gold=?,fame=?,location=?,attributes=?,skills=?,cooldowns=?,bag=?,gear=?,updated_at=? WHERE user_id=?')
    .run(c.level,c.xp,c.stat_points,c.hp,c.max_hp,c.stamina,c.max_stamina,c.mana,c.max_mana,c.gold,c.fame,c.location,JSON.stringify(c.attributes),JSON.stringify(c.skills),JSON.stringify(c.cooldowns),JSON.stringify(c.bag),JSON.stringify(c.gear),Date.now(),user.id);
  if(['travel','explore','fight','craft','enhance','useSkill','rest'].includes(action))tickWorld(false);
  return {message:result,character:getCharacter(user.id),quests:getQuests(user.id)};
}
function rollGrade(){const r=Math.random();return r<.0001?'Myth':r<.001?'Legendary':r<.01?'Unique':r<.07?'Epic':r<.28?'Rare':'Normal'}
function tickWorld(force=true){
  const w=getWorld(),npcs=json(w.npcs,npcSeed),turn=w.turn+1;let threat=w.threat,prosperity=w.prosperity,active=w.active_event,progress=w.event_progress,need=w.event_need,turns=w.event_turns;
  for(const n of npcs){const r=Math.random();if(r<.18){const routes={town:['meadow','mine','ruins'],meadow:['town','woods'],woods:['meadow','ruins'],mine:['town'],ruins:['town','woods']};const choices=routes[n.place]||['town'];n.place=choices[Math.floor(Math.random()*choices.length)];n.goal='travel'}else if(r<.4){n.goal=n.job==='Blacksmith'?'craft':'gather';n.level+=Math.random()<.04?1:0}else if(r<.62){n.goal='train';n.level+=Math.random()<.08?1:0}else if(r<.82){n.goal='quest';if(Math.random()<.2)n.rep++}else n.goal='trade'}
  threat=Math.max(0,Math.min(100,threat+(Math.random()<.38?2:-.6)));prosperity=Math.max(0,Math.min(100,prosperity+(npcs.filter(n=>n.gold>30).length>2?.4:-.3)));
  if(active){turns--;if(Math.random()<.28)progress++;if(progress>=need){threat=Math.max(0,threat-6);prosperity=Math.min(100,prosperity+5);feed(`Morpheus records collective success: ${active}.`);active=null;progress=0;turns=0}else if(turns<=0){threat=Math.min(100,threat+7);feed(`The world moved on without resolving: ${active}.`);active=null;progress=0;turns=0}}
  if(!active&&turn%5===0){if(threat>32)active='Beast Tide on Ashpine Road';else if(prosperity<35)active='Caravan Route Crisis';else active='Signal beneath Sunken Watch';need=3;progress=0;turns=8;feed(`MORPHEUS WORLD EVENT: ${active}. Players and residents may influence the outcome.`)}
  const stability=Math.max(0,Math.min(100,100-threat*.55+prosperity*.14));db.prepare('UPDATE world SET turn=?,threat=?,prosperity=?,stability=?,active_event=?,event_progress=?,event_need=?,event_turns=?,npcs=?,updated_at=? WHERE id=1').run(turn,threat,prosperity,stability,active,progress,need,turns,JSON.stringify(npcs),Date.now());
}
setInterval(()=>{try{tickWorld()}catch(e){console.error('Morpheus tick failed',e)}},15000).unref();
const loginAttempts=new Map();function throttle(ip){const now=Date.now(),x=loginAttempts.get(ip)||{n:0,t:now};if(now-x.t>60000){x.n=0;x.t=now}x.n++;loginAttempts.set(ip,x);return x.n<=12}
const movementTimes=new Map();
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});return fs.createReadStream(path.join(PUBLIC_DIR,'index.html')).pipe(res)}
    if(req.method==='GET'&&url.pathname==='/health'){return send(res,200,{ok:true,db:'sqlite',time:Date.now()})}
    if(req.method==='GET'&&url.pathname==='/auth/google/start'){
      if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)return send(res,503,'Google sign-in is not configured on this server yet.');
      const state=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(state).digest('hex');db.prepare('INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,?)').run(hash,Date.now()+10*60*1000);db.prepare('DELETE FROM oauth_states WHERE expires_at<?').run(Date.now());
      const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:googleRedirectUri(),response_type:'code',scope:'openid email profile',state,include_granted_scopes:'true'}).toString();res.writeHead(302,{Location:target.toString(),'Set-Cookie':secureCookie(req,'greed_oauth_state',state,600),'Cache-Control':'no-store'});return res.end();
    }
    if(req.method==='GET'&&url.pathname==='/auth/google/callback')return await finishGoogleLogin(req,res,url);
    if(req.method==='POST'&&['/api/register','/api/login'].includes(url.pathname)){
      if(!throttle(req.socket.remoteAddress||'unknown'))return send(res,429,{error:'Too many login attempts. Wait a minute.'});const body=await readBody(req),username=String(body.username||'').trim(),password=String(body.password||'');
      if(!/^[a-zA-Z0-9_]{3,20}$/.test(username)||password.length<8||password.length>128)return send(res,400,{error:'Use a 3–20 character username and an 8–128 character password.'});
      let user;
      if(url.pathname==='/api/register'){
        const salt=crypto.randomBytes(16).toString('hex'),passhash=crypto.scryptSync(password,salt,64).toString('hex');
        try{const r=db.prepare('INSERT INTO users(username,salt,passhash,created_at) VALUES(?,?,?,?)').run(username,salt,passhash,Date.now());user={id:Number(r.lastInsertRowid),username};createCharacter(user.id,username)}catch(e){return send(res,409,{error:e.code==='SQLITE_CONSTRAINT_UNIQUE'?'That username is already taken.':'Could not register.'})}
      }else{
        user=db.prepare('SELECT id,username,salt,passhash FROM users WHERE username=? COLLATE NOCASE').get(username);if(!user)return send(res,401,{error:'Username or password is incorrect.'});const given=crypto.scryptSync(password,user.salt,64);if(!crypto.timingSafeEqual(given,Buffer.from(user.passhash,'hex')))return send(res,401,{error:'Username or password is incorrect.'});
      }
      makeSession(user.id,req,res);return send(res,200,{ok:true,username:user.username});
    }
    if(req.method==='POST'&&url.pathname==='/api/logout'){const user=sessionUser(req);if(user){const raw=cookies(req)[COOKIE];db.prepare('DELETE FROM sessions WHERE token_hash=?').run(crypto.createHash('sha256').update(raw).digest('hex'))}return send(res,200,{ok:true},{'Set-Cookie':`${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`})}
    const user=sessionUser(req);if(!user)return send(res,401,{error:'Sign in first.'});
    if(req.method==='GET'&&url.pathname==='/api/me')return send(res,200,{username:user.username,isAdmin:Boolean(user.is_admin)});
    if(req.method==='GET'&&url.pathname==='/api/admin/overview'){
      if(!user.is_admin)return send(res,403,{error:'Admin access required.'});const w=getWorld();return send(res,200,{users:db.prepare('SELECT COUNT(*) AS n FROM users').get().n,activePlayers:db.prepare('SELECT COUNT(*) AS n FROM characters WHERE updated_at>?').get(Date.now()-60000).n,quests:db.prepare('SELECT COUNT(*) AS n FROM quests').get().n,guilds:db.prepare('SELECT COUNT(*) AS n FROM guilds').get().n,world:{turn:w.turn,stability:w.stability,threat:w.threat,event:w.active_event}});
    }
    if(req.method==='GET'&&url.pathname==='/api/state'){
      const c=getCharacter(user.id),w=getWorld();db.prepare('UPDATE characters SET updated_at=? WHERE user_id=?').run(Date.now(),user.id);
      const players=db.prepare('SELECT name,job,level,location,fame,pos_x,pos_y FROM characters WHERE updated_at>? AND user_id<>? ORDER BY level DESC LIMIT 50').all(Date.now()-60000,user.id);
      const chat=db.prepare('SELECT username,message,created_at FROM chat WHERE id>(SELECT COALESCE(MAX(id)-25,0) FROM chat) ORDER BY id').all();
      const guild=db.prepare('SELECT g.name,g.level,g.fame,g.gold,gm.role FROM guild_members gm JOIN guilds g ON g.id=gm.guild_id WHERE gm.user_id=?').get(user.id)||null;
      return send(res,200,{user:user.username,isAdmin:Boolean(user.is_admin),character:c,locations,players,quests:getQuests(user.id),world:{turn:w.turn,threat:w.threat,prosperity:w.prosperity,stability:w.stability,event:w.active_event,eventProgress:w.event_progress,eventNeed:w.event_need,eventTurns:w.event_turns,feed:json(w.event_feed,[]),npcs:json(w.npcs,npcSeed)},chat,guild,skills:[...getAbilities(c.job),...getPassives(c.job).map(name=>[name,0,0,'passive'])]});
    }
    if(req.method==='POST'&&url.pathname==='/api/move'){
      const body=await readBody(req),direction=body.direction,steps=body.steps===undefined?1:body.steps,now=Date.now();
      if(!['up','down','left','right'].includes(direction)||!Number.isInteger(steps)||steps<1||steps>3)return send(res,400,{error:'Choose a direction and 1–3 steps.'});
      const c=getCharacter(user.id);if(!c)return send(res,404,{error:'Character not found.'});
      const last=movementTimes.get(user.id)||0;if(now-last<110)return send(res,429,{error:'Moving too quickly.'});movementTimes.set(user.id,now);
      const delta={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[direction],x=Math.max(1,Math.min(15,c.pos_x+delta[0]*steps)),y=Math.max(1,Math.min(11,c.pos_y+delta[1]*steps));
      db.prepare('UPDATE characters SET pos_x=?,pos_y=?,updated_at=? WHERE user_id=?').run(x,y,now,user.id);
      return send(res,200,{ok:true,position:{x,y}});
    }
    if(req.method==='POST'&&url.pathname==='/api/action'){
      const body=await readBody(req);db.exec('BEGIN IMMEDIATE');try{const result=processAction(user,body);db.exec('COMMIT');return send(res,200,{ok:true,...result})}catch(e){db.exec('ROLLBACK');return send(res,400,{error:e.message||'Action failed.'})}
    }
    if(req.method==='POST'&&url.pathname==='/api/chat'){
      const body=await readBody(req),message=String(body.message||'').trim();if(!message||message.length>240)return send(res,400,{error:'Message must be 1–240 characters.'});db.prepare('INSERT INTO chat(user_id,username,message,created_at) VALUES(?,?,?,?)').run(user.id,user.username,message,Date.now());db.prepare('DELETE FROM chat WHERE id NOT IN (SELECT id FROM chat ORDER BY id DESC LIMIT 250)').run();return send(res,200,{ok:true});
    }
    if(req.method==='GET'&&url.pathname==='/api/leaderboard')return send(res,200,{players:db.prepare('SELECT name,job,level,fame FROM characters ORDER BY level DESC,fame DESC LIMIT 20').all()});
    return send(res,404,{error:'Not found.'});
  }catch(e){console.error(e);if(!res.headersSent)send(res,500,{error:'Server error.'})}
});
server.listen(PORT,()=>console.log(`Greed online prototype listening on http://localhost:${PORT} (SQLite: ${dbPath})`));
process.on('SIGINT',()=>{db.close();server.close(()=>process.exit(0))});

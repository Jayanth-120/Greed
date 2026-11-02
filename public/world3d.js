import * as THREE from '/vendor/three.module.js';

const canvas = document.getElementById('worldCanvas');
const hud = document.getElementById('worldHud');
canvas.style.imageRendering = 'auto';
const palettes = {
  town: ['#779064', '#b69b70', '#e2c795'], meadow: ['#8cbb68', '#c3aa70', '#b7d978'],
  woods: ['#426c56', '#827455', '#75956a'], mine: ['#55595b', '#8b7964', '#72d8e8'],
  ruins: ['#747b68', '#a49578', '#83d8e6']
};
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
} catch {
  hud.textContent = '3D graphics are unavailable in this browser. The routes and RPG actions still work below.';
  canvas.hidden = true;
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#c7d7c0', 18, 44);
const camera = new THREE.PerspectiveCamera(43, 16 / 9, .1, 100);
camera.position.set(0, 10, 14);
scene.add(new THREE.HemisphereLight('#e8f6ff', '#37452c', 2.1));
const sun = new THREE.DirectionalLight('#ffe0ad', 3.1);
sun.position.set(-8, 16, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
const world = new THREE.Group(); scene.add(world);
const mat = (color, roughness = 1) => new THREE.MeshToonMaterial({ color, roughness });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(34, 26), mat('#779064'));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
const player = new THREE.Group(); world.add(player);
const coat = mat('#41a5a7'), trim = mat('#f0ca77'), skin = mat('#f1c9a8'), hair = mat('#59445f'), dark = mat('#283143');
function sphere(parent, geometry, material, x, y, z) { const o = new THREE.Mesh(geometry, material); o.position.set(x,y,z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; }
function makeHero(parent, scale = 1) {
  const g = new THREE.Group(); g.scale.setScalar(scale); parent.add(g);
  sphere(g,new THREE.CapsuleGeometry(.24,.6,4,8),coat,0,.82,0);
  sphere(g,new THREE.SphereGeometry(.25,12,10),skin,0,1.48,0);
  sphere(g,new THREE.SphereGeometry(.27,10,8),hair,0,1.62,-.05);
  sphere(g,new THREE.ConeGeometry(.13,.32,5),hair,-.14,1.72,.02).rotation.z=-.55;
  sphere(g,new THREE.ConeGeometry(.14,.34,5),hair,.12,1.7,.04).rotation.z=.48;
  const legs=[]; for(const x of [-.13,.13]) legs.push(sphere(g,new THREE.CapsuleGeometry(.09,.38,3,6),dark,x,.32,0));
  sphere(g,new THREE.BoxGeometry(.55,.08,.35),trim,0,1.05,.02);
  return { group:g, legs };
}
const hero=makeHero(player);
const props = new THREE.Group(); world.add(props);
function tree(x,z,pine=false) { sphere(props,new THREE.CylinderGeometry(.12,.2,1,7),mat('#684a34'),x,.5,z); for(let i=0;i<(pine?3:2);i++) sphere(props,pine?new THREE.ConeGeometry(.72-i*.12,1.15,7):new THREE.IcosahedronGeometry(.75-i*.08,1),mat(pine?['#315841','#3d684b','#4a7652'][i]:'#638b52'),x,1.3+i*.45,z); }
function rock(x,z,color='#8e897a',size=.7) { const r=sphere(props,new THREE.DodecahedronGeometry(size,0),mat(color),x,size*.55,z);r.rotation.set(.2,.4,.1); }
function house(x,z) { const body=sphere(props,new THREE.BoxGeometry(2,1.5,1.6),mat('#ead6ad'),x,.8,z);body.castShadow=true; const roof=sphere(props,new THREE.ConeGeometry(1.55,.9,4),mat('#a65348'),x,2,z);roof.rotation.y=Math.PI/4; }
function clearProps(){while(props.children.length){const o=props.children.pop();o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose()}}
function buildZone(zone) {
  clearProps(); const p=palettes[zone]||palettes.town; ground.material.color.set(p[0]); scene.fog.color.set(p[0]);
  const pathMesh=new THREE.Mesh(new THREE.BoxGeometry(34,.035,2.1),mat(p[1]));pathMesh.position.set(0,.025,1);props.add(pathMesh);
  if(zone==='town'){house(-5,-3);house(5,-4);house(6,4);for(const [x,z] of [[-8,4],[-7,-5],[8,-1],[-2,5]])tree(x,z);}
  if(zone==='meadow'){for(const [x,z] of [[-9,-5],[8,-5],[-8,5],[9,4]])tree(x,z);for(let i=0;i<24;i++){const f=sphere(props,new THREE.SphereGeometry(.07,6,5),mat(i%2?'#fff0bd':'#e69cbb'),(i*37%29)-14,.15,(i*19%21)-10);f.scale.y=1.7;}}
  if(zone==='woods'){for(let i=0;i<18;i++)tree((i*17%29)-14,(i*13%21)-10,true);}
  if(zone==='mine'){for(let i=0;i<12;i++)rock((i*11%27)-13,(i*7%19)-9,'#626465',.7+(i%3)*.18);for(const [x,z] of [[-4,-3],[6,4],[9,-5]])rock(x,z,'#6cd8e5',.55);}
  if(zone==='ruins'){for(const [x,z] of [[-8,-4],[-7,4],[7,-4],[8,4]]){const pillar=sphere(props,new THREE.BoxGeometry(.65,2.8,.65),mat('#aaa287'),x,1.4,z);pillar.rotation.z=.12;}for(const [x,z] of [[-3,-3],[3,3],[5,-2]]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.6,.055,8,28),mat(p[2]));ring.position.set(x,.12,z);ring.rotation.x=-Math.PI/2;props.add(ring);}}
}
const motes=new THREE.Group();world.add(motes);for(let i=0;i<45;i++){const m=sphere(motes,new THREE.SphereGeometry(.035,5,4),mat('#fff0b2'),(i*17%28)-14,.4+(i%7)*.4,(i*11%20)-10);m.userData.phase=i;}
let target=new THREE.Vector3(0,0,0),zone='';
function update(state){if(!state)return;const c=state.character;if(zone!==c.location){zone=c.location;buildZone(zone)}target.set((c.pos_x-8)*1.55,0,(c.pos_y-6)*1.3);player.userData.name=c.name;player.userData.grid=`${c.pos_x}, ${c.pos_y}`;
  const others=state.players.filter(p=>p.location===zone).slice(0,12);while(world.userData.others?.length)world.remove(world.userData.others.pop());world.userData.others=[];for(const p of others){const g=new THREE.Group();makeHero(g,.78);g.position.set((p.pos_x-8)*1.55,0,(p.pos_y-6)*1.3);world.add(g);world.userData.others.push(g);}
  const npcs=state.world.npcs.filter(n=>n.place===zone).slice(0,9);while(world.userData.npcs?.length)world.remove(world.userData.npcs.pop());world.userData.npcs=[];for(let i=0;i<npcs.length;i++){const g=new THREE.Group();const h=makeHero(g,.75);h.group.children[0].material=mat(['#d38a58','#8068b1','#b8a05f'][i%3]);g.position.set(-7+(i*3.7)%14,0,-6+Math.floor(i/4)*4);world.add(g);world.userData.npcs.push(g);}
}
window.greedSceneUpdate=update;
if(typeof state!=='undefined'&&state)update(state);
function resize(){const r=canvas.getBoundingClientRect();if(r.width<1)return;renderer.setSize(r.width,r.width*9/16,false);camera.aspect=r.width/(r.width*9/16);camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(canvas); resize();
function frame(t){requestAnimationFrame(frame);player.position.lerp(target,.16);const moving=player.position.distanceTo(target)>.08;hero.legs.forEach((l,i)=>l.rotation.x=moving?Math.sin(t*.012+i*Math.PI)*.55:Math.sin(t*.002+i)*.04);hero.group.position.y=moving?Math.abs(Math.sin(t*.012))*.08:Math.sin(t*.002)*.035;camera.position.x+=((player.position.x+2)-camera.position.x)*.035;camera.position.z+=((player.position.z+12)-camera.position.z)*.035;camera.lookAt(player.position.x,0,player.position.z);motes.children.forEach(m=>m.position.y=.6+Math.sin(t*.001+m.userData.phase)*.35);renderer.render(scene,camera);if(hud)hud.textContent=`${zone||'Briarhold'} · ${player.userData.grid||'8, 6'} · WASD / arrows`}
requestAnimationFrame(frame);

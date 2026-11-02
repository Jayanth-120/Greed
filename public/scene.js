(() => {
  const canvas = document.getElementById('worldCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 800, H = 450, TAU = Math.PI * 2;
  const palette = {
    town: { sky:'#f3b979', far:'#bb8768', ground:'#788f64', grass:'#91a86a', road:'#c3a276', glow:'#ffdfa0' },
    meadow:{ sky:'#8ad3df', far:'#72ae92', ground:'#76ad68', grass:'#a9ca76', road:'#c7aa70', glow:'#fff3a7' },
    woods:{ sky:'#729c8f', far:'#426f64', ground:'#426b51', grass:'#688758', road:'#8c7956', glow:'#b5e2a7' },
    mine:{ sky:'#8b8290', far:'#5a5357', ground:'#575b59', grass:'#757366', road:'#9a8a72', glow:'#ffc86d' },
    ruins:{ sky:'#978eaa', far:'#66705f', ground:'#65745d', grass:'#899064', road:'#b7a789', glow:'#a8eaff' }
  };
  let width = 0, height = 0, currentZone = '', zoneChangedAt = 0, lastMoveAt = 0;

  const style = document.createElement('style');
  style.textContent = '.world-frame{box-shadow:0 12px 35px #0008,inset 0 0 0 1px #fff2}.world-frame canvas{image-rendering:auto}.world-help>span{color:#b8c9d4;font-size:12px}.touch-pad button{box-shadow:0 3px 0 #07131d;touch-action:manipulation}.touch-pad button:active{transform:translateY(2px);box-shadow:none}';
  document.head.append(style);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextW = Math.max(320, Math.round(rect.width * dpr));
    const nextH = Math.round(nextW * H / W);
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW; canvas.height = nextH;
      width = nextW; height = nextH;
    }
  }

  function ellipse(x,y,rx,ry,color,alpha=1) {
    ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();ctx.globalAlpha=1;
  }
  function path(points,color,lineWidth,alpha=1) {
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.restore();
  }
  function drawBackdrop(zone,p,t) {
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,p.sky);sky.addColorStop(.53,p.far);sky.addColorStop(1,p.ground);ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // Layered distant ridges and rolling, painterly ground.
    for(let layer=0;layer<3;layer++){
      const y=120+layer*39;ctx.beginPath();ctx.moveTo(0,H);
      for(let x=0;x<=W+40;x+=40){const wobble=Math.sin(x*.012+layer*1.8)*17+Math.sin(x*.027+layer)*8;ctx.lineTo(x,y+wobble)}
      ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=layer===0?p.far:layer===1?p.ground:p.grass;ctx.globalAlpha=layer===0?.72:layer===1?.75:.48;ctx.fill();ctx.globalAlpha=1;
    }
    // Fine grass and stone texture, deterministic so it shimmers rather than flickers.
    for(let i=0;i<175;i++){
      const x=(i*137+31)%W,y=160+((i*83+17)%285),s=1+(i%3);
      const sway=Math.sin(t*.001+i*2)*2;
      ctx.strokeStyle=zone==='mine'?'#c4b28a55':zone==='ruins'?'#d0dda055':'#e0eaaa55';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+sway,y-s*2);ctx.stroke();
    }
  }
  function drawRoad(zone,p) {
    const points=zone==='town'?[[0,226],[145,226],[260,239],[410,222],[560,232],[800,218]]:
      zone==='meadow'?[[0,323],[148,295],[290,273],[444,251],[612,224],[800,185]]:
      zone==='woods'?[[0,264],[160,249],[296,278],[465,253],[620,261],[800,224]]:
      zone==='mine'?[[0,267],[166,250],[326,276],[490,252],[653,267],[800,244]]:[[0,298],[160,283],[300,255],[463,269],[620,230],[800,214]];
    path(points,'#44382944',zone==='town'?82:72);
    path(points,p.road,zone==='town'?72:63);
    path(points,'#e5ca9c66',2,0.75);
    for(let i=0;i<18;i++){
      const x=(i*61+17)%W,y=235+((i*47)%100);
      ellipse(x,y,2+(i%3),1.5,'#6b594466');
    }
  }
  function drawTree(x,y,size,t,kind='leaf') {
    ellipse(x+4,y+14,size*.67,size*.27,'#15251c55');
    ctx.fillStyle=kind==='pine'?'#543b2b':'#664633';ctx.beginPath();ctx.roundRect(x-size*.12,y-size*.23,size*.24,size*.62,4);ctx.fill();
    if(kind==='pine'){
      for(let i=0;i<3;i++){
        const yy=y-size*.75+i*size*.35,w=size*(.34+i*.14);
        ctx.beginPath();ctx.moveTo(x,yy-size*.36);ctx.lineTo(x-w,yy+size*.2);ctx.lineTo(x+w,yy+size*.2);ctx.closePath();ctx.fillStyle=['#386047','#47734d','#31563f'][i];ctx.fill();
        path([[x-w*.65,yy+size*.12],[x,yy+size*.2],[x+w*.7,yy+size*.08]],'#a6c68155',2);
      }
    }else{
      const shades=['#365b45','#477a4d','#5d8b57','#73995b'];
      for(let i=0;i<5;i++){
        const a=i*TAU/5,ox=Math.cos(a)*size*.3,oy=Math.sin(a)*size*.22;
        ellipse(x+ox,y-size*.55+oy,size*(.34+(i%2)*.04),size*.32,shades[i%shades.length]);
        ellipse(x+ox-size*.09,y-size*.65+oy,size*.1,size*.07,'#d5e18b55');
      }
      ellipse(x,y-size*.58,size*.36,size*.32,'#6f9957');
    }
    // Animated leaf glint.
    const shimmer=(Math.sin(t*.0015+x)*.5+.5);ellipse(x-size*.2,y-size*.68,2,2,'#fff6bf',shimmer*.75);
  }
  function drawHouse(x,y,s,t) {
    ellipse(x+s*.1,y+s*.32,s*.61,s*.2,'#17251c66');
    ctx.fillStyle='#d5b98c';ctx.fillRect(x-s*.45,y-s*.27,s*.95,s*.62);
    ctx.fillStyle='#f0d4a1';ctx.fillRect(x-s*.37,y-s*.2,s*.78,s*.5);
    ctx.beginPath();ctx.moveTo(x-s*.57,y-s*.23);ctx.lineTo(x,y-s*.75);ctx.lineTo(x+s*.57,y-s*.23);ctx.closePath();ctx.fillStyle='#994e45';ctx.fill();
    path([[x-s*.53,y-s*.23],[x,y-s*.77],[x+s*.53,y-s*.23]],'#f5c17d',5);
    ctx.fillStyle='#664738';ctx.fillRect(x-s*.1,y+s*.02,s*.23,s*.33);
    for(const wx of [x-s*.28,x+s*.2]){ctx.fillStyle='#7fd9e2';ctx.fillRect(wx,y-s*.08,s*.12,s*.13);ctx.strokeStyle='#fff0b3';ctx.lineWidth=2;ctx.strokeRect(wx,y-s*.08,s*.12,s*.13)}
    // Golden window light.
    ctx.fillStyle=`rgba(255,220,132,${.34+Math.sin(t*.002+x)*.1})`;ctx.fillRect(x-s*.27,y-s*.06,s*.1,s*.1);
  }
  function drawSceneObjects(zone,p,t) {
    if(zone==='town'){
      drawHouse(104,206,.9,t);drawHouse(700,176,.77,t);drawHouse(677,342,.62,t);
      for(const [x,y,s] of [[34,160,1.05],[216,167,.72],[758,250,.86],[575,355,.72],[275,365,.63]])drawTree(x,y,s,t);
      // Well/fountain with a softly rippling pool.
      ellipse(413,197,42,18,'#493d32aa');ellipse(413,190,36,15,'#cbb68d');ellipse(413,187,28,10,'#56a9b2');ellipse(407,184,9+Math.sin(t*.003)*2,2,'#d7ffff99');
      ctx.fillStyle='#d5c29c';ctx.fillRect(380,160,66,8);ctx.fillRect(386,148,7,18);ctx.fillRect(432,148,7,18);
      // Lanterns.
      for(const [x,y] of [[173,225],[570,208],[520,293]]){path([[x,y+18],[x,y-12]],'#493629',3);ellipse(x,y-15,7,7,p.glow,.55+Math.sin(t*.004+x)*.18);ellipse(x,y-15,3,3,'#fff4bd')}
    }else if(zone==='meadow'){
      for(let i=0;i<13;i++){const x=(i*73+16)%W,y=120+(i*61)%288;drawFlower(x,y,t,i)}
      for(const [x,y,s] of [[62,166,.75],[723,167,.8],[690,361,.64],[118,375,.55]])drawTree(x,y,s,t);
      // Butterflies drift across the sunlit field.
      for(let i=0;i<3;i++){const x=(t*.023+i*263)%W,y=116+i*67+Math.sin(t*.003+i)*15;ctx.save();ctx.translate(x,y);ctx.fillStyle='#fff2bcaa';ctx.beginPath();ctx.ellipse(-4,0,4,2,Math.sin(t*.02)*.4,0,TAU);ctx.ellipse(4,0,4,2,-Math.sin(t*.02)*.4,0,TAU);ctx.fill();ctx.restore()}
    }else if(zone==='woods'){
      for(const [x,y,s] of [[18,170,1.15],[100,116,.85],[206,155,.9],[596,133,1.05],[782,147,1.1],[741,352,.93],[95,362,.86],[310,111,.7],[520,371,.9]])drawTree(x,y,s,t,'pine');
      for(let i=0;i<20;i++){const x=(i*101+32)%W,y=190+(i*53)%218;ellipse(x,y,5,2,'#9bc47a');ellipse(x+3,y-1,2,1,'#d9e29b')}
      for(let i=0;i<5;i++){const x=(i*181+60)%W,y=155+(i*49)%180;ellipse(x,y,30,13,'#d6f7e515',.4+Math.sin(t*.001+i)*.15)}
    }else if(zone==='mine'){
      // Dark cavern walls, timber braces and glowing ore.
      for(let i=0;i<7;i++){const x=i*135-20,y=129+(i%2)*20;ctx.fillStyle='#343a3b';ctx.beginPath();ctx.moveTo(x,y+45);ctx.lineTo(x+25,y-32);ctx.lineTo(x+66,y-60);ctx.lineTo(x+102,y-19);ctx.lineTo(x+117,y+54);ctx.closePath();ctx.fill();path([[x+23,y+33],[x+35,y-24],[x+66,y-49],[x+95,y-15]],'#aca48a55',4);}
      for(const [x,y] of [[74,140],[703,166],[143,346],[682,353],[550,145]]){ctx.save();ctx.shadowColor='#55d9f2';ctx.shadowBlur=20;ellipse(x,y,8,15,'#58cbe0');ctx.restore();path([[x-6,y+6],[x,y-15],[x+7,y+8]],'#c2faff',2)}
      for(const [x,y] of [[251,159],[548,335],[97,270],[735,263]]){path([[x,y+20],[x,y-15],[x-18,y-34]],'#76563b',5);path([[x,y-15],[x+20,y-35]],'#76563b',5);ellipse(x,y-39,8,9,p.glow,.68)}
    }else{
      // Sunken watch: broken stonework, ivy, and luminous rune discs.
      for(const [x,y,s] of [[42,142,1],[142,153,.72],[719,143,1],[757,315,.83],[80,354,.86],[620,352,.74]]){
        ctx.save();ctx.translate(x,y);ctx.fillStyle='#918c79';ctx.fillRect(-s*18,-s*37,s*36,s*67);ctx.fillStyle='#c1b99a';ctx.fillRect(-s*22,-s*41,s*44,s*9);ctx.fillStyle='#645e55';ctx.fillRect(-s*13,-s*24,s*9,s*9);ctx.fillRect(s*4,-s*8,s*9,s*10);ctx.restore();
        for(let i=0;i<3;i++)ellipse(x+Math.sin(i+x)*16,y+Math.cos(i+x)*20,2,6,'#6f9b63');
      }
      for(const [x,y] of [[210,164],[601,186],[141,323],[667,319]]){ctx.save();ctx.shadowColor='#70dcff';ctx.shadowBlur=20;ctx.strokeStyle='#83dfff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,14+Math.sin(t*.003+x)*2,0,TAU);ctx.stroke();ctx.restore();ellipse(x,y,3,3,'#d8fbff')}
    }
  }
  function drawFlower(x,y,t,i) {
    const sway=Math.sin(t*.0018+i)*2;path([[x,y],[x+sway,y-9]],'#46764b',2);const colors=['#fff0cb','#f9c2d5','#a8d9ff','#ffe08b'];
    for(let j=0;j<5;j++){const a=j*TAU/5;ellipse(x+sway+Math.cos(a)*4,y-11+Math.sin(a)*4,3,2.5,colors[i%colors.length])}ellipse(x+sway,y-11,2,2,'#f3c65a');
  }
  function drawAvatar(x,y,colors,label,t,moving,scale=1) {
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    const bob=moving?Math.abs(Math.sin(t*.025))*3:Math.sin(t*.003)*1.7;
    ellipse(0,11,15,7,'#1b281e66');
    // Shoes and swaying legs.
    const step=moving?Math.sin(t*.025)*4:0;
    path([[-5,4+bob],[ -5+step,11+bob]],'#3b3544',4);path([[5,4+bob],[5-step,11+bob]],'#3b3544',4);
    ellipse(-6+step,12+bob,5,3,'#f0c9a0');ellipse(6-step,12+bob,5,3,'#f0c9a0');
    // Cloak silhouette, torso and leather belt.
    ctx.beginPath();ctx.moveTo(-10,-9+bob);ctx.quadraticCurveTo(-15,-1+bob,-12,7+bob);ctx.quadraticCurveTo(0,12+bob,12,7+bob);ctx.lineTo(10,-8+bob);ctx.closePath();ctx.fillStyle='#263149';ctx.fill();
    ctx.beginPath();ctx.moveTo(-8,-10+bob);ctx.quadraticCurveTo(0,-16+bob,9,-9+bob);ctx.lineTo(8,4+bob);ctx.quadraticCurveTo(0,8+bob,-8,4+bob);ctx.closePath();ctx.fillStyle=colors.coat;ctx.fill();
    path([[-8,2+bob],[0,4+bob],[8,2+bob]],colors.trim,2);
    // Arms animate while walking.
    path([[-8,-6+bob],[-13+step*.3,1+bob]],colors.coat,4);path([[8,-6+bob],[13-step*.3,1+bob]],colors.coat,4);
    // Face and anime hair tufts.
    ellipse(0,-14+bob,8,8,'#f1cba8');
    ctx.beginPath();ctx.moveTo(-9,-15+bob);ctx.quadraticCurveTo(-7,-26+bob,2,-23+bob);ctx.quadraticCurveTo(10,-22+bob,9,-13+bob);ctx.lineTo(4,-17+bob);ctx.lineTo(1,-13+bob);ctx.lineTo(-2,-18+bob);ctx.lineTo(-5,-13+bob);ctx.closePath();ctx.fillStyle=colors.hair;ctx.fill();
    ellipse(-3,-14+bob,1.25,1.7,'#342b37');ellipse(3,-14+bob,1.25,1.7,'#342b37');path([[-2,-9+bob],[1,-8+bob]],'#ba766e',1);
    // Star glint and name plate.
    if(label){ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#172029cc';ctx.strokeText(label,0,-31+bob);ctx.fillStyle='#fff';ctx.fillText(label,0,-31+bob)}
    ctx.restore();
  }
  function drawCreature(zone,t) {
    if(zone!=='meadow'&&zone!=='woods'&&zone!=='ruins')return;
    const x=zone==='meadow'?672:zone==='woods'?620:552,y=zone==='meadow'?335:zone==='woods'?326:336;
    const fur=zone==='woods'?'#504251':zone==='ruins'?'#757d85':'#d2b78d';
    ellipse(x,y+10,22,9,'#1b281f66');
    ctx.save();ctx.translate(x,y+Math.sin(t*.004)*1.5);
    ctx.fillStyle=fur;ctx.beginPath();ctx.ellipse(0,0,19,12,-.1,0,TAU);ctx.fill();
    if(zone==='meadow'){ctx.beginPath();ctx.ellipse(-10,-13,4,12,-.18,0,TAU);ctx.ellipse(-1,-14,4,12,.14,0,TAU);ctx.fill()}
    else{ctx.beginPath();ctx.moveTo(-12,-5);ctx.lineTo(-8,-20);ctx.lineTo(0,-9);ctx.lineTo(7,-22);ctx.lineTo(10,-5);ctx.closePath();ctx.fill()}
    ellipse(9,-2,2,2,'#ffe9ad');ellipse(13,0,5,3,fur);ctx.restore();
  }
  function drawParticles(zone,t,p) {
    for(let i=0;i<18;i++){
      const x=(i*173+t*(zone==='mine'?-.006:.012))%W,y=(i*97+Math.sin(t*.001+i*2)*14+H)%H;
      const r=1+(i%3)*.55;ctx.save();ctx.globalAlpha=.24+Math.sin(t*.002+i)*.16;ctx.shadowColor=p.glow;ctx.shadowBlur=12;ctx.fillStyle=i%4===0?'#fff4c5':p.glow;ctx.beginPath();ctx.arc((x+W)%W,y,r,0,TAU);ctx.fill();ctx.restore();
    }
  }
  function render(t) {
    const gameState=typeof state==='undefined'?null:state;
    if(!gameState){requestAnimationFrame(render);return}
    resize();if(!width||!height){requestAnimationFrame(render);return}
    ctx.setTransform(width/W,0,0,height/H,0,0);
    const c=gameState.character,zone=c.location,p=palette[zone]||palette.town;
    if(zone!==currentZone){currentZone=zone;zoneChangedAt=t}
    ctx.clearRect(0,0,W,H);
    drawBackdrop(zone,p,t);drawRoad(zone,p);drawSceneObjects(zone,p,t);drawCreature(zone,t);drawParticles(zone,t,p);
    // Soft cinematic edge shade and gentle color wash.
    const vignette=ctx.createRadialGradient(W/2,H/2,130,W/2,H/2,520);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#10202c66');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    for(const player of gameState.players.filter(a=>a.location===zone))drawAvatar(40+player.pos_x*44,35+player.pos_y*31,{coat:'#4cb7d4',trim:'#e8f6ff',hair:'#493f64'},player.name,t,false,.9);
    const isMoving=t-lastMoveAt<220;
    drawAvatar(40+c.pos_x*44,35+c.pos_y*31,{coat:'#55a9aa',trim:'#ffe39c',hair:'#553c52'},c.name,t,isMoving,1.06);
    const fade=Math.max(0,1-(t-zoneChangedAt)/420);if(fade>0){ctx.fillStyle=`rgba(9,17,28,${fade*.5})`;ctx.fillRect(0,0,W,H)}
    const hud=document.getElementById('worldHud');if(hud)hud.textContent=`${gameState.locations[zone].name}  ·  ${c.pos_x}, ${c.pos_y}`;
    requestAnimationFrame(render);
  }
  document.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key))lastMoveAt=performance.now()},{passive:true});
  document.querySelectorAll('[data-move]').forEach(button=>button.addEventListener('pointerdown',()=>{lastMoveAt=performance.now()}));
  window.addEventListener('resize',resize);resize();requestAnimationFrame(render);
})();

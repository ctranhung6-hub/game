import {RemoteMotion} from './remote-motion.js?v=21.1';
import {bindGameControls} from './touch-controls.js?v=15';
import {findBumpTarget} from './interactions.js?v=15';
import * as THREE from './vendor/three.module.js';
import {GRAPHICS} from './graphics-config.js?v=19';
import { multiplayer as net } from './multiplayer.js?v=20';
import { PredictedMotion,SPEED } from './motion.js?v=15';
import {PICKUP_MS,DROP_MS} from './actions.js?v=15';
import {MAP,BASKETS,DELIVERY,JUICER,spawnPoint,insideDelivery,boundedPosition} from './world.js';
const $=s=>document.querySelector(s),container=$('#scene');
// Chỉ thay đổi giao diện màn hình giáo viên. Màn hình học sinh giữ nguyên.
const teacherMapFixed=document.body.dataset.role==='teacher';
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}catch(e){$('#load').textContent='Thiết bị chưa bật WebGL. Hãy thử trình duyệt có hỗ trợ 3D.';throw e;}
renderer.setPixelRatio(GRAPHICS.pixelRatio);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#c9dfca');scene.fog=new THREE.Fog('#c9dfca',38,65);
const camera=new THREE.OrthographicCamera(-12,12,9,-9,.1,100);camera.position.set(0,21,17);camera.lookAt(0,0,0);camera.zoom=2;camera.updateProjectionMatrix();
scene.add(new THREE.HemisphereLight('#fff7df','#86a781',2.5));const sun=new THREE.DirectionalLight('#fff1d2',3.4);sun.position.set(-8,18,9);sun.castShadow=true;sun.shadow.mapSize.set(GRAPHICS.shadowMapSize,GRAPHICS.shadowMapSize);Object.assign(sun.shadow.camera,{left:-30,right:30,top:28,bottom:-28,near:1,far:50});sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun);
// Bề mặt cỏ chi tiết cao: tạo một lần và dùng lại, không tăng số đối tượng 3D.
function createGrassTexture(){
  const c=document.createElement('canvas');c.width=c.height=GRAPHICS.grassTextureSize;
  const ctx=c.getContext('2d');const n=GRAPHICS.grassTextureSize;
  ctx.fillStyle='#fafbf2';ctx.fillRect(0,0,n,n);
  let seed=137;const rand=()=>{seed=seed*48271%2147483647;return seed/2147483647;};
  for(let i=0;i<4400;i++){
    const x=rand()*n,y=rand()*n;
    ctx.fillStyle=i%3===0?'rgba(65,120,65,.085)':i%3===1?'rgba(255,255,255,.21)':'rgba(141,112,64,.055)';
    ctx.fillRect(x,y,.6+rand()*2.8,1+rand()*5);
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(10,6);t.colorSpace=THREE.SRGBColorSpace;
  t.anisotropy=Math.min(GRAPHICS.grassTextureAnisotropy,renderer.capabilities.getMaxAnisotropy());
  return t;
}
const mat=(c,r=1)=>new THREE.MeshStandardMaterial({color:c,roughness:r});const mats={grass:mat('#9fc48e'),edge:mat('#b9cf9e'),wood:mat('#b58453'),trim:mat('#d6ac75'),leaf:mat('#79a35f'),leaf2:mat('#94b879'),skin:mat('#f1bd91'),hair:mat('#5b4030'),blue:mat('#5e94ab'),pants:mat('#365f73'),shoe:mat('#65503e'),white:mat('#fff5df'),red:mat('#e88a6b')};
mats.grass.map=createGrassTexture();mats.grass.needsUpdate=true;
function mesh(geo,material,parent=scene,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,m,p,x,y,z){return mesh(new THREE.BoxGeometry(w,h,d),m,p,x,y,z)}
function ball(r,m,p,x,y,z,s=[1,1,1]){const b=mesh(new THREE.SphereGeometry(r,GRAPHICS.sphereWidthSegments,GRAPHICS.sphereHeightSegments),m,p,x,y,z);b.scale.set(...s);return b;}
function cyl(rt,rb,h,m,p,x,y,z){return mesh(new THREE.CylinderGeometry(rt,rb,h,GRAPHICS.cylinderRadialSegments),m,p,x,y,z)}
const world=new THREE.Group();scene.add(world);
box(MAP.width,.65,MAP.depth,mats.edge,world,0,-.45,0);box(MAP.width-.2,.12,MAP.depth-.2,mats.grass,world,0,-.07,0);
// A warm winding stepping-stone path.
const pathmat=mat('#d3d3a5');for(let x=-20;x<=15;x+=1.1){const m=cyl(.5,.5,.04,pathmat,world,x,.025,Math.sin(x*.4)*.15);m.scale.set(1,1,.7)}
// Fence around three edges, with an open front gate.
function fence(x,z,axis,length,parent=world){const g=new THREE.Group();g.position.set(x,0,z);if(axis==='z')g.rotation.y=Math.PI/2;parent.add(g);for(let i=-length/2;i<=length/2;i+=1.5){box(.12,.93,.13,mats.trim,g,i,.46,0);const top=mesh(new THREE.ConeGeometry(.1,.15,4),mats.trim,g,i,1,0);top.rotation.y=Math.PI/4}box(length,.12,.11,mats.white,g,0,.35,0);box(length,.12,.11,mats.white,g,0,.71,0)}
fence(0,-13.4,'x',44.4);fence(0,13.4,'x',44.4);fence(-22.2,0,'z',26.4);fence(22.2,0,'z',26.4);
const fruitMaterials=new Map();function fruitMat(color){if(!fruitMaterials.has(color))fruitMaterials.set(color,mat(color,.7));return fruitMaterials.get(color);}
function fruit(parent,x=0,y=0,z=0,color='#e99a5c',s=1){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(s);parent.add(g);ball(.26,fruitMat(color),g,0,0,0,[1,.92,1]);cyl(.025,.035,.15,mats.wood,g,0,.28,0);const l=ball(.12,mats.leaf,g,.1,.29,0,[1,.22,.5]);l.rotation.z=.4;return g;}
function tree(x,z,scale=1){const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);world.add(g);cyl(.13,.22,1.8,mats.wood,g,0,.9,0);ball(.85,mats.leaf,g,0,2.1,0,[1,1.1,1]);ball(.65,mats.leaf2,g,.5,2.35,.04);ball(.65,mats.leaf2,g,-.5,2,.15);for(const [a,b,c]of [[-.5,2.3,.5],[.35,2.7,.5],[.5,1.9,.5]])fruit(g,a,b,c,'#e9ad67',.65)}
[[-20.5,-11.5,.95],[-10,-11.5,1.1],[2,-11.5,.95],[17,-11.5,1.1],[-20.5,11.5,.8],[-10,11.5,1],[2,11.5,.95],[17,11.5,.9]].forEach(a=>tree(...a));
// Flowers, crops and a small welcome sign.
let seed=23;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646};for(let i=0;i<65;i++){const x=(random()-.5)*43,z=(random()-.5)*25;if(Math.abs(x)<20&&Math.abs(z)<10)continue;const g=new THREE.Group();g.position.set(x,0,z);world.add(g);cyl(.014,.02,.18,mats.leaf,g,0,.1,0);ball(.08,i%3?mats.white:mats.red,g,0,.23,0,[1,.6,1])}
function label(text,color,bg='#fff8e6',w=256,h=160){const c=document.createElement('canvas');c.width=w*GRAPHICS.labelCanvasScale;c.height=h*GRAPHICS.labelCanvasScale;const ctx=c.getContext('2d');ctx.scale(GRAPHICS.labelCanvasScale,GRAPHICS.labelCanvasScale);ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(4,4,w-8,h-8,28);ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=7;ctx.stroke();ctx.fillStyle=color;ctx.font=`800 ${h*.62}px sans-serif`;while(ctx.measureText(text).width>w-30){const size=parseFloat(ctx.font.split(' ')[1]);if(size<12)break;ctx.font=`800 ${size-2}px sans-serif`;}ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h*.53);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:true}));sp.scale.set(1.05,.66,1);return sp;}
const answerColors=[['#c77f48','#e8a155'],['#a4604f','#e58270'],['#758851','#c5bf5e'],['#6c82a0','#9a9dcd']];const basketData=BASKETS.map((b,i)=>[b.letter,b.x,b.z,...answerColors[i]]);const baskets=[];
for(const [letter,x,z,color,fc]of basketData){const g=new THREE.Group();g.position.set(x,0,z);world.add(g);const ring=mesh(new THREE.RingGeometry(1.02,1.12,64),new THREE.MeshBasicMaterial({color:'#f9f2bb',transparent:true,opacity:0,side:THREE.DoubleSide}),g,0,.04,0);ring.rotation.x=-Math.PI/2;const wood=mat('#c59762');cyl(.77,.61,.65,wood,g,0,.34,0);cyl(.68,.68,.025,mat('#76583d'),g,0,.66,0);for(let i=0;i<16;i++){const a=i/16*Math.PI*2;const slat=box(.12,.62,.06,mats.trim,g,Math.sin(a)*.71,.38,Math.cos(a)*.71);slat.rotation.y=a;}for(const y of [.14,.61]){const r=mesh(new THREE.TorusGeometry(.72,.045,8,32),mats.wood,g,0,y,0);r.rotation.x=Math.PI/2}for(const [a,b] of [[-.32,0],[.22,.15],[0,-.3],[0,.24]])fruit(g,a,.81,b,fc,.88);const sign=label(letter,color);sign.position.set(0,1.9,0);g.add(sign);baskets.push({letter,x,z,g,ring,sign,fruitColor:fc});}
// A large juice press at the opposite edge. Its intake faces the answer bank.
const juicer=new THREE.Group();juicer.position.set(JUICER.x,0,JUICER.z);juicer.rotation.y=-Math.PI/2;world.add(juicer);
const machineGreen=mat('#568c71'),machineCream=mat('#fff0cd'),machineDark=mat('#31584b'),orangeJuice=mat('#eaa14a');
box(5.5,.3,4.5,mats.trim,juicer,0,.15,0);box(4,2.4,3.2,machineGreen,juicer,0,1.5,0);box(3.3,.28,3.5,machineCream,juicer,0,2.83,0);
for(const x of [-1.6,1.6])for(const z of [-1.25,1.25])cyl(.16,.2,2.6,machineDark,juicer,x,1.45,z);
const glass=new THREE.MeshStandardMaterial({color:'#e6f6cf',transparent:true,opacity:.28,roughness:.2,depthWrite:false});cyl(1.28,1.28,2.1,glass,juicer,0,4,0);
for(const y of [3,5.05]){const ring=mesh(new THREE.TorusGeometry(1.3,.12,10,36),machineCream,juicer,0,y,0);ring.rotation.x=Math.PI/2;}
cyl(1.55,.8,1.05,machineGreen,juicer,0,5.6,0);cyl(1.42,1.42,.06,machineDark,juicer,0,6.15,0);
for(const [x,y,z,c]of [[-.45,3.5,.3,'#eea557'],[.4,3.65,-.1,'#e58270'],[0,4.2,.3,'#c5bf5e']])fruit(juicer,x,y,z,c,1.45);
box(3.35,1.6,.16,machineCream,juicer,0,1.65,1.68);const intake=cyl(.64,.64,.18,machineDark,juicer,0,1.75,1.88);intake.rotation.x=Math.PI/2;const intakeRim=mesh(new THREE.TorusGeometry(.67,.1,10,32),mats.trim,juicer,0,1.75,2);box(1.5,.2,1.15,machineGreen,juicer,0,1.05,2.15);
for(const [x,c]of [[-1.18,'#a9c06c'],[1.18,'#e88a6b']]){const button=cyl(.14,.14,.09,mat(c),juicer,x,1.8,1.83);button.rotation.x=Math.PI/2;}
const wheel=new THREE.Group();wheel.position.set(-2.15,1.9,0);juicer.add(wheel);const wheelMesh=mesh(new THREE.TorusGeometry(.65,.1,10,28),mats.trim,wheel,0,0,0);wheelMesh.rotation.y=Math.PI/2;for(const a of [0,Math.PI/2]){const spoke=box(.09,1.15,.1,mats.trim,wheel,0,0,0);spoke.rotation.x=a;}
const jug=cyl(.5,.45,1.35,glass,juicer,2.45,.92,.4);cyl(.43,.4,.8,orangeJuice,juicer,2.45,.65,.4);const spout=cyl(.09,.09,.7,mats.trim,juicer,2,1.7,.4);spout.rotation.z=Math.PI/2;
const machineTitle=label('MÁY ÉP','#31584b','#fff4d6',512,150);machineTitle.scale.set(3.8,1.1,1);machineTitle.position.set(0,7.05,0);juicer.add(machineTitle);
let pressUntil=0,pressCount=0;
// A fully articulated little gardener. Front points along local +Z.
const actor=new THREE.Group();world.add(actor);actor.position.set(spawnPoint(0).x,0,spawnPoint(0).z);
const body=new THREE.Group();body.name='body';actor.add(body);const torso=ball(.45,mats.blue,body,0,1.02,0,[1,1.12,.72]);box(.67,.46,.48,mats.pants,body,0,.83,.025);box(.43,.33,.04,mats.pants,body,0,1.17,.328);for(const x of [-.23,.23]){box(.08,.48,.045,mats.pants,body,x,1.2,.29);ball(.035,mats.trim,body,x,1.28,.32);}
const head=new THREE.Group();head.position.set(0,1.7,0);body.add(head);ball(.43,mats.skin,head,0,0,0,[1,1.05,.93]);for(const x of [-.41,.41])ball(.09,mats.skin,head,x,0,0);ball(.44,mats.hair,head,0,.16,-.035,[1,.75,.95]);ball(.43,mats.skin,head,0,-.04,.07,[.9,.83,.86]);for(const x of [-.14,.14]){ball(.045,mat('#3e3531'),head,x,.03,.409,[.8,1, .4]);ball(.012,mats.white,head,x-.012,.045,.43)}ball(.065,mats.skin,head,0,-.06,.43,[.8,.7,.6]);for(const x of [-.24,.24])ball(.065,mat('#e6a08a'),head,x,-.09,.37,[1,.5,.15]);const smile=mesh(new THREE.TorusGeometry(.075,.012,6,16,Math.PI),mats.hair,head,0,-.09,.408);smile.rotation.z=Math.PI;
cyl(.49,.51,.09,mats.trim,head,0,.32,0);cyl(.3,.4,.22,mats.trim,head,0,.47,0);cyl(.4,.405,.065,mats.blue,head,0,.38,0);
const legs=[],arms=[];for(const side of [-1,1]){const leg=new THREE.Group();leg.position.set(side*.22,.65,0);leg.name='leg'+legs.length;actor.add(leg);cyl(.14,.13,.4,mats.pants,leg,0,-.19,0);ball(.16,mats.shoe,leg,0,-.44,.08,[.95,.7,1.5]);legs.push(leg);const arm=new THREE.Group();arm.position.set(side*.44,1.25,0);arm.name='arm'+arms.length;body.add(arm);cyl(.13,.12,.25,mats.blue,arm,0,-.12,0);cyl(.1,.09,.28,mats.skin,arm,0,-.34,0);ball(.115,mats.skin,arm,0,-.49,.015);arms.push(arm);}
const heldAnchor=new THREE.Group();heldAnchor.name='held';heldAnchor.position.set(0,.98,.56);body.add(heldAnchor);const shadow=mesh(new THREE.CircleGeometry(.5,32),new THREE.MeshBasicMaterial({color:'#385e36',transparent:true,opacity:.14,depthWrite:false}),world,0,.035,2.4);shadow.rotation.x=-Math.PI/2;
const avatarLabel=label('BẠN','#466b5d','#ffffed',256,100);avatarLabel.scale.set(.8,.32,1);world.add(avatarLabel);
const avatarTemplate=actor.clone(true);
const remoteAvatars=new Map();let lastDirection='';let lastUISignature='';const fallingFruit=new Map();
let holding=null,nearest=null,anim=null,walkPhase=0,moved=0,toastTime=0,keys=new Set(),joy={x:0,y:0},touchControls=null,done={move:false,pick:false,drop:false},dropped=[];
function task(name){done[name]=true;const li=$('#task-'+name);li.classList.add('done');li.querySelector('i').textContent='✓';$('#completed').hidden=!Object.values(done).every(Boolean)}
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');toastTime=2.3}
function bumpTargetNow(){
 const state=net.state(),self=net.self();if(!state||!self)return null;
 const players=state.players.map(p=>{const v=remoteAvatars.get(p.id);return v?{...p,x:v.g.position.x,z:v.g.position.z}:p;});
 return findBumpTarget({...state,players},{...self,x:actor.position.x,z:actor.position.z},net.now());
}
function updateUI(){
const localTarget=bumpTargetNow();
const state=net.state(),self=net.self(),now=net.now();const signature=[!!net.active(),state?.phase,state?.round,state?.paused,self?.held,self?.submitted,self?.picked,self?._pending,self?._submitting,!!(self&&now<self.busyUntil),self?Math.ceil(Math.max(0,self.cooldownUntil-now)/1000):0,localTarget?.id,net.canMove(),nearest?.letter,self&&insideDelivery(actor.position),!!holding,!!anim].join('|');if(signature===lastUISignature)return;lastUISignature=signature;

if(net.active()&&net.state()){const r=net.state(),p=net.self(),now=net.now(),open=net.canMove(),busy=!p||now<p.busyUntil;const button=$('#interact'),held=p?.held;const submit=held&&insideDelivery(actor.position);button.querySelector('b').textContent=held?(submit?'NỘP':'THẢ'):'NHẬN';button.querySelector('.action-icon').textContent=held?'↑':'↓';button.setAttribute('aria-label',held?(submit?'Nộp đáp án':'Thả quả'):'Nhận quả');button.classList.toggle('carrying',!!held);button.disabled=!open||busy||!!p?.submitted||(!held&&!nearest);const steal=$('#bump');steal.disabled=!open||busy||!localTarget;const cooldown=p?Math.max(0,Math.ceil((p.cooldownUntil-now)/1000)):0;steal.querySelector('small').textContent=cooldown?cooldown+'s':'Q';steal.title=cooldown?'Làm rơi đang hồi chiêu':localTarget?'Làm mất quả đối thủ trong tầm 2,6 m':'Đứng trong tầm 2,6 m, ngoài vùng an toàn';$('#holding').textContent=p?._submitting?'Đang nộp…':p?.submitted?'Đã đúng +100':held?'Quả '+held+(p._pending?' · đang xác nhận':''):'Tay không';$('#prompt').textContent=r.role==='host'?'Giáo viên đang quan sát sân chơi':r.phase==='lobby'?'Sân tập · Nhặt và thả quả tự do':r.phase!=='playing'?'Đáp án đã công bố · Chờ giáo viên tiếp tục':r.paused?'Giáo viên đang tạm dừng':now<r.readUntil?'Đọc đề cùng nhóm trước khi chạy!':p?.submitted?'Đã đúng +100 · Chờ các đội còn lại':busy?'Đợi nhân vật một chút nhé…':submit?'Trong vùng nộp · Nhấn NỘP hoặc E':held?'Mang quả '+held+' về máy ép hoa quả':localTarget?'Có thể làm rơi quả · Nhấn LÀM RƠI hoặc Q':nearest?'Giỏ '+nearest.letter+' · Nhấn NHẬN hoặc E':'Chạy đến giỏ A, B, C hoặc D';$('.control-deck').classList.toggle('host-controls',r.role==='host');return;}
$('.control-deck').classList.remove('host-controls');
const busy=!!anim,carrying=!!holding,button=$('#interact');
button.disabled=busy||(!carrying&&!nearest);
button.querySelector('b').textContent=carrying?'THẢ':'NHẬN';
button.querySelector('.action-icon').textContent=carrying?'↑':'↓';
button.setAttribute('aria-label',carrying?'Thả quả '+holding.letter:'Nhận quả');
button.classList.toggle('carrying',carrying);
// The solo practice stage has no valid opponent. Never offer a fake steal.
$('#bump').disabled=true;
$('#holding').textContent=holding?'Quả '+holding.letter:'Tay không';
$('#prompt').textContent=busy?'Đợi nhân vật một chút nhé…':holding?'Đang mang quả '+holding.letter+' · Nhấn THẢ hoặc E':nearest?'Giỏ '+nearest.letter+' · Nhấn NHẬN hoặc E':'Đi đến gần một giỏ để lấy quả';
}
function interact(){if(net.active()){if(!$('#interact').disabled){const self=net.self(),kind=self.held?(insideDelivery(actor.position)&&net.state().phase!=='lobby'?'submit':'drop'):'pick';net.send('interact',{kind,letter:self.held||nearest?.letter});}return;}if(anim)return;if(holding)drop();else pick();}
function bump(){if(net.active()&&!$('#bump').disabled)net.send('bump');}

function pick(){if(net.active()||anim||holding||!nearest)return;const b=nearest,input=net.input();if(Math.hypot(input.x,input.z)<.12)actor.rotation.y=Math.atan2(b.x-actor.position.x,b.z-actor.position.z);anim={kind:'pick',t:0,b,applied:false};updateUI()}
function drop(){if(net.active()||anim||!holding)return;anim={kind:'drop',t:0,b:holding,applied:false};updateUI()}

function clearInput(){keys.clear();joy={x:0,y:0};touchControls?.reset();$('#knob').style.transform='';}
window.addEventListener('keydown',e=>{if($('#guide').open||$('#room-dialog').open||e.target.closest?.('input,textarea,select,[contenteditable]'))return;const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d','e','q'].includes(k))e.preventDefault();keys.add(k);if(!e.repeat){if(k==='e')interact();if(k==='q')bump()}});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',clearInput);document.addEventListener('focusin',e=>{if(e.target.closest?.('input,textarea,select'))clearInput()});document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput()});
const joystickZone=document.createElement('div');joystickZone.id='joystick-zone';joystickZone.setAttribute('role','group');joystickZone.setAttribute('aria-label','Vùng joystick nổi: chạm và kéo để di chuyển');const joystickWrap=$('.joystick-wrap');joystickZone.append(joystickWrap);$('.game').append(joystickZone);
touchControls=bindGameControls({joystick:$('#joystick'),knob:$('#knob'),joystickZone,joystickWrap,interactButton:$('#interact'),bumpButton:$('#bump'),onInput:value=>{joy=value;},onInteract:()=>{updateUI();interact();},onBump:()=>{updateUI();bump();}});
$('#reset').onclick=()=>{clearInput();anim=null;holding=null;heldAnchor.clear();actor.position.set(spawnPoint(0).x,0,spawnPoint(0).z);actor.rotation.y=0;done={move:false,pick:false,drop:false};moved=0;for(const li of document.querySelectorAll('.tasks li')){li.classList.remove('done');li.querySelector('i').textContent='○'}$('#completed').hidden=true;for(const d of dropped)world.remove(d.g);dropped=[];toast('Nouvelle aventure!'.replace('Nouvelle aventure!','Bắt đầu một vòng khám phá mới!'));updateUI()};
$('#help').onclick=()=>{clearInput();$('#guide').showModal()};$('#close-guide').onclick=$('#start').onclick=()=>$('#guide').close();
// Màn hình giáo viên: dành sẵn một vùng riêng cho bản đồ ngay từ phòng chờ.
// Phần câu hỏi có thể cao/thấp theo nội dung nhưng không làm co giãn hoặc đẩy bản đồ.
// Chỉ áp dụng cho trang có data-role="teacher"; không sửa HTML/CSS của học sinh.
if(teacherMapFixed){
 const game=$('.game');
 if(getComputedStyle(game).position==='static')game.style.position='relative';
 for(const [property,value] of [
  ['position','absolute'],['inset','auto 0 0 0'],['height','58%'],
  ['width','100%'],['max-height','58dvh'],['min-height','0'],
  ['box-sizing','border-box'],['transform','none'],['flex','none']
 ])container.style.setProperty(property,value,'important');
}
// Tính khung bao thực tế một lần để cả bốn giỏ, hàng rào và máy ép đều nhìn thấy.
const teacherMapBounds=teacherMapFixed?new THREE.Box3().setFromObject(world):null;
const teacherMapCenter=teacherMapFixed?teacherMapBounds.getCenter(new THREE.Vector3()):null;
const teacherMapSize=teacherMapFixed?teacherMapBounds.getSize(new THREE.Vector3()):null;
function resize(){
 const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);
 renderer.setSize(w,h);
 const aspect=w/h;
 if(teacherMapFixed){
  // Góc quay giữ nguyên; chỉ tính toán lại khung nhìn khi kích thước cửa sổ thay đổi.
  const distance=Math.hypot(21,17);
  const verticalSize=teacherMapSize.z*21/distance+teacherMapSize.y*17/distance;
  const view=Math.max(verticalSize*1.18,teacherMapSize.x*1.12/aspect);
  camera.left=-view*aspect/2;camera.right=view*aspect/2;
  camera.top=view/2;camera.bottom=-view/2;
  camera.zoom=1;
 }else{
  // Giữ NGUYÊN camera/zoom của học sinh.
  const view=Math.max(27.8,50/aspect);
  camera.left=-view*aspect/2;camera.right=view*aspect/2;
  camera.top=view/2;camera.bottom=-view/2;
 }
 camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(container);resize();
// Camera magnification changes presentation only; shared collision geometry stays exact.
let overview=false,panX=0,panZ=0,drag=null;
// Chỉ tạo nút thay đổi góc nhìn trên màn hình học sinh.
// Giáo viên luôn thấy toàn bộ bản đồ, không có nút "Phóng to 100%" / "Toàn bản đồ".
if(!teacherMapFixed){
 const zoomButton=document.createElement('button');zoomButton.id='map-overview';zoomButton.type='button';
 Object.assign(zoomButton.style,{position:'absolute',left:'50%',bottom:'22px',transform:'translateX(-50%)',zIndex:'7',padding:'10px 14px',borderRadius:'12px',border:'1px solid #bed8a8',background:'#fffef4ee',color:'#285731',fontSize:'13px',fontWeight:'700',cursor:'pointer'});
 zoomButton.textContent='⛶ Toàn bản đồ';zoomButton.setAttribute('aria-pressed','false');
 zoomButton.onclick=()=>{overview=!overview;camera.zoom=overview?1:2;camera.updateProjectionMatrix();zoomButton.textContent=overview?'＋ Phóng to 100%':'⛶ Toàn bản đồ';zoomButton.setAttribute('aria-pressed',String(overview));};
 $('.game').append(zoomButton);
}
renderer.domElement.style.touchAction='none';
renderer.domElement.addEventListener('pointerdown',e=>{if(teacherMapFixed||!net.isHost()||overview)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const w=container.clientWidth,h=container.clientHeight;panX=THREE.MathUtils.clamp(panX-(e.clientX-drag.x)*(camera.right-camera.left)/camera.zoom/w,MAP.minX,MAP.maxX);panZ=THREE.MathUtils.clamp(panZ-(e.clientY-drag.y)*(camera.top-camera.bottom)/camera.zoom/h/.777,MAP.minZ,MAP.maxZ);drag.x=e.clientX;drag.y=e.clientY;});
const endPan=e=>{if(drag?.id===e.pointerId)drag=null;};renderer.domElement.addEventListener('pointerup',endPan);renderer.domElement.addEventListener('pointercancel',endPan);
function updateCamera(){
 if(teacherMapFixed){
  // Vị trí camera không thay đổi giữa: phòng chờ → câu hỏi → công bố đáp án.
  camera.position.set(teacherMapCenter.x,teacherMapCenter.y+21,teacherMapCenter.z+17);
  camera.lookAt(teacherMapCenter);
  return;
 }
 // Học sinh: giữ nguyên cơ chế camera đi theo nhân vật và nút toàn bản đồ.
 let x=0,z=0;
 if(!overview){if(net.isHost()){x=panX;z=panZ;}else{x=actor.position.x;z=actor.position.z;}}
 camera.position.set(x,21,z+17);camera.lookAt(x,0,z);
}
window.addEventListener('farm-left',()=>{panX=panZ=0;});
const clock=new THREE.Clock();let total=0;
function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.07);total+=dt;let dx=0,dz=0,speed=0;if(!net.active()&&!$('#guide').open){dx=joy.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));dz=joy.y+Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));const len=Math.hypot(dx,dz);if(len>.08){speed=Math.min(1,len);dx/=len;dz/=len;actor.position.x=THREE.MathUtils.clamp(actor.position.x+dx*SPEED*speed*dt,MAP.minX,MAP.maxX);actor.position.z=THREE.MathUtils.clamp(actor.position.z+dz*SPEED*speed*dt,MAP.minZ,MAP.maxZ);const target=Math.atan2(dx,dz);let delta=Math.atan2(Math.sin(target-actor.rotation.y),Math.cos(target-actor.rotation.y));actor.rotation.y+=delta*Math.min(1,dt*14);moved+=dt*speed;if(moved>.6&&!done.move)task('move')}}
walkPhase+=dt*11*speed;legs.forEach((l,i)=>l.rotation.x=Math.sin(walkPhase+i*Math.PI)*.62*speed);arms.forEach((a,i)=>{a.rotation.x=holding?-1.02:Math.sin(walkPhase+i*Math.PI+Math.PI)*.5*speed;a.rotation.z=holding?(i===0?-.22:.22):0});body.position.y=Math.abs(Math.sin(walkPhase))*speed*.045+Math.sin(total*2)*.012;body.rotation.x=0;
if(net.active()&&net.state()){const i=net.input(),key=i.x.toFixed(2)+','+i.z.toFixed(2);if(key!==lastDirection){lastDirection=key;net.inputChanged();}renderNetwork(dt,total);}
if(!net.active()&&anim){anim.t+=dt;const duration=(anim.kind==='pick'?PICKUP_MS:DROP_MS)/1000,p=Math.min(1,anim.t/duration),bend=Math.sin(p*Math.PI);body.rotation.x=bend*(speed?.15:.3);body.position.y-=bend*.05;arms.forEach(a=>a.rotation.x=-bend*1.35);if(p>.52&&!anim.applied){anim.applied=true;if(anim.kind==='pick'){holding={letter:anim.b.letter,color:anim.b.fruitColor};const f=fruit(heldAnchor,0,0,0,holding.color,1.2);const badge=label(holding.letter,'#456046');badge.position.set(0,.15,.32);badge.scale.set(.32,.22,1);f.add(badge);task('pick');toast('Đã lấy quả '+holding.letter+'! Thử mang đi rồi thả nhé.')}else{const f=fruit(world,actor.position.x+Math.sin(actor.rotation.y)*.65,.24,actor.position.z+Math.cos(actor.rotation.y)*.65,holding.color,1);dropped.push({g:f,t:1.1});heldAnchor.clear();holding=null;task('drop');toast(Object.values(done).every(Boolean)?'Hoàn thành sân tập! Thầy có thể thử lại các giỏ khác.':'Đã thả quả! Bạn có thể chọn một giỏ khác.')}}if(p>=1)anim=null;}
nearest=null;let min=1.6;for(const b of baskets){const dist=Math.hypot(b.x-actor.position.x,b.z-actor.position.z);if(dist<min){min=dist;nearest=b}b.sign.position.y=1.9+Math.sin(total*1.8)*.035;}for(const b of baskets)b.ring.material.opacity=b===nearest&&!(net.active()?net.self()?.held:holding)&&!net.isHost()?.9:0;
for(const d of dropped){d.t-=dt;d.g.scale.setScalar(Math.max(0,Math.min(1,d.t*3)));if(d.t<=0)world.remove(d.g)}dropped=dropped.filter(d=>d.t>0);shadow.visible=!net.active();avatarLabel.visible=!net.active();shadow.position.set(actor.position.x,.035,actor.position.z);avatarLabel.position.set(actor.position.x,2.78,actor.position.z);if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('#toast').classList.remove('show')}updateUI();updateCamera();renderer.render(scene,camera);}

// Visible safe delivery zone. Positions and fruit ownership come from the server.
const delivery=new THREE.Group();world.add(delivery);delivery.visible=false;
const safeRing=mesh(new THREE.RingGeometry(DELIVERY.radius-.12,DELIVERY.radius,64),new THREE.MeshBasicMaterial({color:'#fffbd4',side:THREE.DoubleSide,transparent:true,opacity:.8}),delivery,DELIVERY.x,.05,DELIVERY.z);safeRing.rotation.x=-Math.PI/2;
const safeDisk=mesh(new THREE.CircleGeometry(DELIVERY.radius-.12,64),new THREE.MeshBasicMaterial({color:'#eff5ce',side:THREE.DoubleSide,transparent:true,opacity:.18,depthWrite:false}),delivery,DELIVERY.x,.04,DELIVERY.z);safeDisk.rotation.x=-Math.PI/2;
const deliveryLabel=label('NỘP','#486841','#ffffe8',256,100);deliveryLabel.scale.set(1.15,.45,1);deliveryLabel.position.set(DELIVERY.x,.55,DELIVERY.z);delivery.add(deliveryLabel);for(const b of basketData){const ring=mesh(new THREE.RingGeometry(1.58,1.65,48),new THREE.MeshBasicMaterial({color:'#f6f4ce',side:THREE.DoubleSide,transparent:true,opacity:.4}),delivery,b[1],.045,b[2]);ring.rotation.x=-Math.PI/2;}
net.input=()=>{if($('#guide').open||$('#room-dialog').open)return{x:0,z:0};let x=joy.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),z=joy.y+Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));const l=Math.max(1,Math.hypot(x,z));return Math.hypot(x,z)<.12?{x:0,z:0}:{x:x/l,z:z/l}};
function roomAvatar(p){const g=avatarTemplate.clone(true);g.traverse(o=>{if(o.isMesh&&o.material===mats.blue)o.material=mat(p.color)});world.add(g);g.position.set(p.x,0,p.z);const contact=mesh(new THREE.CircleGeometry(.48,20),new THREE.MeshBasicMaterial({color:'#385e36',transparent:true,opacity:.14,depthWrite:false}),world,p.x,.035,p.z);contact.rotation.x=-Math.PI/2;const tag=label(p.name,'#3d604a','#fffbea',512,100);tag.scale.set(1.5,.3,1);world.add(tag);const shield=mesh(new THREE.RingGeometry(.6,.67,32),new THREE.MeshBasicMaterial({color:'#ffec9d',side:THREE.DoubleSide}),world,p.x,.055,p.z);shield.rotation.x=-Math.PI/2;return {g,tag,shield,contact,body:g.getObjectByName('body'),anchor:g.getObjectByName('held'),legs:[g.getObjectByName('leg0'),g.getObjectByName('leg1')],arms:[g.getObjectByName('arm0'),g.getObjectByName('arm1')],held:null,changeAt:-10,changeKind:'drop',phase:0,motion:new PredictedMotion(),remoteMotion:new RemoteMotion()};}
net.movement=()=>{const r=net.state(),v=r&&remoteAvatars.get(r.playerId);return {moves:v?.motion.pending()||[],moveSeq:v?.motion.seq,motionRound:r?.round};};
const obstacleLayer=new THREE.Group();world.add(obstacleLayer);let obstacleKey='';
const hayMaterial=mat('#d9b85c'),hayTop=mat('#efcf78'),hayRope=mat('#a17c40');
function renderObstacles(r){
 const key=r.code+JSON.stringify(r.obstacles||[]);if(key===obstacleKey)return;obstacleKey=key;
 obstacleLayer.traverse(o=>{if(o.isMesh)o.geometry.dispose();});obstacleLayer.clear();
 for(const o of r.obstacles||[]){
  if(o.kind==='fence'){fence(o.x,o.z,o.w>o.d?'x':'z',Math.max(o.w,o.d),obstacleLayer);continue;}
  const g=new THREE.Group();g.position.set(o.x,0,o.z);obstacleLayer.add(g);
  box(o.w,.95,o.d,hayMaterial,g,0,.5,0);box(o.w*.97,.08,o.d*.97,hayTop,g,0,1.01,0);
  for(const x of [-o.w*.28,o.w*.28]){box(.07,1.02,o.d+.04,hayRope,g,x,.52,0);}
  for(let i=0;i<7;i++)box(o.w*.83,.025,.02,hayTop,g,0,.15+i*.11,o.d/2+.012);
 }
}
function renderNetwork(dt,time){
 const r=net.state(),now=net.now();renderObstacles(r);delivery.visible=true;const submitted=r.players.filter(p=>p.submitted).length;if(submitted>pressCount)pressUntil=time+.6;pressCount=submitted;wheel.rotation.x+=dt*(time<pressUntil?16:.7);actor.visible=false;
 for(const [id,v]of remoteAvatars)if(!r.players.some(p=>p.id===id)){world.remove(v.g,v.tag,v.shield,v.contact);remoteAvatars.delete(id)}
 for(const authoritative of r.players){const p=authoritative.id===r.playerId?net.self():authoritative;let v=remoteAvatars.get(p.id);if(!v){v=roomAvatar(p);remoteAvatars.set(p.id,v)}const oldx=v.g.position.x,oldz=v.g.position.z;let tx=p.x,tz=p.z;
  const local=p.id===r.playerId,input=net.input(),canRun=net.canMove();
  let moving;
  if(local){v.motion.setEnvironment(r,p.id);v.motion.reconcile(p,r.code+':'+r.round);const pos=v.motion.step(input,dt,canRun);v.g.position.set(pos.x,0,pos.z);actor.position.set(pos.x,0,pos.z);moving=canRun&&Math.hypot(input.x,input.z)>=.12;}
  else{v.remoteMotion.sample(p,r.code+':'+r.round+':'+r.phase,r.serverNow);const pos=v.remoteMotion.position(now,dt)||p;v.g.position.x=pos.x;v.g.position.z=pos.z;moving=Math.hypot(v.g.position.x-oldx,v.g.position.z-oldz)/Math.max(dt,.001)>.13;}
  const facing=local&&moving?Math.atan2(input.x,input.z):p.angle;
  let delta=Math.atan2(Math.sin(facing-v.g.rotation.y),Math.cos(facing-v.g.rotation.y));v.g.rotation.y+=delta*Math.min(1,dt*14);v.phase+=dt*11*(moving?1:0);v.legs.forEach((l,i)=>l.rotation.x=moving?Math.sin(v.phase+i*Math.PI)*.6:0);v.arms.forEach((a,i)=>{a.rotation.x=p.held?-1.02:moving?Math.sin(v.phase+i*Math.PI+Math.PI)*.5:0;a.rotation.z=p.held?(i===0?-.22:.22):0});
  if(v.held!==p.held){v.changeKind=p.held?'pick':'drop';v.changeAt=time;v.held=p.held;v.anchor.clear();if(p.held){const colors={A:'#e8a155',B:'#e58270',C:'#c5bf5e',D:'#9a9dcd'},f=fruit(v.anchor,0,0,0,colors[p.held],1.2),badge=label(p.held,'#456046');badge.position.set(0,.15,.32);badge.scale.set(.32,.22,1);f.add(badge)}}
  const elapsed=time-v.changeAt,duration=(v.changeKind==='pick'?PICKUP_MS:DROP_MS)/1000,animating=elapsed<duration&&elapsed>=0,bend=animating?Math.sin(elapsed/duration*Math.PI):0;v.body.rotation.x=bend*(moving?.15:.3);v.body.position.y=Math.sin(time*2)*.012-bend*.05;if(animating)v.arms.forEach(a=>a.rotation.x=-bend*1.35);
  const swat=Math.max(0,1-(now-(p.bumpAt||0))/450);if(swat>0){v.arms[1].rotation.x=-Math.sin(swat*Math.PI)*1.4;v.arms[1].rotation.z=-Math.sin(swat*Math.PI)*.9;}const fumble=Math.max(0,1-(now-(p.fumbleAt||0))/550);if(fumble>0)v.body.rotation.z=Math.sin(fumble*Math.PI*3)*.13;else v.body.rotation.z=0;
  v.contact.position.set(v.g.position.x,.035,v.g.position.z);v.tag.position.set(v.g.position.x,2.78,v.g.position.z);v.shield.position.set(v.g.position.x,.055,v.g.position.z);v.shield.visible=now<p.shieldUntil;v.g.visible=true;
  if(p.id===r.playerId)actor.position.set(v.g.position.x,0,v.g.position.z);
 }
 for(const d of r.drops||[]){let f=fallingFruit.get(d.id);if(!f){const colors={A:'#e8a155',B:'#e58270',C:'#c5bf5e',D:'#9a9dcd'};f=fruit(world,d.x,1,d.z,colors[d.letter],1);fallingFruit.set(d.id,f);}const age=Math.max(0,(now-d.at)/1000);f.position.set(d.x+.55*Math.min(1,age*2),Math.max(.24,1-age*3)+Math.abs(Math.sin(age*10))*.25*Math.max(0,1-age),d.z+.3*Math.min(1,age*2));f.rotation.z=age*3;f.scale.setScalar(Math.min(1,Math.max(0,(1.8-age)*3)));}
 for(const [id,f]of fallingFruit)if(!(r.drops||[]).some(d=>d.id===id)){world.remove(f);fallingFruit.delete(id);}
 if(r.role==='host'){actor.position.set(100,0,100);nearest=null;}
}
window.addEventListener('farm-message',e=>toast(e.detail));
window.addEventListener('farm-left',()=>{for(const v of remoteAvatars.values())world.remove(v.g,v.tag,v.shield,v.contact);remoteAvatars.clear();for(const f of fallingFruit.values())world.remove(f);fallingFruit.clear();delivery.visible=false;obstacleLayer.clear();obstacleKey='';actor.visible=true;clearInput();holding=null;anim=null;heldAnchor.clear();actor.position.set(spawnPoint(0).x,0,spawnPoint(0).z);});

$('#load').remove();frame();
// Minimal read-only state for validating prototype interactions.
window.farmPrototype={getState:()=>({x:actor.position.x,z:actor.position.z,holding:holding?.letter??null,nearest:nearest?.letter??null,busy:!!anim,tasks:{...done}})};

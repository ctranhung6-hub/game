import test from 'node:test';import assert from 'node:assert/strict';
import {createRoom,addPlayer,advance,command,syncPlayer,view,targetFor,isSafe,ROUND_MS,RESULT_MS,SPEED,leavePlayer,touchPlayer,DISCONNECT_MS} from '../lib/farm/engine.mjs';
import {BASKETS,DELIVERY,MAP,spawnPoint,boundedPosition,makeObstacles,clearReach,PLAYER_RADIUS} from '../public/play/world.js';
import {PICKUP_MS,DROP_MS} from '../public/play/actions.js';
import {PredictedMotion,moveStep,STEP} from '../public/play/motion.js';
const question={text:'$1+1=?$',options:['$2$','$3$','$4$','$5$'],correct:'A',seconds:12,read:20,explanation:'$1+1=2$'};
function room(count=2,qs=2){const r=createRoom({code:'ABC234',hostToken:'teacher',questions:Array.from({length:qs},()=>question)},0);for(let i=0;i<count;i++)addPlayer(r,{name:'Nhóm '+i,id:'p'+i,token:'s'+i},0);return r}
const host=(r,command,now,id=command+now)=>{advance(r,now);return globalCommand(r,{token:'teacher',command,requestId:id},now)};const globalCommand=command;
const act=(r,i,action,now,seq=now,input={x:0,z:0})=>{advance(r,now);return syncPlayer(r,{token:'s'+i,seq,action,input},now)};
function start(count=2,qs=2){const r=room(count,qs);host(r,'start',1000);return r}
function pick(r,i,letter,now){const b=BASKETS.find(b=>b.letter===letter);r.players[i].x=b.x;r.players[i].z=b.z;act(r,i,'interact',now)}
function submit(r,i,now){r.players[i].x=DELIVERY.x;r.players[i].z=DELIVERY.z;act(r,i,'interact',now)}
test('60-second reminder starts immediately, without extra reading time',()=>{const r=start();assert.equal(r.questions[0].seconds,60);assert.equal(r.questions[0].read,0);assert.equal(r.startsAt,1000);assert.equal(r.readUntil,1000);assert.equal(r.endsAt,61000);assert.equal(ROUND_MS,60000)});
test('Lobby practice allows movement and repeated picking/dropping, including at centre',()=>{const r=room(),p=r.players[0];act(r,0,null,100,1,{x:1,z:0});advance(r,350);assert.ok(p.x>0);pick(r,0,'A',500);assert.equal(p.held,'A');submit(r,0,1300);assert.equal(p.held,null);assert.equal(p.submitted,null);pick(r,0,'B',2100);assert.equal(p.held,'B');assert.equal(p.picked,false);assert.equal(p.score,0);host(r,'start',3000);assert.equal(p.held,null);assert.equal(p.picked,false);assert.equal(p.x,spawnPoint(0).x);});
test('Student snapshots do not leak tokens or current answer key',()=>{const r=start();const s=view(r,'s0',2000);assert.equal(s.question.correct,undefined);assert.equal(s.question.explanation,undefined);assert.ok(s.players.every(p=>!('token'in p)));assert.throws(()=>view(r,'intruder',2000));});

test('Dropping fruit before submission allows changing A to B',()=>{
 const r=start(),p=r.players[0];pick(r,0,'A',2000);assert.equal(p.chosen,'A');
 p.x=3;p.z=0;act(r,0,'interact',2800);
 assert.equal(p.held,null);assert.equal(p.picked,false);assert.equal(p.chosen,null);
 pick(r,0,'B',3600);assert.equal(p.held,'B');assert.equal(p.chosen,'B');assert.equal(p.score,0);
});


test('A hit drops carried fruit and the victim may choose another answer',()=>{
 for(const own of [null,'D']){
  const r=start(),[p,t]=r.players;if(own)pick(r,0,own,2000);pick(r,1,'B',2001);
  p.x=3;p.z=0;t.x=3.8;t.z=0;p.lastSeen=t.lastSeen=3000;
  const selected=p.chosen;act(r,0,'bump',3000);
  assert.equal(p.held,own);assert.equal(p.chosen,selected);assert.equal(t.held,null);assert.equal(t.picked,false);assert.equal(t.chosen,null);
  pick(r,1,'C',4000);assert.equal(t.held,'C');assert.equal(t.chosen,'C');
  assert.equal(p.cooldownUntil,8000);assert.equal(t.shieldUntil,6000);
 }
});

test('Safe areas, shields, cooldown and feature toggle block hits',()=>{const r=start(),[p,t]=r.players;p.x=3;p.z=0;t.x=3.5;t.z=0;t.held='A';t.lastSeen=3000;t.shieldUntil=4000;assert.equal(targetFor(r,p,3000),null);t.shieldUntil=0;p.cooldownUntil=4000;assert.equal(targetFor(r,p,3000),null);p.cooldownUntil=0;r.stealing=false;assert.equal(targetFor(r,p,3000),null);r.stealing=true;p.x=t.x=DELIVERY.x;p.z=t.z=DELIVERY.z;assert.ok(isSafe(t));assert.equal(targetFor(r,p,3000),null);});

test('Correct = +100, wrong = 0 and retryable; the round ends once both are correct',()=>{
 const r=start();pick(r,0,'A',2000);pick(r,1,'B',2001);submit(r,0,3000);
 assert.equal(r.players[0].score,100);assert.equal(r.players[0].submitted,'A');
 act(r,0,'interact',4000);assert.equal(r.players[0].submitted,'A');assert.equal(r.phase,'playing');
 submit(r,1,4100);assert.equal(r.phase,'playing');assert.equal(r.players[1].score,0);
 assert.equal(r.players[1].submitted,null);assert.equal(r.players[1].lastSubmission.correct,false);
 pick(r,1,'A',5000);assert.equal(r.players[1].held,'A');submit(r,1,6100);
 assert.equal(r.players[1].score,100);assert.equal(r.players[1].submitted,'A');
 assert.equal(r.phase,'revealed');assert.equal(r.revealReason,'all');
 assert.equal(r.players[0].lastCorrect,true);assert.equal(r.players[1].lastCorrect,true);
});

test('Reveal stays on both screens until the teacher continues, then resets picks',()=>{const r=start(1);pick(r,0,'A',2000);submit(r,0,3000);advance(r,6000);assert.equal(r.phase,'revealed');advance(r,60000);assert.equal(r.phase,'revealed');assert.equal(view(r,'teacher',60000).question.correct,'A');assert.equal(view(r,'s0',60000).question.correct,'A');assert.throws(()=>command(r,{token:'s0',command:'continue',requestId:'student-next'},60000));host(r,'continue',61000);assert.equal(r.phase,'playing');assert.equal(r.round,1);assert.equal(r.endsAt,121000);assert.equal(r.players[0].picked,false);assert.equal(r.players[0].submitted,null);assert.equal(r.players[0].score,100);assert.equal(view(r,'s0',61000).question.correct,undefined);});

test('At 60 seconds the round freezes and reveals, even with pending or wrong answers',()=>{
 const r=start();pick(r,0,'A',2000);submit(r,0,3000);
 advance(r,60999);assert.equal(r.phase,'playing');assert.equal(r.players[0].score,100);
 advance(r,61000);assert.equal(r.phase,'revealed');assert.equal(r.revealReason,'timeout');
 assert.equal(r.players[0].score,100);assert.equal(r.players[1].score,0);assert.equal(r.players[1].submitted,null);
 pick(r,1,'A',61001);assert.equal(r.players[1].held,null);
 advance(r,120000);assert.equal(r.phase,'revealed');
 host(r,'continue',120001);assert.equal(r.round,1);assert.equal(r.phase,'playing');assert.equal(r.players[0].score,100);
});

test('Final answer is revealed before the teacher opens the summary, without double scoring',()=>{const r=start(2,1);pick(r,0,'A',2000);pick(r,1,'A',2001);submit(r,0,3000);submit(r,1,3001);assert.equal(r.phase,'revealed');assert.equal(r.players[0].correctCount,1);assert.equal(r.players[1].correctCount,1);advance(r,99999);assert.equal(r.phase,'revealed');assert.equal(r.players[0].score,100);assert.equal(view(r,'s0',99999).question.correct,'A');host(r,'continue',100000);assert.equal(r.phase,'finished');assert.equal(r.players[0].score,100);});

test('Pause preserves remaining time; resuming enforces the new 60-second cutoff',()=>{
 const r=start();host(r,'pause',5000);pick(r,0,'A',7000);assert.equal(r.players[0].held,null);
 advance(r,70000);assert.equal(r.phase,'playing');host(r,'resume',75000);
 assert.equal(r.endsAt,131000);advance(r,130999);assert.equal(r.phase,'playing');
 advance(r,131000);assert.equal(r.phase,'revealed');assert.equal(r.revealReason,'timeout');
 pick(r,0,'A',132000);assert.equal(r.players[0].held,null);
});

test('Sequence deduplication, authorization and roster limits remain enforced',()=>{const r=start();pick(r,0,'A',2000);act(r,0,'interact',3000,2000);assert.equal(r.players[0].held,'A');assert.throws(()=>command(r,{token:'s0',command:'start',requestId:'x'},2000));assert.throws(()=>addPlayer(r,{id:'x',token:'x',name:'new'},2000));const lobby=room(8);assert.throws(()=>addPlayer(lobby,{id:'x',token:'x',name:'new'},0));assert.throws(()=>createRoom({code:'x',hostToken:'t',questions:[{...question,options:[]}]},0));});
test('Restart clears results and returns everyone to unrestricted practice',()=>{const r=start(1,1);pick(r,0,'A',2000);submit(r,0,3000);host(r,'restart',4000);assert.equal(r.phase,'lobby');assert.equal(r.players[0].score,0);assert.equal(r.players[0].correctCount,0);pick(r,0,'D',5000);submit(r,0,6000);pick(r,0,'B',7000);assert.equal(r.players[0].held,'B');});
test('Server movement normalizes diagonal speed, respects bounds and stops stale devices',()=>{const r=room(1),p=r.players[0];p.x=0;p.z=0;r.obstacles=[];act(r,0,null,100,1,{x:10,z:10});const initial={x:p.x,z:p.z};advance(r,600);assert.ok(Math.abs(Math.hypot(p.x-initial.x,p.z-initial.z)-SPEED*.5)<.001);advance(r,5000);assert.ok(Math.hypot(p.x-initial.x,p.z-initial.z)<=SPEED*1.5+.01);p.x=MAP.maxX-.1;p.z=-5;act(r,0,null,5100,2,{x:1,z:0});advance(r,5400);assert.equal(p.x,MAP.maxX);});
test('Predicted movement replays unacknowledged steps without changing visible position',()=>{const m=new PredictedMotion();m.reconcile({x:0,z:0,moveAck:0},'r:0');for(let i=0;i<30;i++)m.step({x:1,z:0},STEP,true);const before=m.x,server={x:0,z:0};for(let i=0;i<15;i++)moveStep(server,1,0);m.reconcile({...server,moveAck:15},'r:0');assert.ok(Math.abs(m.x-before)<1e-10);assert.equal(m.pending().length,15);m.reconcile({x:0,z:2,moveAck:0},'r:1');assert.equal(m.x,0);assert.equal(m.z,2);assert.equal(m.pending().length,0);});
test('Delayed and duplicate network acknowledgements do not create sawtooth corrections',()=>{const r=room(1),m=new PredictedMotion();m.setEnvironment(r,r.players[0].id);m.reconcile({...r.players[0],moveAck:0},'r:-1');let requests=0,deliveries=[];for(let frame=1;frame<=400;frame++){const now=frame*STEP*1000,input=frame<100?{x:1,z:0}:frame<200?{x:0,z:-1}:frame<300?{x:-1,z:0}:{x:0,z:1};m.step(input,STEP,true);if(frame%15===0){advance(r,now+100);syncPlayer(r,{token:'s0',seq:++requests,input,motionRound:-1,moves:m.pending()},now+100);deliveries.push({frame:frame+6,p:{...r.players[0]}})}for(const d of deliveries.filter(d=>d.frame===frame)){const x=m.x,z=m.z;m.reconcile(d.p,'r:-1');assert.ok(Math.abs(m.x-x)<1e-9);assert.ok(Math.abs(m.z-z)<1e-9);m.reconcile(d.p,'r:-1');assert.ok(Math.abs(m.x-x)<1e-9)}}assert.ok(r.players[0].moveAck>300);});
test('Server tick protocol never double-integrates position on snapshot reads',()=>{const r=room(1),p=r.players[0],moves=Array.from({length:15},(_,i)=>({seq:i+1,x:1,z:0}));syncPlayer(r,{token:'s0',seq:1,input:{x:1,z:0},motionRound:-1,moves},300);const x=p.x;advance(r,600);assert.equal(p.x,x);syncPlayer(r,{token:'s0',seq:2,input:{x:1,z:0},motionRound:-1,moves},600);assert.equal(p.x,x);assert.equal(p.moveAck,15);});
test('Tick protocol rejects faster-than-real-time bursts, gaps and old-round movement',()=>{const r=room(1),p=r.players[0],moves=Array.from({length:90},(_,i)=>({seq:i+1,x:1,z:0}));syncPlayer(r,{token:'s0',seq:1,input:{x:1,z:0},motionRound:-1,moves},1);assert.ok(p.moveAck<=5);const ack=p.moveAck;syncPlayer(r,{token:'s0',seq:2,input:{x:1,z:0},motionRound:-1,moves:[{seq:ack+2,x:1,z:0}]},1000);assert.equal(p.moveAck,ack);host(r,'start',2000);syncPlayer(r,{token:'s0',seq:3,input:{x:1,z:0},motionRound:-1,moves},2100);assert.equal(p.moveAck,0);assert.equal(p.x,spawnPoint(0).x);});
test('Joystick dead zone prevents centre drift and disabled input queues no movement',()=>{const m=new PredictedMotion();m.reconcile({x:0,z:0,moveAck:0},'a');m.step({x:.04,z:.02},STEP,true);assert.equal(m.x,0);assert.equal(m.z,0);const before=m.pending().length;m.step({x:1,z:0},STEP,false);assert.equal(m.pending().length,before);});

test('Answer baskets share the west edge, with a long route to the opposite juice press',()=>{assert.equal(new Set(BASKETS.map(b=>b.x)).size,1);assert.equal(new Set(BASKETS.map(b=>b.z)).size,4);for(const b of BASKETS){assert.ok(b.x<0);assert.ok(DELIVERY.x-b.x>=32);assert.ok(Math.hypot(b.x-DELIVERY.x,b.z-DELIVERY.z)/SPEED>3)}assert.ok(MAP.width>40);});
test('Picking and dropping finish quickly without interrupting movement',()=>{const r=room(1),p=r.players[0];pick(r,0,'A',1000);assert.equal(p.busyUntil,1000+PICKUP_MS);const x=p.x;act(r,0,null,1050,1050,{x:1,z:0});advance(r,1150);assert.ok(p.x>x);p.x=3;p.z=0;act(r,0,'interact',1300);assert.equal(p.held,null);assert.equal(p.busyUntil,1300+DROP_MS);});
test('Pickup is evaluated at the pressed movement step while later steps keep running',()=>{const r=room(1),p=r.players[0],b=BASKETS[0];p.x=b.x+1.5;p.z=b.z;const moves=Array.from({length:20},(_,i)=>({seq:i+1,x:1,z:0}));const result=syncPlayer(r,{token:'s0',seq:1,input:{x:1,z:0},motionRound:-1,moves,action:'interact',afterMoveSeq:0},1000);assert.equal(result.deferAction,undefined);assert.equal(p.held,'A');assert.ok(p.x>b.x+2.8);assert.equal(p.moveAck,20);});

test('A running pickup waits for its pressed step if only part of the move batch was processed',()=>{const r=room(1),p=r.players[0],b=BASKETS[0];p.x=b.x+.5;p.z=b.z;const moves=Array.from({length:15},(_,i)=>({seq:i+1,x:1,z:0}));let result=syncPlayer(r,{token:'s0',seq:1,input:{x:1,z:0},motionRound:-1,moves,action:'interact',afterMoveSeq:6},1);assert.equal(result.deferAction,true);assert.equal(p.held,null);result=syncPlayer(r,{token:'s0',seq:2,input:{x:1,z:0},motionRound:-1,moves,action:'interact',afterMoveSeq:6},500);assert.equal(result.deferAction,undefined);assert.equal(p.held,'A');assert.equal(p.moveAck,15);});
test('Solid machine body keeps players outside while intake stays accessible',()=>{const p={x:18,z:0};boundedPosition(p);assert.ok(p.x<=16.5||p.x>=20.1||Math.abs(p.z)>=2.1);const at={x:DELIVERY.x,z:DELIVERY.z};boundedPosition(at);assert.equal(at.x,DELIVERY.x);assert.equal(at.z,DELIVERY.z);});

test('An action ID can be retried after a lost response without dropping an already picked fruit',()=>{const r=room(1),p=r.players[0],b=BASKETS[0];p.x=b.x;p.z=b.z;const body={token:'s0',seq:1,action:'interact',actionId:'pick-request-0000000001',input:{x:0,z:0}};const first=syncPlayer(r,body,1000);assert.equal(first.actionReceipt.status,'applied');assert.equal(p.held,'A');const retry=syncPlayer(r,{...body,seq:2},3000);assert.equal(retry.actionReceipt.id,body.actionId);assert.equal(retry.actionReceipt.status,'applied');assert.equal(p.held,'A');assert.equal(p.actionReceipts.length,1);});
test('Rejected action IDs stay rejected; a new click uses a new ID',()=>{const r=room(1),p=r.players[0],body={token:'s0',seq:1,action:'interact',actionId:'reject-request-000001',input:{x:0,z:0}};let result=syncPlayer(r,body,1000);assert.equal(result.actionReceipt.status,'rejected');p.x=BASKETS[0].x;p.z=BASKETS[0].z;result=syncPlayer(r,{...body,seq:2},2000);assert.equal(result.actionReceipt.status,'rejected');assert.equal(p.held,null);result=syncPlayer(r,{...body,seq:3,actionId:'new-request-000000001'},3000);assert.equal(result.actionReceipt.status,'applied');assert.equal(p.held,'A');});
test('Submission receipt retry does not double score or reopen the answer',()=>{const r=start(1,1),p=r.players[0];pick(r,0,'A',2000);p.x=DELIVERY.x;p.z=DELIVERY.z;const body={token:'s0',seq:3000,action:'interact',actionId:'submit-request-000001',input:{x:0,z:0}};syncPlayer(r,body,3000);assert.equal(r.phase,'revealed');const again=syncPlayer(r,{...body,seq:4000},4000);assert.equal(again.actionReceipt.status,'applied');assert.equal(p.score,100);assert.equal(p.correctCount,1);});
test('A stale repeated packet returns its existing receipt',()=>{const r=room(1),p=r.players[0];p.x=BASKETS[0].x;p.z=BASKETS[0].z;const body={token:'s0',seq:1,action:'interact',actionId:'duplicate-pick-000001',input:{x:0,z:0}};const a=syncPlayer(r,body,1000);const b=syncPlayer(r,body,2000);assert.equal(a.actionReceipt.id,b.actionReceipt.id);assert.equal(p.held,'A');assert.equal(p.actionReceipts.length,1);});


test('Fruit can be changed before submission and after a wrong submission',()=>{
 const r=start(),p=r.players[0];pick(r,0,'C',2000);p.x=0;p.z=0;act(r,0,'interact',2600);
 pick(r,0,'D',3000);assert.equal(p.held,'D');assert.equal(p.chosen,'D');
 submit(r,0,4000);assert.equal(p.submitted,null);assert.equal(p.score,0);
 pick(r,0,'A',5000);assert.equal(p.held,'A');assert.equal(p.chosen,'A');
 submit(r,0,6000);assert.equal(p.submitted,'A');assert.equal(p.score,100);
});

test('Submitted players continue moving, block others and can hit from 2.6 units away',()=>{
 const r=start(),[p,t]=r.players;r.obstacles=[];pick(r,0,'A',2000);submit(r,0,3000);
 p.x=0;p.z=0;t.x=2.4;t.z=0;t.held='B';t.chosen='B';t.picked=true;t.lastSeen=4000;
 assert.equal(targetFor(r,p,4000),t);act(r,0,'bump',4000);assert.equal(t.held,null);assert.equal(p.submitted,'A');assert.equal(r.drops.length,0);
 const x=p.x;syncPlayer(r,{token:'s0',seq:5000,input:{x:-1,z:0},moves:[{seq:1,x:-1,z:0}]},5000);assert.ok(p.x<x);assert.equal(p.submitted,'A');
 const runner={id:'runner',x:p.x-1.4,z:p.z};for(let i=0;i<60;i++)moveStep(runner,1,0,{players:[p]});assert.ok(Math.hypot(runner.x-p.x,runner.z-p.z)>=PLAYER_RADIUS*2-1e-8);
});
test('Hits obey the extended range and cannot pass through obstacles',()=>{const r=start(),[p,t]=r.players;r.obstacles=[];p.x=0;p.z=0;t.x=2.61;t.z=0;t.held='A';t.lastSeen=3000;assert.equal(targetFor(r,p,3000),null);t.x=2.5;assert.equal(targetFor(r,p,3000),t);r.obstacles=[{x:1.2,z:0,w:.3,d:2}];assert.equal(targetFor(r,p,3000),null);assert.equal(clearReach(p,t,r.obstacles),false);});
test('Obstacles are shared, deterministic, differ per room and leave the supply/delivery zones clear',()=>{const a=makeObstacles('ABC234');assert.deepEqual(a,makeObstacles('ABC234'));assert.notDeepEqual(a,makeObstacles('DEF567'));assert.ok(a.some(o=>o.kind==='hay'));assert.ok(a.some(o=>o.kind==='fence'));for(const o of a){assert.ok(o.x-o.w/2>-14);assert.ok(o.x+o.w/2<9);assert.ok(Math.abs(o.z)+o.d/2<11);}});
test('Prediction and server apply the same wall collisions, also after submission',()=>{const obstacles=[{x:1,z:0,w:.3,d:3}],environment={obstacles,players:[]};const p={id:'local',x:0,z:0},m=new PredictedMotion();m.setEnvironment(environment,'local');m.reconcile({...p,moveAck:0,submitted:'A'},'round');for(let i=0;i<30;i++){m.step({x:1,z:0},STEP,true);moveStep(p,1,0,environment);}const x=m.x;m.reconcile({...p,moveAck:30,submitted:'A'},'round');assert.equal(m.pending().length,0);assert.equal(m.x,x);assert.ok(p.x<=1-.15-PLAYER_RADIUS+1e-9);assert.equal(m.x,p.x);});
test('Random obstacle fields retain walkable paths from spawn to every basket and delivery',()=>{
 for(const code of ['ABC234','DEF567','QWERTY','ZZZZZZ','234567']){
  const env={obstacles:makeObstacles(code)},step=.5,minX=-21,maxX=21,minZ=-12,maxZ=12;
  const blocked=(x,z)=>{const p={x,z};boundedPosition(p,env);return Math.hypot(p.x-x,p.z-z)>.01;};
  const start=[12,-4],queue=[start],seen=new Set([start.join(',')]);
  for(let at=0;at<queue.length;at++){const [x,z]=queue[at];for(const [dx,dz]of [[step,0],[-step,0],[0,step],[0,-step]]){const nx=x+dx,nz=z+dz,k=nx+','+nz;if(nx<minX||nx>maxX||nz<minZ||nz>maxZ||seen.has(k)||blocked(nx,nz))continue;seen.add(k);queue.push([nx,nz]);}}
  for(const b of [...BASKETS,DELIVERY])assert.ok(queue.some(([x,z])=>Math.hypot(x-b.x,z-b.z)<1),code+JSON.stringify(b));
 }
});
test('One browser device reuses one character even with another token or tab',()=>{const r=room(0);const a=addPlayer(r,{id:'one',token:'first',name:'Nhóm A',deviceId:'device',clientId:'tab1'},100);const b=addPlayer(r,{id:'two',token:'other',name:'Nhóm B',deviceId:'device',clientId:'tab2'},200);assert.equal(a,b);assert.equal(r.players.length,1);leavePlayer(r,'first','tab1',300);assert.equal(r.players.length,1);leavePlayer(r,'first','tab2',400);assert.equal(r.players.length,0);const c=addPlayer(r,{id:'third',token:'new',name:'Changed',deviceId:'device',clientId:'tab3'},500);assert.equal(c.id,'one');assert.equal(r.players.length,1);});
test('Leaving removes the avatar and a returning device retains its locked answer',()=>{const r=room(0);addPlayer(r,{id:'p0',token:'s0',name:'A',deviceId:'device',clientId:'tab'},100);addPlayer(r,{id:'p1',token:'s1',name:'B'},100);host(r,'start',1000);pick(r,0,'D',2000);leavePlayer(r,'s0','tab',2500);assert.equal(r.players.length,1);const p=addPlayer(r,{id:'other',token:'other',name:'other',deviceId:'device',clientId:'tab2'},2600);assert.equal(p.id,'p0');assert.equal(p.chosen,'D');assert.equal(p.held,null);});
test('A disconnected non-submitter is removed; remaining submitted groups finish, empty room never auto-scores',()=>{
 const r=room(0);addPlayer(r,{id:'p0',token:'s0',name:'A',deviceId:'d0',clientId:'t0'},0);addPlayer(r,{id:'p1',token:'s1',name:'B',deviceId:'d1',clientId:'t1'},0);host(r,'start',1000);pick(r,0,'A',2000);submit(r,0,3000);touchPlayer(r.players[0],'t0',DISCONNECT_MS+1001);advance(r,DISCONNECT_MS+1002);assert.equal(r.players.length,1);assert.equal(r.phase,'revealed');assert.equal(r.players[0].score,100);
 const empty=room(0);addPlayer(empty,{id:'p0',token:'s0',name:'A',deviceId:'d0',clientId:'t0'},0);host(empty,'start',1000);leavePlayer(empty,'s0','t0',2000);advance(empty,99999);assert.equal(empty.players.length,0);assert.equal(empty.phase,'revealed');assert.equal(empty.revealReason,'timeout');
});
test('Teacher can kick during a round, students cannot, and the kicked device cannot immediately rejoin',()=>{const r=room(0);addPlayer(r,{id:'p0',token:'s0',name:'A',deviceId:'d0',clientId:'t0'},100);addPlayer(r,{id:'p1',token:'s1',name:'B'},100);host(r,'start',1000);pick(r,1,'A',2000);submit(r,1,3000);assert.throws(()=>command(r,{token:'s1',command:'remove',playerId:'p0',requestId:'bad'},3100));command(r,{token:'teacher',command:'remove',playerId:'p0',requestId:'kick'},3200);assert.equal(r.players.length,1);assert.equal(r.phase,'revealed');assert.throws(()=>addPlayer(r,{id:'new',token:'new',name:'New',deviceId:'d0',clientId:'newtab'},3300));});


test('Wrong submission action replay does not duplicate; a NEW correct submission is allowed',()=>{
 const r=start(),p=r.players[0];pick(r,0,'B',2000);p.x=DELIVERY.x;p.z=DELIVERY.z;
 const wrong={token:'s0',seq:3000,action:'interact',actionId:'wrong-submit-000001',input:{x:0,z:0}};
 const first=syncPlayer(r,wrong,3000);assert.deepEqual(first.actionReceipt.feedback,{correct:false,points:0});
 assert.equal(first.actionReceipt.status,'applied');assert.equal(p.submitted,null);assert.equal(p.score,0);
 const replay=syncPlayer(r,{...wrong,seq:3100},3100);
 assert.deepEqual(replay.actionReceipt.feedback,{correct:false,points:0});assert.equal(p.score,0);
 pick(r,0,'A',4000);assert.equal(p.held,'A');
 // A replay of the previous answer must not remove the newly picked fruit.
 const replayAgain=syncPlayer(r,{...wrong,seq:5000},5000);assert.equal(replayAgain.actionReceipt.feedback.correct,false);
 assert.equal(p.held,'A');assert.equal(p.score,0);
 p.x=DELIVERY.x;p.z=DELIVERY.z;
 const correct=syncPlayer(r,{token:'s0',seq:6000,action:'interact',actionId:'retry-new-action-00001',input:{x:0,z:0}},6000);
 assert.equal(correct.actionReceipt.status,'applied');assert.equal(correct.actionReceipt.feedback.points,100);
 assert.equal(p.score,100);assert.equal(p.submitted,'A');
 const dup=syncPlayer(r,{token:'s0',seq:6500,action:'interact',actionId:'retry-new-action-00001',input:{x:0,z:0}},6500);
 assert.equal(dup.actionReceipt.feedback.points,100);assert.equal(p.score,100);
});

test('Other players cannot see wrong attempt status, answer choice, or answer key',()=>{
 const r=start(),p=r.players[0];pick(r,0,'B',2000);submit(r,0,3000);
 assert.equal(p.score,0);assert.equal(p.submitted,null);assert.equal(r.phase,'playing');
 const other=view(r,'s1',3100);assert.equal(other.players[0].submitted,false);
 assert.equal(other.players[0].lastSubmission,null);
 assert.equal(other.question.correct,undefined);assert.equal(other.players[0].chosen,null);
 r.obstacles=[];const before=p.x;p.x=0;p.z=0;
 syncPlayer(r,{token:'s0',seq:5000,input:{x:1,z:0},moves:[{seq:1,x:1,z:0}]},5000);
 assert.ok(p.x>0);assert.equal(p.score,0);
});

test('Teacher cannot skip an unanswered round; repeated continue is idempotent',()=>{const r=start(1,3);assert.throws(()=>host(r,'continue',1500));pick(r,0,'A',2000);submit(r,0,3000);host(r,'continue',4000,'same-next');host(r,'continue',5000,'same-next');assert.equal(r.round,1);assert.equal(r.phase,'playing');assert.equal(r.players[0].score,100);});


test('Exactly at the deadline a previously carried correct fruit receives zero',()=>{
 const r=start(),p=r.players[0];pick(r,0,'A',2000);
 p.x=DELIVERY.x;p.z=DELIVERY.z;
 const request=syncPlayer(r,{token:'s0',seq:61000,action:'interact',input:{x:0,z:0},actionId:'deadline-submit-000001'},61000);
 assert.equal(r.phase,'revealed');assert.equal(r.revealReason,'timeout');
 assert.equal(p.score,0);assert.equal(p.submitted,null);
 assert.equal(request.actionReceipt.status,'rejected');
});
test('One millisecond before deadline a correct submission earns exactly 100',()=>{
 const r=start(),p=r.players[0];pick(r,0,'A',2000);p.x=DELIVERY.x;p.z=DELIVERY.z;
 syncPlayer(r,{token:'s0',seq:60999,action:'interact',input:{x:0,z:0}},60999);
 assert.equal(p.score,100);assert.equal(p.submitted,'A');
 advance(r,61000);assert.equal(r.phase,'revealed');assert.equal(p.score,100);
});
test('All wrong and unanswered teams receive zero at expiry; no duplicate rewards',()=>{
 const r=start(3,1);pick(r,0,'A',2000);submit(r,0,3000);pick(r,1,'C',4000);submit(r,1,5000);
 advance(r,61000);assert.equal(r.phase,'revealed');
 assert.deepEqual(r.players.map(p=>p.score),[100,0,0]);
 advance(r,91000);assert.deepEqual(r.players.map(p=>p.score),[100,0,0]);
});


test('Exactly two automatic round-ending conditions: EVERY team correct or 60 seconds',()=>{
 const r=start(3,1);
 pick(r,0,'B',2000);submit(r,0,3000);
 pick(r,1,'C',3500);submit(r,1,4500);
 pick(r,2,'D',5000);submit(r,2,6000);
 assert.equal(r.phase,'playing');assert.deepEqual(r.players.map(p=>p.score),[0,0,0]);
 pick(r,0,'A',7000);submit(r,0,8000);
 pick(r,1,'A',9000);submit(r,1,10000);
 assert.equal(r.phase,'playing');assert.deepEqual(r.players.map(p=>p.score),[100,100,0]);
 advance(r,60999);assert.equal(r.phase,'playing');
 advance(r,61000);assert.equal(r.phase,'revealed');assert.equal(r.revealReason,'timeout');
 assert.deepEqual(r.players.map(p=>p.score),[100,100,0]);
});

test('All 8 teams can retry repeatedly; the last correct team ends the round early',()=>{
 const r=start(8,1);
 for(let i=0;i<8;i++){pick(r,i,'B',2000+i*100);submit(r,i,4000+i*100);}
 assert.equal(r.phase,'playing');assert.ok(r.players.every(p=>!p.submitted&&p.score===0));
 for(let i=0;i<8;i++){
   pick(r,i,'A',7000+i*100);submit(r,i,9000+i*100);
   assert.equal(r.phase,i===7?'revealed':'playing');
 }
 assert.equal(r.revealReason,'all');assert.ok(r.players.every(p=>p.score===100&&p.correctCount===1));
});

test('Wrong attempt at 59.999s is allowed but cannot be corrected at the exact deadline',()=>{
 const r=start(2,1),p=r.players[0];pick(r,0,'B',50000);submit(r,0,60999);
 assert.equal(r.phase,'playing');assert.equal(p.submitted,null);assert.equal(p.score,0);
 const before=p.x;pick(r,0,'A',61000);assert.equal(p.held,null);
 assert.equal(r.phase,'revealed');assert.equal(r.revealReason,'timeout');assert.equal(p.score,0);
});

test('Pausing the round allows retries after resuming without resetting prior correct scores',()=>{
 const r=start(2,1);pick(r,0,'A',2000);submit(r,0,3000);
 pick(r,1,'B',4000);submit(r,1,5000);assert.equal(r.phase,'playing');
 host(r,'pause',6000);assert.equal(r.paused,true);advance(r,100000);assert.equal(r.phase,'playing');
 host(r,'resume',101000);assert.equal(r.endsAt,156000);
 pick(r,1,'A',102000);submit(r,1,103000);
 assert.equal(r.phase,'revealed');assert.equal(r.revealReason,'all');
 assert.deepEqual(r.players.map(p=>p.score),[100,100]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addPlayer,command,syncPlayer,view} from '../lib/farm/engine.mjs';
import {rankedResults,formatTime} from '../public/play/ranking.js';
import {BASKETS,DELIVERY,makeObstacles} from '../public/play/world.js';
import {SPEED,STEP,moveStep} from '../public/play/motion.js';
const question={text:'1+1?',options:['2','3','4','5'],correct:'A'};
function setup(){const r=createRoom({code:'TESTAB',hostToken:'teacher',questions:[question,question]},0);for(let i=0;i<2;i++)addPlayer(r,{id:'p'+i,token:'s'+i,name:'Group '+i},0);command(r,{token:'teacher',command:'start',requestId:'start'},1000);return r;}
function host(r,name,now){return command(r,{token:'teacher',command:name,requestId:name+now},now);}
function take(r,i,letter,now){const p=r.players[i],b=BASKETS.find(b=>b.letter===letter);p.x=b.x;p.z=b.z;return syncPlayer(r,{token:p.token,seq:now,action:'interact'},now);}
function submit(r,i,now,id){const p=r.players[i];p.x=DELIVERY.x;p.z=DELIVERY.z;return syncPlayer(r,{token:p.token,seq:now,action:'interact',...(id?{actionId:id}:{})},now);}
test('Ranking prefers correct count, then smaller total duration, with true ties sharing rank',()=>{
 const input=[{id:'slow',correctCount:2,totalTimeMs:30000},{id:'fewer',correctCount:1,totalTimeMs:1000},{id:'fast',correctCount:2,totalTimeMs:25000},{id:'tie',correctCount:2,totalTimeMs:25000}];
 const rows=rankedResults(input);assert.deepEqual(rows.map(p=>p.id),['fast','tie','slow','fewer']);assert.deepEqual(rows.map(p=>p.rank),[1,1,3,4]);assert.equal(input[0].id,'slow');assert.match(formatTime(12345),/12,345/);
});
test('Timing starts at round start, includes pre-submit answer changes and never counts twice',()=>{
 const r=setup(),p=r.players[0];take(r,0,'B',2000);const b=r.players[0];b.x=0;b.z=0;syncPlayer(r,{token:'s0',seq:3000,action:'interact'},3000);assert.equal(p.totalTimeMs,0);assert.equal(p.answerTimeMs,null);
 take(r,0,'A',4000);submit(r,0,5000,'correct-request-00001');assert.equal(p.answerTimeMs,4000);assert.equal(p.totalTimeMs,4000);assert.equal(p.score,100);
 submit(r,0,6000,'correct-request-00001');assert.equal(p.totalTimeMs,4000);assert.equal(p.score,100);
 take(r,1,'A',6500);submit(r,1,7000);assert.equal(r.phase,'revealed');assert.equal(r.players[1].totalTimeMs,6000);
 assert.equal(view(r,'s0',7000).players[0].totalTimeMs,4000);assert.equal(view(r,'teacher',7000).players[0].answerTimeMs,4000);
});
test('Pauses and the reveal/teacher waiting period do not inflate recorded times',()=>{
 const r=setup();take(r,0,'A',2000);submit(r,0,3000);host(r,'pause',5000);host(r,'resume',15000);take(r,1,'A',16000);submit(r,1,17000);
 assert.equal(r.players[0].answerTimeMs,2000);assert.equal(r.players[1].answerTimeMs,6000);
 host(r,'continue',50000);assert.equal(r.players[0].answerTimeMs,null);assert.equal(r.players[0].totalTimeMs,2000);
 take(r,0,'A',51000);submit(r,0,52000);assert.equal(r.players[0].answerTimeMs,2000);assert.equal(r.players[0].totalTimeMs,4000);
 host(r,'restart',53000);assert.equal(r.players[0].totalTimeMs,0);assert.equal(r.players[0].answerTimeMs,null);
});
test('Every room has exactly 3 hay bales and 5 fences in both orientations',()=>{
 for(const code of ['ABC234','TESTAB','ZZZZZZ','234567','QWERTY']){const obstacles=makeObstacles(code);assert.equal(obstacles.length,8);assert.equal(obstacles.filter(o=>o.kind==='hay').length,3);assert.equal(obstacles.filter(o=>o.kind==='fence').length,5);assert.equal(obstacles.filter(o=>o.kind==='fence'&&o.w>o.d).length,3);assert.equal(obstacles.filter(o=>o.kind==='fence'&&o.d>o.w).length,2);}
});
test('Running speed is 1.5 times v09 and still cannot tunnel through a thin fence',()=>{
 assert.ok(Math.abs(SPEED-6.4*1.5)<1e-9);const p={x:0,z:0},env={obstacles:[{x:1,z:0,w:.32,d:3}]};for(let i=0;i<60;i++)moveStep(p,1,0,env);assert.ok(p.x<1);const free={x:0,z:0};for(let i=0;i<60;i++)moveStep(free,1,0);assert.ok(Math.abs(free.x-SPEED)<1e-8);assert.equal(STEP,1/60);
});

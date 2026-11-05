import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,addPlayer,command,syncPlayer,view,leavePlayer} from '../lib/farm/engine.mjs';
import {BASKETS,DELIVERY} from '../public/play/world.js';
const question={text:'1+1?',options:['2','3','4','5'],correct:'A'};
function setup(){const r=createRoom({code:'TESTAB',hostToken:'teacher',questions:[question,question,question]},0);for(let i=0;i<2;i++)addPlayer(r,{id:'p'+i,token:'s'+i,name:'Group '+i},0);command(r,{token:'teacher',command:'start',requestId:'start'},1000);return r;}
function correct(r,i,now){const p=r.players[i];p.x=BASKETS[0].x;p.z=BASKETS[0].z;syncPlayer(r,{token:p.token,seq:now,action:'interact'},now);p.x=DELIVERY.x;p.z=DELIVERY.z;syncPlayer(r,{token:p.token,seq:now+1000,action:'interact'},now+1000);}
const finish=(r,now=5000,id='finish')=>command(r,{token:'teacher',command:'finish',requestId:id},now);
test('Early finish immediately preserves earned scores and time, does not score held fruit, and blocks later submission',()=>{
 const r=setup();correct(r,0,2000);const p=r.players[1];p.held='A';p.x=DELIVERY.x;p.z=DELIVERY.z;
 finish(r);assert.equal(r.phase,'finished');assert.equal(r.endedEarly,true);assert.equal(r.playedTotal,1);assert.equal(r.players[0].score,100);assert.equal(r.players[1].score,0);
 const snapshot=view(r,'s1',5000);assert.equal(snapshot.endedEarly,true);assert.equal(snapshot.results[0].totalTimeMs,2000);assert.equal(snapshot.results[1].score,0);assert.equal(snapshot.playedTotal,1);assert.equal(snapshot.total,3);
 syncPlayer(r,{token:'s1',seq:6000,action:'interact',input:{x:1,z:0}},6000);assert.equal(p.score,0);assert.equal(p.vx,0);
 finish(r,7000,'finish-again');assert.equal(r.finishedAt,5000);assert.deepEqual(view(r,'teacher',7000).results,snapshot.results);
});
test('Summary results remain available after pupils close their tabs',()=>{const r=setup();correct(r,0,2000);finish(r);const results=structuredClone(r.finalResults);leavePlayer(r,'s0',null,6000);leavePlayer(r,'s1',null,6000);assert.equal(r.players.length,0);assert.deepEqual(view(r,'teacher',6000).results,results);});
test('Only the teacher may finish, also while paused or viewing answers; restart clears the final snapshot',()=>{
 const r=setup();assert.throws(()=>command(r,{token:'s0',command:'finish',requestId:'bad'},2000));assert.equal(r.phase,'playing');command(r,{token:'teacher',command:'pause',requestId:'pause'},2000);finish(r);assert.equal(r.paused,false);assert.equal(r.phase,'finished');command(r,{token:'teacher',command:'restart',requestId:'restart'},6000);assert.equal(r.finalResults,null);assert.equal(r.endedEarly,false);assert.throws(()=>finish(r,6500,'lobby-finish'));
 const revealed=setup();correct(revealed,0,2000);correct(revealed,1,2500);assert.equal(revealed.phase,'revealed');finish(revealed);assert.equal(revealed.phase,'finished');assert.equal(revealed.finalResults[1].score,100);
});

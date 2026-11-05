import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import WebSocket from 'ws';
import {CHARACTER_COLORS} from '../public/play/colors.js';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('9 WebSockets: room, eight players, movement, push, reconnect, kick and finish',async()=>{
 const port=19000+Math.floor(Math.random()*1000),origin=`http://localhost:${port}`;
 const child=spawn(process.execPath,['backend/server.mjs'],{env:{...process.env,PORT:String(port),ALLOWED_ORIGINS:origin,DATA_DIR:''},stdio:['ignore','pipe','pipe']});
 const clients=[];
 try{
  await Promise.race([once(child.stdout,'data'),pause(5000).then(()=>{throw Error('Startup timeout');})]);
  async function client(device=randomBytes(32).toString('hex')){
   const ws=new WebSocket(`ws://localhost:${port}/ws`,{origin});await once(ws,'open');let n=0;const pending=new Map(),states=[];
   ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='state')states.push(m.data);if(m.type==='response'){const p=pending.get(m.id);pending.delete(m.id);if(p){clearTimeout(p.timer);m.error?p.reject(Object.assign(Error(m.error),{status:m.status})):p.resolve(m.data);}}});
   const c={ws,device,states,request:body=>new Promise((resolve,reject)=>{const id=String(++n),timer=setTimeout(()=>reject(Error('request timeout')),3000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,deviceId:device,body}));})};clients.push(c);return c;
  }
  const host=await client(),room=await host.request({type:'create',questions:[{text:'2+2?',options:['4','3','2','1'],correct:'A'}]});
  const players=await Promise.all(Array.from({length:8},async(_,i)=>{const c=await client();c.join=await c.request({type:'join',code:room.code,joinToken:c.device,name:'Nhom '+i,color:CHARACTER_COLORS[i].value,clientId:c.device});return c;}));
  const ninth=await client();await assert.rejects(ninth.request({type:'join',code:room.code,joinToken:ninth.device,name:'Ninth',clientId:ninth.device}));
  await host.request({type:'command',code:room.code,token:room.token,command:'start',requestId:randomBytes(16).toString('hex')});
  const latency=[];
  for(let seq=1;seq<=20;seq++){
   await pause(50);await Promise.all(players.map(async c=>{const t=performance.now();const r=await c.request({type:'sync',code:room.code,token:c.join.token,seq,motionRound:0,moves:[{seq,x:1,z:0}],input:{x:1,z:0},clientId:c.device});latency.push(performance.now()-t);assert.equal(r.players.find(p=>p.id===c.join.playerId).moveAck,seq);}));
  }
  assert.ok(host.states.length>=15,'host receives pushed snapshots without polling');
  assert.equal(host.states.at(-1).players.length,8);
  const old=players[0];old.ws.close();await once(old.ws,'close');const restored=await client(old.device);
  const joined=await restored.request({type:'join',code:room.code,joinToken:old.device,name:'Nhom 0',clientId:old.device});assert.equal(joined.playerId,old.join.playerId);assert.equal(joined.players.length,8);
  await host.request({type:'command',code:room.code,token:room.token,command:'remove',playerId:joined.playerId,requestId:randomBytes(16).toString('hex')});
  await assert.rejects(restored.request({type:'sync',code:room.code,token:joined.token,seq:100,input:{x:0,z:0},clientId:old.device}));
  const final=await host.request({type:'command',code:room.code,token:room.token,command:'finish',requestId:randomBytes(16).toString('hex')});assert.equal(final.phase,'finished');
  latency.sort((a,b)=>a-b);console.log(`Local 8-player RTT p95: ${latency[Math.floor(latency.length*.95)].toFixed(1)} ms; ${host.states.length} pushed frames`);
 }finally{for(const c of clients)c.ws.terminate();child.kill();await once(child,'exit');}
});

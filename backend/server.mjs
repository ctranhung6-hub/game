import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {WebSocketServer} from 'ws';
import {game,rooms} from './rooms.mjs';
import {advance,view} from '../lib/farm/engine.mjs';
const root=fileURLToPath(new URL('../public/',import.meta.url));
const allowed=new Set((process.env.ALLOWED_ORIGINS||'http://localhost:8080').split(',').map(s=>s.trim()).filter(Boolean));
const port=Number(process.env.PORT||8080),dataDir=process.env.DATA_DIR;
if(process.env.NODE_ENV==='production'&&!process.env.ALLOWED_ORIGINS)throw Error('Thiếu ALLOWED_ORIGINS: điền URL Vercel.');
if(dataDir){try{for(const [code,entry] of JSON.parse(await readFile(path.join(dataDir,'rooms.json'),'utf8'))){if(entry.expiresAt>Date.now())rooms.set(code,entry);}}catch(e){if(e.code!=='ENOENT')throw e;}}
let saving=false;
async function checkpoint(){if(!dataDir||saving)return;saving=true;try{await mkdir(dataDir,{recursive:true});const file=path.join(dataDir,'rooms.json');await writeFile(file+'.tmp',JSON.stringify([...rooms]),{mode:0o600});await rename(file+'.tmp',file);}catch(e){console.error('Checkpoint:',e.message);}finally{saving=false;}}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true,version:21}));}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const alias={'/':'/play/teacher.html','/teacher':'/play/teacher.html','/game':'/play/student.html','/play/teacher':'/play/teacher.html','/play/student':'/play/student.html'};
  const file=path.resolve(root,'.'+(alias[url.pathname]||decodeURIComponent(url.pathname)));
  if(!file.startsWith(root)){res.writeHead(403);return res.end();}
  const bytes=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
const wss=new WebSocketServer({noServer:true,maxPayload:110000,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
 if(new URL(req.url,'http://localhost').pathname!=='/ws'||!allowed.has(req.headers.origin)||wss.clients.size>=2000){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
let revision=0;
function send(ws,message){if(ws.readyState===1&&ws.bufferedAmount<256000)ws.send(JSON.stringify(message));else if(ws.bufferedAmount>=256000)ws.close(1013,'Slow connection');}
function snapshot(ws,now){const entry=rooms.get(ws.code);if(!entry)return;try{const data=view(entry.room,ws.token,now);if(ws.map===ws.code)delete data.obstacles;if(ws.round===data.round&&ws.phase===data.phase)delete data.question;ws.map=ws.code;ws.round=data.round;ws.phase=data.phase;send(ws,{type:'state',revision:++revision,data});}catch{send(ws,{type:'session-error',status:401,error:'Phiên đã kết thúc hoặc giáo viên đã mời bạn ra.'});ws.code=null;}}
function broadcast(code){const now=Date.now();for(const ws of wss.clients)if(ws.code===code)snapshot(ws,now);}
wss.on('connection',ws=>{
 ws.alive=true;ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
 ws.window=Date.now();ws.count=0;ws.creates=0;
 ws.on('message',raw=>{
  let id;
  try{
   const m=JSON.parse(raw.toString());id=m.id;
   if(typeof id!=='string'||id.length>90||!m.body||typeof m.body!=='object')throw Object.assign(Error('Yêu cầu không hợp lệ.'),{status:400});
   const now=Date.now();if(now-ws.window>=1000){ws.window=now;ws.count=0;}
   if(++ws.count>60)throw Object.assign(Error('Gửi thao tác quá nhanh.'),{status:429});
   if(typeof m.deviceId!=='string'||!/^[-a-f0-9]{64}$/.test(m.deviceId))throw Object.assign(Error('Thiếu định danh thiết bị.'),{status:401});
   if(ws.deviceId&&ws.deviceId!==m.deviceId)throw Object.assign(Error('Thiết bị đã thay đổi.'),{status:401});ws.deviceId=m.deviceId;
   if(m.body.type==='create'&&++ws.creates>20)throw Object.assign(Error('Đã tạo quá nhiều phòng trên kết nối này.'),{status:429});
   const data=game(m.body,ws.deviceId);
   if(['create','join','sync','command'].includes(m.body.type)){ws.code=data.code;ws.token=data.token||m.body.token;}
   if(m.body.type==='leave')ws.code=null;
   send(ws,{type:'response',id,revision:++revision,data});
   if(m.body.action||['create','join','command','leave'].includes(m.body.type))broadcast(data.code||m.body.code);
  }catch(e){send(ws,{type:'response',id,error:e.status?e.message:'Máy chủ gặp lỗi.',status:e.status||500});}
 });
});
// One process owns all rooms. Never run multiple replicas of this backend.
const simulation=setInterval(()=>{const now=Date.now();for(const [code,entry] of rooms){if(entry.expiresAt<=now){rooms.delete(code);continue;}advance(entry.room,now);}},1000/30);
const updates=setInterval(()=>{const now=Date.now();for(const ws of wss.clients){if(ws.code)snapshot(ws,now);}},50);
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);
const saveTimer=setInterval(checkpoint,5000);
server.listen(port,'0.0.0.0',()=>console.log(`Nong Trai v21 listening on ${port}`));
async function shutdown(){clearInterval(simulation);clearInterval(updates);clearInterval(heartbeat);clearInterval(saveTimer);await checkpoint();for(const ws of wss.clients)ws.close(1001,'Server restarting');server.close(()=>process.exit());setTimeout(()=>process.exit(),1500).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);

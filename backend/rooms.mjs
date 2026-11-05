import {randomUUID,randomInt} from 'node:crypto';
import {CHARACTER_COLORS} from '../public/play/colors.js';
import {createRoom,addPlayer,advance,command,syncPlayer,view,GameError,touchPlayer,leavePlayer} from '../lib/farm/engine.mjs';
export const rooms=new Map();
let dirty=false;
const secret=()=>randomUUID()+randomUUID();
const codegen=()=>String(randomInt(1_000_000)).padStart(6,'0');
export function game(b,deviceId){
 if(!b||typeof b!=='object'||Array.isArray(b))throw new GameError('Dữ liệu không hợp lệ.');
 const now=Date.now();
 if(b.type==='create'){
  for(const [code,v] of rooms)if(v.expiresAt<now)rooms.delete(code);
  let code;do{code=codegen();}while(rooms.has(code));
  const token=secret(),room=createRoom({code,hostToken:token,questions:b.questions,stealing:b.stealing},now);
  if(rooms.size>=200)throw new GameError('Máy chủ đã đủ phòng.',503);rooms.set(code,{room,expiresAt:now+12*3600000});dirty=true;
  return{token,...view(room,token,now)};
 }
 const code=String(b.code||'').toUpperCase().trim();
 if(!/^\d{6}$/.test(code))throw new GameError('Mã phòng gồm 6 chữ số.');
 const entry=rooms.get(code);if(!entry||entry.expiresAt<=now)throw new GameError('Không tìm thấy phòng hoặc phòng đã hết hạn (12 giờ).',404);
 // Clone before applying: a rejected request must not partially change the room.
 // No awaits in this transaction; concurrent devices cannot overwrite each other.
 const r=structuredClone(entry.room);advance(r,now);let token=b.token,extra={};
 const clientId=typeof b.clientId==='string'&&/^[-a-zA-Z0-9]{1,90}$/.test(b.clientId)?b.clientId:'legacy';
 if(b.type==='palette'){const own=r.players.find(p=>p.deviceId===deviceId);return{code,phase:r.phase,colors:CHARACTER_COLORS,usedColors:r.players.filter(p=>p!==own).map(p=>p.color),ownColor:own?.color||null};}
 if(b.type==='join'){
  if(typeof b.joinToken!=='string'||!/^[-a-zA-Z0-9]{64,90}$/.test(b.joinToken))throw new GameError('Mã tham gia không hợp lệ.');
  const duplicate=r.players.find(p=>p.token===b.joinToken);if(duplicate?.deviceId&&duplicate.deviceId!==deviceId)throw new GameError('Phiên tham gia không hợp lệ.',401);
  const p=addPlayer(r,{name:b.name,token:b.joinToken,id:randomUUID(),deviceId,clientId,color:b.color},now);token=p.token;extra.token=token;
 }else if(b.type==='command')command(r,b,now);
 else if(b.type==='leave'){const p=r.players.find(p=>p.token===token);if(p?.deviceId&&p.deviceId!==deviceId)throw new GameError('Phiên không hợp lệ.',401);leavePlayer(r,token,clientId,now);rooms.set(code,{...entry,room:r});dirty=true;return{left:true};}
 else if(b.type==='sync'){
  let p=r.players.find(p=>p.token===token);if(!p){const previous=r.departed.find(p=>p.token===token&&p.deviceId===deviceId);if(previous)p=addPlayer(r,{name:previous.name,token:previous.token,id:previous.id,deviceId,clientId},now);}if(p){if(p.deviceId&&p.deviceId!==deviceId)throw new GameError('Phiên không hợp lệ.',401);touchPlayer(p,clientId,now);}
  if(token!==r.hostToken&&!b.watch){const {message,deferAction,actionReceipt}=syncPlayer(r,b,now);extra={message,deferAction,actionReceipt};}
 }else throw new GameError('Yêu cầu không hợp lệ.');
 const result={...view(r,token,now),...extra};
 // The map and question are immutable during a round. Clients cache them and
 // receive only changing positions/scores in subsequent polls.
 if(b.type==='sync'&&b.cacheMap===r.code)delete result.obstacles;
 if(b.type==='sync'&&b.cacheRound===r.round&&b.cachePhase===r.phase)delete result.question;
 rooms.set(code,{...entry,room:r});dirty=true;return result;
}

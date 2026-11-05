import {WS_URL} from './config.js';
let deviceId;try{deviceId=localStorage.getItem('farm-device-token');if(!/^[a-f0-9]{64}$/.test(deviceId||'')){deviceId=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem('farm-device-token',deviceId);}}catch{deviceId=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');}
let socket,connecting,backoff=500,retry,serial=0;
const pending=new Map();
function connect(){
 if(socket?.readyState===1)return Promise.resolve(socket);
 if(connecting)return connecting;
 connecting=new Promise((resolve,reject)=>{
  const ws=new WebSocket(WS_URL);socket=ws;
  const deadline=setTimeout(()=>{ws.close();reject(Error('Không kết nối được máy chủ game. Kiểm tra GAME_SERVER_URL.'));},7000);
  ws.onopen=()=>{clearTimeout(deadline);connecting=null;backoff=500;resolve(ws);window.dispatchEvent(new Event('farm-connected'));};
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
   if(m.type==='response'){const r=pending.get(m.id);if(!r)return;pending.delete(m.id);r.clean();if(m.error)r.reject(Object.assign(Error(m.error),{status:m.status}));else r.resolve(m.data);}
   else if(m.type==='state')window.dispatchEvent(new CustomEvent('farm-state',{detail:m.data}));
   else if(m.type==='session-error')window.dispatchEvent(new CustomEvent('farm-session-error',{detail:m}));
  };
  ws.onerror=()=>{};
  ws.onclose=()=>{clearTimeout(deadline);connecting=null;socket=null;reject(Error('Mất kết nối máy chủ game.'));for(const r of pending.values()){r.clean();r.reject(Error('Đang kết nối lại…'));}pending.clear();window.dispatchEvent(new Event('farm-disconnected'));clearTimeout(retry);retry=setTimeout(()=>connect().catch(()=>{}),backoff+Math.random()*200);backoff=Math.min(backoff*2,5000);};
 });return connecting;
}
export async function request(body,signal){
 const ws=await connect();if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 return new Promise((resolve,reject)=>{
  const id=String(++serial),abort=()=>{pending.delete(id);clean();reject(new DOMException('Aborted','AbortError'));};
  const timer=setTimeout(()=>{pending.delete(id);clean();reject(Error('Máy chủ phản hồi chậm. Hãy thử lại.'));},4000);
  const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
  pending.set(id,{resolve,reject,clean});signal?.addEventListener('abort',abort,{once:true});
  if(ws.bufferedAmount>128000){pending.delete(id);clean();reject(Error('Kết nối đang nghẽn.'));return;}
  try{ws.send(JSON.stringify({id,deviceId,body}));}catch(e){pending.delete(id);clean();reject(e);}
 });
}

import {BASKETS,insideDelivery,clearReach} from './world.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const isSafePosition=p=>insideDelivery(p)||BASKETS.some(b=>distance(p,b)<=1.65);
export function findBumpTarget(room,player,now){
 if(!room.stealing||now<(player.cooldownUntil||0)||now<(player.busyUntil||0)||isSafePosition(player))return null;
 return room.players.filter(t=>t.id!==player.id&&t.held&&!t.submitted&&now>=(t.shieldUntil||0)&&(room.phase==='lobby'||(t.stolenCount||0)<2)&&!isSafePosition(t)&&(t.lastSeen!==undefined?now-t.lastSeen<6000:t.online!==false)&&distance(player,t)<=4&&clearReach(player,t,room.obstacles)).sort((a,b)=>distance(player,a)-distance(player,b))[0]||null;
}

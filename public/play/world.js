export const MAP={width:46,depth:28,minX:-21.8,maxX:21.8,minZ:-12.8,maxZ:12.8};
export const BASKETS=[{letter:'A',x:-18,z:-9},{letter:'B',x:-18,z:-3},{letter:'C',x:-18,z:3},{letter:'D',x:-18,z:9}];
export const DELIVERY={x:14.8,z:0,radius:2.2};
export const JUICER={x:18.2,z:0};
export function spawnPoint(index){return{x:12.2+Math.floor(index/4)*1.8,z:(index%4-1.5)*2.4}}
export function insideDelivery(p){return Math.hypot(p.x-DELIVERY.x,p.z-DELIVERY.z)<=DELIVERY.radius}
// Per-room seeded layouts: everyone sees and collides with the same obstacles.
export const PLAYER_RADIUS=.43;
export function makeObstacles(code){
 let seed=Array.from(code).reduce((s,c)=>(s*31+c.charCodeAt(0))>>>0,19)||1;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const slots=[];for(const x of [-10,-3,4])for(const z of [-8,-2.7,2.7,8])slots.push({x,z});
 for(let i=slots.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
 const items=slots.slice(0,8).map((slot,i)=>{
  const kind=i<3?'hay':'fence',vertical=i>=6;
  return{id:i,kind,x:slot.x+(random()-.5)*1.4,z:slot.z+(random()-.5)*1.2,w:kind==='hay'?1.7:vertical?.32:3.1,d:kind==='hay'?1.35:vertical?3.1:.32};
 });
 return items;
}
function resolveRect(p,o,pad=0){
 const left=o.x-o.w/2-pad,right=o.x+o.w/2+pad,top=o.z-o.d/2-pad,bottom=o.z+o.d/2+pad;
 if(p.x>left&&p.x<right&&p.z>top&&p.z<bottom){
  const edges=[{d:p.x-left,k:'x',v:left},{d:right-p.x,k:'x',v:right},{d:p.z-top,k:'z',v:top},{d:bottom-p.z,k:'z',v:bottom}].sort((a,b)=>a.d-b.d);
  p[edges[0].k]=edges[0].v;
 }
}
export function boundedPosition(p,environment={}){
 p.x=Math.max(MAP.minX,Math.min(MAP.maxX,p.x));p.z=Math.max(MAP.minZ,Math.min(MAP.maxZ,p.z));
 // The machine bounds already include the character clearance.
 resolveRect(p,{x:18.3,z:0,w:3.6,d:4.2});
 for(let pass=0;pass<2;pass++){
  for(const o of environment.obstacles||[])resolveRect(p,o,PLAYER_RADIUS);
  for(const other of environment.players||[]){
   if(other.id===p.id)continue;
   const dx=p.x-other.x,dz=p.z-other.z,d=Math.hypot(dx,dz),min=PLAYER_RADIUS*2;
   if(d<min){if(d>.00001){p.x=other.x+dx/d*min;p.z=other.z+dz/d*min;}else p.x+=min;}
  }
 }
 for(const o of environment.obstacles||[])resolveRect(p,o,PLAYER_RADIUS);
 resolveRect(p,{x:18.3,z:0,w:3.6,d:4.2});
 p.x=Math.max(MAP.minX,Math.min(MAP.maxX,p.x));p.z=Math.max(MAP.minZ,Math.min(MAP.maxZ,p.z));return p;
}
export function clearReach(a,b,obstacles=[]){
 // Reject hits through a fence/hay bale, using slab intersection in XZ.
 for(const o of obstacles){let lo=0,hi=1;for(const [key,width] of [['x','w'],['z','d']]){
  const delta=b[key]-a[key],min=o[key]-o[width]/2,max=o[key]+o[width]/2;
  if(Math.abs(delta)<1e-9){if(a[key]<min||a[key]>max){lo=2;break;}}
  else{let t1=(min-a[key])/delta,t2=(max-a[key])/delta;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);}
 }if(lo<=hi&&lo<=1&&hi>=0)return false;}
 return true;
}

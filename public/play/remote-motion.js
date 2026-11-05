// Render remote players from confirmed positions. Never predict through a wall
// or ahead of the latest confirmed position, which causes backward corrections.
export class RemoteMotion {
 constructor(){this.key=null;this.samples=[];this.gap=100;this.cursor=null;}
 sample(p,key,serverNow){
  if(this.key!==key){this.key=key;this.samples=[];this.cursor=null;this.gap=100;}
  const at=Number(p.positionAt||serverNow),last=this.samples.at(-1);
  if(!Number.isFinite(at)||!Number.isFinite(p.x)||!Number.isFinite(p.z))return;
  if(last&&at<=last.at)return;
  if(last){const gap=at-last.at;this.gap=this.gap*.8+Math.min(500,gap)*.2;}
  this.samples.push({at,x:p.x,z:p.z});
  if(this.samples.length>40)this.samples.shift();
 }
 position(now,dt){
  const a=this.samples;if(!a.length)return null;
  const delay=Math.max(120,Math.min(350,this.gap*1.6));
  const desired=Math.min(now-delay,a.at(-1).at);
  // A growing jitter buffer must not move playback backwards.
  if(this.cursor===null)this.cursor=Math.max(a[0].at,desired);
  else {const lag=desired-this.cursor;this.cursor+=Math.min(Math.max(0,lag),Math.max(0,dt)*1000*(lag>100?1.15:1));}
  while(a.length>2&&a[1].at<=this.cursor)a.shift();
  const left=a[0],right=a[1]||left;
  const t=right.at===left.at?0:Math.max(0,Math.min(1,(this.cursor-left.at)/(right.at-left.at)));
  return {x:left.x+(right.x-left.x)*t,z:left.z+(right.z-left.z)*t};
 }
}

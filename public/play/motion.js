import {boundedPosition} from './world.js';
export const STEP=1/60,SPEED=9.6;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function moveStep(p,x,z,environment={}){const length=Math.hypot(x,z);if(length<.12)return p;const divisor=Math.max(1,length);p.x+=x/divisor*SPEED*STEP;p.z+=z/divisor*SPEED*STEP;return boundedPosition(p,environment)}
// Predict fixed input steps, then replay only unacknowledged steps. An ordinary
// acknowledgement reproduces the exact displayed position, not a moving target.
export class PredictedMotion{
 constructor(){this.x=0;this.z=0;this.key=null;this.seq=0;this.ack=0;this.queue=[];this.accumulator=0;this.environment={}}
 setEnvironment(environment,id){this.environment=environment;this.id=id}
 reconcile(p,key){const ack=p.moveAck||0;if(this.key!==key){this.key=key;this.x=p.x;this.z=p.z;this.seq=this.ack=ack;this.queue=[];this.accumulator=0;return}if(ack<this.ack)return;if(ack===this.ack)return;this.ack=ack;this.seq=Math.max(this.seq,ack);this.queue=this.queue.filter(m=>m.seq>ack);this.x=p.x;this.z=p.z;for(const m of this.queue)moveStep(this,m.x,m.z,this.environment)}
 step(input,dt,enabled){if(!enabled){this.accumulator=0;return{x:this.x,z:this.z}}this.accumulator+=Math.min(.07,dt);while(this.accumulator+1e-9>=STEP&&this.queue.length<180){this.accumulator-=STEP;const m={seq:++this.seq,x:input.x,z:input.z};moveStep(this,m.x,m.z,this.environment);this.queue.push(m)}return{x:this.x,z:this.z}}
 pending(){return this.queue.slice(0,90)}
}

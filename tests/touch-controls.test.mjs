import test from 'node:test';
import assert from 'node:assert/strict';
import {bindGameControls} from '../public/play/touch-controls.js';
import {findBumpTarget} from '../public/play/interactions.js';
import {createRoom,addPlayer,command,syncPlayer} from '../lib/farm/engine.mjs';
class Element extends EventTarget{
 constructor(){super();this.disabled=false;this.style={};this.pointers=new Set();this.classes=new Set();this.classList={add:s=>this.classes.add(s),remove:s=>this.classes.delete(s)};}
 getBoundingClientRect(){return{left:0,top:0,width:100,height:100};}
 setPointerCapture(id){this.pointers.add(id);}
 hasPointerCapture(id){return this.pointers.has(id);}
 releasePointerCapture(id){this.pointers.delete(id);}
}
function fire(el,type,values={}){const e=new Event(type,{cancelable:true});for(const [k,v]of Object.entries(values))Object.defineProperty(e,k,{value:v});el.dispatchEvent(e);return e;}
function controls(){const joystick=new Element(),knob=new Element(),interactButton=new Element(),bumpButton=new Element();let input={x:0,y:0},pick=0,bump=0,time=1000;
 const control=bindGameControls({joystick,knob,interactButton,bumpButton,onInput:v=>input=v,onInteract:()=>pick++,onBump:()=>bump++,now:()=>time});
 return{joystick,knob,interactButton,bumpButton,control,get input(){return input},get pick(){return pick},get bump(){return bump},advance:dt=>time+=dt};
}
const finger=(id,extra={})=>({pointerId:id,pointerType:'touch',isPrimary:id===1,button:0,clientX:81,clientY:50,...extra});
test('Second finger picks/drops immediately on down while first finger keeps running, without click',()=>{
 const c=controls();const down=fire(c.joystick,'pointerdown',finger(1));assert.ok(down.defaultPrevented);assert.equal(c.input.x,1);
 const press=fire(c.interactButton,'pointerdown',finger(2));assert.equal(c.pick,1);assert.ok(press.defaultPrevented);assert.equal(c.input.x,1);
 fire(c.interactButton,'pointerup',finger(2));assert.equal(c.input.x,1);assert.ok(c.joystick.hasPointerCapture(1));
 fire(c.interactButton,'click',{detail:1,pointerType:'touch'});assert.equal(c.pick,1);
 fire(c.interactButton,'pointerdown',finger(2));assert.equal(c.pick,2);assert.equal(c.input.x,1);
 c.control.dispose();
});
test('Secondary finger bumps while running; ending or cancelling that finger never resets joystick',()=>{
 const c=controls();fire(c.joystick,'pointerdown',finger(1));fire(c.bumpButton,'pointerdown',finger(7));assert.equal(c.bump,1);assert.equal(c.input.x,1);
 for(const event of ['pointerup','pointercancel','lostpointercapture'])fire(c.bumpButton,event,finger(7));assert.equal(c.input.x,1);
 fire(c.joystick,'pointermove',finger(1,{clientX:50,clientY:19}));assert.equal(c.input.y,-1);assert.equal(c.input.x,0);
 fire(c.joystick,'pointerup',finger(1));assert.deepEqual(c.input,{x:0,y:0});c.control.dispose();
});
test('Only the joystick owner can release movement, even if the joystick is the second touch',()=>{
 const c=controls();fire(c.interactButton,'pointerdown',finger(1));fire(c.joystick,'pointerdown',finger(2));assert.equal(c.input.x,1);
 fire(c.joystick,'pointercancel',finger(3));assert.equal(c.input.x,1);fire(c.joystick,'lostpointercapture',finger(2));assert.equal(c.input.x,0);c.control.dispose();
});
test('Pointer down runs once, holding and synthetic clicks never repeat, keyboard activation stays available',()=>{
 const c=controls();fire(c.interactButton,'pointerdown',finger(1,{pointerType:'mouse'}));assert.equal(c.pick,1);
 fire(c.interactButton,'pointerdown',finger(1,{pointerType:'mouse'}));assert.equal(c.pick,1);fire(c.interactButton,'pointerup',finger(1));
 fire(c.interactButton,'click',{detail:0});assert.equal(c.pick,1);c.advance(701);fire(c.interactButton,'click',{detail:0});assert.equal(c.pick,2);
 fire(c.interactButton,'pointerdown',finger(3,{pointerType:'mouse',button:2}));assert.equal(c.pick,2);c.interactButton.disabled=true;fire(c.interactButton,'pointerdown',finger(4));assert.equal(c.pick,2);c.control.dispose();
});
test('Predicted target becomes available while running before a stale server target ID arrives',()=>{
 const target={id:'other',x:2.5,z:0,held:'A',online:true},r={stealing:true,phase:'playing',targetId:null,players:[target],obstacles:[]};const self={id:'self',x:-3,z:0};
 assert.equal(findBumpTarget(r,self,1000),null);assert.equal(findBumpTarget(r,{...self,x:0},1000),target);
 target.online=false;assert.equal(findBumpTarget(r,{...self,x:0},1000),null);
});
function runningRoom(){const r=createRoom({code:'TESTAB',hostToken:'teacher',questions:[{text:'1+1?',options:['2','3','4','5'],correct:'A'}]},0);addPlayer(r,{id:'p',token:'p',name:'P'},0);addPlayer(r,{id:'t',token:'t',name:'T'},0);command(r,{token:'teacher',command:'start',requestId:'start'},1000);r.obstacles=[];Object.assign(r.players[0],{x:0,z:0});Object.assign(r.players[1],{x:2.5,z:0,held:'A',picked:true,chosen:'A',lastSeen:3000});return r;}
test('A running bump checks the pressed step while later queued movement keeps going',()=>{
 const r=runningRoom(),p=r.players[0],t=r.players[1];const result=syncPlayer(r,{token:'p',seq:1,motionRound:0,input:{x:-1,z:0},moves:Array.from({length:30},(_,i)=>({seq:i+1,x:-1,z:0})),action:'bump',actionId:'running-bump-request-01',afterMoveSeq:0},3000);
 assert.equal(t.held,null);assert.equal(result.actionReceipt.status,'applied');assert.ok(p.x<-4.7);assert.equal(p.moveAck,30);
});
test('A running bump waits for its pressed step instead of consuming the action too early',()=>{
 const r=runningRoom(),p=r.players[0],t=r.players[1];t.x=1.2;t.lastSeen=1000;
 const body={token:'p',seq:1,motionRound:0,input:{x:-1,z:0},moves:Array.from({length:15},(_,i)=>({seq:i+1,x:-1,z:0})),action:'bump',actionId:'deferred-bump-request-01',afterMoveSeq:6};
 let result=syncPlayer(r,body,1001);assert.equal(result.deferAction,true);assert.equal(t.held,'A');assert.equal(p.actionReceipts,undefined);
 result=syncPlayer(r,{...body,seq:2},1500);assert.equal(result.actionReceipt.status,'applied');assert.equal(t.held,null);assert.equal(p.moveAck,15);
});

test('Floating joystick starts under the finger anywhere in the movement zone, then follows drag',()=>{
 const joystick=new Element(),knob=new Element(),zone=new Element(),wrap=new Element(),pickButton=new Element(),bumpButton=new Element();let input;
 zone.getBoundingClientRect=()=>({left:10,top:100,width:450,height:500});
 const c=bindGameControls({joystick,knob,joystickZone:zone,joystickWrap:wrap,interactButton:pickButton,bumpButton,onInput:v=>input=v,onInteract:()=>{},onBump:()=>{}});
 assert.equal(wrap.hidden,true);
 fire(zone,'pointerdown',finger(1,{clientX:250,clientY:350}));assert.equal(wrap.hidden,false);assert.equal(wrap.style.left,'190px');assert.equal(wrap.style.top,'200px');assert.deepEqual(input,{x:0,y:0});
 fire(zone,'pointermove',finger(1,{clientX:281,clientY:350}));assert.equal(input.x,1);assert.equal(input.y,0);
 fire(bumpButton,'pointerdown',finger(2));fire(bumpButton,'pointerup',finger(2));assert.equal(input.x,1);
 fire(zone,'pointerup',finger(1));assert.equal(wrap.hidden,true);assert.deepEqual(input,{x:0,y:0});
 fire(zone,'pointerdown',finger(3,{clientX:60,clientY:180}));assert.equal(wrap.style.left,'0px');assert.equal(wrap.style.top,'30px');assert.deepEqual(input,{x:0,y:0});
 fire(zone,'pointermove',finger(3,{clientX:60,clientY:149}));assert.equal(input.y,-1);c.dispose();assert.equal(wrap.hidden,true);
});

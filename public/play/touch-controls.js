// Each finger owns only its own control. Secondary touch pointers are intentional.
export function bindGameControls({joystick,knob,joystickZone,joystickWrap,interactButton,bumpButton,onInput,onInteract,onBump,now=()=>performance.now()}){
 const removers=[],surface=joystickZone||joystick;let joystickId=null,origin=null;
 if(joystickZone&&joystickWrap)joystickWrap.hidden=true;
 const listen=(el,type,fn)=>{el.addEventListener(type,fn,{passive:false});removers.push(()=>el.removeEventListener(type,fn));};
 const primaryButton=e=>e.pointerType!=='mouse'||e.button===0;
 const capture=(el,id)=>{try{el.setPointerCapture(id);}catch{}};
 const release=(el,id)=>{try{if(el.hasPointerCapture(id))el.releasePointerCapture(id);}catch{}};
 function move(e){
  if(e.pointerId!==joystickId)return;e.preventDefault();
  const r=joystick.getBoundingClientRect(),dx=e.clientX-(origin?.x??r.left+r.width/2),dy=e.clientY-(origin?.y??r.top+r.height/2),length=Math.hypot(dx,dy),radius=r.width*.31,ratio=length>radius?radius/length:1;
  onInput({x:dx*ratio/radius,y:dy*ratio/radius});knob.style.transform=`translate(${dx*ratio}px,${dy*ratio}px)`;
 }
 function reset(){const id=joystickId;joystickId=null;origin=null;if(joystickZone&&joystickWrap)joystickWrap.hidden=true;onInput({x:0,y:0});knob.style.transform='';if(id!==null)release(surface,id);}
 listen(surface,'pointerdown',e=>{
  if(joystickId!==null||!primaryButton(e))return;e.preventDefault();joystickId=e.pointerId;
  if(joystickZone&&joystickWrap){
   origin={x:e.clientX,y:e.clientY};joystickWrap.hidden=false;
   const area=joystickZone.getBoundingClientRect(),rect=joystick.getBoundingClientRect();
   joystickWrap.style.left=(e.clientX-area.left-rect.width/2)+'px';joystickWrap.style.top=(e.clientY-area.top-rect.height/2)+'px';
  }
  capture(surface,joystickId);move(e);
 });
 listen(surface,'pointermove',move);
 for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(surface,type,e=>{if(e.pointerId===joystickId)reset();});
 function action(button,run){
  let pointerId=null,suppressClickUntil=-Infinity;
  listen(button,'pointerdown',e=>{
   if(!primaryButton(e))return;e.preventDefault();
   if(button.disabled||pointerId!==null)return;
   pointerId=e.pointerId;suppressClickUntil=now()+700;capture(button,pointerId);button.classList.add('touch-pressed');run();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(button,type,e=>{
   if(e.pointerId!==pointerId)return;const id=pointerId;pointerId=null;button.classList.remove('touch-pressed');release(button,id);
  });
  listen(button,'click',e=>{
   e.preventDefault();
   // A physical pointer already ran on down; keep keyboard/accessibility activation.
   if(button.disabled||e.detail>0||e.pointerType||now()<suppressClickUntil)return;run();
  });
  listen(button,'contextmenu',e=>e.preventDefault());
 }
 action(interactButton,onInteract);action(bumpButton,onBump);
 return{reset,dispose(){reset();for(const remove of removers)remove();}};
}

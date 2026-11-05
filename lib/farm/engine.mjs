import {COLORS} from '../../public/play/colors.js';
export {COLORS};
import {findBumpTarget,isSafePosition} from '../../public/play/interactions.js';
import {PICKUP_MS,DROP_MS} from '../../public/play/actions.js';
import {moveStep,STEP,SPEED} from '../../public/play/motion.js';
import {BASKETS,spawnPoint,insideDelivery,boundedPosition,makeObstacles,clearReach} from '../../public/play/world.js';
export {BASKETS};
export {SPEED};
export const ROUND_MS=60000,RESULT_MS=3000;
export class GameError extends Error{constructor(message,status=400){super(message);this.status=status}}
const fail=s=>{throw new GameError(s)},dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const event=(r,text,now)=>{r.events.push({id:++r.eventId,text,at:now});r.events=r.events.slice(-15)};
export function validateQuestions(items){
 if(!Array.isArray(items)||!items.length||items.length>40)fail('Cần từ 1 đến 40 câu hỏi.');
 return items.map((q,i)=>{if(typeof q.text!=='string'||!q.text.trim()||q.text.length>2500)fail(`Câu ${i+1}: nội dung không hợp lệ.`);if(!Array.isArray(q.options)||q.options.length!==4||q.options.some(a=>typeof a!=='string'||!a.trim()||a.length>1200))fail(`Câu ${i+1}: cần đủ 4 đáp án.`);if(!['A','B','C','D'].includes(q.correct))fail(`Câu ${i+1}: cần chọn đáp án đúng.`);return{text:q.text.trim(),options:q.options.map(s=>s.trim()),correct:q.correct,explanation:String(q.explanation||'').slice(0,2500),seconds:60,read:0}});
}
export function createRoom({code,hostToken,questions,stealing=true},now){return{code,hostToken,questions:validateQuestions(questions),stealing:!!stealing,phase:'lobby',round:-1,players:[],obstacles:makeObstacles(code),departed:[],kicked:[],events:[],eventId:0,paused:false,createdAt:now,updatedAt:now,hostCommands:[],drops:[]}}
function resetPlayer(p,index,now){const spawn=spawnPoint(index);Object.assign(p,{x:spawn.x,z:spawn.z,angle:-Math.PI/2,held:null,submitted:null,chosen:null,picked:false,lastCorrect:null,lastSubmission:null,answerTimeMs:null,vx:0,vz:0,tickAt:now,busyUntil:0,cooldownUntil:0,shieldUntil:0,stolenCount:0,bumpAt:0,fumbleAt:0,motionProtocol:false,moveAck:0,moveCredit:80,lastMoveCreditAt:now,positionAt:now});}
function availableColor(r,color){
 if(color!==undefined&&!COLORS.includes(color))throw new GameError('Hãy chọn một trong 8 màu nhân vật.',400);
 const selected=color||COLORS.find(c=>!r.players.some(p=>p.color===c));
 if(!selected||r.players.some(p=>p.color===selected))throw new GameError('Màu này vừa có nhóm khác chọn. Hãy chọn màu còn trống.',409);
 return selected;
}
export function addPlayer(r,{name,token,id,deviceId,clientId,color},now){
 const existing=deviceId&&r.players.find(p=>p.deviceId===deviceId);if(existing){touchPlayer(existing,clientId,now);return existing;}
 if(deviceId&&(r.kicked||[]).includes(deviceId))throw new GameError('Giáo viên đã mời thiết bị này ra khỏi phòng.',403);
 const previous=deviceId&&(r.departed||[]).find(p=>p.deviceId===deviceId);if(previous){if(r.players.length>=8)fail('Phòng đã đủ 8 nhóm.');const nextColor=availableColor(r,color??(r.players.some(p=>p.color===previous.color)?undefined:previous.color));r.departed=r.departed.filter(p=>p!==previous);previous.color=nextColor;previous.clients={};previous.held=null;previous.vx=previous.vz=0;if(previous.departedRound!==r.round)resetPlayer(previous,r.players.length,now);touchPlayer(previous,clientId,now);r.players.push(previous);return previous;}
 if(r.phase!=='lobby')fail('Ván chơi đã bắt đầu. Hãy chờ ván mới.');if(r.players.length>=8)fail('Phòng đã đủ 8 nhóm.');name=String(name||'').trim().slice(0,20);if(!name)fail('Hãy nhập tên nhóm.');if(r.players.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))fail('Tên nhóm đã được dùng. Hãy chọn tên khác.');
 const p={id,token,deviceId,clients:{},name,color:availableColor(r,color),score:0,correctCount:0,totalTimeMs:0,lastSeen:now,lastSeq:-1};resetPlayer(p,r.players.length,now);touchPlayer(p,clientId,now);r.players.push(p);event(r,`${name} đã vào sân tập.`,now);return p;
}
export const isSafe=isSafePosition;
export const targetFor=findBumpTarget;
export function isOpen(r,now){return !r.paused&&(r.phase==='lobby'||r.phase==='playing'&&now>=r.readUntil&&now<r.endsAt)}
function finishMatch(r,now,early=false){
 if(r.phase==='finished')return;
 r.endedEarly=early;r.playedTotal=Math.max(0,r.round+1);r.phase='finished';r.finishedAt=now;r.paused=false;r.nextAt=0;
 r.players.forEach(p=>{p.vx=p.vz=0;});
 r.finalResults=r.players.map(p=>({id:p.id,name:p.name,score:p.score,correctCount:p.correctCount||0,totalTimeMs:p.totalTimeMs||0}));
 event(r,early?'Giáo viên đã kết thúc ván sớm. Điểm và thời gian đã được chốt.':'Đã hoàn thành tất cả câu hỏi!',now);
}
function startNext(r,now){const next=r.round+1;if(next>=r.questions.length){finishMatch(r,now);return;}r.round=next;r.phase='playing';r.paused=false;r.startsAt=r.readUntil=now;r.endsAt=now+ROUND_MS;r.nextAt=0;r.revealReason=null;r.drops=[];r.players.forEach((p,i)=>resetPlayer(p,i,now));event(r,`Câu ${next+1} bắt đầu: 60 giây để nộp đáp án.`,now)}
export function reveal(r,now,reason='all'){
 if(r.phase!=='playing')return;
 r.paused=false;r.revealReason=reason;
 const correct=r.questions[r.round].correct;
 for(const p of r.players){p.vx=p.vz=0;p.held=null;p.lastCorrect=!!p.submitted&&p.submitted===correct;}
 // Scoring is finalized at submission, never on reveal or after time runs out.
 r.phase='revealed';r.nextAt=0;
 event(r,`${reason==='timeout'?'Hết 60 giây!':'Tất cả nhóm đã trả lời đúng!'} Đáp án đúng: ${correct}. Chờ giáo viên bấm Tiếp tục.`,now);
}
export function advance(r,now){
 prunePlayers(r,now);
 completeIfReady(r,now);
 const moving=r.phase==='lobby'||r.phase==='playing';for(const p of r.players){if(moving&&!p.motionProtocol&&!r.paused){const end=Math.min(now,p.lastSeen+1500),start=Math.max(p.tickAt,r.phase==='lobby'?0:r.readUntil);const dt=Math.max(0,(end-start)/1000);for(let left=dt;left>0;left-=STEP){p.x+=p.vx*SPEED*Math.min(STEP,left);p.z+=p.vz*SPEED*Math.min(STEP,left);boundedPosition(p,r);}if(Math.hypot(p.vx,p.vz)>.05)p.angle=Math.atan2(p.vx,p.vz)}p.tickAt=now;}
 completeIfReady(r,now);
 r.drops=(r.drops||[]).filter(d=>now-d.at<1800);r.updatedAt=now;
}
export function command(r,body,now){
 if(body.token!==r.hostToken)throw new GameError('Chỉ giáo viên được điều khiển phòng.',403);if(typeof body.requestId!=='string'||body.requestId.length>100)fail('Thiếu mã thao tác.');if(r.hostCommands.includes(body.requestId))return;
 if(body.command==='start'){if(r.phase!=='lobby')fail('Ván chơi đã bắt đầu.');if(!r.players.length)fail('Cần ít nhất một nhóm vào phòng.');r.endedEarly=false;r.finalResults=null;r.playedTotal=0;r.players.forEach(p=>{p.score=0;p.correctCount=0;p.totalTimeMs=0});startNext(r,now)}
 else if(body.command==='finish'){if(r.phase==='lobby')fail('Ván chơi chưa bắt đầu.');finishMatch(r,now,true);}
 else if(body.command==='continue'){if(r.phase!=='revealed')fail('Chỉ tiếp tục sau khi công bố đáp án.');startNext(r,now);}
 else if(body.command==='pause'){if(r.phase!=='playing'||r.paused)fail('Không thể tạm dừng lúc này.');r.paused=true;r.pauseAt=now;r.players.forEach(p=>p.vx=p.vz=0)}
 else if(body.command==='resume'){if(!r.paused)fail('Phòng chưa tạm dừng.');const dt=now-r.pauseAt;r.startsAt+=dt;r.readUntil+=dt;r.endsAt+=dt;r.paused=false;r.players.forEach(p=>p.tickAt=now)}
 else if(body.command==='restart'){r.phase='lobby';r.round=-1;r.paused=false;r.departed=[];r.endedEarly=false;r.finalResults=null;r.playedTotal=0;r.nextAt=0;r.drops=[];r.players.forEach((p,i)=>{p.score=p.correctCount=p.totalTimeMs=0;resetPlayer(p,i,now)});event(r,'Trở lại sân tập. Điểm đã đặt lại.',now)}
 else if(body.command==='remove'){const p=r.players.find(p=>p.id===body.playerId);if(p){if(p.deviceId)(r.kicked||=[]).push(p.deviceId);removePlayer(r,p,now,true);}}
 else fail('Lệnh không hợp lệ.');r.hostCommands.push(body.requestId);r.hostCommands=r.hostCommands.slice(-30);completeIfReady(r,now);
}
export function syncPlayer(r,body,now){
 const p=r.players.find(p=>p.token===body.token);if(!p)throw new GameError('Phiên tham gia không còn hợp lệ.',401);if(body.actionId!==undefined&&(typeof body.actionId!=='string'||!/^[-a-zA-Z0-9]{16,90}$/.test(body.actionId)))fail('Mã thao tác không hợp lệ.');let feedback;const prior=body.actionId?(p.actionReceipts||[]).find(a=>a.id===body.actionId):null;const finish=(message,applied=false)=>{let actionReceipt=prior;if(body.actionId&&!actionReceipt){actionReceipt={id:body.actionId,status:applied?'applied':'rejected',message,feedback,at:now};(p.actionReceipts||=[]).push(actionReceipt);p.actionReceipts=p.actionReceipts.slice(-16);}return{player:p,message:actionReceipt?.message??message,...(actionReceipt?{actionReceipt}:{})};};if(!Number.isSafeInteger(body.seq)||body.seq<0)fail('Số thứ tự không hợp lệ.');if(body.seq<=p.lastSeq)return prior?finish(prior.message):{player:p};p.lastSeq=body.seq;p.lastSeen=now;
 if(body.motionRound!==undefined&&body.motionRound!==r.round)return body.action?finish('Câu hỏi đã chuyển, hãy chọn ở câu mới.'):{player:p};
 completeIfReady(r,now);
 let actionPosition=null;
 if(body.afterMoveSeq!==undefined&&(!Number.isSafeInteger(body.afterMoveSeq)||body.afterMoveSeq<0))fail('Mốc thao tác không hợp lệ.');
 if(Array.isArray(body.moves)){
  if(body.moves.length>90)fail('Quá nhiều bước di chuyển.');p.motionProtocol=true;p.moveAck??=0;p.moveCredit=Math.min(1500,(p.moveCredit??80)+Math.max(0,now-(p.lastMoveCreditAt??now)));p.lastMoveCreditAt=now;if(body.afterMoveSeq===p.moveAck)actionPosition={x:p.x,z:p.z};
  for(const m of body.moves){if(!Number.isSafeInteger(m.seq)||!Number.isFinite(m.x)||!Number.isFinite(m.z)||Math.abs(m.x)>1.01||Math.abs(m.z)>1.01)fail('Bước di chuyển không hợp lệ.');if(m.seq<=p.moveAck)continue;if(m.seq!==p.moveAck+1)break;if(p.moveCredit+1e-6<STEP*1000)break;p.moveCredit-=STEP*1000;p.moveAck=m.seq;if(isOpen(r,now))moveStep(p,m.x,m.z,r);if(body.afterMoveSeq===p.moveAck)actionPosition={x:p.x,z:p.z};}
  p.positionAt=now;
 }
 const x=Number(body.input?.x??0),z=Number(body.input?.z??0);if(!Number.isFinite(x)||!Number.isFinite(z))fail('Hướng di chuyển không hợp lệ.');const len=Math.max(1,Math.hypot(x,z));p.vx=x/len;p.vz=z/len;if(Math.hypot(p.vx,p.vz)>=.12)p.angle=Math.atan2(p.vx,p.vz);
 if(prior)return finish(prior.message);if(!isOpen(r,now)){p.vx=p.vz=0;return body.action?finish('Lượt chơi đã kết thúc hoặc đáp án đã nộp.'):{player:p}}if(!body.action)return{player:p};if(body.afterMoveSeq!==undefined&&!actionPosition){if(body.afterMoveSeq>(p.moveAck||0))return{player:p,deferAction:true};return finish('Thao tác đã quá hạn. Hãy nhấn lại.');}const at=actionPosition||p;if(now<p.busyUntil)return finish('Đợi nhân vật hoàn thành thao tác.');const practice=r.phase==='lobby',beforeHeld=p.held,beforeSubmitted=p.submitted,beforeBump=p.bumpAt;let message;
 if(body.action==='interact'){
  if(p.submitted)return finish('Đội đã trả lời đúng (+100 điểm). Chờ câu tiếp theo.');

  if(p.held){if(!practice&&insideDelivery(at)){
   const letter=p.held,correct=letter===r.questions[r.round].correct;p.held=null;
   p.lastSubmission={letter,correct,at:now};feedback={correct,points:correct?100:0};
   // Only a correct submission locks the team and awards 100 points.
   // A wrong submission clears the fruit and lets the team retry until the 60s deadline.
   if(correct){
    p.submitted=letter;p.lastCorrect=true;
    p.answerTimeMs=Math.max(0,now-r.startsAt);p.totalTimeMs=(p.totalTimeMs||0)+p.answerTimeMs;
    feedback.timeMs=p.answerTimeMs;p.score+=100;p.correctCount=(p.correctCount||0)+1;
    message='Chính xác! +100 điểm. Chờ các đội còn lại hoặc hết giờ.';
    event(r,`${p.name} đã trả lời đúng câu ${r.round+1}.`,now);
   }else{
    p.submitted=null;p.lastCorrect=null;p.chosen=null;p.picked=false;
    message='Chưa chính xác! Chọn quả khác và thử lại trước khi hết giờ.';
   }
  }else{p.held=null;p.chosen=null;p.picked=false;message=practice?'Đã thả quả. Có thể lấy quả khác để tập.':'Đã thả quả. Bạn có thể chọn bất kỳ đáp án khác.'}p.busyUntil=now+DROP_MS}
  else{const basket=BASKETS.filter(b=>dist(at,b)<=1.6).sort((a,b)=>dist(at,a)-dist(at,b))[0];if(basket){p.held=basket.letter;if(!practice){p.picked=true;p.chosen=basket.letter}p.busyUntil=now+PICKUP_MS;message=practice?`Đã lấy quả ${basket.letter}. Tập chạy và thả tùy ý!`:`Đã cầm quả ${basket.letter}. Có thể thả để đổi trước khi nộp.`}else message='Hãy đến gần giỏ để lấy quả.'}
 }else if(body.action==='bump'||body.action==='steal'){
  const t=targetFor(r,{...p,x:at.x,z:at.z},now);if(t){const letter=t.held;t.held=null;t.chosen=null;t.picked=false;p.cooldownUntil=now+5000;t.shieldUntil=now+3000;t.stolenCount++;p.busyUntil=now+450;p.bumpAt=now;t.fumbleAt=now;p.angle=Math.atan2(t.x-p.x,t.z-p.z);event(r,`${p.name} làm rơi quả ${letter} của ${t.name}!`,now);message='Đã làm rơi quả đối thủ!'}else message='Chưa có đối thủ mang quả ở gần.';
 }else fail('Thao tác không hợp lệ.');if(!practice)completeIfReady(r,now);return finish(message,!!feedback||p.held!==beforeHeld||p.submitted!==beforeSubmitted||p.bumpAt!==beforeBump);
}
export function view(r,token,now){
 const host=token===r.hostToken,p=host?null:r.players.find(p=>p.token===token);if(!host&&!p)throw new GameError('Phiên không hợp lệ.',401);const q=r.questions[r.round],visible=q?{text:q.text,options:q.options,...(['revealed','finished'].includes(r.phase)||host?{correct:q.correct,explanation:q.explanation}:{})}:null;
 return{code:r.code,role:host?'host':'player',playerId:p?.id??null,phase:r.phase,round:r.round,revealReason:r.revealReason||null,total:r.questions.length,endedEarly:!!r.endedEarly,playedTotal:r.phase==='finished'?(r.playedTotal??r.questions.length):Math.max(0,r.round+1),results:r.phase==='finished'?r.finalResults||null:null,question:visible,paused:r.paused,serverNow:now,readUntil:r.readUntil??0,endsAt:r.endsAt??0,nextAt:r.nextAt||0,pauseAt:r.pauseAt??0,stealing:r.stealing,obstacles:r.obstacles||[],events:r.events,drops:(r.drops||[]).filter(d=>now-d.at<1800),players:r.players.map(t=>({id:t.id,name:t.name,color:t.color,x:t.x,z:t.z,vx:t.vx,vz:t.vz,ackSeq:t.lastSeq,moveAck:t.moveAck||0,positionAt:t.positionAt||now,angle:t.angle,held:t.held,picked:!!t.picked,chosen:t.id===p?.id||host?t.chosen:null,submitted:host||t.id===p?.id||r.phase!=='playing'?t.submitted:!!t.submitted,score:t.score,answerTimeMs:t.answerTimeMs??null,totalTimeMs:t.totalTimeMs||0,correctCount:t.correctCount??Math.round(t.score/100),shieldUntil:t.shieldUntil,cooldownUntil:t.cooldownUntil,busyUntil:t.busyUntil,stolenCount:t.stolenCount,bumpAt:t.bumpAt||0,fumbleAt:t.fumbleAt||0,lastSubmission:t.lastSubmission?(host||t.id===p?.id||r.phase!=='playing'?t.lastSubmission:null):null,lastCorrect:r.phase==='playing'?null:t.lastCorrect,online:now-t.lastSeen<6000})),targetId:p&&isOpen(r,now)?targetFor(r,p,now)?.id??null:null};
}

// Transport binds each connection to a persistent, high-entropy browser device credential.
export const DISCONNECT_MS=8000;
export function touchPlayer(p,clientId,now){p.lastSeen=now;if(clientId)(p.clients||={})[clientId]=now;}
export function completeIfReady(r,now){if(r.phase!=='playing'||r.paused)return;if(now>=r.endsAt)reveal(r,now,'timeout');else if(r.players.length&&r.players.every(p=>p.submitted===r.questions[r.round].correct))reveal(r,now,'all');}
function removePlayer(r,p,now,kicked=false){
 r.players=r.players.filter(t=>t!==p);
 if(!kicked&&p.deviceId){p.departedRound=r.round;(r.departed||=[]).push(p);r.departed=r.departed.slice(-32);}
 event(r,`${p.name} ${kicked?'được giáo viên mời ra khỏi phòng':'đã rời phòng'}.`,now);
}
export function leavePlayer(r,token,clientId,now){
 const p=r.players.find(p=>p.token===token);if(!p) return;
 if(clientId){delete p.clients?.[clientId];if(Object.keys(p.clients||{}).length)return;}
 removePlayer(r,p,now);completeIfReady(r,now);
}
export function prunePlayers(r,now){
 for(const p of [...r.players]){
  // Legacy test/server records without a browser identity are not presence tracked.
  if(!p.deviceId)continue;
  for(const [id,last]of Object.entries(p.clients||{}))if(now-last>DISCONNECT_MS)delete p.clients[id];
  if(now-p.lastSeen>DISCONNECT_MS||!Object.keys(p.clients||{}).length)removePlayer(r,p,now);
 }
}

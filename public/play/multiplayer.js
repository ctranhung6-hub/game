import {request} from './transport.js';
import {CHARACTER_COLORS} from './colors.js?v=15';
import {compareResults,rankedResults,formatTime} from './ranking.js?v=15';
import {currentStandings,shouldShowScoreboard} from './scoreboard.js?v=17';
import {OptimisticAction} from './optimistic.js?v=15';
const $=s=>document.querySelector(s);
const teacherPage=document.body.dataset.role==='teacher';
const sessionKey=teacherPage?'farm-teacher-session':'farm-student-session';
const clientId=uuid();
let deviceJoinToken;try{deviceJoinToken=localStorage.getItem('farm-device-token');if(!deviceJoinToken){deviceJoinToken=uuid();localStorage.setItem('farm-device-token',deviceJoinToken);}}catch{deviceJoinToken=uuid();}
window.addEventListener('farm-message',e=>{const t=$('#toast');t.textContent=e.detail;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500)});

// Persistent transport; server pushes other players independently of input acknowledgements.
function closeLive(){}
function openLive(){}
const liveApi=(body,signal)=>api(body,signal);
window.addEventListener('farm-connected',()=>{if(session)void sync();});
window.addEventListener('farm-disconnected',()=>setText('#connection','Đang kết nối lại…'));
window.addEventListener('farm-state',e=>{if(session&&e.detail.code===session.code)accept(e.detail,null);});
window.addEventListener('farm-session-error',e=>{error(e.detail.error);});
const optimistic=new OptimisticAction();let currentFlight=null;
const feedbackSeen=new Set();let feedbackTimer;
let roundTrip=0,lastInputAt=0,lastInputKey='',lastPersist=0,lastPollAt=0;
let session=null,state=null,inFlight=false,seq=0,pending=null,offset=0,pauseClock=0,lastSuccess=0,questionKey='',renderPlayersKey='',teacherDraft=[],tickTimer;
export const multiplayer={active:()=>!!session,state:()=>state,self:()=>optimistic.project(state?.players.find(p=>p.id===state.playerId),state?.round,state?.phase),isHost:()=>session?.role==='host',canMove:()=>!!state&&state.role==='player'&&['lobby','playing'].includes(state.phase)&&!state.paused&&(state.phase==='lobby'||Date.now()+offset>=state.readUntil&&Date.now()+offset<state.endsAt)&&Date.now()-lastSuccess<2200,now:()=>Date.now()+offset,send:sendAction,inputChanged:()=>{if(session&&!inFlight&&Date.now()-lastInputAt>40)sync();},latency:()=>roundTrip/2000,input:()=>({x:0,z:0}),movement:()=>({moves:[],motionRound:state?.round})};
const sample=[{text:'Cho tam giác $ABC$ vuông tại $A$, biết $AB=3\\text{ cm}$, $AC=4\\text{ cm}$. Độ dài $BC$ bằng bao nhiêu?',options:['$5\\text{ cm}$','$7\\text{ cm}$','$\\sqrt{7}\\text{ cm}$','$25\\text{ cm}$'],correct:'A',seconds:45,read:7,explanation:'Theo định lí Pythagore: $BC=\\sqrt{AB^2+AC^2}=\\sqrt{3^2+4^2}=5\\text{ cm}$.'},{text:'Giá trị của $\\dfrac{2}{3}+\\dfrac{1}{6}$ bằng bao nhiêu?',options:['$\\dfrac{3}{9}$','$\\dfrac{5}{6}$','$\\dfrac{1}{2}$','$1$'],correct:'B',seconds:40,read:5,explanation:'Quy đồng: $\\dfrac{2}{3}+\\dfrac{1}{6}=\\dfrac{4}{6}+\\dfrac{1}{6}=\\dfrac{5}{6}$.'},{text:'Với $x=3$, giá trị của biểu thức $(x+1)^2$ là bao nhiêu?',options:['$10$','$12$','$9$','$16$'],correct:'D',seconds:35,read:5,explanation:'Thay $x=3$: $(3+1)^2=4^2=16$.'}];
export function math(el,text){el.replaceChildren();const pattern=/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;let end=0;for(const match of String(text).matchAll(pattern)){el.append(document.createTextNode(text.slice(end,match.index)));const span=document.createElement('span'),raw=match[0],display=raw.startsWith('$$')||raw.startsWith('\\[');const formula=raw.startsWith('$')?raw.slice(display?2:1,display?-2:-1):raw.slice(2,-2);try{window.katex.render(formula,span,{throwOnError:false,trust:false,strict:'ignore',displayMode:display,output:'htmlAndMathml'});}catch{span.textContent=raw;}el.append(span);end=match.index+raw.length;}el.append(document.createTextNode(text.slice(end)));}
const setText=(id,text)=>{const el=$(id),value=String(text);if(el&&el.textContent!==value)el.textContent=value;};
function error(text){setText('#room-error',text||'');}
async function api(body,signal){return request({...body,clientId},signal);}
function mode(name){for(const el of document.querySelectorAll('[data-room-view]'))el.hidden=el.dataset.roomView!==name;error('');}
function uuid(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')}
function persist(){if(session)sessionStorage.setItem(sessionKey,JSON.stringify({...session,seq}));else sessionStorage.removeItem(sessionKey);}
function accept(data,sentAt=Date.now()){
 // Reuse unchanged world/question data rather than repeatedly downloading it.
 if(state&&data.code===state.code){
  if(data.obstacles===undefined)data.obstacles=state.obstacles;
  if(data.question===undefined&&data.round===state.round&&data.phase===state.phase)data.question=state.question;
 }
 state=data;optimistic.validate(data.round,data.phase);optimistic.settle(data.actionReceipt);if(sentAt!==null){const elapsed=Date.now()-sentAt;roundTrip=roundTrip?roundTrip*.75+elapsed*.25:elapsed;const estimated=data.serverNow-(sentAt+Date.now())/2;offset=offset?offset*.8+estimated*.2:estimated;}lastSuccess=Date.now();error('');renderRoom();const receipt=data.actionReceipt;if(receipt?.feedback&&!feedbackSeen.has(receipt.id)){feedbackSeen.add(receipt.id);if(feedbackSeen.size>100)feedbackSeen.delete(feedbackSeen.values().next().value);window.dispatchEvent(new CustomEvent('farm-feedback',{detail:receipt.feedback}));}if(data.message&&!data.actionReceipt?.feedback)window.dispatchEvent(new CustomEvent('farm-message',{detail:data.message}));}
function enter(data,token){session={code:data.code,token:token||data.token,role:data.role,name:data.players.find(p=>p.id===data.playerId)?.name};seq=Date.now();pending=null;optimistic.clear();questionKey='';persist();accept(data);$('#room-dialog').close();document.body.classList.add('in-room');if(teacherPage)document.body.classList.add('student-view','spectator-view');clearInterval(tickTimer);startPolling();openLive();sync();}
function sendAction(action,preview){
 if(!session||pending||currentFlight?.action||optimistic.value)return false;
 const at=multiplayer.movement(),id=uuid();pending={id,action,afterMoveSeq:at.moveSeq,motionRound:at.motionRound,attempts:0};
 if(action==='interact'&&preview)optimistic.begin({...preview,id,round:state.round});
 if(currentFlight&&!currentFlight.action){currentFlight.priorityAbort=true;currentFlight.controller.abort();}
 renderRoom();sync();return true;
}
function pollingDelay(){return session?.role==='host'?1000:50;}
function startPolling(){clearInterval(tickTimer);tickTimer=setInterval(()=>{if(session&&!inFlight&&Date.now()-lastPollAt>=pollingDelay())sync();},20);}
async function sync(){
 if(!session||inFlight)return;inFlight=true;lastPollAt=Date.now();let action=pending;pending=null;
 if(action&&action.motionRound!==state?.round){optimistic.clear();action=null;}
 const flight={action,controller:new AbortController(),priorityAbort:false};currentFlight=flight;
 const sentAt=Date.now(),input=multiplayer.canMove()?multiplayer.input():{x:0,z:0};const key=input.x.toFixed(2)+','+input.z.toFixed(2),movement=multiplayer.movement(),moving=Math.hypot(input.x,input.z)>.12,watch=session.role==='host';
 const body={type:'sync',...session,cacheMap:state?.obstacles?state.code:undefined,cacheRound:state?.question?state.round:undefined,cachePhase:state?.question?state.phase:undefined,seq:++seq,input,watch,...(!watch?movement:{}),...(action?{action:action.action,actionId:action.id,afterMoveSeq:action.afterMoveSeq,motionRound:action.motionRound}:{})};
 let retryDelay=0;
 try{const data=await liveApi(body,flight.controller.signal);if(!session||session.code!==body.code)return;if(!watch){lastInputAt=sentAt;lastInputKey=key;}accept(data,sentAt);if(data.deferAction&&action){pending=action;retryDelay=70;}if(Date.now()-lastPersist>3000){persist();lastPersist=Date.now()}}
 catch(e){
  if(!flight.priorityAbort){setText('#connection','Đang kết nối lại…');
   if(action&&action.attempts<2&&action.motionRound===state?.round&&e.status!==401&&e.status!==404&&e.status!==400){action.attempts++;pending=action;retryDelay=150;}
   else if(action){optimistic.clear();renderRoom();window.dispatchEvent(new CustomEvent('farm-message',{detail:'Chưa xác nhận được thao tác. Hãy kiểm tra kết nối rồi thử lại.'}));}
   if(e.status===401||e.status===404){closeLive();clearInterval(tickTimer);optimistic.clear();mode(teacherPage?'teacher':'student');error(e.message);$('#room-dialog').showModal();session=null;state=null;persist();if($('#scoreboard-board'))$('#scoreboard-board').hidden=true;document.body.classList.remove('in-room');if(teacherPage)document.body.classList.remove('student-view','spectator-view');window.dispatchEvent(new Event('farm-left'));}
  }
 }
 finally{if(currentFlight===flight)currentFlight=null;inFlight=false;if(pending)setTimeout(sync,retryDelay)}
}
function renderRoom(){if(!state)return;const s=state;document.body.classList.toggle('practice-mode',s.phase==='lobby');setText('#room-code',s.code);setText('.live','SÂN ĐẤU TRỰC TUYẾN');setText('#connection','● Đã kết nối');setText('#phase-label',s.phase==='lobby'?'PHÒNG CHỜ':s.phase==='playing'?(s.paused?'TẠM DỪNG':'ĐANG CHƠI'):s.phase==='revealed'?'KẾT QUẢ CÂU HỎI':'TỔNG KẾT');setText('#room-count',`${s.players.length}/8 nhóm`);$('#teacher-controls').hidden=s.role!=='host';
const next=$('#next-question');next.disabled=s.phase!=='lobby'||!s.players.length;next.textContent='Bắt đầu ván chơi';$('#pause-game').disabled=s.phase!=='playing';$('#pause-game').textContent=s.paused?'Tiếp tục':'Tạm dừng';$('#reveal-game').hidden=true;
const key=JSON.stringify([s.phase,s.round,s.question?.text,s.question?.correct]);if(questionKey!==key){questionKey=key;const q=s.question;$('#question-panel').hidden=!q;$('#result-panel').hidden=!q||!['revealed','finished'].includes(s.phase);if(q){setText('#question-number',`CÂU ${s.round+1} / ${s.total}`);math($('#question-content'),q.text);$('#answers').replaceChildren();q.options.forEach((text,i)=>{const row=document.createElement('div');row.className='answer '+(s.phase!=='playing'&&q.correct==='ABCD'[i]?'correct':'');const b=document.createElement('b');b.textContent='ABCD'[i];const body=document.createElement('span');math(body,text);row.append(b,body);$('#answers').append(row)});if(q.correct&&s.phase!=='playing'){setText('#correct-answer','Đáp án đúng: '+q.correct);math($('#explanation'),q.explanation);}}}
renderTeacherHUD();renderLiveScoreboard();fitQuestion();renderSummary();
setText('#room-welcome',s.phase==='lobby'?'Chờ các nhóm vào sân. Giáo viên nhấn bắt đầu khi đã sẵn sàng.':s.phase==='finished'?'Đã hoàn thành! Điểm của các nhóm được xếp ở bên dưới.':s.phase==='revealed'?'Cùng xem đáp án và lời giải. Chờ giáo viên bấm Tiếp tục.':s.role==='host'?'Quan sát các nhóm lấy quả và mang về máy ép hoa quả.':'Lấy quả A–D và mang vào máy ép hoa quả để nộp.');
const pkey=JSON.stringify(s.players.map(p=>[p.id,p.name,p.score,p.online,!!p.submitted,p.lastCorrect,p.lastSubmission?.at,p.totalTimeMs]));if(pkey!==renderPlayersKey){renderPlayersKey=pkey;$('#players-list').replaceChildren();[...s.players].sort(compareResults).forEach((p,i)=>{const row=document.createElement('div');row.className='player-row';const badge=document.createElement('span');badge.className='player-dot';badge.style.background=p.color;const name=document.createElement('strong');name.textContent=p.name+(p.id===s.playerId?' (bạn)':'');const status=document.createElement('small');status.textContent=p.online?'':'Mất kết nối';const score=document.createElement('b');score.textContent=p.score;const time=document.createElement('time');time.className='result-time';time.textContent=formatTime(p.totalTimeMs);time.title='Tổng thời gian trả lời đúng';row.append(badge,name,status,score,time);if(teacherPage){const kick=document.createElement('button');kick.className='kick-player';kick.textContent='Mời ra';kick.title='Mời '+p.name+' ra khỏi phòng';kick.onclick=()=>{if(confirm('Mời '+p.name+' ra khỏi phòng?'))hostCommand('remove',{playerId:p.id});};row.append(kick);}$('#players-list').append(row)});}
const me=multiplayer.self();setText('#local-team',s.role==='host'?'Giáo viên':me?.name||'Đang chờ');setText('#holding',me?._submitting?'Đang nộp…':me?.submitted?'Đã nộp':me?.held?'Quả '+me.held+(me._pending?' · đang xác nhận':''):'Tay không');setText('#score-hud',me?me.score+' điểm':'');setText('#play-status',s.phase==='lobby'?'Sân tập · Nhặt và thả quả tự do':s.paused?'Tạm dừng':s.phase==='revealed'?'Đáp án đã công bố · Chờ giáo viên tiếp tục':s.phase==='finished'?'Hoàn thành ván chơi':me?.submitted?'':me?.picked&&!me?.held?'Có thể lấy quả A, B, C hoặc D':'');
}
async function hostCommand(command,extra={}){if(!session||session.role!=='host')return;try{const data=await api({type:'command',...session,command,requestId:uuid(),...extra});accept(data);}catch(e){window.dispatchEvent(new CustomEvent('farm-message',{detail:e.message}));}}
function makeQuestion(q,index){const card=document.createElement('fieldset');card.className='editor-question';const legend=document.createElement('legend');legend.textContent='Câu '+(index+1);card.append(legend);const field=(label,name,value,multiline=false)=>{const l=document.createElement('label');l.textContent=label;const input=document.createElement(multiline?'textarea':'input');input.name=name;input.value=value;input.maxLength=name==='text'||name==='explanation'?2500:1200;input.required=name!=='explanation';if(multiline)input.rows=2;l.append(input);card.append(l);return input};field('Nội dung (công thức đặt trong $...$)','text',q.text,true);q.options.forEach((v,i)=>field('Đáp án '+'ABCD'[i],'option'+i,v));const row=document.createElement('div');row.className='editor-settings';const corr=document.createElement('label');corr.textContent='Đáp án đúng';const select=document.createElement('select');select.name='correct';for(const l of 'ABCD'){const o=document.createElement('option');o.value=o.textContent=l;select.append(o)}select.value=q.correct;corr.append(select);row.append(corr);const fixed=document.createElement('span');fixed.className='fixed-duration';fixed.textContent='60 giây/câu · Nộp đúng +100, sai 0 · Được đổi quả trước khi nộp';row.append(fixed);card.append(row);field('Lời giải sau câu hỏi','explanation',q.explanation,true);const preview=document.createElement('div');preview.className='math-preview';const refresh=()=>{preview.replaceChildren();const heading=document.createElement('strong');heading.textContent='XEM TRƯỚC';preview.append(heading);for(const name of ['text','option0','option1','option2','option3']){const p=document.createElement('p');math(p,card.querySelector(`[name="${name}"]`).value);preview.append(p)}};card.addEventListener('input',()=>{saveDraft();refresh()});card.addEventListener('change',saveDraft);card.append(preview);const remove=document.createElement('button');remove.type='button';remove.className='quiet';remove.textContent='Xóa câu này';remove.onclick=()=>{card.remove();saveDraft()};card.append(remove);refresh();return card;}
function readQuestions(){return [...document.querySelectorAll('.editor-question')].map(card=>{const value=n=>card.querySelector(`[name="${n}"]`).value;return {text:value('text'),options:[0,1,2,3].map(i=>value('option'+i)),correct:value('correct'),seconds:60,read:0,explanation:value('explanation')}})}
function saveDraft(){localStorage.setItem('farm-questions-v2',JSON.stringify(readQuestions()));}
function populate(items){$('#question-editor').replaceChildren();items.forEach((q,i)=>$('#question-editor').append(makeQuestion(q,i)));}
let fitKey='',summaryKey='';
function fitQuestion(){
 const panel=$('#question-panel');if(panel.hidden)return;const key=[state?.round,state?.phase,innerWidth,innerHeight].join(':');if(key===fitKey)return;fitKey=key;
 const long=state?.question?.options.some(t=>t.length>90),columns=innerWidth<700||long?2:4;$('#answers').style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;
 let size=innerWidth<800?14:17;const limit=Math.max(145,innerHeight*.43);
 for(;size>=10;size--){panel.style.setProperty('--answer-font',size+'px');panel.style.setProperty('--question-font',(size+1)+'px');for(const k of panel.querySelectorAll('.katex')){k.style.fontSize='';const available=k.closest('.answer')?.querySelector('span')?.clientWidth||panel.clientWidth-40;if(k.getBoundingClientRect().width>available)k.style.fontSize=(1.21*available/k.getBoundingClientRect().width)+'em';}if(panel.getBoundingClientRect().height<=limit)break;}
}

function renderLiveScoreboard(){
 const board=$('#scoreboard-board');
 if(!board)return;
 const s=state;
 // Keep the side strip hidden in the lobby/practice mode and behind final results.
 // During each question (including pause/reveal) the scores remain permanently visible.
 const visible=shouldShowScoreboard(s?.phase);
 board.hidden=!visible;
 if(!visible){board.dataset.signature='';return;}
 const list=currentStandings(s.players);
 setText('#scoreboard-round',`C${s.round+1}/${s.total}`);
 // Rebuild only when the standings change, not on every movement update.
 const signature=JSON.stringify([s.playerId,...list.map(p=>[p.id,p.name,p.color,p.score,p.rank])]);
 if(board.dataset.signature===signature)return;
 board.dataset.signature=signature;
 const rows=$('#scoreboard-list');rows.replaceChildren();
 for(const p of list){
  const item=document.createElement('li');item.className='scoreboard-row';
  if(p.id===s.playerId)item.classList.add('is-self');
  if(p.rank===1&&p.score>0)item.classList.add('is-leader');
  const rank=document.createElement('span');rank.className='scoreboard-rank';rank.textContent=p.rank+'.';
  const dot=document.createElement('span');dot.className='scoreboard-dot';dot.style.background=p.color;
  const name=document.createElement('strong');name.textContent=p.name;name.title=p.name;
  const score=document.createElement('b');score.className='scoreboard-points';score.textContent=p.score.toLocaleString('vi-VN');
  item.setAttribute('aria-label',`${p.name}, hạng ${p.rank}, ${p.score} điểm`);
  item.append(rank,dot,name,score);rows.append(item);
 }
}
function renderTeacherHUD(){
 const hud=$('#teacher-hud');if(!teacherPage){hud.hidden=true;return}hud.hidden=state.phase!=='lobby';$('#finish-match').hidden=!['playing','revealed'].includes(state.phase);$('#continue-match').hidden=state.phase!=='revealed';$('#continue-match').textContent=state.round+1>=state.total?'Xem tổng kết':'Tiếp tục →';setText('#teacher-room-label','PHÒNG '+state.code+' · '+state.players.length+' NHÓM');$('#start-match').hidden=state.phase!=='lobby';$('#start-match').disabled=!state.players.length;$('#pause-match').hidden=state.phase!=='playing';$('#pause-match').textContent=state.paused?'Tiếp tục':'Tạm dừng';setText('#teacher-progress',state.phase==='lobby'?'Học sinh đang tập nhặt – thả':state.phase==='playing'?`Đang chơi · Câu ${state.round+1}/${state.total}`:state.phase==='revealed'?(state.revealReason==='timeout'?'Hết 60 giây · Công bố kết quả':'Tất cả đội trả lời đúng · Công bố kết quả'):'Hoàn thành');
}
function renderSummary(){
 const overlay=$('#summary-overlay');overlay.hidden=state.phase!=='finished';if(overlay.hidden){summaryKey='';return}const results=state.results||state.players,total=state.playedTotal??state.total;const key=JSON.stringify([state.endedEarly,total,results]);if(summaryKey===key)return;summaryKey=key;
 const list=rankedResults(results),winners=list.filter(p=>p.rank===1);setText('#winner-text',winners.length===1?winners[0].name+' dẫn đầu!':winners.length===2?'Đồng hạng nhất: '+winners.map(p=>p.name).join(', '):winners.length+' nhóm cùng dẫn đầu!');setText('#summary-count',(state.endedEarly?'Kết thúc sớm · Đã mở '+total+'/'+state.total+' câu':state.total+' câu hỏi')+' · Ưu tiên số câu đúng, sau đó tổng thời gian ngắn hơn');const tbody=$('#summary-rows');tbody.replaceChildren();list.forEach(p=>{const tr=document.createElement('tr');if(p.rank===1)tr.className='winner';for(const t of [p.rank,p.name,p.correctCount+'/'+total,p.score,formatTime(p.totalTimeMs)]){const td=document.createElement('td');td.textContent=t;tr.append(td)}tbody.append(tr)});$('#summary-restart').hidden=!teacherPage;
}
window.addEventListener('resize',()=>{fitKey='';fitQuestion()});
async function enterFullscreen(){
 if(document.fullscreenElement)return;
 try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch{/* Joining still works if fullscreen is unavailable or declined. */}
}
let selectedColor=null,paletteCode='',paletteBusy=false;
function initColorPicker(){
 const field=document.createElement('fieldset');field.id='color-picker';const legend=document.createElement('legend');legend.textContent='Màu nhân vật';field.append(legend);
 const grid=document.createElement('div');grid.className='color-grid';
 for(const color of CHARACTER_COLORS){const label=document.createElement('label');label.className='color-option';const input=document.createElement('input');input.type='radio';input.name='character-color';input.value=color.value;input.required=true;input.disabled=true;input.onchange=()=>{selectedColor=input.value;};const swatch=document.createElement('span');swatch.className='color-swatch';swatch.style.background=color.value;const name=document.createElement('small');name.textContent=color.label;label.append(input,swatch,name);grid.append(label);}
 const note=document.createElement('p');note.id='color-note';note.textContent='Nhập mã phòng để xem màu còn trống.';field.append(grid,note);$('#join-name').closest('label').after(field);
 $('#join-code').addEventListener('input',()=>{selectedColor=null;paletteCode='';for(const input of field.querySelectorAll('input')){input.disabled=true;input.checked=false;}void refreshPalette();});
 setInterval(()=>{if(!session&&$('#room-dialog').open)void refreshPalette();},1000);setTimeout(refreshPalette,0);
}
async function refreshPalette(){
 if(teacherPage||paletteBusy||session)return;
 const code=$('#join-code').value.toUpperCase().trim();if(!/^\d{6}$/.test(code)){setText('#color-note','Nhập mã phòng để xem màu còn trống.');return;}
 paletteBusy=true;try{const data=await api({type:'palette',code});if(code!==$('#join-code').value.toUpperCase().trim())return;
  const changed=paletteCode!==code;paletteCode=code;const used=new Set(data.usedColors);
  if(selectedColor&&used.has(selectedColor))selectedColor=null;
  if(changed)selectedColor=data.ownColor||CHARACTER_COLORS.find(c=>!used.has(c.value))?.value||null;
  for(const input of $('#color-picker').querySelectorAll('input')){input.disabled=used.has(input.value);input.checked=input.value===selectedColor;input.closest('label').classList.toggle('is-used',input.disabled);input.setAttribute('aria-label',CHARACTER_COLORS.find(c=>c.value===input.value).label+(input.disabled?' · Đã có nhóm chọn':''));}
  setText('#color-note',data.ownColor?'Thiết bị này đã có nhân vật trong phòng.':used.size>=8?'Phòng đã đủ 8 màu.':'Màu có dấu × đã có nhóm chọn.');
 }catch(e){paletteCode='';selectedColor=null;for(const input of $('#color-picker').querySelectorAll('input')){input.disabled=true;input.checked=false;}setText('#color-note',e.message);}finally{paletteBusy=false;}
}
function init(){
const feedback=document.createElement('div');feedback.id='answer-feedback';feedback.hidden=true;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');$('.game').append(feedback);
const scoreboard=document.createElement('section');scoreboard.id='scoreboard-board';scoreboard.hidden=true;
scoreboard.setAttribute('aria-label','Bảng điểm trực tiếp của các đội');
const heading=document.createElement('div');heading.className='scoreboard-heading';
const headingTitle=document.createElement('strong');headingTitle.textContent='🏆 ĐIỂM';
const headingRound=document.createElement('small');headingRound.id='scoreboard-round';
heading.append(headingTitle,headingRound);
const scoreList=document.createElement('ol');scoreList.id='scoreboard-list';scoreList.setAttribute('aria-label','Tổng điểm hiện tại của các đội');scoreList.setAttribute('aria-live','polite');
scoreboard.append(heading,scoreList);$('.game').append(scoreboard);
window.addEventListener('farm-feedback',e=>{clearTimeout(feedbackTimer);feedback.replaceChildren();feedback.className=e.detail.correct?'is-correct':'is-wrong';const title=document.createElement('strong'),text=document.createElement('span');title.textContent=e.detail.correct?'Chính xác · +100':'Chưa đúng · Thử lại';text.textContent=e.detail.correct?'Thời gian: '+formatTime(e.detail.timeMs):'Chọn quả khác và nộp lại trước khi hết 60 giây';feedback.append(title,text);feedback.hidden=false;feedbackTimer=setTimeout(()=>feedback.hidden=true,2600);});
const continueButton=document.createElement('button');continueButton.id='continue-match';continueButton.hidden=true;continueButton.textContent='Tiếp tục →';continueButton.onclick=()=>hostCommand('continue');const resultActions=document.createElement('div');resultActions.className='question-actions';resultActions.hidden=!teacherPage;resultActions.append(continueButton);$('#result-panel').append(resultActions);

$('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else void enterFullscreen();};
const fullscreen=$('#fullscreen'),leave=$('#leave-room');fullscreen.textContent='⛶';leave.textContent='↪';leave.setAttribute('aria-label','Rời phòng');leave.title=teacherPage?'Rời phòng':'Thoát về màn hình nhập mã phòng';if(!teacherPage)leave.setAttribute('aria-label','Thoát về màn hình nhập mã phòng');
const updateFullscreen=()=>{const text=document.fullscreenElement?'Thoát toàn màn hình':'Toàn màn hình';fullscreen.setAttribute('aria-label',text);fullscreen.title=text;};updateFullscreen();document.addEventListener('fullscreenchange',updateFullscreen);

$('#start-match').onclick=()=>hostCommand('start');$('#pause-match').onclick=()=>hostCommand(state?.paused?'resume':'pause');$('#share-match').onclick=()=>$('#copy-student-link').click();$('#summary-restart').onclick=()=>hostCommand('restart');
const dialog=$('#room-dialog');$('.game').prepend($('#question-panel'));
if(teacherPage){const roster=document.createElement('details');roster.id='teacher-roster';const title=document.createElement('summary');title.textContent='Các nhóm / Mời ra';roster.append(title,$('#players-list'));$('#teacher-hud').append(roster);const tools=document.createElement('div');tools.className='screen-tools';tools.append($('#fullscreen'),$('#leave-room'));const finish=document.createElement('button');finish.id='finish-match';finish.textContent='■ Kết thúc';finish.title='Kết thúc ván và xem tổng kết';finish.setAttribute('aria-label','Kết thúc ván và xem tổng kết');finish.hidden=true;finish.onclick=async()=>{if(finish.disabled)return;finish.disabled=true;try{await hostCommand('finish');}finally{finish.disabled=false;}};tools.append(finish);$('.game').append(tools);}
const panel=$('#question-panel'),game=$('.game'),size=()=>game.style.setProperty('--question-space',panel.hidden?'0px':(panel.getBoundingClientRect().bottom-game.getBoundingClientRect().top+8)+'px');new ResizeObserver(size).observe(panel);new MutationObserver(size).observe(panel,{attributes:true,attributeFilter:['hidden']});size();
dialog.addEventListener('cancel',e=>{if(!session)e.preventDefault()});
$('#open-room').onclick=()=>{mode(teacherPage?'teacher':'student');dialog.showModal()};
$('#close-room').onclick=()=>dialog.close();
if(teacherPage){
try{teacherDraft=JSON.parse(localStorage.getItem('farm-questions-v2')||'null')||sample}catch{teacherDraft=sample}
populate(teacherDraft);
$('#add-question').onclick=()=>{if(readQuestions().length>=40)return;$('#question-editor').append(makeQuestion({text:'',options:['','','',''],correct:'A',seconds:45,read:5,explanation:''},readQuestions().length));saveDraft()};
$('#sample-questions').onclick=()=>{populate(sample);saveDraft()};
$('#create-form').onsubmit=async e=>{e.preventDefault();const button=$('#create-room');button.disabled=true;error('');try{const data=await api({type:'create',questions:readQuestions(),stealing:$('#allow-steal').checked});enter(data);}catch(err){error(err.message)}finally{button.disabled=false}};
}
if(!teacherPage)initColorPicker();
if(!teacherPage)$('#join-form').onsubmit=async e=>{e.preventDefault();void enterFullscreen();const b=$('#join-room');b.disabled=true;try{if(!selectedColor||paletteCode!==$('#join-code').value.toUpperCase().trim())throw new Error('Hãy chọn màu còn trống cho nhân vật.');const data=await api({type:'join',code:$('#join-code').value,name:$('#join-name').value,joinToken:deviceJoinToken,color:selectedColor});enter(data);}catch(err){error(err.message);void refreshPalette();}finally{b.disabled=false}};
if(teacherPage){$('#next-question').onclick=()=>hostCommand('start');$('#pause-game').onclick=()=>hostCommand(state?.paused?'resume':'pause');$('#reveal-game').onclick=()=>hostCommand('reveal');$('#restart-room').onclick=()=>{if(confirm('Đưa cả lớp về phòng chờ và đặt lại điểm?'))hostCommand('restart')};}
$('#leave-room').onclick=async()=>{
 if(!teacherPage){
  if(!confirm('Bạn có muốn thoát phòng không?'))return;
  const button=$('#leave-room');if(button.disabled)return;button.disabled=true;
  clearInterval(tickTimer);const leaving=session;
  if(currentFlight){currentFlight.priorityAbort=true;currentFlight.controller.abort();}
  session=null;state=null;pending=null;optimistic.clear();persist();
  // Stop room polling before sending leave so no concurrent sync can rejoin it.
  if(leaving)await Promise.race([api({type:'leave',...leaving}).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1500))]);
  location.assign('/');return;
 }
if(session?.role==='host'&&!confirm('Rời giao diện giáo viên sẽ xóa phiên điều khiển trên tab này. Phòng vẫn tồn tại nhưng bạn sẽ cần tạo phòng mới để làm giáo viên. Bạn chắc chắn muốn rời?'))return;if(session?.role==='player')void api({type:'leave',...session}).catch(()=>{});if(!teacherPage&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});clearInterval(tickTimer);if(currentFlight){currentFlight.priorityAbort=true;currentFlight.controller.abort();}closeLive();session=null;state=null;pending=null;optimistic.clear();persist();if($('#scoreboard-board'))$('#scoreboard-board').hidden=true;document.body.classList.remove('in-room');if(teacherPage)document.body.classList.remove('student-view','spectator-view');window.dispatchEvent(new Event('farm-left'));mode(teacherPage?'teacher':'student');dialog.showModal();};
$('#copy-student-link').onclick=async()=>{const url=new URL('/game',location.origin);url.searchParams.set('room',state.code);try{await navigator.clipboard.writeText(url.href);window.dispatchEvent(new CustomEvent('farm-message',{detail:'Đã sao chép link học sinh kèm mã phòng.'}))}catch{window.prompt('Link học sinh',url.href)}};
$('#copy-code').onclick=async()=>{try{await navigator.clipboard.writeText(state.code);window.dispatchEvent(new CustomEvent('farm-message',{detail:'Đã sao chép mã phòng '+state.code}))}catch{window.dispatchEvent(new CustomEvent('farm-message',{detail:'Mã phòng: '+state.code}))}};
if(teacherPage){$('#export-questions').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(readQuestions(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cau-hoi-nong-trai.json';a.click();URL.revokeObjectURL(url)};$('#import-questions').onchange=async e=>{try{const f=e.target.files[0];if(!f||f.size>100000)throw new Error('Tệp tối đa 100 KB.');const items=JSON.parse(await f.text());if(!Array.isArray(items)||!items.length||items.length>40||items.some(q=>typeof q.text!=='string'||!Array.isArray(q.options)||q.options.length!==4||q.options.some(v=>typeof v!=='string')||!['A','B','C','D'].includes(q.correct)))throw new Error('Tệp câu hỏi không đúng định dạng.');populate(items);saveDraft();error('')}catch(err){error(err.message)}finally{e.target.value=''}};
}
if(!teacherPage){const code=new URLSearchParams(location.search).get('room');if(code)$('#join-code').value=code.toUpperCase();}
let saved;try{saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null')}catch{}if(saved&&saved.role===(teacherPage?'host':'player')){session=saved;seq=Math.max(Date.now(),saved.seq||0);api(teacherPage?{type:'sync',...session,seq:++seq,input:{x:0,z:0}}:{type:'join',code:session.code,name:session.name||'Nhóm của bạn',joinToken:deviceJoinToken}).then(d=>enter(d,d.token||session.token)).catch(e=>{error('Không khôi phục được phòng: '+e.message);session=null;persist();mode(teacherPage?'teacher':'student');dialog.showModal()})}else{mode(teacherPage?'teacher':'student');dialog.showModal()}
setInterval(()=>{if(!state)return;const now=state.paused?state.pauseAt:Date.now()+offset;let left=0,label='';if(state.phase==='playing'){if(now<state.readUntil){left=Math.ceil((state.readUntil-now)/1000);label='ĐỌC ĐỀ'}else{left=Math.max(0,Math.ceil((state.endsAt-now)/1000));label=state.paused?'TẠM DỪNG':left?'CÒN LẠI':'HẾT GIỜ'}}if(state.phase==='revealed'){label='CHỜ GIÁO VIÊN TIẾP TỤC';}setText('#time-left',['HẾT GIỜ','CHỜ GIÁO VIÊN TIẾP TỤC'].includes(label)?label:label?`${label} · ${left}s`:'');if(Date.now()-lastSuccess>2000)setText('#connection','Đang kết nối lại…');},200);
}
init();

window.addEventListener('pagehide',()=>{if(session?.role==='player')void api({type:'leave',...session}).catch(()=>{});});

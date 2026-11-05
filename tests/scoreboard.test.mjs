import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentStandings} from '../public/play/scoreboard.js';
import {createRoom,addPlayer,command,syncPlayer,view,reveal} from '../lib/farm/engine.mjs';
import {BASKETS,DELIVERY} from '../public/play/world.js';

test('Bảng điểm: xếp hạng theo tổng điểm, hòa điểm đồng hạng, không đổi mảng đầu vào',()=>{
 const input=[{id:'a',name:'Đội A',score:100},{id:'b',name:'Đội B',score:0},{id:'c',name:'Đội C',score:200},{id:'d',name:'Đội D',score:100}];
 const result=currentStandings(input);
 assert.deepEqual(result.map(p=>[p.id,p.rank,p.score]),[['c',1,200],['a',2,100],['d',2,100],['b',4,0]]);
 assert.equal(input[0].id,'a');
});

test('Bảng điểm: đội mới 0 điểm và điểm không hợp lệ không làm hỏng thứ hạng',()=>{
 const result=currentStandings([{id:'x',name:'X',score:undefined},{id:'y',name:'Y',score:0}]);
 assert.deepEqual(result.map(p=>p.rank),[1,1]);
 assert.ok(result.every(p=>p.score===0));
});

test('Bảng điểm đọc đúng tổng điểm máy chủ trước và sau khi qua câu mới',()=>{
 const question={text:'1 + 1?',options:['2','3','4','5'],correct:'A'};
 const r=createRoom({code:'TESTAB',hostToken:'teacher',questions:[question,question]},0);
 addPlayer(r,{id:'a',token:'a-token',name:'Đội A'},0);
 addPlayer(r,{id:'b',token:'b-token',name:'Đội B'},0);
 command(r,{token:'teacher',command:'start',requestId:'start'},1000);
 const player=r.players[0],basket=BASKETS.find(b=>b.letter==='A');player.x=basket.x;player.z=basket.z;
 syncPlayer(r,{token:player.token,seq:2000,action:'interact'},2000);
 player.x=DELIVERY.x;player.z=DELIVERY.z;
 syncPlayer(r,{token:player.token,seq:3000,action:'interact'},3000);
 let scores=currentStandings(view(r,'teacher',3000).players);
 assert.deepEqual(scores.map(p=>[p.name,p.score]),[['Đội A',100],['Đội B',0]]);
 reveal(r,61000,'timeout');
 command(r,{token:'teacher',command:'continue',requestId:'next'},62000);
 scores=currentStandings(view(r,'teacher',62000).players);
 assert.deepEqual(scores.map(p=>[p.name,p.score]),[['Đội A',100],['Đội B',0]]);
});

test('Giao diện có bảng điểm, không còn bảng trạng thái nộp',()=>{
 const js=readFileSync(new URL('../public/play/multiplayer.js',import.meta.url),'utf8');
 assert.match(js,/scoreboard-board/);
 assert.match(js,/scoreboard-points/);
 assert.doesNotMatch(js,/completion-board|ĐÃ NỘP 0\/0 ĐỘI/);
});

test('Bảng điểm V17: chỉ hiển thị sau khi bắt đầu và trước màn tổng kết',async()=>{
 const {shouldShowScoreboard}=await import('../public/play/scoreboard.js');
 assert.equal(shouldShowScoreboard('lobby'),false);
 assert.equal(shouldShowScoreboard('playing'),true);
 assert.equal(shouldShowScoreboard('revealed'),true);
 assert.equal(shouldShowScoreboard('finished'),false);
 assert.equal(shouldShowScoreboard(undefined),false);
});

test('Bảng điểm V17: luôn hiện cạnh phải, không còn nút thu gọn',()=>{
 const js=readFileSync(new URL('../public/play/multiplayer.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/play/tablet.css',import.meta.url),'utf8');
 assert.match(js,/visible=shouldShowScoreboard\(s\?\.phase\)/);
 assert.match(js,/document\.createElement\('section'\)/);
 assert.doesNotMatch(js,/scoreboard\.open=true/);
 assert.match(css,/#scoreboard-board\{[^}]*right:max\(4px,env\(safe-area-inset-right\)\)/);
 assert.match(css,/#scoreboard-board\{[^}]*pointer-events:none/);
 assert.match(css,/\.student-view:not\(\.teacher-view\) #scoreboard-board/);
});

// Live score table: ranks depend only on total points, with equal scores sharing rank.
// Final match ranking may additionally use total answer time as a tie-breaker.
export function currentStandings(players){
 const list=players.map(p=>({...p,score:Number.isFinite(p.score)?Math.max(0,p.score):0}));
 list.sort((a,b)=>b.score-a.score||String(a.name||'').localeCompare(String(b.name||''),'vi'));
 let previous=null,rank=0;
 return list.map((player,i)=>{
  if(player.score!==previous)rank=i+1;
  previous=player.score;
  return {...player,rank};
 });
}

// The side scoreboard starts with the first question, stays during reveal/pause,
// and disappears in practice/lobby and in the end-of-match summary.
export function shouldShowScoreboard(phase){
 return phase==='playing'||phase==='revealed';
}

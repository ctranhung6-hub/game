// All timing comes from the server, in milliseconds of active question time.
export const compareResults=(a,b)=>(b.correctCount||0)-(a.correctCount||0)||(a.totalTimeMs||0)-(b.totalTimeMs||0);
export function rankedResults(players){
 const list=[...players].sort(compareResults);let rank=1;
 return list.map((player,i)=>{if(i&&compareResults(player,list[i-1])!==0)rank=i+1;return{...player,rank};});
}
export function formatTime(ms){return ((ms||0)/1000).toLocaleString('vi-VN',{minimumFractionDigits:3,maximumFractionDigits:3})+' s';}

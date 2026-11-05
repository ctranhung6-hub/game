// Keep immediate visual feedback separate from authoritative answers and scores.
export class OptimisticAction{
 constructor(){this.value=null;this.cached=null;this.base=null}
 begin(value){if(this.value)return false;this.value=value;this.cached=this.base=null;return true}
 clear(){this.value=null;this.cached=this.base=null}
 validate(round,phase){if(this.value&&(this.value.round!==round||!['lobby','playing'].includes(phase)))this.clear()}
 project(player,round,phase){this.validate(round,phase);const a=this.value;if(!player||!a)return player;if(this.base===player&&this.cached)return this.cached;this.base=player;this.cached={...player,_pending:true,_submitting:a.kind==='submit',held:a.kind==='pick'?a.letter:null,picked:player.picked||(a.kind==='pick'&&phase!=='lobby'),busyUntil:Infinity};return this.cached}
 settle(receipt){if(!receipt||receipt.id!==this.value?.id)return false;this.clear();return true}
}

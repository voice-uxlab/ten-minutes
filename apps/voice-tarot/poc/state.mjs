import {selectionCount} from './spreads.mjs';
export function draw(state,picks) {
 const extra=state.clarifier?.confirmed&&!state.clarifier.drawn;
 if(state.cards.length&&!extra)return {error:'이미 카드를 선택했어요.'};
 const count=selectionCount(state),used=state.cards.map(c=>c.number);
 if(!state.deck||!Array.isArray(picks)||picks.length!==count||new Set(picks).size!==count||picks.some(n=>!Number.isInteger(n)||n<1||n>78||used.includes(n)))return {error:`사용하지 않은 1~78 중 서로 다른 번호 ${count}개를 골라 주세요.`};
 const offset=state.cards.length;
 const drawn=picks.map((n,i)=>({...state.deck[n-1],number:n,slot:offset+i+1,position:extra?state.clarifier.question:state.positions[i],...(extra?{clarifies:state.clarifier.slot}:{})}));
 state.cards.push(...drawn);
 if(extra){state.positions.push(state.clarifier.question);state.clarifier.drawn=true;}
 return {question:state.question,cards:drawn.map(cardInfo)};
}
export const cardInfo=c=>({id:c.id,slot:c.slot,position:c.position,name:c.name,direction:c.reversed?'역방향':'정방향',keywords:c.reversed?c.reverse:c.upright,...(c.clarifies?{clarifies:c.clarifies}:{}),...(c.knowledge?{knowledge:c.knowledge}:{})});
export function reveal(state,slot) {
 if(!Number.isInteger(slot)||slot<1||slot>state.cards.length)return {error:'먼저 카드를 선택해 주세요.'};
 if(slot>1&&!state.revealed.includes(slot-1))return {error:'앞 카드부터 공개해 주세요.'};
 if(!state.revealed.includes(slot))state.revealed.push(slot);
 return cardInfo(state.cards[slot-1]);
}

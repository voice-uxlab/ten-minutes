import {draw} from './state.mjs';
import {selectionCount} from './spreads.mjs';
export function selectNumbers(s,numbers,replace=false){
 if(s.cards.length&&!(s.clarifier?.confirmed&&!s.clarifier.drawn))return {error:'이미 확정한 카드는 바꿀 수 없어.'};
 if(!Array.isArray(numbers))return {error:'번호 배열이 필요해.'};
 const count=selectionCount(s),used=s.cards.map(c=>c.number);
 const valid=numbers.filter(n=>Number.isInteger(n)&&n>=1&&n<=78&&!used.includes(n));
 const next=[...new Set([...(replace?[]:s.picks),...valid])];
 if(next.length>count)return {error:`번호가 ${count}개보다 많아. 어떤 번호인지 확인해 줘.`};
 s.picks=next;
 return {picks:[...next],remaining:count-next.length,invalid:numbers.filter(n=>!valid.includes(n)),note:next.length===count?'번호를 읽어주고 사용자 확인을 기다려. 아직 카드를 공개하지 마.':`${count-next.length}개만 더 물어봐.`};
}
export function confirmSelection(s){return draw(s,s.picks);}

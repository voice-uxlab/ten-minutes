import {makePlan,masters,READING_VERSION,selectionCount} from './spreads.mjs';
import {selectNumbers,confirmSelection} from './selection.mjs';
import {reveal,cardInfo} from './state.mjs';
import {cardKnowledge} from './card-knowledge.mjs';
const error=message=>({error:message});
export function createReading(deck,masterId='adaptive'){
 if(!Object.hasOwn(masters,masterId))throw Error('알 수 없는 리딩 방식이에요.');
 return {deck,masterId,version:READING_VERSION,question:'',positions:[],plan:null,picks:[],cards:[],revealed:[],questionConfirmed:false,clarifier:null,summaryVisited:false,readingSlots:[]};
}
export function publicReading(s){
 const {deck,...state}=s;return structuredClone({...state,requiredCount:selectionCount(s),usedNumbers:s.cards.map(c=>c.number)});
}
export function readingContext(s,focusSlots=[]){
 return {tradition:'RWS',version:s.version,question:s.question,plan:s.plan,master:masters[s.masterId],focusSlots,cards:s.cards.filter(c=>s.revealed.includes(c.slot)).map(cardInfo),
  method:'카드 이름·정역 → knowledge.symbol 도상이 knowledge.core 또는 reversed의 의미로 이어지는 이유 → 자리 질문 → 사용자가 제공한 구체적 사실과 연결되는 이유 → 실제 카드 이름을 짚어 강화·대조·전환 설명 → 그 카드 근거로 원래 질문에 답하기. 해석 가설과 사실을 구분하며 맞지 않는다는 피드백을 인정한다.',
  visualPolicy:'knowledge.symbol은 전통 RWS 참고 도상이다. 현재 화면을 보고 발견한 것처럼 말하지 않는다.'};
}
export function applyReading(s,action,a={}){
 switch(action){
 case 'review_question':{
  const plan=makePlan(a.spreadId,{choices:a.choices,timeframe:a.timeframe});
  if(!plan||typeof a.question!=='string'||!a.question.trim()||a.question.length>300)return error('질문과 유효한 배치가 필요해.');
  if(s.question===a.question.trim()&&JSON.stringify(s.plan)===JSON.stringify(plan))return {ok:true,unchanged:true,plan:s.plan,questionConfirmed:s.questionConfirmed,picks:[...s.picks],revealed:[...s.revealed],note:'이미 정리한 같은 질문이야. 현재 선택과 공개 상태를 유지하고, 질문 확인을 반복하지 말고 이어서 진행해.'};
  if(s.cards.length)return error('확정한 카드와 질문은 바꿀 수 없어.');
  s.question=a.question.trim();s.plan=plan;s.positions=[...plan.positions];s.picks=[];s.questionConfirmed=false;
  return {ok:true,plan,master:masters[s.masterId],note:'고민을 자연스럽게 짚고 맞는지 확인해. 방식·설정·자리 목록을 설명하거나 고르게 하지 마.'};
 }
 case 'confirm_question':
  if(!s.plan||s.cards.length)return error('질문과 배치를 먼저 확인해.');
  s.questionConfirmed=true;return {ok:true,count:s.plan.count,positions:s.positions};
 case 'select_numbers':
  if(!s.questionConfirmed)return error('질문과 배치에 대한 사용자 확인이 먼저야.');
  return selectNumbers(s,a.picks,a.replace===true);
 case 'confirm_cards':{
  if(!s.questionConfirmed)return error('질문과 배치 확인이 먼저야.');
  const result=confirmSelection(s);if(result.error)return result;
  for(const c of s.cards){if(c.knowledge)continue;c.knowledge=cardKnowledge(c.id);if(c.knowledge){c.upright=c.knowledge.core;c.reverse=c.knowledge.reversed;}}
  return {question:s.question,plan:s.plan,cards:s.cards.map(cardInfo),note:'아직 해석하지 말고 공개되지 않은 카드를 순서대로 공개해.'};
 }
 case 'reveal_card':return reveal(s,a.slot);
 case 'show_reading':{
  if(!s.cards.length||s.revealed.length!==s.cards.length)return error('선택한 카드를 모두 공개한 뒤 해석을 시작해.');
  const slots=a.slots!==undefined?a.slots:a.slot===0?[]:[a.slot];
  if(!Array.isArray(slots)||slots.some(n=>!Number.isInteger(n)||n<1||n>s.cards.length)||new Set(slots).size!==slots.length)return error('유효한 카드 자리 번호가 필요해.');
  if(!slots.length)s.summaryVisited=true;else s.readingSlots=[...new Set([...(s.readingSlots||[]),...slots])];
  return {ok:true,context:readingContext(s,slots)};
 }
 case 'request_clarifier':
  if(s.clarifier?.confirmed||!s.summaryVisited||s.revealed.length!==s.cards.length)return error('종합 리딩 후 미해결 질문에 한해 추가 카드 한 장을 제안할 수 있어.');
  if(!Number.isInteger(a.slot)||a.slot<1||a.slot>s.plan.count||typeof a.question!=='string'||!a.question.trim()||a.question.length>150)return error('더 살펴볼 자리와 구체적인 질문을 정해 줘.');
  s.clarifier={slot:a.slot,question:a.question.trim(),confirmed:false,drawn:false};
  return {ok:true,proposal:s.clarifier,note:'이 질문으로 한 장을 더 뽑을지 사용자 동의를 기다려. 기존 카드를 바꾸지 않아.'};
 case 'confirm_clarifier':
  if(!s.clarifier||s.clarifier.confirmed)return error('추가 카드 제안과 사용자 동의가 먼저야.');
  s.clarifier.confirmed=true;s.picks=[];return {ok:true,count:1,usedNumbers:s.cards.map(c=>c.number)};
 case 'cancel_clarifier':
  if(s.clarifier?.confirmed)return error('이미 동의한 추가 카드 선택을 이어가 줘.');
  s.clarifier=null;return {ok:true};
 default:return error('알 수 없는 리딩 작업이야.');
 }
}

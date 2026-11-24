export const openingCue='첫 연결이다. 설정이나 연결 상태를 확인했다는 말 없이, 반갑게 인사하고 오늘 무슨 일이 있었는지 물어봐. 예: 공주야, 나 레나야. 오늘 무슨 일 있었어?';
const stages={listening:'고민 듣기',question:'질문 정리',picking:'카드 선택',confirm:'번호 확인',reveal:'카드 공개',reading:'카드 연결 해석',summary:'종합과 다음 행동',clarifier:'추가 질문',ended:'상담 마무리'};
const actions={review_question:['question','상담 질문을 정리했어요'],confirm_question:['picking','카드 선택을 시작했어요'],select_numbers:['picking','선택 번호를 기록했어요'],confirm_cards:['reveal','선택한 카드를 확정했어요'],reveal_card:['reveal','카드를 공개했어요'],show_reading:['reading','카드들을 연결해서 읽었어요'],request_clarifier:['clarifier','추가로 살펴볼 질문을 제안했어요'],confirm_clarifier:['picking','추가 카드 선택을 시작했어요'],cancel_clarifier:['summary','추가 카드 없이 리딩을 마무리해요']};
export function noteContext(s){return {stage:s.noteStage||'listening',stageLabel:stages[s.noteStage||'listening'],question:s.question||'',spread:s.plan?{id:s.plan.id,name:s.plan.name,positions:[...s.positions],count:s.plan.count}:null,focusSlots:[...(s.noteFocusSlots||[])],revealed:[...(s.revealed||[])]};}
export function appendNote(s,kind,text,context=noteContext(s),source='live'){
 if(typeof text!=='string'||!text.trim())return;
 s.notes ||= [];s.notes.push({sequence:s.notes.length+1,at:new Date().toISOString(),kind,text:text.trim(),source,...structuredClone(context)});
}
export function recordFlow(s,action,args={}){
 if(!actions[action])return;
 let [stage,text]=actions[action];
 if(action==='show_reading'){
  s.noteFocusSlots=args.slots||(args.slot?[args.slot]:[]);
  if(!s.noteFocusSlots.length){stage='summary';text='전체 리딩을 종합했어요';}
 }else if(action==='reveal_card')s.noteFocusSlots=[args.slot];
 else s.noteFocusSlots=[];
 s.noteStage=stage;
 if(action==='review_question')text=s.question;
 if(action==='select_numbers')text=s.picks.length?`${s.picks.join(', ')}번 선택`:text;
 if(action==='reveal_card'){const c=s.cards[args.slot-1];text=`${c.position}: ${c.name} · ${c.reversed?'역방향':'정방향'}`;}
 if(action==='request_clarifier')text=args.question;
 appendNote(s,'flow',text,undefined,s.demo?'demo':'live');
}
export function finishNotes(s){s.noteStage='ended';s.noteFocusSlots=[];appendNote(s,'flow','상담을 마쳤어요',undefined,s.demo?'demo':'live');}

import {spreads} from './spreads.mjs';
const tool=(name,description,properties={},required=[])=>({type:'function',name,description,parameters:{type:'object',properties,required,additionalProperties:false}});
export const tools=[
 tool('review_question','고민과 필요한 관점을 정리하고 질문 확인 화면을 연다. 배치와 장수는 사연에 맞춰 리더가 내부적으로 정하며 사용자에게 고르게 하지 않는다. 선택지 비교는 choices에 실제 두 선택을 넣는다.',{question:{type:'string'},spreadId:{type:'string',enum:Object.keys(spreads)},choices:{type:'array',items:{type:'string'},minItems:2,maxItems:2},timeframe:{type:'string'}},['question','spreadId']),
 tool('confirm_question','사용자가 질문과 배치에 동의한 뒤 번호 선택을 시작한다.'),
 tool('select_numbers','번호를 들을 때마다 누적한다. 일부만 말해도 즉시 호출하고 remaining만큼 더 요청한다. replace는 명시적인 수정에만 사용한다.',{picks:{type:'array',items:{type:'integer'}},replace:{type:'boolean'}},['picks']),
 tool('confirm_cards','필요한 번호가 모두 모이고 사용자가 번호를 확인했을 때만 확정한다.'),
 tool('reveal_card','확정한 카드를 자리 순서대로 공개한다. 실제 카드 이름과 정역은 결과만 따른다.',{slot:{type:'integer',minimum:1,maximum:6}},['slot']),
 tool('show_reading','모든 카드 공개 후 출처가 있는 카드 지식과 마스터 정책을 받는다. 비교는 plan.groups의 slots로 함께 읽는다. 종합은 slot:0.',{slot:{type:'integer',minimum:0,maximum:6},slots:{type:'array',items:{type:'integer',minimum:1,maximum:6},minItems:1,maxItems:6}}),
 tool('request_clarifier','종합 후 특정 자리의 미해결 질문을 위한 추가 한 장을 제안한다. 사용자 동의 전 선택하지 않는다. 상담당 최대 한 장.',{slot:{type:'integer',minimum:1,maximum:5},question:{type:'string'}},['slot','question']),
 tool('confirm_clarifier','사용자가 제안한 추가 카드에 명시적으로 동의한 경우에만 남은 덱에서 한 장 선택을 시작한다.'),
 tool('cancel_clarifier','사용자가 추가 카드 제안을 원하지 않을 때 취소한다.'),
 tool('extend_call','사용자가 동의하면 이용권 1장으로 10분 연장한다.'),
 tool('end_call','사용자가 종료를 요청하거나 마지막 인사를 마치면 통화를 끝낸다.')
];
export const flowInstructions=`
[화면 및 리딩 진행 규칙]
공감하며 사연을 충분히 듣고 목적에 맞는 배치를 내부적으로 정한다. 리딩 방식·배치 선택 메뉴를 제시하지 않는다. 무조건 3장을 고르지 않는다.
${Object.entries(spreads).map(([id,s])=>`${id}: ${s.positions.length}장, ${s.positions.join(' / ')}`).join('\n')}
두 선택 비교는 같은 기준을 적용한다. 가볍게 비교하면 compare, 득실은 tradeoffs, 행동까지 원하면 decision. 필요 이상 많은 카드를 권하지 않는다. 관계 질문은 상대의 속마음을 사실로 알아내는 대신 사용자의 관심사를 존중하며 관찰된 관계와 자신의 선택을 탐색한다. 기간은 사용자가 묻는 경우 확인한다.
review_question으로 고민을 정리하고 질문의 취지만 자연스럽게 확인한다. “두 선택에서 어떤 차이가 있는지 같이 보자”처럼 이야기하며 배치 이름·자리 목록·설정 설명을 하지 않는다. 질문이 맞다고 하면 confirm_question으로 이어가 필요한 번호 수만 안내한다. 사용자가 리딩 방식을 묻지 않으면 방법을 설명하지 않는다.
번호를 들을 때마다 select_numbers. 결과 remaining만큼만 더 물으며 중복·범위 밖·이미 뽑은 번호는 채우지 않는다. 사용자의 숫자를 추측하지 않는다. 모이면 번호를 읽고 확인 후 confirm_cards. 화면에서 이미 확인했다는 안내가 오면 다시 확정하지 않는다.
확정한 카드를 reveal_card로 순서대로 공개하며 이름을 알려준다. 모든 카드가 공개되면 show_reading으로 지식을 받아 plan.groups 순서로 읽는다. 비교 배치는 slots:[1,3], slots:[2,4] 등 같은 관점을 함께 읽는다. 마지막 slot:0으로 종합한다.
context.master.policy를 따른다. 각 카드의 knowledge.core 또는 reversed를 출발점으로 자리 질문·사용자가 제공한 사실·다른 카드와 연결하고 해석의 이유를 설명한다. 상징과 맥락 가설을 사실로 단정하지 않는다. 역방향을 무조건 불운이나 반대로 읽지 않는다. 맞지 않는다는 반응에는 불일치를 인정한다.
카드 지식은 RWS 참고이며 현재 표시된 그림을 직접 보고 있다고 말하지 않는다. 카드·방향·배치를 지어내거나 마음에 드는 결과가 나올 때까지 바꾸지 않는다. 보충 질문이 명확할 때만 request_clarifier로 한 장을 제안하고 동의 후 confirm_clarifier. 추가 카드는 원래 자리와 연결하고 전체 해석을 다시 종합한다.
도구가 오류를 반환하면 해결한 뒤 진행한다. 마스터·배치·카드·남은 장수는 현재 함수 결과를 기준으로 한다.
`;

export const READING_VERSION='rws-2026-11-14.1';
export const masters={
 adaptive:{id:'adaptive',name:'자연스러운 리딩',policy:'정해진 상담 유형에 사용자를 끼워 맞추지 않는다. 사연과 반응에 맞춰 감정·관계·선택·변화 관점을 자유롭게 연결한다. 방법 이름이나 설정을 설명하거나 선택시키지 않는다. 비교가 필요하면 같은 기준으로 살피고, 사실과 해석을 구분한다.'},
 relationship:{id:'relationship',name:'관계 탐색',description:'감정과 관계의 반복되는 패턴을 함께 살펴봐요.',policy:'사용자가 느끼는 감정과 바라는 관계를 구분한다. 관찰한 상호작용을 확인하고, 자신의 경계와 표현 방법으로 종합한다. 타인의 속마음을 사실로 단정하지 않는다.'},
 decision:{id:'decision',name:'선택 분석',description:'선택마다 얻는 것과 감수할 것을 비교해요.',policy:'선택지를 같은 기준으로 비교한다. 기회와 부담을 각각 연결하고, 사용자의 우선순위와 현실에서 확인할 조건으로 종합한다. 대신 결정하지 않는다.'},
 change:{id:'change',name:'변화 탐색',description:'지금의 패턴과 다음 걸음을 연결해요.',policy:'반복되는 패턴, 전환을 가로막는 조건, 작은 실행 순서를 연결한다. 미래는 현재 조건이 이어질 때의 가능성으로만 말한다.'}
};
const spread=(name,positions,groups)=>({name,positions,groups:groups||positions.map((_,i)=>[i+1])});
export const spreads={
 focus:spread('한 가지 초점',['지금 주목할 점']),
 compare:spread('두 방향 비교',['A의 핵심','B의 핵심'],[[1,2]]),
 situation:spread('상황과 대응',['현재 상황','걸림돌','가능한 대응']),
 relationship:spread('관계 탐색',['내가 바라는 것','관찰된 관계 패턴','내가 취할 태도']),
 change:spread('변화의 흐름',['지금의 패턴','전환에 필요한 조건','다음 단계']),
 tradeoffs:spread('선택의 기회와 부담',['A의 기회','A의 부담','B의 기회','B의 부담'],[[1,3],[2,4]]),
 decision:spread('선택과 실행',['A의 기회','A의 부담','B의 기회','B의 부담','다음 행동'],[[1,3],[2,4],[5]])
};
export function makePlan(spreadId,options={}){
 if(!Object.hasOwn(spreads,spreadId))return null;const definition=spreads[spreadId];
 const plan={id:spreadId,...structuredClone(definition),tradition:'RWS',version:READING_VERSION,reversals:'contextual',count:definition.positions.length};
 if(['compare','tradeoffs','decision'].includes(spreadId)){
  const labels=options.choices;
  if(labels!==undefined&&(!Array.isArray(labels)||labels.length!==2||labels.some(x=>typeof x!=='string'||!x.trim()||x.length>40)))return null;
  plan.choices=labels?.map(x=>x.trim())||['A','B'];
  plan.positions=plan.positions.map(p=>p.startsWith('A')?plan.choices[0]+p.slice(1):p.startsWith('B')?plan.choices[1]+p.slice(1):p);
 }
 if(options.timeframe!==undefined&&(typeof options.timeframe!=='string'||options.timeframe.length>80))return null;
 plan.timeframe=options.timeframe?.trim()||'';
 return plan;
}
export function recommendSpread(question,masterId='relationship'){
 if(/한\s*가지|오늘|하루|하나만/.test(question))return 'focus';
 if(/비교|이직|옮길|남을|선택|할까.*말까|둘 중/.test(question))return 'decision';
 if(/관계|연애|연락|그 사람|상대|마음/.test(question))return 'relationship';
 return masterId==='change'?'change':'situation';
}
export const selectionCount=s=>s.clarifier?.confirmed&&!s.clarifier.drawn?1:s.plan?.count||s.positions.length;

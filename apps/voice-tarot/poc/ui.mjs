export const $=id=>document.getElementById(id);
export const screens=[
 ['01','홈 · 로그인','welcome','네이버·카카오 로그인, 닉네임 체험'],
 ['02','소개 · 마이크 허용 전','intro','마이크·음성 처리 동의 안내'],
 ['03','소개 · 상담 준비 완료','ready','상담 시작 활성화'],
 ['04','고민 듣기','listening','캐릭터, 실시간 자막, 통화 제어'],
 ['05','질문 확인','question','질문 확인 또는 수정'],
 ['06','질문별 번호 선택','picking','실제 상담은 배치에 따라 1~5개 누적'],
 ['07','선택 번호 확인','confirm','선택 번호 확인 또는 다시 선택'],
 ['08','첫 번째 카드 공개','reveal1','첫 카드 강조, 나머지 비공개'],
 ['09','두 번째 카드 공개','reveal2','두 번째 카드 강조'],
 ['10','세 번째 카드 공개','reveal3','세 번째 카드 강조'],
 ['11','첫 번째 카드 해석','reading1','카드 의미 → 고민 연결 → 생각할 점'],
 ['12','두 번째 카드 해석','reading2','현재 해석 중인 카드 강조'],
 ['13','세 번째 카드 해석','reading3','현재 해석 중인 카드 강조'],
 ['14','종합 리딩','summary','선택된 배치의 카드들을 종합'],
 ['15','상담 종료','ended','마무리 메시지, 리포트, 홈 이동'],
 ['16','연결 중','connecting','연결 상태 안내·취소'],
 ['17','마이크 권한 안내','permission','브라우저 권한 안내·다시 시도'],
 ['18','연결 실패','connection-error','상담 상태 유지·재연결'],
 ['19','번호 다시 듣기','retry-numbers','두 번호 유지·나머지 한 개 요청'],
 ['20','팀 리뷰 · 구현 기준','review','원본 시안과 구현 차이·설정 현황'],
 ['21','상담 리포트','report','기존 PoC의 요약·이미지 저장 유지']
];
export function showScreen(id){for(const n of ['welcome','home','callScreen','errorScreen','endedScreen','reportScreen'])$(n).hidden=n!==id;window.scrollTo(0,0);}
export function phase(name,{heading='',hint='',caption,question='',slot=0,total=3}={}){
 showScreen('callScreen');$('callScreen').dataset.phase=name;
 $('callReader').hidden=name==='reveal';$('eyebrow').hidden=name!=='reveal';
 $('eyebrow').textContent=`PICKED BY PRINCESS / ${slot} OF ${total}`;
 $('callHeading').textContent=heading;$('stepHint').textContent=hint;
 $('questionPanel').hidden=name!=='question';$('questionActions').hidden=name!=='question';
 $('selectionActions').hidden=name!=='confirm';$('deck').hidden=!['picking','retry-numbers'].includes(name);
 $('messagePanel').hidden=['question','confirm'].includes(name);
 $('wave').hidden=!['listening','connecting'].includes(name);
 $('question').textContent=question;
 if(caption!==undefined)$('caption').textContent=caption;
}
const renderedCards=new WeakMap();
export function renderCards(target,cards,revealed,active=0){
 const root=$(target);root.hidden=!cards.length;root.dataset.count=cards.length;const activeSlots=Array.isArray(active)?active:[active];
 while(root.children.length>cards.length)root.lastElementChild.remove();
 cards.forEach((c,i)=>{
  const open=revealed.includes(i+1),existing=root.children[i];
  const signature=JSON.stringify([c.number,c.position,open,open?c.name:null,open?!!c.reversed:false]);
  if(existing&&renderedCards.get(existing)===signature){existing.classList.toggle('active',activeSlots.includes(i+1));return;}
  const wrap=document.createElement('div');wrap.className='card-wrap'+(activeSlots.includes(i+1)?' active':'');renderedCards.set(wrap,signature);
  const face=document.createElement('div');face.className='card'+(open?(c.reversed?' reversed':''):' back');
  if(!open){const image=new Image();image.src='/assets/card-back.png';image.alt='아직 공개하지 않은 타로 카드';face.append(image);}
  else{
   const art={별:['star','XVII','THE STAR'],태양:['sun','XIX','THE SUN'],절제:['temperance','XIV','TEMPERANCE']}[c.name];
   const top=document.createElement('span');top.className='arcana';top.textContent=art?.[1]||'TAROT';
   const symbol=art?new Image():document.createElement('span');symbol.className='symbol';if(art){symbol.src=`/assets/${art[0]}.png`;symbol.alt=c.name;}else symbol.textContent='✦';
   const english=document.createElement('span');english.className='english';english.textContent=art?.[2]||c.position;
   const title=document.createElement('b');title.textContent=c.name;face.append(top,symbol,english,title);
  }
  const label=document.createElement('span');label.textContent=`선택 ${String(c.number||i+1).padStart(2,'0')}${open&&c.reversed?' · 역방향':''}`;const position=document.createElement('small');position.className='position-label';position.textContent=c.position||'';wrap.append(face,label,position);if(existing)existing.replaceWith(wrap);else root.append(wrap);
 });
}
export function renderNumbers(picks,count=3){$('pickCount').textContent=`${picks.length} / ${count}`;$('selectedNumbers').replaceChildren();for(const n of picks){const b=document.createElement('span');b.className='number-chip';b.textContent=`${n}번`;$('selectedNumbers').append(b);}for(const b of $('grid').children){b.classList.toggle('selected',picks.includes(Number(b.textContent)));b.setAttribute('aria-pressed',String(picks.includes(Number(b.textContent))));}}
export const demoCards=[{id:17,name:'별',number:7,position:'나의 마음',upright:'희망 · 치유',reverse:'불안 · 회복',slot:1},{id:19,name:'태양',number:22,position:'관찰된 관계 패턴',upright:'긍정 · 활력',reverse:'조급함 · 지연',slot:2},{id:14,name:'절제',number:51,position:'관계의 흐름',upright:'균형 · 조화',reverse:'불균형 · 과함',slot:3}];
export function preview(key){
 const entry=screens.find(s=>s[2]===key);if(!entry)return false;
 document.body.classList.add('preview-mode');$('previewBar').hidden=false;$('previewName').textContent=`${entry[0]} · ${entry[1]}`;
 $('previewNext').onclick=()=>location.href=`/?preview=${screens[(screens.indexOf(entry)+1)%screens.length][2]}`;
 if(new URLSearchParams(location.search).has('embed'))document.body.classList.add('embedded-preview');$('status').textContent=key==='connecting'?'연결 중':'공주 얘기 듣는 중';$('timer').textContent='● 08:49';$('mode').textContent='';$('next').hidden=true;$('extend').hidden=true;
 const next=()=> $('previewNext').click();
 if(key==='review'){location.replace('/screens#review');return true;}
 if(key==='welcome'){showScreen('welcome');$('guest').onclick=()=>location.href='/?preview=intro';return true;}
 if(['intro','ready'].includes(key)){showScreen('home');$('greeting').textContent='공주야, 안녕!';$('offer').textContent='10분 상담 시작하기';$('call').disabled=key!=='ready';$('voiceConsent').checked=key==='ready';$('allowMic').textContent=key==='ready'?'허용됨':'허용하기';$('allowMic').onclick=()=>location.href='/?preview=ready';$('call').onclick=()=>location.href='/?preview=connecting';document.querySelector('.extras').hidden=true;return true;}
 if(['permission','connection-error'].includes(key)){showScreen('errorScreen');$('errorHeading').textContent=key==='permission'?'공주 목소리를\n들을 수 있게 해줘.':'연결이 잠깐\n끊겼어, 공주야.';$('errorMessage').textContent=key==='permission'?'브라우저의 사이트 설정에서 마이크 권한을 허용한 뒤 다시 시도해줘.':'인터넷 연결을 확인하고 다시 시작해줘. 선택한 번호와 카드는 그대로 보관할게.';$('retry').onclick=()=>location.href='/?preview=connecting';return true;}
 if(key==='ended'){showScreen('endedScreen');$('endLine').textContent='언제든 이야기를 들려주고 싶으면, 지금의 공주를 기억하고 있을게.';$('viewReport').onclick=()=>location.href='/?preview=report';return true;}
 if(key==='report'){showScreen('reportScreen');$('reportDate').textContent='화면 검토용 예시';$('reportQuestion').textContent='연락 없는 그 사람, 기다려도 될까?';renderCards('reportCards',demoCards,[1,2,3]);$('summary').textContent='기다림 속에서도 네 마음의 균형을 잃지 마. 공주가 원하는 관계의 기준을 먼저 생각해봐.';$('queenLine').textContent='결정의 주인공은 언제나 공주야.';$('share').disabled=true;return true;}
 const question='연락 없는 그 사람, 기다려도 될까?';
 const data={listening:['공주야,\n무슨 일 있었어?','','응, 공주야. 천천히 말해.\n괜찮아, 다 듣고 있어.'],question:['이 질문으로\n살펴볼까?','',''],picking:['공주가 끌리는\n번호 세 개를 말해줘.','02 / 03 · 1~78 사이 번호를 골라줘.','번호를 하나씩 말해도 괜찮아.'],confirm:['7번, 22번, 51번.\n이 세 장이 맞아?','02 / 03 · 확인 전에는 카드를 열지 않아요.',''],connecting:['잠깐만, 공주야.\n언니가 전화 받을게.','연결 상태를 확인하고 있어요.','곧 네 이야기를 들을 준비가 돼.'], 'retry-numbers':['한 개만 더\n알려줄래?','02 / 03 · 2개 선택했어요.','7번, 22번 골랐어. 겹치지 않는 번호 하나만 더 말해줘.'],summary:['결정의 주인공은\n언제나 공주야.','03 / 03 · 세 장 종합 리딩','세 장을 함께 보면, 마음을 회복하고 네 기준을 세우는 흐름이야. 오늘은 공주의 마음에 먼저 답해줘.']};
 if(data[key]){const [heading,hint,caption]=data[key];phase(key,{heading,hint,caption,question});renderCards('slots',key==='summary'||key==='confirm'?demoCards:[],key==='summary'?[1,2,3]:[]);if(key==='retry-numbers'){renderNumbers([7,22]);renderCards('slots',demoCards.slice(0,2),[]);}if(key==='picking')renderNumbers([]);}
 else{const slot=Number(key.at(-1)),reveal=key.startsWith('reveal');phase(reveal?'reveal':'reading',{slot,heading:reveal?`${['첫','두','세'][slot-1]} 번째 카드는,\n${demoCards[slot-1].name}이야.`:['별이 말해주는 건,\n다시 기대할 용기.','잘하는 건,\n잘한다고 말해도 돼.','급하게 답내지 마.\n공주의 속도로 가자.'][slot-1],hint:reveal?`${slot} / 3 카드 공개`:'03 / 03 · 카드별 리딩',caption:reveal?'이번엔 세 장을 함께 읽어볼게.':demoCards[slot-1].upright+'의 카드야. 지금 마음과 어떻게 닿아 있는지 같이 생각해보자.'});renderCards('slots',demoCards,reveal?[1,2,3].slice(0,slot):[1,2,3],slot);}
 for(const id of ['confirmQuestion','confirmCards','changeQuestion','changeCards'])$(id).onclick=next;
 $('hangup').onclick=()=>location.href='/?preview=ended';$('mute').onclick=()=>{$('mute').classList.toggle('muted');$('mute').querySelector('.control-label').textContent=$('mute').classList.contains('muted')?'음소거 중':'마이크 켜짐';};return true;
}

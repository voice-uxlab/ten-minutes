import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReading,applyReading,publicReading} from './reading.mjs';
import {cards} from './cards.mjs';
const deck=()=>cards.map(c=>({...c,reversed:false}));
function ready(spreadId,masterId='relationship'){
 const s=createReading(deck(),masterId);
 assert.equal(applyReading(s,'review_question',{question:'어떤 선택을 할까?',spreadId}).ok,true);
 assert.equal(applyReading(s,'confirm_question').ok,true);return s;
}
for(const [spreadId,count] of [['focus',1],['compare',2],['situation',3],['tradeoffs',4],['decision',5]]){
 test(`${spreadId}: partial picks, exact count, stable confirmed cards and positional knowledge`,()=>{
  const s=ready(spreadId);
  const picks=Array.from({length:count},(_,i)=>i+1);
  if(count>1){assert.equal(applyReading(s,'select_numbers',{picks:picks.slice(0,-1)}).remaining,1);assert.ok(applyReading(s,'confirm_cards').error);}
  assert.equal(applyReading(s,'select_numbers',{picks:[picks.at(-1)]}).remaining,0);
  assert.equal(publicReading(s).cards.length,0);
  assert.equal(applyReading(s,'confirm_cards').cards.length,count);
  const ids=s.cards.map(c=>c.id);
  assert.ok(applyReading(s,'review_question',{question:'다시',spreadId:'focus'}).error);
  assert.ok(applyReading(s,'select_numbers',{picks:[40],replace:true}).error);
  assert.deepEqual(s.cards.map(c=>c.id),ids);
  assert.ok(!('deck' in publicReading(s)));
  assert.ok(applyReading(s,'show_reading',{slot:0}).error);
  for(let slot=1;slot<=count;slot++)assert.equal(applyReading(s,'reveal_card',{slot}).slot,slot);
  const result=applyReading(s,'show_reading',{slot:0});
  assert.equal(result.context.cards.length,count);assert.equal(result.context.tradition,'RWS');
  assert.ok(result.context.cards.every(c=>c.knowledge.sources.length&&c.position));
 });
}
test('question revisions clear tentative picks and validate before mutation',()=>{
 const s=ready('decision');applyReading(s,'select_numbers',{picks:[7,22]});
 assert.ok(applyReading(s,'review_question',{question:'새 질문',spreadId:'bogus'}).error);
 assert.deepEqual(s.picks,[7,22]);
 applyReading(s,'review_question',{question:'새 질문',spreadId:'focus'});
 assert.deepEqual(s.picks,[]);assert.equal(s.questionConfirmed,false);
 assert.ok(applyReading(s,'select_numbers',{picks:[7]}).error);
});
test('a clarifier needs a completed reading, explicit consent, and unused number; only one is allowed',()=>{
 const s=ready('compare');
 assert.ok(applyReading(s,'request_clarifier',{slot:1,question:'무엇을 확인할까?'}).error);
 applyReading(s,'select_numbers',{picks:[7,22]});applyReading(s,'confirm_cards');
 for(const slot of [1,2])applyReading(s,'reveal_card',{slot});
 applyReading(s,'show_reading',{slot:0});
 assert.equal(applyReading(s,'request_clarifier',{slot:1,question:'A에서 확인할 조건은?'}).ok,true);
 assert.ok(applyReading(s,'select_numbers',{picks:[51]}).error);
 applyReading(s,'confirm_clarifier');
 assert.equal(applyReading(s,'select_numbers',{picks:[7]}).remaining,1);
 applyReading(s,'select_numbers',{picks:[51]});applyReading(s,'confirm_cards');
 assert.deepEqual(s.cards.map(c=>c.number),[7,22,51]);
 assert.equal(s.cards[2].clarifies,1);
 applyReading(s,'reveal_card',{slot:3});
 assert.ok(applyReading(s,'request_clarifier',{slot:2,question:'더 뽑을까?'}).error);
});
test('comparison groups and master policies reach the actual reading context',()=>{
 const s=ready('decision','decision');applyReading(s,'select_numbers',{picks:[1,2,3,4,5]});applyReading(s,'confirm_cards');
 for(let slot=1;slot<=5;slot++)applyReading(s,'reveal_card',{slot});
 const r=applyReading(s,'show_reading',{slots:[1,3]});
 assert.deepEqual(r.context.focusSlots,[1,3]);assert.equal(r.context.master.id,'decision');
 assert.deepEqual(r.context.plan.groups,[[1,3],[2,4],[5]]);
 assert.ok(applyReading(s,'show_reading',{slots:[9]}).error);
});

test('all 78 cards carry distinct RWS knowledge, source provenance and contextual reversals',async()=>{
 const {knowledge}=await import('./card-knowledge.mjs');
 assert.equal(knowledge.length,78);assert.equal(new Set(knowledge.map(c=>c.id)).size,78);
 for(const k of knowledge){assert.equal(k.name,cards[k.id].name);for(const key of ['symbol','core','reversed','reflection','provenance','caution'])assert.ok(k[key],`${k.name}: ${key}`);}
 assert.equal(knowledge[71].name,'펜타클 8');assert.match(knowledge[71].core,/숙련/);
});

test('choice labels are substituted once and interpretation progress survives snapshots',()=>{
 const s=createReading(deck(),'decision');
 applyReading(s,'review_question',{question:'회사 비교',spreadId:'compare',choices:['B 회사','A 회사']});
 assert.deepEqual(s.positions,['B 회사의 핵심','A 회사의 핵심']);
 applyReading(s,'confirm_question');applyReading(s,'select_numbers',{picks:[1,2]});applyReading(s,'confirm_cards');
 for(const slot of [1,2])applyReading(s,'reveal_card',{slot});
 assert.equal(publicReading(s).summaryVisited,false);
 applyReading(s,'show_reading',{slots:[1,2]});assert.deepEqual(publicReading(s).readingSlots,[1,2]);
 assert.equal(publicReading(s).summaryVisited,false);
 applyReading(s,'show_reading',{slot:0});assert.equal(publicReading(s).summaryVisited,true);
});

test('repeated question review preserves confirmed picks and revealed cards',()=>{
 const s=ready('situation');
 applyReading(s,'select_numbers',{picks:[7,22]});
 const args={question:'어떤 선택을 할까?',spreadId:'situation'};
 const before=structuredClone(s);
 const result=applyReading(s,'review_question',args);
 assert.deepEqual(s,before);assert.equal(result.unchanged,true);
 applyReading(s,'select_numbers',{picks:[51]});applyReading(s,'confirm_cards');applyReading(s,'reveal_card',{slot:1});
 const drawn=structuredClone(s);
 assert.equal(applyReading(s,'review_question',args).unchanged,true);
 assert.deepEqual(s,drawn);
});

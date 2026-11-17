import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createReading,applyReading,publicReading} from '../shared/reading.ts';
import {cards} from '../shared/cards.ts';
const deck=()=>cards.map(c=>({...c,reversed:false}));
function ready(spreadId,masterId='relationship'){
 const s=createReading(deck(),masterId);
 assert.equal(applyReading(s,'review_question',{question:'어떤 선택을 할까?',spreadId}).ok,true);
 assert.equal(applyReading(s,'confirm_question').ok,true);return s;
}
for(const spreadId of ['timeline','situation','relationship','decision']) {
 test(`${spreadId}: exactly three picks and interleaved reveal/read with no grouped reading`,()=>{
  const s=ready(spreadId);
  assert.equal(applyReading(s,'select_numbers',{picks:[1,78]}).remaining,1);
  assert.ok(applyReading(s,'confirm_cards').error);
  assert.ok(applyReading(s,'select_numbers',{picks:[2,3]}).error);
  assert.equal(applyReading(s,'select_numbers',{picks:[22]}).remaining,0);
  assert.equal(applyReading(s,'confirm_cards').cards.length,3);
  assert.ok(applyReading(s,'show_reading',{slot:1}).error);
  for (let slot=1;slot<=3;slot++) {
   assert.equal(applyReading(s,'reveal_card',{slot}).slot,slot);
   if(slot<3) assert.ok(applyReading(s,'reveal_card',{slot:slot+1}).error);
   assert.ok(applyReading(s,'show_reading',{slots:[1,2]}).error);
   assert.ok(applyReading(s,'show_reading',{slot:0}).error);
   const r=applyReading(s,'show_reading',{slot});
   assert.equal(r.context.cards.length,1);assert.equal(r.context.cards[0].slot,slot);
   assert.ok(r.context.cards[0].knowledge.sources.length);
  }
  assert.equal(applyReading(s,'show_reading',{slot:0}).context.cards.length,3);
  for(const action of ['request_clarifier','confirm_clarifier']) assert.ok(applyReading(s,action,{slot:1,question:'extra'}).error);
  assert.ok(!('deck' in publicReading(s)));
 });
}
test('removed spreads are rejected and revised questions reset tentative picks',()=>{
 const s=ready('decision');applyReading(s,'select_numbers',{picks:[7,22]});
 for(const spreadId of ['focus','compare','tradeoffs','change']) assert.ok(applyReading(s,'review_question',{question:'new',spreadId}).error);
 assert.deepEqual(s.picks,[7,22]);
 assert.equal(applyReading(s,'review_question',{question:'new',spreadId:'timeline'}).ok,true);
 assert.deepEqual(s.picks,[]);assert.equal(s.questionConfirmed,false);
});
test('all 78 cards carry distinct RWS knowledge, source provenance and contextual reversals',async()=>{
 const {knowledge}=await import('../shared/card-knowledge.ts');
 assert.equal(knowledge.length,78);assert.equal(new Set(knowledge.map(c=>c.id)).size,78);
 for(const k of knowledge){assert.equal(k.name,cards[k.id].name);for(const key of ['symbol','core','reversed','reflection','provenance','caution'])assert.ok(k[key],`${k.name}: ${key}`);}
 assert.equal(knowledge[71].name,'펜타클 8');assert.match(knowledge[71].core,/숙련/);
});

test('decision choice labels preserve order and meaning',()=>{
 const s=createReading(deck(),'decision');
 applyReading(s,'review_question',{question:'compare',spreadId:'decision',choices:['B company','A company']});
 assert.deepEqual(s.positions,['선택지 A: B company','선택지 B: A company','조언']);
 assert.deepEqual(s.plan.groups,[[1],[2],[3]]);
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

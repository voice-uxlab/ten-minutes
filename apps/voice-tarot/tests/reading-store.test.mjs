import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ReadingStore} from '../server/reading-store.ts';
import {cards} from '../shared/cards.ts';
test('server restart retains deck, partial selection and master; concurrent selections accumulate',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tarot-store-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new ReadingStore(dir,()=>cards.map(c=>({...c,reversed:false})));
 const {id}=await store.request({action:'create',masterId:'change'});
 const act=(action,args)=>store.request({id,action,args});
 await act('review_question',{question:'선택을 비교할까?',spreadId:'decision'});await act('confirm_question');
 await Promise.all([act('select_numbers',{picks:[7,22]}),act('select_numbers',{picks:[78]})]);
 const restarted=new ReadingStore(dir,()=>{throw Error('must not reshuffle');});
 const restored=await restarted.request({id,action:'get'});
 assert.deepEqual(restored.state.picks,[7,22,78]);assert.equal(restored.state.masterId,'change');assert.ok(!JSON.stringify(restored).includes('deck'));
 await restarted.request({id,action:'select_numbers',args:{picks:[78]}});
 const drawn=await restarted.request({id,action:'confirm_cards'});
 assert.deepEqual(drawn.state.cards.map(c=>c.id),[6,21,77]);
 assert.ok((await restarted.request({id,action:'select_numbers',args:{picks:[1],replace:true}})).result.error);
 await assert.rejects(store.request({id:'../other',action:'get'}));
});
test('older three-card reports preserve selected identities and orientation when resumed',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tarot-legacy-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new ReadingStore(dir,()=>cards.map(c=>({...c,reversed:false})));
 const result=await store.request({action:'create',previous:{question:'이전 고민',positions:['나','관계','대응'],cards:[{id:77,number:1,reversed:true},{id:0,number:22,reversed:false},{id:50,number:51,reversed:true}],revealed:[1]}});
 assert.deepEqual(result.state.cards.map(c=>[c.id,c.reversed]),[[77,true],[0,false],[50,true]]);assert.deepEqual(result.state.revealed,[1]);
});

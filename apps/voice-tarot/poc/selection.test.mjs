import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectNumbers,confirmSelection} from './selection.mjs';
const session=()=>({deck:Array.from({length:78},(_,id)=>({id,name:String(id)})),cards:[],picks:[],positions:['나','상대','흐름'],revealed:[]});
test('partial voice choices accumulate without drawing until confirmed',()=>{
 const s=session();
 assert.equal(selectNumbers(s,[7,22]).remaining,1);
 assert.equal(selectNumbers(s,[22,79]).remaining,1);
 assert.deepEqual(s.picks,[7,22]);
 assert.ok(confirmSelection(s).error);
 assert.equal(selectNumbers(s,[51]).remaining,0);
 assert.equal(s.cards.length,0);
 assert.equal(confirmSelection(s).cards.length,3);
 assert.deepEqual(s.cards.map(c=>c.id),[6,21,50]);
 assert.ok(selectNumbers(s,[1],true).error);
});
test('corrections replace candidate numbers and excess choices are not silently dropped',()=>{
 const s=session(); selectNumbers(s,[7,22]);
 selectNumbers(s,[7,23],true); assert.deepEqual(s.picks,[7,23]);
 assert.ok(selectNumbers(s,[51,52]).error); assert.deepEqual(s.picks,[7,23]);
 selectNumbers(s,[],true); assert.deepEqual(s.picks,[]);
});

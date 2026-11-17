import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shuffle} from '../server/server.ts';
import {draw,reveal} from '../shared/state.ts';
test('78 unique cards; stable picks and guarded reveals',()=>{const deck=shuffle();assert.equal(deck.length,78);assert.equal(new Set(deck.map(c=>c.id)).size,78);const s={deck,cards:[],positions:['나','상대','흐름'],revealed:[]};assert.ok(draw(s,[1,1,2]).error);assert.ok(draw(s,[0,2,3]).error);assert.ok(draw(s,[1.2,2,3]).error);assert.equal(draw(s,[7,22,51]).cards[0].name,deck[6].name);assert.ok(draw(s,[1,2,3]).error);assert.ok(reveal(s,2).error);assert.equal(reveal(s,1).slot,1);reveal(s,1);assert.deepEqual(s.revealed,[1]);assert.ok(reveal(s,2).error);s.readingSlots=[1];assert.equal(reveal(s,2).slot,2);});

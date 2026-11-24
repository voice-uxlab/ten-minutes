import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendNote,noteContext,recordFlow,finishNotes} from './conversation-notes.mjs';
test('delayed user transcription retains the flow at speech start, separate from internal and demo events',()=>{
 const s={question:'연락을 기다려도 될까?',positions:['마음','관계','대응'],plan:{id:'relationship',name:'관계 탐색',count:3},revealed:[],picks:[],notes:[]};
 const atSpeechStart=noteContext(s);
 recordFlow(s,'review_question');recordFlow(s,'confirm_question');
 appendNote(s,'user','답장이 없어서 답답해',atSpeechStart);
 assert.equal(s.notes.at(-1).stage,'listening');assert.equal(s.notes.at(-1).kind,'user');
 s.positions[0]='다른 자리';assert.equal(s.notes.at(-1).spread.positions[0],'마음');
 recordFlow(s,'show_reading',{slots:[1,3]});appendNote(s,'assistant','두 카드를 연결해볼게');
 assert.deepEqual(s.notes.at(-1).focusSlots,[1,3]);
 recordFlow(s,'show_reading',{slot:0});finishNotes(s);
 assert.deepEqual(s.notes.slice(-2).map(n=>n.stage),['summary','ended']);
 assert.ok(s.notes.every((n,i)=>n.sequence===i+1));
 const demo={...s,demo:true,notes:[]};appendNote(demo,'example','시범 질문',undefined,'demo');
 assert.equal(demo.notes[0].kind,'example');assert.equal(demo.notes[0].source,'demo');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SpeechPlayer,displaySpeech} from './speech.mjs';
function setup(sampleRate=24000){
 const played=[],sent=[],errors=[];
 const context={currentTime:0,destination:{},createBuffer(_,length,rate){const samples=new Float32Array(length);return {duration:length/rate,getChannelData:()=>samples}},createBufferSource(){return {connect(){},disconnect(){},start(at){this.at=at;played.push(this)},stop(){this.stopped=true}}}};
 const socket={send(raw){sent.push(JSON.parse(raw))},close(){this.closed=true}};
 const player=new SpeechPlayer(context,{socketFactory:()=>socket,onError:e=>errors.push(e.message)});
 const connected=player.connect('ws://test/speech');
 const receive=data=>socket.onmessage({data:JSON.stringify(data)});
 receive({type:'ready',sampleRate});
 const audio=(id,bytes)=>receive({type:'audio',id,audio:Buffer.from(bytes).toString('base64')});
 return {player,socket,sent,errors,played,receive,audio,connected};
}
test('sends complete words incrementally without changing Korean text, flushes tail',async t=>{
 const s=setup();t.after(()=>s.player.close());await s.connected;
 s.player.append('안');assert.equal(s.sent.length,0);
 s.player.append('녕 공');s.player.append('주야');s.player.append('',true);
 assert.deepEqual(s.sent.map(x=>[x.text,x.flush]),[['안녕 ',false],['공주야 ',true]]);
});
test('plays split PCM before completion, cancellation drops late audio and allows new response',t=>{
 const s=setup();t.after(()=>s.player.close());s.player.append('첫 답변 ',true);
 s.audio('speech-1',[0]);s.audio('speech-1',[64,0,192]);
 assert.deepEqual([...s.played[0].buffer.getChannelData(0)],[.5,-.5]);
 s.player.cancel();assert.equal(s.played[0].stopped,true);
 s.audio('speech-1',[0,64]);s.player.append('새 답변 ',true);s.audio('speech-2',[0,64]);
 s.receive({type:'done',id:'speech-2'});assert.equal(s.played.length,2);
 s.played[1].onended();assert.equal(s.player.busy,false);assert.deepEqual(s.errors,[]);
});
test('out of order contexts play in order, errors stop queued audio and close connection',t=>{
 const s=setup();t.after(()=>s.player.close());s.player.append('첫째 ',true);s.player.append('둘째 ',true);
 s.audio('speech-2',[0,192]);s.receive({type:'done',id:'speech-2'});assert.equal(s.played.length,0);
 s.audio('speech-1',[0,64]);s.receive({type:'done',id:'speech-1'});
 assert.deepEqual(s.played.map(x=>x.buffer.getChannelData(0)[0]),[.5,-.5]);
 assert.ok(s.played[1].at>s.played[0].at);
 s.receive({type:'error',message:'연결 실패'});assert.equal(s.player.busy,false);assert.equal(s.socket.closed,true);assert.deepEqual(s.errors,['연결 실패']);
});


test('a short sentence triggers synthesis before response end and keeps its context',t=>{
 const s=setup();t.after(()=>s.player.close());
 s.player.append('공주, ');s.player.append('그랬구나.');
 assert.equal(s.sent.at(-1).generate,true);assert.equal(s.sent.at(-1).flush,false);
 s.audio('speech-1',[0,64]);assert.equal(s.played.length,1);
 s.player.append(' 네 얘기 더 해봐.');s.player.append('',true);
 assert.ok(s.sent.every(x=>x.id==='speech-1'));
 assert.equal(s.sent.at(-1).flush,true);
});


test('acting tags stay out of captions including partial streamed tags',()=>{
 assert.equal(displaySpeech('[conf'),'');
 assert.equal(displaySpeech('[confident] 공주, [warm'),'공주, ');
 assert.equal(displaySpeech('[confident] 공주, [warmly] 괜찮아.'),'공주,  괜찮아.');
});

test('Typecast PCM plays at the negotiated 32kHz rate',t=>{
 const s=setup(32000);t.after(()=>s.player.close());
 s.player.append('테스트 ',true);s.audio('speech-1',[0,64,0,192]);
 assert.equal(s.played[0].buffer.duration,2/32000);
});

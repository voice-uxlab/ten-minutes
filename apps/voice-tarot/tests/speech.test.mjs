import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SpeechPlayer,displaySpeech} from '../src/features/consultation/speech.ts';
function setup(sampleRate=24000,options={}){
 const played=[],sent=[],errors=[];
 const context={currentTime:0,destination:{},createBuffer(_,length,rate){const samples=new Float32Array(length);return {duration:length/rate,getChannelData:()=>samples}},createBufferSource(){return {connect(){},disconnect(){},start(at){this.at=at;played.push(this)},stop(){this.stopped=true}}}};
 const socket={send(raw){sent.push(JSON.parse(raw))},close(){this.closed=true}};
 const player=new SpeechPlayer(context,{socketFactory:()=>socket,onError:e=>errors.push(e.message),...options});
 const connected=player.connect('ws://test/speech');
 const receive=data=>socket.onmessage({data:JSON.stringify(data)});
 if (!options.streamSegment) receive({type:'ready',sampleRate});
 const audio=(id,bytes)=>receive({type:'audio',id,audio:Buffer.from(bytes).toString('base64')});
 return {player,context,socket,sent,errors,played,receive,audio,connected};
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

test('playback notification waits for scheduled audio time and cancel clears future notifications',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let starts=0;
 const s=setup(24000,{onPlaybackStart:()=>starts++});t.after(()=>s.player.close());
 s.player.append('첫 문장.',true);s.audio('speech-1',new Uint8Array(48000));s.receive({type:'done',id:'speech-1'});
 s.player.append('다음 문장.',true);s.audio('speech-2',[0,64]);s.receive({type:'done',id:'speech-2'});
 assert.equal(starts,0);
 s.context.currentTime=.025;t.mock.timers.tick(25);assert.equal(starts,1);
 s.player.cancel();s.context.currentTime=2;t.mock.timers.tick(2000);assert.equal(starts,1);
});

test("FastAPI audio handles a split WAV header, plays before EOF and cancels old segments", async (t) => {
  const streams = [];
  const s = setup(32000, {
    streamSegment: async (text, responseId, index, signal) =>
      new Response(new ReadableStream({
        start(stream) {
          streams.push({ text, responseId, index, signal, stream });
          signal.addEventListener("abort", () => stream.error(signal.reason), { once: true });
        },
      })),
  });
  t.after(() => s.player.close());
  await s.connected;
  const nextTurn = () => new Promise((resolve) => setImmediate(resolve));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(32000, 24);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);

  s.player.append("첫 문장이야.", true, "response-1");
  s.player.append("대기 중인 문장이야.", true, "response-1");
  const first = streams[0];
  assert.equal(first.index, 0);
  first.stream.enqueue(header.subarray(0, 20));
  first.stream.enqueue(Buffer.concat([header.subarray(20), Buffer.from([0, 64])]));
  await nextTurn();
  assert.equal(s.played[0].buffer.duration, 1 / 32000);
  assert.equal(s.played[0].buffer.getChannelData(0)[0], .5);
  s.player.cancel();
  assert.equal(first.signal.aborted, true);
  assert.equal(s.played[0].stopped, true);
  s.player.append("새 답변이야.", true, "response-2");
  await nextTurn();
  assert.deepEqual(streams.map(({ text, responseId, index }) => [text, responseId, index]), [
    ["첫 문장이야.", "response-1", 0],
    ["새 답변이야.", "response-2", 0],
  ]);
  streams[1].stream.enqueue(Buffer.concat([header, Buffer.from([0, 64])]));
  streams[1].stream.close();
  await nextTurn();
  assert.equal(s.played.length, 2);
  assert.deepEqual(s.errors, []);
});

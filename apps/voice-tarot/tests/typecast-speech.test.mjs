import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {bridgeTypecast,TypecastPCM} from '../server/typecast-speech.ts';
function wav(){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(0xffffffff,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(32000,24);h.writeUInt32LE(64000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(0xffffffff,40);return h;}
const settle=()=>new Promise(r=>setImmediate(r));
function setup(request){const client=new EventEmitter(),received=[];Object.assign(client,{readyState:1,bufferedAmount:0,send:raw=>received.push(JSON.parse(raw)),close(){this.emit('close')}});bridgeTypecast(client,{key:'private-key',voice:'tc_test',model:'ssfm-v30'},{request});return {client,received,send:d=>client.emit('message',Buffer.from(JSON.stringify(d)))};}
test('WAV parser handles split headers and refuses wrong rate or truncated PCM',()=>{const p=new TypecastPCM();assert.equal(p.push(wav().subarray(0,13)).length,0);assert.deepEqual([...p.push(Buffer.concat([wav().subarray(13),Buffer.from([0,64])]))],[0,64]);p.finish();const bad=wav();bad.writeUInt32LE(24000,24);assert.throws(()=>new TypecastPCM().push(bad));const truncated=new TypecastPCM();truncated.push(Buffer.concat([wav(),Buffer.from([0])]));assert.throws(()=>truncated.finish());});
test('starts at sentence boundary and forwards PCM before HTTP completes, strips tags and preserves smart emotion context',async t=>{
 const requests=[],streams=[];const s=setup(async(url,options)=>{requests.push({url,...options,body:JSON.parse(options.body)});return new Response(new ReadableStream({start(c){streams.push(c)}}));});t.after(()=>s.client.close());
 s.send({type:'text',id:'speech-1',text:'[confident] 공주, ',flush:false});assert.equal(requests.length,0);
 s.send({type:'text',id:'speech-1',text:'네 얘기 해봐. ',generate:true,flush:false});await settle();
 assert.equal(requests[0].headers['X-API-KEY'],'private-key');assert.equal(requests[0].body.text,'공주, 네 얘기 해봐.');
 streams[0].enqueue(wav().subarray(0,20));streams[0].enqueue(Buffer.concat([wav().subarray(20),Buffer.from([0,64])]));await settle();
 assert.equal(s.received[0].sampleRate,32000);assert.equal(s.received.at(-1).type,'audio');assert.ok(!s.received.some(x=>x.type==='done'));
 s.send({type:'text',id:'speech-1',text:'괜찮아. ',flush:true});streams[0].close();await settle();
 assert.equal(requests.length,2);assert.equal(requests[0].body.prompt.emotion_type,'smart');assert.equal(requests[1].body.prompt.emotion_type,'smart');assert.match(requests[1].body.prompt.previous_text,/네 얘기/);assert.equal(requests[1].body.output.audio_tempo,1.3);
 streams[1].enqueue(Buffer.concat([wav(),Buffer.from([0,64])]));streams[1].close();await settle();assert.equal(s.received.at(-1).type,'done');assert.ok(!JSON.stringify(s.received).includes('private-key'));
});
test('interruption aborts HTTP, discards queued speech and ignores late audio',async t=>{
 let stream,signal;const s=setup(async(_,options)=>{signal=options.signal;return new Response(new ReadableStream({start(c){stream=c}}));});t.after(()=>s.client.close());
 s.send({type:'text',id:'speech-1',text:'예전 답변.',generate:true,flush:false});await settle();
 s.send({type:'text',id:'speech-1',text:'읽으면 안 돼.',flush:true});s.send({type:'cancel',id:'speech-1'});assert.equal(signal.aborted,true);
 stream.enqueue(Buffer.concat([wav(),Buffer.from([0,64])]));await settle();assert.deepEqual(s.received.map(x=>x.type),['ready']);
});
test('provider errors surface without forwarding secrets',async t=>{const s=setup(async()=>new Response('private-key',{status:401}));t.after(()=>s.client.close());s.send({type:'text',id:'speech-1',text:'안녕.',flush:true});await settle();assert.equal(s.received.at(-1).type,'error');assert.match(s.received.at(-1).message,/401/);assert.ok(!JSON.stringify(s.received).includes('private-key'));});

test('a multi-sentence reading can queue more than four contexts without losing speech',async t=>{
 const streams=[],requests=[];
 const s=setup(async(_,options)=>{requests.push(JSON.parse(options.body));return new Response(new ReadableStream({start(c){streams.push(c)}}));});
 t.after(()=>s.client.close());
 for(let i=1;i<=6;i++)s.send({type:'text',id:`speech-${i}`,text:`카드 설명 ${i}.`,flush:true});
 await settle();
 for(let i=0;i<6;i++){
  assert.equal(requests[i].text,`카드 설명 ${i+1}.`);
  streams[i].enqueue(Buffer.concat([wav(),Buffer.from([0,64]) ]));streams[i].close();await settle();
 }
 assert.equal(s.received.filter(x=>x.type==='done').length,6);
 assert.ok(!s.received.some(x=>x.type==='error'));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once,EventEmitter} from 'node:events';
import WebSocket from 'ws';
import {attachSpeechSocket} from './speech-socket.mjs';

for(const model of ['eleven_flash_v2_5','eleven_v4_turbo'])test(`${model}: proxy authentication, streaming, interruption and completion`,async t=>{
 const dialogue=model==='eleven_v4_turbo';
 const saved={...process.env};process.env.ELEVENLABS_API_KEY='secret-test';process.env.ELEVENLABS_VOICE_ID='voice-test';process.env.ELEVENLABS_MODEL=model;
 const messages=[];let target,options;
 const upstream=new EventEmitter();Object.assign(upstream,{readyState:WebSocket.CONNECTING,bufferedAmount:0,send(raw){messages.push(JSON.parse(raw))},close(){this.readyState=WebSocket.CLOSED;this.emit('close')},terminate(){this.close()}});
 const server=createServer();attachSpeechSocket(server,{connect:(url,opts)=>{target=url;options=opts;setImmediate(()=>{upstream.readyState=WebSocket.OPEN;upstream.emit('open')});return upstream}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const host=`127.0.0.1:${server.address().port}`;
 const client=new WebSocket(`ws://${host}/speech`,{origin:`http://${host}`});
 t.after(async()=>{client.terminate();await new Promise(r=>server.close(r));for(const k of ['ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID','ELEVENLABS_MODEL']){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}});
 const [ready]=await once(client,'message');assert.deepEqual(JSON.parse(ready),{type:'ready'});
 assert.equal(options.headers['xi-api-key'],'secret-test');assert.ok(target.includes(dialogue?'text-to-dialogue/multi-stream-input':'voice-test/multi-stream-input'));assert.match(target,/output_format=pcm_24000/);
 client.send(JSON.stringify({type:'text',id:'speech-1',text:'안녕. ',flush:false,generate:true}));
 await new Promise(r=>setTimeout(r,20));assert.equal(messages.at(-1).flush,true);assert.equal(messages.at(-1).close_context,undefined);
 if(dialogue){assert.deepEqual(messages[1],{context_id:'speech-1',voices:['voice-test']});assert.equal(messages.at(-1).inputs[0].voice_id,'voice-test');assert.equal(messages.at(-1).inputs[0].text,'안녕. ')}
 const received=once(client,'message');upstream.emit('message',JSON.stringify({contextId:'speech-1',audio:'AEA='}));assert.deepEqual(JSON.parse((await received)[0]),{type:'audio',id:'speech-1',audio:'AEA='});
 client.send(JSON.stringify({type:'cancel',id:'speech-1'}));await new Promise(r=>setTimeout(r,20));assert.deepEqual(messages.at(-1),{context_id:'speech-1',close_context:true});
 client.send(JSON.stringify({type:'text',id:'speech-2',text:'끝. ',flush:true}));await new Promise(r=>setTimeout(r,20));
 assert.deepEqual(messages.slice(-2),[dialogue?{context_id:'speech-2',inputs:[{voice_id:'voice-test',text:'끝. '}],flush:true}:{context_id:'speech-2',text:'끝. ',flush:true},{context_id:'speech-2',close_context:true}]);
 if(dialogue){upstream.emit('message',JSON.stringify({context_id:'speech-2',is_final_audio_for_turn:true}));}
 const done=once(client,'message');upstream.emit('message',JSON.stringify({contextId:'speech-2',isFinal:true}));assert.deepEqual(JSON.parse((await done)[0]),{type:'done',id:'speech-2'});
 const bad=new WebSocket(`ws://${host}/speech`,{origin:'https://foreign.example'});bad.on('error',()=>{});const [_,response]=await once(bad,'unexpected-response');assert.equal(response.statusCode,403);response.resume();bad.terminate();
 const closed=once(upstream,'close');client.close();await closed;assert.equal(upstream.readyState,WebSocket.CLOSED);
});

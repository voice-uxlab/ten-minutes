import {readFileSync} from 'node:fs';
const persona=readFileSync(new URL('../soul.md',import.meta.url),'utf8').trim();
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {handleLive,liveConfig} from '../server/live.ts';
test('Live uses separate Responses tools, keeps API key on server and validates requests',async()=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-private-value';
 const store={request:async()=>({state:{cards:[],question:'test'}})};let sent;
 const upstream=async(url,options)=>{sent={url,body:JSON.parse(options.body)};return Response.json({session:{id:'live-id',private:'not-forwarded'},transport:{type:'webrtc',sdp:'answer'},secret:'not-forwarded'});};
 const run=async(body)=>{let status,text;const res={writeHead:s=>{status=s;},end:t=>{text=t;}};await handleLive(Readable.from([JSON.stringify(body)]),res,'/live-session',store,{upstream});return {status,data:JSON.parse(text)};};
 try{assert.equal((await run({id:'id',history:[],sdp:'bad'})).status,400);assert.equal(sent,undefined);const result=await run({id:'id',history:[],sdp:'v=0\r\n'});assert.equal(result.status,201);assert.deepEqual(result.data,{session:{id:'live-id'},transport:{type:'webrtc',sdp:'answer'}});assert.equal(sent.url,'https://api.openai.com/v1/live/sessions');assert.equal(sent.body.session.delegation.type,'responses');assert.ok(sent.body.session.instructions.includes(persona));assert.ok(sent.body.session.delegation.responses.instructions.includes(persona));assert.equal(sent.body.session.delegation.responses.tools.length,8);assert.ok(!JSON.stringify(result.data).includes('test-private-value'));assert.equal(liveConfig({}).audio.output.voice,'marin');await run({id:'id',history:[],sdp:'v=0\r\n',voiceEngine:'live-noeul'});assert.equal(sent.body.session.audio.output.voice,'noeul');assert.match(sent.body.session.instructions,/2 times/);assert.equal((await run({id:'id',history:[],sdp:'v=0\r\n',voiceEngine:'live-noeul',speakingPace:9})).status,400);await run({id:'id',history:[],sdp:'v=0\r\n',voiceEngine:'live-noeul',speakingPace:1.5});assert.match(sent.body.session.instructions,/1\.5 times/);}finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('report requests explicitly ask for JSON in the input, not only instructions',async()=>{const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';try{let body,status,data;await handleLive(Readable.from([JSON.stringify({id:'id',history:[]})]),{writeHead:s=>status=s,end:t=>data=JSON.parse(t)},'/live-report',{request:async()=>({state:{cards:[],revealed:[]}})},{upstream:async(_,options)=>{body=JSON.parse(options.body);return Response.json({output:[{content:[{text:'{"summary":"요약"}'}]}]});}});assert.match(body.input,/json/i);assert.ok(body.instructions.includes(persona));assert.equal(status,200);assert.equal(data.report.summary,'요약');}finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}});

test('Live voice, delegated reasoning, and report all use the selected soul',async()=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test';
 try {
  for (const selected of ['test-friend', 'cool-unnie']) {
  const testSoul=readFileSync(new URL(`../personas/${selected}.md`,import.meta.url),'utf8').trim();
  const state={cards:[],revealed:[],personaId:selected};
  const config=liveConfig(state);
  for(const instructions of [config.instructions,config.delegation.responses.instructions]) {
   assert.ok(instructions.includes(testSoul));assert.ok(!instructions.includes('# 레나 퀸 — Soul'));
  }
  let sent;
  await handleLive(Readable.from([JSON.stringify({id:'id',history:[]})]),{writeHead(){},end(){}},'/live-report',{request:async()=>({state})},{upstream:async(_,options)=>{sent=JSON.parse(options.body);return Response.json({output:[{content:[{text:'{"summary":"요약"}'}]}]});}});
  assert.ok(sent.instructions.includes(testSoul));
  }
 } finally {if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});

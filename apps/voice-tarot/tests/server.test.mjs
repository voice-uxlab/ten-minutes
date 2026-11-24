import {readFileSync} from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const readingDirectory=await mkdtemp(join(tmpdir(),'tarot-http-'));
process.env.READING_STORE_DIR=readingDirectory;
const {server}=await import('../server/server.ts');

test('server keeps keys private, requests text-only Realtime, and requires TTS configuration', async t => {
  const saved = Object.fromEntries(['OPENAI_API_KEY','ELEVENLABS_API_KEY','ELEVENLABS_VOICE_ID','TTS_PROVIDER','TYPECAST_API_KEY','TYPECAST_VOICE_ID'].map(k => [k, process.env[k]]));
  process.env.TTS_PROVIDER='elevenlabs';
  Object.assign(process.env, {OPENAI_API_KEY:'test-openai', ELEVENLABS_API_KEY:'test-eleven', ELEVENLABS_VOICE_ID:'test-voice'});
  delete process.env.TYPECAST_API_KEY;
  t.after(async () => {
    for (const [key,value] of Object.entries(saved)) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(readingDirectory,{recursive:true,force:true});
  });
  const nativeFetch = globalThis.fetch;
  const calls = [];
  t.mock.method(globalThis,'fetch',async (url, options) => {
    if(String(url).startsWith('http://127.0.0.1:')) return nativeFetch(url,options);
    calls.push({url, ...options, body:JSON.parse(options.body)});
    if(String(url).includes('client_secrets')) return Response.json({value:'ephemeral-only'});
    return new Response(new Uint8Array([0,64,0,192]));
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=async body=>{const r=await fetch(base+'/reading',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,...await r.json()};};
  assert.equal((await fetch(base+'/reading',{method:'POST',headers:{Origin:'https://other.test'},body:'{}'})).status,403);
  assert.equal((await post({id:'../.env',action:'get'})).status,400);
  const created=await post({action:'create',masterId:'decision'});assert.equal(created.status,200);assert.ok(!('deck' in created.state));
  const id=created.id;
  await post({id,action:'review_question',args:{question:'A와 B를 비교해 줘',spreadId:'decision',choices:['A','B']}});
  await post({id,action:'confirm_question'});
  const partial=await post({id,action:'select_numbers',args:{picks:[7,22]}});assert.equal(partial.result.remaining,1);assert.equal(partial.state.cards.length,0);
  await post({id,action:'select_numbers',args:{picks:[78]}});
  const drawn=await post({id,action:'confirm_cards'});assert.equal(drawn.state.cards.length,3);
  for (const path of ['/spreads.mjs', '/card-knowledge.mjs', '/voice-lab', '/voice-settings']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  for (const path of ['/voice-settings', '/test-logs', '/test-recording', '/live-session', '/live-report']) {
    assert.equal((await fetch(base + path, { method: 'POST', body: '{}' })).status, 404);
  }
  assert.equal((await fetch(base + '/session', { method: 'POST' })).status, 503);
  assert.equal(calls.length, 0);
  Object.assign(process.env, {TYPECAST_API_KEY:'private-typecast',TYPECAST_VOICE_ID:'tc_test'});
  const session=await fetch(base+'/session',{method:'POST'});
  assert.equal(session.status,200);
  assert.deepEqual(await session.json(),{value:'ephemeral-only'});
  assert.deepEqual(calls[0].body.session.output_modalities,['text']);
  assert.ok(calls[0].body.session.instructions.includes(readFileSync(new URL('../soul.md',import.meta.url),'utf8').trim()));
  assert.ok(!JSON.stringify(calls).includes('private-typecast'));
  const variant=await post({action:'create',personaId:'test-friend'});
  assert.equal(variant.state.personaId,'test-friend');
  const variantSession=await fetch(base+'/session',{method:'POST',body:JSON.stringify({id:variant.id})});
  assert.equal(variantSession.status,200);
  const testSoul=readFileSync(new URL('../personas/test-friend.md',import.meta.url),'utf8').trim();
  assert.ok(calls.at(-1).body.session.instructions.includes(testSoul));
  assert.ok(!calls.at(-1).body.session.instructions.includes('# 레나 퀸 — Soul'));
  assert.equal((await post({action:'create',personaId:'../../.env'})).status,400);
  const restored=await post({id:variant.id,action:'get'});
  assert.equal(restored.state.personaId,'test-friend');

});

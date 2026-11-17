import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {TestLogStore} from '../server/test-logs.ts';
test('test logs persist both speakers, replayed batches dedupe, repeated tools are flagged and secrets are redacted',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'tarot-test-logs-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new TestLogStore(dir),id='a'.repeat(48),runId='a'.repeat(8)+'-'+ 'b'.repeat(4)+'-'+ 'c'.repeat(4)+'-'+ 'd'.repeat(4)+'-'+ 'e'.repeat(12);
 const events=[
  {seq:1,at:'2026-11-15T00:00:00Z',type:'transcript',data:{speaker:'user',text:'이직 고민이야'}},
  {seq:2,at:'2026-11-15T00:00:01Z',type:'transcript',data:{speaker:'assistant',text:'카드로 살펴보자'}},
  {seq:3,at:'2026-11-15T00:00:02Z',type:'tool.request',data:{name:'review_question',args:{question:'이직'}}},
  {seq:4,at:'2026-11-15T00:00:03Z',type:'tool.request',data:{name:'review_question',args:{question:'이직'}}},
  {seq:5,at:'2026-11-15T00:00:04Z',type:'error',data:{token:'private-token',message:'Bearer private-value',nested:{apiKey:'private-key'}}},
 ];
 const batch={id,runId,engine:'realtime',persona:'test-friend',events};
 await Promise.all([store.append(batch),store.append(batch)]);
 const name=`${id}-${runId}`;
 const md=await readFile(join(dir,name+'.md'),'utf8'),json=JSON.parse(await readFile(join(dir,name+'.json'),'utf8'));
 assert.equal(json.events.length,5);assert.match(md,/이직 고민이야/);assert.match(md,/카드로 살펴보자/);assert.match(md,/동일 도구/);assert.match(md,/REDACTED/);assert.ok(!md.includes('private-'));
 const restarted=new TestLogStore(dir);await restarted.append({...batch,events:[{seq:6,at:'2026-11-15T00:00:05Z',type:'speech.playback',data:{text:'카드로 살펴보자'}}]});
 assert.equal(JSON.parse(await readFile(join(dir,name+'.json'),'utf8')).events.length,6);
 assert.throws(()=>store.key('../../escape',runId));
});

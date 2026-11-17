import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {handleAuth} from './auth.mjs';
test('OAuth binds callback to browser and provider, consumes state, keeps tokens server-side',async t=>{
 const original={...process.env};Object.assign(process.env,{NAVER_CLIENT_ID:'client',NAVER_CLIENT_SECRET:'secret',APP_ORIGIN:'http://localhost:3000'});
 const server=createServer((req,res)=>handleAuth(req,res,new URL(req.url,'http://localhost')));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>{process.env=original;server.closeAllConnections();server.close();});
 const base=`http://127.0.0.1:${server.address().port}`,native=globalThis.fetch;let exchanges=0;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url).startsWith(base))return native(url,options);
  exchanges++;return String(url).includes('token')?Response.json({access_token:'private-token'}):Response.json({response:{id:'member1',nickname:'공주'}});
 });
 const start=await fetch(base+'/auth/naver',{redirect:'manual'});assert.equal(start.status,302);
 const state=new URL(start.headers.get('location')).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];
 const missing=await fetch(base+`/auth/naver/callback?state=${state}&code=code`,{redirect:'manual'});assert.match(missing.headers.get('location'),/invalid_state/);assert.equal(exchanges,0);
 const good=await fetch(base+`/auth/naver/callback?state=${state}&code=code`,{headers:{cookie},redirect:'manual'});assert.equal(good.headers.get('location'),'/');assert.equal(exchanges,2);
 const session=good.headers.getSetCookie().find(c=>c.startsWith('tarot_session=')).split(';')[0];assert.ok(!session.includes('private-token'));
 const me=await fetch(base+'/auth/me',{headers:{cookie:session}});assert.equal((await me.json()).user.nickname,'공주');
 const replay=await fetch(base+`/auth/naver/callback?state=${state}&code=code`,{headers:{cookie},redirect:'manual'});assert.match(replay.headers.get('location'),/invalid_state/);assert.equal(exchanges,2);
 const forged=await fetch(base+'/auth/me',{headers:{cookie:session+'x'}});assert.equal((await forged.json()).user,null);
});

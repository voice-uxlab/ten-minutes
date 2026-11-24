import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReadingStore} from './reading-store.mjs';
import {cards} from './cards.mjs';
import {JSDOM} from 'jsdom';
import {SpeechPlayer} from './speech.mjs';
import {screens,preview,renderCards,demoCards} from './ui.mjs';
const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
function dom(url='http://localhost:3000/'){
 const d=new JSDOM(html,{url});
 for(const key of ['window','document','localStorage','location','Image','navigator'])Object.defineProperty(globalThis,key,{value:d.window[key],configurable:true,writable:true});
 d.window.scrollTo=()=>{};return d;
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,20));
test('every designed application preview renders its intended screen without API or microphone',()=>{
 for(const [,title,key]of screens.filter(s=>s[2]!=='review')){
  const d=dom(`http://localhost:3000/?preview=${key}&embed=1`);
  assert.equal(preview(key),true,title);
  assert.equal(document.querySelectorAll('section.page:not([hidden])').length,1,title);
  assert.ok(document.body.classList.contains('embedded-preview'));
  if(key==='picking')assert.equal(document.querySelectorAll('#slots .card').length,0);
  if(key==='retry-numbers')assert.equal(document.querySelectorAll('#slots .card').length,2);
  d.window.close();
 }
});
test('card reveal and focus updates preserve unchanged card DOM and do not replay their entry animation',t=>{
 const d=dom();t.after(()=>{d.window.dispatchEvent(new d.window.Event('pagehide'));d.window.close();});
 renderCards('slots',demoCards.map(({number,position,slot})=>({number,position,slot})),[]);const backs=[...document.querySelector('#slots').children];
 renderCards('slots',demoCards,[]);assert.ok(backs.every((node,i)=>document.querySelector('#slots').children[i]===node),'confirming hidden cards must not recreate the same backs');
 renderCards('slots',demoCards,[1],1);
 assert.equal(document.querySelector('#slots').children[1],backs[1]);
 const first=document.querySelector('#slots').children[0];
 renderCards('slots',structuredClone(demoCards),[1],1);assert.equal(document.querySelector('#slots').children[0],first);
 renderCards('slots',demoCards,[1,2],2);assert.equal(document.querySelector('#slots').children[0],first);
 assert.equal(first.classList.contains('active'),false);
});
test('actual app supports question editing, partial choices, correction, confirmation, reveal, reading and saved report',async t=>{
 const d=dom(),$=id=>document.getElementById(id);t.after(()=>{d.window.dispatchEvent(new d.window.Event('pagehide'));d.window.close();});
 const dir=await mkdtemp(join(tmpdir(),'tarot-app-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=new ReadingStore(dir,()=>cards.map(c=>({...c,reversed:false})));
 t.mock.method(globalThis,'fetch',async (path,options)=>{if(path==='/auth/me')return Response.json({user:null});if(path==='/reading')return Response.json(await store.request(JSON.parse(options.body)));throw Error(`Unexpected request ${path}`);});
 localStorage.setItem('queen',JSON.stringify({nick:'검증',tickets:1,freeUsed:true}));
 await import('./app.js?demo-test');await flush();
 await $('demo').onclick();assert.equal($('callScreen').dataset.phase,'listening');
 await $('next').onclick();assert.equal($('callScreen').dataset.phase,'question');
 $('changeQuestion').click();$('questionInput').value='새로운 일을 시작해도 될까?';await $('editQuestion').onsubmit({preventDefault(){}});
 assert.equal($('question').textContent,'새로운 일을 시작해도 될까?');
 await $('confirmQuestion').onclick();assert.equal($('slots').children.length,0);
 await $('grid').children[6].onclick();await $('grid').children[21].onclick();
 assert.equal($('slots').children.length,2);assert.match($('callHeading').textContent,/1개/);
 await $('grid').children[50].onclick();assert.equal($('callScreen').dataset.phase,'confirm');
 assert.equal(document.querySelectorAll('#slots .back').length,3);
 await $('changeCards').onclick();assert.equal($('slots').children.length,0);
 for(const i of [6,21,50])await $('grid').children[i].onclick();
 await $('confirmCards').onclick();assert.equal($('callScreen').dataset.phase,'reveal');
 for(let i=1;i<=3;i++){await $('next').onclick();assert.equal(document.querySelectorAll('#slots .back').length,3-i);}
 for(let i=0;i<4;i++)await $('next').onclick();
 assert.equal($('callScreen').dataset.phase,'reading');
 await $('next').onclick();assert.equal($('endedScreen').hidden,false);
 $('viewReport').click();assert.equal($('reportScreen').hidden,false);
 const last=JSON.parse(localStorage.getItem('queen')).last;
 assert.equal(last.question,'새로운 일을 시작해도 될까?');assert.deepEqual(last.revealed,[1,2,3]);assert.equal(last.report.readings.length,3);
});
test('live tool events accumulate choices, reconnect keeps choices and does not charge twice',async t=>{
 const d=dom(),$=id=>document.getElementById(id);t.after(()=>{d.window.dispatchEvent(new d.window.Event('pagehide'));d.window.close();});
 let pc,charges=0;const readingRequests=[];
 class AudioMock{constructor(){this.destination={};this.currentTime=0;}resume(){}createAnalyser(){return {connect(){},disconnect(){},frequencyBinCount:1,getByteFrequencyData(){}};}}
 globalThis.AudioContext=AudioMock;
 Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}],getAudioTracks:()=>[{enabled:true}]})}});
 class PC{constructor(){pc=this;this.connectionState='connected';this.sent=[];this.dc={readyState:'open',send:event=>this.sent.push(JSON.parse(event)),close(){}};}addTrack(){}createDataChannel(){return this.dc;}async createOffer(){return {sdp:'offer'};}async setLocalDescription(o){this.localDescription=o;}async setRemoteDescription(){this.dc.onopen();}close(){}}
 globalThis.RTCPeerConnection=PC;
 t.mock.method(SpeechPlayer.prototype,'connect',async()=>{});
 t.mock.method(SpeechPlayer.prototype,'close',()=>{});
 const dir=await mkdtemp(join(tmpdir(),'tarot-live-'));t.after(()=>rm(dir,{recursive:true,force:true}));const store=new ReadingStore(dir,()=>cards.map(c=>({...c,reversed:false})));
 t.mock.method(globalThis,'fetch',async (path,options)=>{if(path==='/auth/me')return Response.json({user:null});if(path==='/reading'){const request=JSON.parse(options.body);readingRequests.push(request);return Response.json(await store.request(request));}if(path==='/session'){charges++;return Response.json({value:'test'});}if(String(path).startsWith('https://api.openai.com/'))return new Response('answer');throw Error(`Unexpected request ${path}`);});
 localStorage.setItem('queen',JSON.stringify({nick:'검증',tickets:2,freeUsed:true}));
 await import('./app.js?live-test');await flush();$('voiceConsent').checked=true;
 await $('call').onclick();const opening=pc.sent.find(e=>e.type==='conversation.item.create').item.content[0].text;assert.doesNotMatch(opening,/남은 이용권|10분|무료 5분|master/);assert.equal(JSON.parse(localStorage.getItem('queen')).tickets,1);
 let serial=0;
 async function tool(name,args){const id=`test-${++serial}`;pc.dc.onmessage({data:JSON.stringify({type:'response.created',response:{id}})});const message={type:'response.done',response:{id,status:'completed',output:[{type:'function_call',name,arguments:JSON.stringify(args),call_id:id}]}};pc.dc.onmessage({data:JSON.stringify(message)});await flush();return message;}
 await tool('review_question',{question:'오늘 할 일은?',spreadId:'situation'});
 pc.dc.onmessage({data:JSON.stringify({type:'response.created',response:{id:'touch-interrupt'}})});
 const before=pc.sent.filter(e=>e.type==='response.create').length;
 await $('confirmQuestion').onclick();assert.ok(pc.sent.some(e=>e.type==='response.cancel'));
 pc.dc.onmessage({data:JSON.stringify({type:'response.done',response:{id:'touch-interrupt',status:'cancelled',output:[]}})});await flush();
 assert.equal(pc.sent.filter(e=>e.type==='response.create').length,before+1,'a touch during an active response must resume immediately after cancellation');
 const requestStart=readingRequests.length,outputStart=pc.sent.filter(e=>e.item?.type==='function_call_output').length,respondStart=pc.sent.filter(e=>e.type==='response.create').length;
 const duplicate={type:'response.done',response:{id:'duplicate-response',status:'completed',output:[{type:'function_call',name:'select_numbers',arguments:'{"picks":[7,22]}',call_id:'duplicate-call'}]}};
 pc.dc.onmessage({data:JSON.stringify({type:'response.created',response:{id:'duplicate-response'}})});
 pc.dc.onmessage({data:JSON.stringify(duplicate)});pc.dc.onmessage({data:JSON.stringify(duplicate)});await flush();
 assert.equal(readingRequests.length-requestStart,1,'a replayed response must issue one mutation');
 assert.equal(pc.sent.filter(e=>e.item?.type==='function_call_output').length-outputStart,1);
 assert.equal(pc.sent.filter(e=>e.type==='response.create').length-respondStart,1);
 assert.equal($('slots').children.length,2);assert.match($('caption').textContent,/1개/);
 pc.dc.onmessage({data:JSON.stringify({type:'response.created',response:{id:'replayed-call'}})});
 pc.dc.onmessage({data:JSON.stringify({...duplicate,response:{...duplicate.response,id:'replayed-call'}})});await flush();
 assert.equal(readingRequests.length-requestStart,1,'call_id must be handled once even across response envelopes');
 assert.equal($('slots').children.length,2);
 pc.connectionState='disconnected';pc.onconnectionstatechange();assert.equal($('errorScreen').hidden,false);
 await $('retry').onclick();await flush();assert.equal(charges,2);assert.equal(JSON.parse(localStorage.getItem('queen')).tickets,1);
 assert.equal($('slots').children.length,2);
 await tool('select_numbers',{picks:[51]});await tool('confirm_cards',{});
 for(const slot of [1,2,3])await tool('reveal_card',{slot});
 await tool('show_reading',{slot:0});assert.equal($('callScreen').dataset.phase,'reading');
 await tool('request_clarifier',{slot:2,question:'이 상황에서 먼저 확인할 것은?'});
 assert.equal($('clarifierPanel').hidden,false);assert.equal(document.querySelectorAll('#slots .card').length,3);
 await $('confirmClarifier').onclick();assert.equal($('grid').children[6].disabled,true);
 await tool('select_numbers',{picks:[7]});assert.equal($('pickCount').textContent,'0 / 1');
 await tool('select_numbers',{picks:[63]});await tool('confirm_cards',{});await tool('reveal_card',{slot:4});
 await tool('show_reading',{slot:0});assert.equal(document.querySelectorAll('#slots .card').length,4);
 window.dispatchEvent(new window.Event('pagehide'));
 assert.deepEqual(JSON.parse(localStorage.getItem('queen')).last.revealed,[1,2,3,4]);
});

test('five-card comparison renders, reads in groups, saves policy and fits all cards into report',async t=>{
 const d=dom(),$=id=>document.getElementById(id);t.after(()=>{d.window.dispatchEvent(new d.window.Event('pagehide'));d.window.close();});
 const dir=await mkdtemp(join(tmpdir(),'tarot-five-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new ReadingStore(dir,()=>cards.map(c=>({...c,reversed:false})));
 t.mock.method(globalThis,'fetch',async(path,options)=>path==='/auth/me'?Response.json({user:null}):Response.json(await store.request(JSON.parse(options.body))));
 localStorage.setItem('queen',JSON.stringify({nick:'검증',masterId:'decision'}));
 await import('./app.js?five-test');await flush();await $('demo').onclick();await $('next').onclick();
 $('changeQuestion').click();$('questionInput').value='회사에 남을까, 이직할까?';await $('editQuestion').onsubmit({preventDefault(){}});
 assert.equal($('masterSelect'),null);assert.equal($('spreadSelect'),null);
 await $('confirmQuestion').onclick();assert.equal($('slots').children.length,0);
 // Rapid touches must accumulate rather than overwrite each other.
 await Promise.all([1,2,3,4].map(i=>$('grid').children[i].onclick()));
 assert.equal($('slots').children.length,4);assert.match($('pickCount').textContent,/4 \/ 5/);
 await $('grid').children[5].onclick();await $('confirmCards').onclick();
 for(let i=0;i<5;i++)await $('next').onclick();
 await $('next').onclick();assert.equal(document.querySelectorAll('#slots .active').length,2);
 for(let i=0;i<4;i++)await $('next').onclick();
 const last=JSON.parse(localStorage.getItem('queen')).last;
 assert.equal(last.cards.length,5);assert.equal(last.plan.id,'decision');assert.equal(last.masterId,'adaptive');assert.ok(last.readingId);
 assert.deepEqual(last.positions,['A의 기회','A의 부담','B의 기회','B의 부담','다음 행동']);
 $('viewReport').click();assert.equal($('reportCards').children.length,5);assert.match($('reportPlan').textContent,/5장/);assert.ok(last.notes.some(n=>n.kind==='user'&&n.text.includes('이직')));assert.ok(last.notes.some(n=>n.stage==='summary'));assert.equal(last.notes.at(-1).stage,'ended');assert.equal($('endedNotePanel').open,true);assert.match($('reportNotes').textContent,/카드 연결 해석/);
});

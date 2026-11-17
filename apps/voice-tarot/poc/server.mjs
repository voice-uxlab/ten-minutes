import {handleLive} from './live.mjs';
import {defaults,applyVoiceSettings} from './voice-settings.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { attachSpeechSocket } from './speech-socket.mjs';
import { cards } from './cards.mjs';
import { instructions } from './instructions.mjs';
import {voiceProtocol,actingInstructions} from './voice-protocol.mjs';
import {ttsConfig} from './tts-config.mjs';
export function shuffle() {
  const deck = cards.map(c => ({...c, reversed: Boolean(randomInt(2))}));
  for (let i=deck.length-1;i>0;i--) { const j=randomInt(i+1); [deck[i],deck[j]]=[deck[j],deck[i]]; }
  return deck;
}
import {tools,flowInstructions} from './tools.mjs';
import {handleAuth} from './auth.mjs';
import {ReadingStore} from './reading-store.mjs';
const readings=new ReadingStore(process.env.READING_STORE_DIR||new URL('./.reading-sessions/',import.meta.url).pathname,shuffle);
export const server=createServer(async(req,res)=>{
 const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try {
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  if(await handleAuth(req,res,url))return;
  if(req.method==='GET'&&path==='/voice-settings') {const tts=ttsConfig();return reply(200,{provider:tts.provider,keyConfigured:!!process.env.TYPECAST_API_KEY,settings:tts.settings||{...defaults,voice:process.env.TYPECAST_VOICE_ID||'',model:process.env.TYPECAST_MODEL||defaults.model}});}
  if(req.method==='POST') {
   if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`) return reply(403,{error:'허용되지 않은 요청입니다.'});
   if(await handleLive(req,res,path,readings))return;
   if(path==='/voice-settings') {
    if(!process.env.TYPECAST_API_KEY)return reply(503,{error:'서버 .env에 TYPECAST_API_KEY를 설정해 주세요.'});
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)return reply(413,{error:'설정이 너무 커요.'});}
    try{return reply(200,{settings:applyVoiceSettings(JSON.parse(raw)),provider:'typecast'});}catch(e){return reply(400,{error:e.message});}
   }
   if(path==='/reading') {
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)return reply(413,{error:'요청이 너무 커요.'});}
    let request;try{request=JSON.parse(raw);}catch{return reply(400,{error:'올바른 JSON이 필요해요.'});}
    if(!request||typeof request!=='object'||Array.isArray(request))return reply(400,{error:'요청 내용을 확인해 주세요.'});
    try{return reply(200,await readings.request(request));}catch(e){return reply(400,{error:e.message});}
   }
   if(path==='/session') {
    const tts=ttsConfig();if(tts.error)return reply(503,{error:tts.error});
    if(!process.env.OPENAI_API_KEY) return reply(503,{error:'OPENAI_API_KEY가 없어 시범 통화만 이용할 수 있어요.'});
    const upstream=await fetch('https://api.openai.com/v1/realtime/client_secrets',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({session:{type:'realtime',model:process.env.REALTIME_MODEL||'gpt-realtime-2.1',instructions:instructions+flowInstructions+(tts.provider==='elevenlabs'&&voiceProtocol(tts.model,'').dialogue?actingInstructions:''),tools,output_modalities:['text'],audio:{input:{turn_detection:{type:'semantic_vad',eagerness:'medium'},transcription:{model:'gpt-4o-mini-transcribe',language:'ko'}}}}})});
    if(!upstream.ok) return reply(502,{error:`음성 세션 발급 실패 (${upstream.status}). 서버의 키와 모델 권한을 확인해 주세요.`});
    const data=await upstream.json();return reply(200,{value:data.value});
   }
  }
  if(req.method==='GET'&&path==='/research'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(await readFile(new URL('./docs/research/tarot-reading-research.md',import.meta.url)));}
  // Production SPA assets are restricted to the build directory; never serve env/source files.
  if(process.env.SERVE_REACT==='1'&&req.method==='GET') {
   const asset=/^\/assets\/[a-zA-Z0-9_.-]+$/.test(path);
   const route=path==='/'||['/login','/onboarding','/tickets','/payments/result','/screens','/live-lab'].includes(path)||/^\/sessions\/[a-f0-9]{48}(?:\/report)?$/.test(path);
   if(asset||route){try{const file=asset?'.'+path:'./index.html';const data=await readFile(new URL(file,new URL('../dist/',import.meta.url)));const ext=file.split('.').at(-1);res.writeHead(200,{'Content-Type':({js:'text/javascript',css:'text/css',png:'image/png',html:'text/html; charset=utf-8'})[ext]||'application/octet-stream','Cache-Control':asset?'public, max-age=3600':'no-store'});return res.end(data);}catch{return reply(404,{error:'프론트엔드를 먼저 빌드해 주세요.'});}}
  }
  const files={'/screens':'screens.html','/screens.js':'screens.js','/ui.mjs':'ui.mjs','/selection.mjs':'selection.mjs','/spreads.mjs':'spreads.mjs','/conversation-notes.mjs':'conversation-notes.mjs','/voice-lab':'voice-lab.html','/voice-lab.js':'voice-lab.js','/voice-lab.css':'voice-lab.css','/':'index.html','/app.js':'app.js','/style.css':'style.css','/state.mjs':'state.mjs','/speech.mjs':'speech.mjs'};
  if(req.method==='GET'&&/^\/assets\/[a-z0-9-]+\.png$/.test(path)){try{const data=await readFile(new URL('.'+path,import.meta.url));res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'});return res.end(data);}catch{return reply(404,{error:'Not found'});}}
  if(req.method==='GET'&&files[path]) {res.writeHead(200,{'Content-Type':path.endsWith('.css')?'text/css':path.endsWith('.js')||path.endsWith('.mjs')?'text/javascript':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(await readFile(new URL(files[path],import.meta.url)));}
  reply(404,{error:'Not found'});
 }catch {if(!res.headersSent)reply(500,{error:'요청을 처리하지 못했어요. 다시 시도해 주세요.'});else res.end();}
});
attachSpeechSocket(server);
if(process.argv[1]===new URL(import.meta.url).pathname)server.listen(process.env.PORT||3000,'127.0.0.1',()=>console.log('퀸의 타로 http://localhost:'+ (process.env.PORT||3000)));

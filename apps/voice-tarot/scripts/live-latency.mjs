// Synthetic greeting probe. Measures observed caption->Typecast PCM latency, not human turn latency.
import WebSocket from 'ws';
import {performance} from 'node:perf_hooks';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../src/features/consultation/live-bridge.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {LiveBridge}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
import {liveConfig} from '../server/live.mjs';
import {bridgeTypecast} from '../poc/typecast-speech.mjs';
import {ttsConfig} from '../poc/tts-config.mjs';
const config=ttsConfig();if(config.error||config.provider!=='typecast')throw Error(config.error||'TYPECAST provider required');
const output=new EventEmitter();output.readyState=1;output.bufferedAmount=0;output.close=()=>{};
let firstText,firstPCM,requestAt,feedTimer,finished=false,serial=0;
let bridge;
const finish=()=>{if(finished)return;finished=true;clearTimeout(timeout);bridge?.dispose();clearInterval(feedTimer);output.emit('close');if(ws.readyState===1)ws.send(JSON.stringify({type:'session.close'}));setTimeout(()=>ws.terminate(),1500).unref();};
output.send=raw=>{const e=JSON.parse(raw);if(e.type==='audio'&&!firstPCM){firstPCM=performance.now();console.log(JSON.stringify({caption_to_first_typecast_pcm_ms:Math.round(firstPCM-firstText),caption_buffer_ms:Math.round(requestAt-firstText),typecast_request_to_first_pcm_ms:Math.round(firstPCM-requestAt),scope:'production caption chunker; single synthetic greeting; excludes browser playback and user turn detection'}));finish();}else if(e.type==='error'){console.log(JSON.stringify({typecast_error:e.message}));process.exitCode=1;finish();}};
bridgeTypecast(output,config,{request:(...args)=>{requestAt ||= performance.now();return fetch(...args);}});
const ws=new WebSocket('wss://api.openai.com/v1/live/sessions',{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`}});
const timeout=setTimeout(()=>{console.log('No measurable audio within 35 seconds');process.exitCode=1;finish();},35000);
bridge=new LiveBridge({send:()=>{},append:(text)=>output.emit('message',JSON.stringify({type:'text',id:`speech-${++serial}`,text,flush:true})),cancel:()=>{},context:()=>null,transcript:()=>{},caption:()=>{},command:async()=>({}),error:message=>console.log(message),metric:()=>{}});
ws.on('open',()=>{const session=liveConfig({question:'',cards:[],revealed:[],picks:[]});session.instructions+='\n처음 연결되면 한국어로 자연스럽게 인사하고 오늘 무슨 일이 있었는지 물어봐.';session.audio.format={type:'audio/pcm',rate:24000};ws.send(JSON.stringify({type:'session.start',session}));});
ws.on('unexpected-response',(_,r)=>{console.log('Live HTTP status',r.statusCode);r.resume();process.exitCode=1;finish();});
ws.on('error',e=>{console.log('Live connection failed:',e.message);process.exitCode=1;finish();});
ws.on('message',raw=>{const e=JSON.parse(raw);if(e.type==='session.started'){console.log('Live session started');feedTimer=setInterval(()=>{if(ws.readyState===1)ws.send(JSON.stringify({type:'session.input_audio.append',audio:Buffer.alloc(960).toString('base64')}));},20);ws.send(JSON.stringify({type:'session.commentary.append',delegation_id:null,content:'공주야, 나 레나야. 오늘 무슨 일 있었어? 라고 자연스럽게 인사해.'}));}
 if(e.type==='error'){console.log(JSON.stringify({live_error:e.error?.code,message:e.error?.message}));process.exitCode=1;finish();}
 if(e.type==='session.output_transcript.delta'&&!finished){firstText ||= performance.now();bridge.event(e);}
 if(e.type==='session.closed'){ws.close();}
});

import {typecastOptions} from './voice-settings.mjs';
import WebSocket from 'ws';

// Typecast's WAV stream uses a 44-byte header and 32 kHz mono PCM16.
// Accumulate the header: HTTP chunk boundaries need not align with WAV fields.
export class TypecastPCM {
 constructor(){this.header=Buffer.alloc(0);this.bytes=0;this.ready=false;}
 push(value){
  let chunk=Buffer.from(value);
  if(!this.ready){
   const n=Math.min(44-this.header.length,chunk.length);
   this.header=Buffer.concat([this.header,chunk.subarray(0,n)]);chunk=chunk.subarray(n);
   if(this.header.length<44)return Buffer.alloc(0);
   const h=this.header;
   if(h.toString('ascii',0,4)!=='RIFF'||h.toString('ascii',8,12)!=='WAVE'||h.toString('ascii',12,16)!=='fmt '||h.readUInt32LE(16)!==16||h.readUInt16LE(20)!==1||h.readUInt16LE(22)!==1||h.readUInt32LE(24)!==32000||h.readUInt16LE(34)!==16||h.toString('ascii',36,40)!=='data')throw Error('타입캐스트 오디오 형식이 예상한 32kHz PCM WAV와 달라요.');
   this.ready=true;
  }
  this.bytes+=chunk.length;return chunk;
 }
 finish(){if(!this.ready||!this.bytes||this.bytes%2)throw Error('타입캐스트 음성이 비어 있거나 중간에 끊겼어요.');}
}

export function bridgeTypecast(client,config,{request=fetch}={}){
 const contexts=new Map();let queue=[],active=null,pumping=false,closed=false;
 const send=data=>{if(!closed&&client.readyState===WebSocket.OPEN)client.send(JSON.stringify(data));};
 const cleanup=()=>{closed=true;active?.controller.abort();queue=[];contexts.clear();};
 const fail=error=>{if(closed)return;send({type:'error',message:error.message});cleanup();client.close(1011,'Speech failed');};
 const complete=context=>{if(context.final&&!context.jobs&&contexts.get(context.id)===context){send({type:'done',id:context.id});contexts.delete(context.id);}};
 async function pump(){
  if(pumping||closed)return;pumping=true;
  try{while(queue.length&&!closed){
   const job=queue.shift(),context=job.context;
   if(contexts.get(context.id)!==context)continue;
   const controller=new AbortController();active={controller,context};
   const timeout=setTimeout(()=>controller.abort(),30000);
   try{
    const response=await request('https://api.typecast.ai/v1/text-to-speech/stream',{
     method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-API-KEY':config.key},
     body:JSON.stringify({voice_id:config.voice,model:config.model,language:'kor',text:job.text,
      ...typecastOptions({model:config.model,...(config.model==='ssfm-v21'?{mode:'preset'}:{}),...config.settings},job.previous)})
    });
    if(!response.ok){await response.body?.cancel();throw Error(`타입캐스트 합성 실패 (${response.status}). API 키·보이스의 모델 지원·크레딧을 확인해 주세요.`);}
    if(!response.body)throw Error('타입캐스트 음성 스트림이 없어요.');
    const pcm=new TypecastPCM();
    for await(const chunk of response.body){
     if(closed||contexts.get(context.id)!==context)break;
     if(client.bufferedAmount>4*1024*1024)throw Error('음성 수신이 지연되고 있어요. 다시 전화해 주세요.');
     const bytes=pcm.push(chunk);if(bytes.length)send({type:'audio',id:context.id,audio:bytes.toString('base64')});
    }
    if(!closed&&contexts.get(context.id)===context){pcm.finish();context.jobs--;complete(context);}
   }catch(error){if(!closed&&contexts.get(context.id)===context)fail(controller.signal.aborted?Error('타입캐스트 음성 응답 시간이 초과됐어요.'):error);}
   finally{clearTimeout(timeout);active=null;}
  }}finally{pumping=false;}
 }
 function enqueue(context,text){
  text=text.replace(/\[[^\]]*\]/g,'').trim();if(!text)return;
  // API accepts at most 2,000 characters per request; normal sentence chunks are much shorter.
  while(text.length){let n=Math.min(text.length,1900);if(n<text.length){const space=text.lastIndexOf(' ',n);if(space>0)n=space;}
   const part=text.slice(0,n).trim();text=text.slice(n).trimStart();if(!part)continue;
   queue.push({context,text:part,previous:context.previous});context.previous=(context.previous+' '+part).slice(-2000);context.jobs++;
  }
 }
 client.on('message',raw=>{try{
  const data=JSON.parse(raw.toString());
  if(typeof data.id!=='string'||!/^speech-\d+$/.test(data.id))throw Error('잘못된 음성 요청이에요.');
  if(data.type==='cancel'){
   const context=contexts.get(data.id);contexts.delete(data.id);queue=queue.filter(job=>job.context!==context);
   if(context&&active?.context===context)active.controller.abort();return;
  }
  if(data.type!=='text'||typeof data.text!=='string'||data.text.length>4000||typeof data.flush!=='boolean'||(data.generate!==undefined&&typeof data.generate!=='boolean'))throw Error('잘못된 음성 요청이에요.');
  let context=contexts.get(data.id);
  if(!context){if(contexts.size>=64)throw Error('음성 요청이 너무 많이 쌓였어요.');context={id:data.id,pending:'',previous:'',length:0,jobs:0,final:false};contexts.set(data.id,context);}
  context.length+=data.text.length;
  if(context.final||context.length>20000||queue.length>64)throw Error('음성 요청이 너무 길어요.');
  context.pending+=data.text;
  if(data.generate||data.flush||context.pending.length>=180){enqueue(context,context.pending);context.pending='';}
  context.final=data.flush;complete(context);void pump();
 }catch(error){fail(error);}});
 client.on('close',cleanup);client.on('error',cleanup);
 send({type:'ready',sampleRate:32000});
}

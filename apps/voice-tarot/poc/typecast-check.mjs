import {TypecastPCM} from './typecast-speech.mjs';
const key=process.env.TYPECAST_API_KEY;
try{
 if(!key)throw Error('.env에 TYPECAST_API_KEY를 넣어 주세요. 키를 채팅에 붙이지 않아도 됩니다.');
 if(process.argv[2]==='voices'){
  const response=await fetch('https://api.typecast.ai/v3/voices',{headers:{'X-API-KEY':key},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`보이스 목록 조회 실패 (${response.status})`);
  const voices=await response.json(),query=process.argv[3]||'혜민';
  if(!Array.isArray(voices))throw Error('보이스 목록 응답 형식이 예상과 달라요.');
  const found=voices.filter(v=>JSON.stringify(v.voice_name||'').toLowerCase().includes(query.toLowerCase()));
  console.log(JSON.stringify(found.map(v=>({voice_id:v.voice_id,name:v.voice_name,models:v.models,preview_url:v.preview_url})),null,2));
  if(!found.length)console.log('일치하는 API 보이스가 없어요. Studio의 보이스가 API에도 제공되는지 확인해 주세요.');
 }else{
  const voice=process.env.TYPECAST_VOICE_ID,model=process.env.TYPECAST_MODEL||'ssfm-v30';
  if(!voice)throw Error('먼저 npm run typecast:voices로 API 보이스 ID를 확인하고 TYPECAST_VOICE_ID에 넣어 주세요.');
  console.log('짧은 대사를 합성합니다. 타입캐스트 크레딧이 사용됩니다.');
  const start=performance.now();let first=null;const pcm=new TypecastPCM();
  const response=await fetch('https://api.typecast.ai/v1/text-to-speech/stream',{method:'POST',signal:AbortSignal.timeout(30000),headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({voice_id:voice,model,language:'kor',text:'공주, 굳이 네가 기다려줄 이유가 있어? 네가 아까운 건 너도 알잖아.',prompt:model==='ssfm-v21'?{emotion_preset:'normal',emotion_intensity:1}:{emotion_type:'smart'},output:{audio_format:'wav',audio_tempo:1.1,audio_pitch:0}})});
  if(!response.ok){
   const detail=await response.json().catch(()=>({}));
   const code=typeof detail.error_code==='string'&&/^[A-Z0-9_]{1,100}$/.test(detail.error_code)?detail.error_code:'UNKNOWN';
   throw Error(`음성 합성 실패 (${response.status}, ${code}). ${code==='UNUSUAL_ACTIVITY_DETECTED'?'타입캐스트가 비정상 활동 감지로 요청을 차단했어요. 고객지원에 오류 코드를 전달해 확인해 주세요.':'보이스의 지원 모델과 키·크레딧을 확인해 주세요.'}`);
  }
  for await(const chunk of response.body){if(pcm.push(chunk).length&&first===null)first=Math.round(performance.now()-start);}
  pcm.finish();console.log({voice,model,firstPcmMs:first,pcmBytes:pcm.bytes,audioSeconds:pcm.bytes/64000});
 }
}catch(error){console.error(error.message);process.exitCode=1;}

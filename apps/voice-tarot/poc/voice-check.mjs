// Explicit diagnostic only: generates a short phrase and consumes TTS credits.
import WebSocket from 'ws';
import {voiceProtocol} from './voice-protocol.mjs';

const key=process.env.ELEVENLABS_API_KEY, voice=process.env.ELEVENLABS_VOICE_ID;
const model=process.env.ELEVENLABS_MODEL||'eleven_flash_v2_5';
function checkSocket(){
 return new Promise((resolve,reject)=>{
  const protocol=voiceProtocol(model,voice);
  const socket=new WebSocket(protocol.url,{headers:{'xi-api-key':key},handshakeTimeout:10000});
  let finished=false;
  const finish=(error,bytes)=>{if(finished)return;finished=true;clearTimeout(timer);socket.terminate();if(error)reject(error);else resolve(bytes)};
  const timer=setTimeout(()=>finish(Error('음성 데이터 수신 시간 초과')),15000);
  socket.on('open',()=>{
   socket.send(JSON.stringify(protocol.init('check')));
   socket.send(JSON.stringify(protocol.text('check','연결 확인. ',true)));
   socket.send(JSON.stringify({context_id:'check',close_context:true}));
  });
  socket.on('message',raw=>{
   try{
    const data=JSON.parse(raw);
    if(data.error||data.detail){const error=Error('ElevenLabs WebSocket 요청 거절');error.code=data.error;finish(error);return}
    if(data.audio){const bytes=Buffer.from(data.audio,'base64').length;if(bytes)finish(null,bytes)}
   }catch{finish(Error('음성 응답 형식 오류'))}
  });
  socket.on('error',()=>finish(Error('WebSocket 연결 실패')));
  socket.on('close',()=>finish(Error('음성 수신 전에 연결이 종료됐어요.')));
 });
}
try{
 if(!key||!voice)throw Error('.env의 ELEVENLABS_API_KEY와 ELEVENLABS_VOICE_ID를 확인해 주세요.');
 console.log(`보이스 확인: ${voice} (짧은 테스트 합성으로 크레딧 사용)`);
 let bytes;
 try{bytes=await checkSocket()}catch(error){
  if(error.code!=='voice_id_does_not_exist')throw error;
  console.log('WebSocket에서 보이스를 찾지 못해 HTTP 합성을 한 번 확인합니다.');
  const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=pcm_24000`,{method:'POST',signal:AbortSignal.timeout(30000),headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({text:'연결 확인.',model_id:voiceProtocol(model,voice).dialogue?'eleven_flash_v2_5':model,language_code:'ko'})});
  if(!response.ok){await response.body?.cancel();throw Error(`HTTP 합성 실패 (${response.status}). 보이스 추가 여부·구독·키 권한을 확인해 주세요.`)}
  if(!(await response.arrayBuffer()).byteLength)throw Error('HTTP에서 빈 음성이 반환됐어요.');
  bytes=await checkSocket();
 }
 console.log(`WebSocket 음성 수신 성공: ${bytes} bytes. 통화를 새로 연결해 주세요.`);
}catch(error){console.error(error.message);process.exitCode=1}

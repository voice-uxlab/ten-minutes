export function voiceProtocol(model, voice) {
 const dialogue=/^eleven_v[34]/.test(model);
 const query=new URLSearchParams({model_id:model,language_code:'ko',output_format:'pcm_24000'});
 if(!dialogue)query.set('inactivity_timeout','180');
 return {
  dialogue,
  url:`wss://api.elevenlabs.io/v1/${dialogue?'text-to-dialogue':`text-to-speech/${encodeURIComponent(voice)}`}/multi-stream-input?${query}`,
  init:context_id=>dialogue?{context_id,voices:[voice]}:{context_id,text:' ',generation_config:{chunk_length_schedule:[50,80,120,160]}},
  keepAlive:context_id=>dialogue?{context_id,keep_alive:true}:{context_id,text:''},
  text:(context_id,text,flush)=>dialogue?{context_id,inputs:text.trim()?[{voice_id:voice,text}]:[],flush}:{context_id,text,flush}
 };
}
export const actingInstructions=`
[음성 연기]
친한 언니와 전화하듯 자연스러운 구어체로 말한다. 자신감 있지만 소리치거나 과장하지 않는다.
공감은 부드럽게, 조언은 단호하게. 광고나 내레이션처럼 매 문장을 강조하지 않는다.
음성으로 읽을 답변에만 필요할 때 [confident], [warmly], [thoughtful] 중 하나를 문장 앞에 붙인다.
태그는 한 답변에 최대 2개, 꼭 필요하지 않으면 생략한다. 긴 연기 설명이나 다른 대괄호 지시는 출력하지 않는다.
함수 인자, JSON, 리포트에는 태그를 넣지 않는다. 첫 문장은 짧지만 완결된 자연스러운 문장으로 말한다.
`;

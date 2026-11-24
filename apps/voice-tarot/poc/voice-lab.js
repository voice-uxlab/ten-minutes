import {SpeechPlayer} from './speech.mjs';
const $=id=>document.getElementById(id);
let initial,player,context,run=0,keyReady=false;
function values(){return {voice:$('voice').value.trim(),model:$('model').value,mode:$('mode').value,emotion:$('emotion').value,intensity:+$('intensity').value,speed:+$('speed').value,pitch:+$('pitch').value,silence:$('silenceEnabled').checked?+$('silence').value:null,loudness:$('loudnessEnabled').checked?+$('loudness').value:null};}
function update(){
 const voice=$('voice').value.trim();let selected='';
 for(const button of document.querySelectorAll('[data-voice]')){const match=button.dataset.voice===voice;button.setAttribute('aria-pressed',String(match));if(match)selected=button.textContent;}
 $('voiceChoice').textContent=selected?`선택한 목소리: ${selected}`:voice?'직접 입력한 ID로 테스트해요.':'후보를 선택하거나 아래에 다른 ID를 직접 입력해 주세요.';
 const legacy=$('model').value==='ssfm-v21';$('mode').options[0].disabled=legacy;if(legacy)$('mode').value='preset';
 for(const option of $('emotion').options)option.disabled=legacy&&!['normal','happy','sad','angry'].includes(option.value);
 if($('emotion').selectedOptions[0].disabled)$('emotion').value='normal';
 $('emotions').disabled=$('mode').value==='smart';
 $('modeHelp').textContent=$('mode').value==='smart'?'대사와 앞 문장의 문맥으로 감정을 자동 결정해요. 감정·강도 고정은 적용되지 않아요.':'선택한 감정과 강도를 고정해서 읽어요.';
 for(const [id,unit]of [['speed','배'],['pitch',' 반음'],['intensity',''],['silence','ms'],['loudness',' LUFS']])$(id+'Value').textContent=$(id).value+unit;
 $('silence').disabled=!$('silenceEnabled').checked;$('loudness').disabled=!$('loudnessEnabled').checked;
}
function fill(s){for(const id of ['voice','model','mode','emotion','intensity','speed','pitch'])$(id).value=s[id];$('silenceEnabled').checked=s.silence!==null;$('silence').value=s.silence??150;$('loudnessEnabled').checked=s.loudness!==null;$('loudness').value=s.loudness??-23;update();}
function stop(){run++;player?.close();player=null;$('stop').disabled=true;$('play').disabled=!keyReady;}
$('lab').addEventListener('input',update);
$('stop').onclick=()=>{stop();$('status').textContent='재생을 중지했어요.';};
$('reset').onclick=()=>{fill({...initial,mode:'smart',emotion:'normal',intensity:1,speed:1.1,pitch:0,silence:null,loudness:null});$('status').textContent='기본 설정으로 돌아왔어요. 통화에 적용하려면 적용 버튼을 눌러 주세요.';};
for(const button of document.querySelectorAll('[data-sample]'))button.onclick=()=>{$('text').value=button.dataset.sample;};
for(const button of document.querySelectorAll('[data-voice]'))button.onclick=()=>{stop();$('voice').value=button.dataset.voice;update();$('status').textContent=`${button.textContent} 선택됨. ‘이 설정으로 들어보기’를 눌러 주세요.`;};
$('lab').onsubmit=async event=>{
 event.preventDefault();if(!$('lab').reportValidity()||!keyReady)return;stop();const token=run,start=performance.now();$('play').disabled=true;$('stop').disabled=false;$('status').textContent='음성을 만들고 있어요…';
 try{
 context??=new AudioContext();await context.resume();if(token!==run)return;
 player=new SpeechPlayer(context,{onFirstAudio:()=>{if(token===run)$('status').textContent=`재생 중 · 첫 음성 ${(performance.now()-start).toFixed(0)}ms (합성 준비부터 재생 예약까지)`;},onState:busy=>{if(!busy)queueMicrotask(()=>{if(token===run){$('status').textContent='재생 완료. 설정을 바꿔 다시 비교해 보세요.';stop();}});},onError:error=>{if(token===run){stop();$('status').textContent=error.message;}}});
 await player.connect(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/speech?settings=${encodeURIComponent(JSON.stringify(values()))}`);
 if(token===run)player.append($('text').value.trim(),true);
 }catch(error){if(token===run){stop();$('status').textContent=error.message;}}
};
$('apply').onclick=async()=>{
 if(!$('voice').reportValidity())return;$('apply').disabled=true;
 try{const response=await fetch('/voice-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values())});const result=await response.json();if(!response.ok)throw Error(result.error);$('applied').textContent=`적용됨: ${result.settings.voice} · ${result.settings.speed}배 · ${result.settings.mode==='smart'?'자동 감정':$('emotion').selectedOptions[0].textContent}. 진행 중 통화는 종료하고 다시 걸어 주세요.`;$('connection').textContent='실제 통화 제공자: 타입캐스트 · API 키 설정됨';}catch(error){$('applied').textContent=error.message;}finally{$('apply').disabled=false;}
};
window.addEventListener('pagehide',()=>{stop();void context?.close();});
try{const response=await fetch('/voice-settings');if(!response.ok)throw Error('서버를 재시작한 뒤 새로고침해 주세요.');const data=await response.json();initial=data.settings;fill(initial);keyReady=data.keyConfigured;$('connection').textContent=`실제 통화 제공자: ${data.provider} · ${keyReady?'타입캐스트 API 키 설정됨':'서버 .env에 TYPECAST_API_KEY가 필요해요'}`;$('play').disabled=!keyReady;$('apply').disabled=!keyReady;}catch(error){$('connection').textContent=error.message;$('play').disabled=true;$('apply').disabled=true;}

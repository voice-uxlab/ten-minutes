import {currentVoiceSettings} from './voice-settings.mjs';
export function ttsConfig(env=process.env) {
 const settings=currentVoiceSettings();
 const provider=settings?'typecast':env.TTS_PROVIDER||'elevenlabs';
 if(!['elevenlabs','typecast'].includes(provider))return {error:'TTS_PROVIDER는 elevenlabs 또는 typecast로 설정해 주세요.'};
 const prefix=provider==='typecast'?'TYPECAST':'ELEVENLABS';
 const key=env[`${prefix}_API_KEY`],voice=settings?.voice||env[`${prefix}_VOICE_ID`];
 return {provider,key,voice,settings,model:settings?.model||env[`${prefix}_MODEL`]||(provider==='typecast'?'ssfm-v30':'eleven_flash_v2_5'),error:!key||!voice?`${prefix}_API_KEY와 ${prefix}_VOICE_ID를 .env에 설정해 주세요.`:null};
}

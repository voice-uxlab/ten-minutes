import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateVoiceSettings,typecastOptions} from './voice-settings.mjs';
test('voice controls validate ranges and incompatible model combinations',()=>{
 const s=validateVoiceSettings({voice:'tc_test'});assert.equal(s.speed,1.2);
 for(const change of [{speed:3},{speed:'1.1'},{pitch:.5},{silence:1001},{loudness:1},{voice:'https://example.com'},{model:'unknown'},{model:'ssfm-v21',mode:'smart'}])assert.throws(()=>validateVoiceSettings({...s,...change}));
});
test('smart and preset controls translate to provider fields, disabled optional effects stay omitted',()=>{
 const s=validateVoiceSettings({voice:'tc_test'});assert.deepEqual(typecastOptions(s,'앞 문장'),{prompt:{emotion_type:'smart',previous_text:'앞 문장'},output:{audio_format:'wav',audio_tempo:1.2,audio_pitch:0}});
 const options=typecastOptions({...s,mode:'preset',emotion:'angry',intensity:.5,speed:1.2,pitch:-1,silence:150,loudness:-23});assert.equal(options.prompt.emotion_preset,'angry');assert.equal(options.prompt.emotion_intensity,.5);assert.equal(options.output.remove_silence_ms,150);assert.equal(options.output.target_lufs,-23);
});

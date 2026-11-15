export function displaySpeech(text:string):string;
export class SpeechPlayer {
 constructor(context:AudioContext,options?:{destination?:AudioNode;onState?:(busy:boolean)=>void;onError?:(error:Error)=>void;onFirstAudio?:()=>void;onPlaybackStart?:(text:string)=>void});
 busy:boolean;
 connect():Promise<void>;
 append(text:string,final?:boolean):void;
 cancel():void;
 close():void;
}

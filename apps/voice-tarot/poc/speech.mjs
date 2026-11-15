export function displaySpeech(text) {return text.replace(/\[[^\]]*\]/g,'').replace(/\[[^\]]*$/,'').replace(/^ +/,'');}

// One browser socket per call; independent contexts separate interrupted answers.
export class SpeechPlayer {
  constructor(context, {onState = () => {}, onError = () => {}, onFirstAudio = () => {}, destination = context.destination, socketFactory = url => new WebSocket(url)} = {}) {
    Object.assign(this, {context, destination, onState, onError, onFirstAudio, socketFactory});
    this.sources = new Set();
    this.turns = [];
    this.serial = 0;
    this.nextAt = 0;
    this.closed = false;
  }
  get busy() {return this.turns.length > 0 || this.sources.size > 0;}
  connect(url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/speech`) {
    this.socket = this.socketFactory(url);
    return new Promise((resolve, reject) => {
      this.rejectConnect = reject;
      this.connectTimer = setTimeout(() => this.fail('음성 연결 시간이 초과됐어요.'), 15000);
      this.socket.onmessage = event => {
        if(this.closed)return;
        try {
          const data = JSON.parse(event.data);
          if(data.type === 'ready') {this.sampleRate=data.sampleRate||24000;this.ready = true;clearTimeout(this.connectTimer);this.rejectConnect = null;resolve();return;}
          if(data.type === 'error') return this.fail(data.message);
          const turn = this.turns.find(t => t.id === data.id);
          if(!turn)return; // Ignore audio already in flight when the user interrupted.
          clearTimeout(turn.timeout);
          turn.timeout = setTimeout(() => this.fail('음성 응답이 지연되고 있어요. 다시 전화해 주세요.'), 30000);
          if(data.type === 'audio') turn.audio.push(Uint8Array.from(atob(data.audio), c => c.charCodeAt(0)));
          if(data.type === 'done') {turn.done = true;clearTimeout(turn.timeout);}
          this.drain();
        } catch {this.fail('음성 응답을 읽지 못했어요.');}
      };
      this.socket.onerror = () => this.fail('음성 연결에 실패했어요.');
      this.socket.onclose = () => {if(!this.closed)this.fail('음성 연결이 끊겼어요. 다시 전화해 주세요.');};
    });
  }
  send(data) {if(this.ready&&!this.closed)this.socket.send(JSON.stringify(data));}
  append(delta, flush = false) {
    if(this.closed || !this.ready || (!delta && !this.current))return;
    if(!this.current) {
      this.current = {id:`speech-${++this.serial}`, text:'', audio:[], remainder:new Uint8Array(0), first:true, done:false};
      this.turns.push(this.current);
      this.onState(true);
    }
    const turn = this.current;
    turn.text += delta;
    // Send complete words as they arrive; never invent spaces inside Korean words.
    const sentences = [...turn.text.matchAll(/[.!?。！？](?:[”’"'])?(?=\s|$)/g)];
    const lastSentence = sentences.at(-1);
    const sentenceEnd = lastSentence ? lastSentence.index + lastSentence[0].length : 0;
    const boundary = flush ? turn.text.length : Math.max(sentenceEnd, turn.text.lastIndexOf(' ') + 1);
    if(boundary || flush) {
      const text = turn.text.slice(0,boundary);
      turn.text = turn.text.slice(boundary);
      this.send({type:'text', id:turn.id, text:(flush || sentenceEnd === boundary) ? text.trimEnd()+' ' : text, flush, generate:!flush && sentenceEnd > 0});
      clearTimeout(turn.timeout);
      turn.timeout = setTimeout(() => this.fail('음성 응답이 지연되고 있어요. 다시 전화해 주세요.'), 30000);
    }
    if(flush)this.current = null;
  }
  drain() {
    // Later contexts may synthesize early, but their audio must play in text order.
    while(this.turns.length) {
      const turn = this.turns[0];
      for(const value of turn.audio.splice(0)) {
        const bytes = new Uint8Array(turn.remainder.length + value.length);
        bytes.set(turn.remainder);bytes.set(value,turn.remainder.length);
        const size = bytes.length - bytes.length % 2;
        turn.remainder = bytes.slice(size);
        if(!size)continue;
        const buffer = this.context.createBuffer(1,size/2,this.sampleRate||24000);
        const samples = buffer.getChannelData(0), view = new DataView(bytes.buffer);
        for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
        const source = this.context.createBufferSource();
        source.buffer=buffer;source.connect(this.destination);this.sources.add(source);
        source.onended=()=>{this.sources.delete(source);source.disconnect();if(!this.busy)this.onState(false);};
        const at=Math.max(this.context.currentTime+0.025,this.nextAt);
        source.start(at);this.nextAt=at+buffer.duration;
        if(turn.first){turn.first=false;this.onFirstAudio();}
      }
      if(!turn.done)break;
      if(turn.remainder.length || turn.first)return this.fail('생성된 음성이 없거나 중간에 끊겼어요.');
      this.turns.shift();
    }
    if(!this.busy)this.onState(false);
  }
  cancel() {
    for(const turn of this.turns){clearTimeout(turn.timeout);this.send({type:'cancel',id:turn.id});}
    this.turns=[];this.current=null;
    for(const source of this.sources){source.onended=null;source.stop();source.disconnect();}
    this.sources.clear();this.nextAt=0;this.onState(false);
  }
  close() {
    if(this.closed)return;
    this.cancel();this.closed=true;this.ready=false;clearTimeout(this.connectTimer);
    this.rejectConnect?.(Error('음성 연결이 취소됐어요.'));this.rejectConnect=null;
    this.socket?.close();
  }
  fail(message) {
    if(this.closed)return;
    const error=Error(message);
    this.rejectConnect?.(error);this.rejectConnect=null;
    this.close();this.onError(error);
  }
}

// Prime playback in the click gesture before the async session lookup (mobile Safari).
let prepared: AudioContext | undefined;
export function prepareAudio() {
  prepared ||= new AudioContext();
  void prepared.resume().catch(() => {});
}
export function takeAudio() {
  const context = prepared || new AudioContext();
  prepared = undefined;
  return context;
}
export function discardPreparedAudio() {
  void prepared?.close().catch(() => {});
  prepared = undefined;
}

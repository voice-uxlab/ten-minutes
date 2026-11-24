// Local energy detector cuts Typecast playback before delayed server captions arrive.
// This is a conservative speech heuristic; background noise can still trigger it.
export function watchMicrophone(
  context: AudioContext,
  stream: MediaStream,
  onChange: (active: boolean) => void,
) {
  const source = context.createMediaStreamSource(stream),
    analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let voiced = 0,
    quiet = 0,
    active = false;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(
      samples.reduce((n, x) => n + x * x, 0) / samples.length,
    );
    if (rms > 0.025) {
      voiced++;
      quiet = 0;
      if (!active && voiced >= 3) {
        active = true;
        onChange(true);
      }
    } else {
      voiced = 0;
      quiet++;
      if (active && quiet >= 8) {
        active = false;
        onChange(false);
      }
    }
  }, 20);
  return () => {
    clearInterval(timer);
    source.disconnect();
    analyser.disconnect();
  };
}

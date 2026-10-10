// Microphone → 16-bit PCM chunks (80 ms) for Gradium speech-to-text.
const WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('echoes-capture', Capture);
`;

const SUPPORTED = [8000, 16000, 22050, 24000, 44100, 48000];

export interface Mic {
  /** Gradium input_format matching the capture sample rate. */
  format: string;
  /** Live input level 0..1 for the UI. */
  level: () => number;
  stop: () => void;
}

export async function startMic(onChunk: (base64: string) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  // Use the device's native rate when Gradium supports it (Firefox can't resample mic input).
  let ctx = new AudioContext();
  if (!SUPPORTED.includes(ctx.sampleRate)) {
    await ctx.close();
    ctx = new AudioContext({ sampleRate: 24000 });
  }
  const rate = ctx.sampleRate;
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'echoes-capture');
  const chunk = Math.round(rate * 0.08);
  let pending = new Float32Array(0);
  let peak = 0;

  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const merged = new Float32Array(pending.length + e.data.length);
    merged.set(pending);
    merged.set(e.data, pending.length);
    pending = merged;
    while (pending.length >= chunk) {
      const frame = pending.subarray(0, chunk);
      pending = pending.slice(chunk);
      const pcm = new Int16Array(chunk);
      let max = 0;
      for (let i = 0; i < chunk; i++) {
        const s = Math.max(-1, Math.min(1, frame[i]));
        pcm[i] = s < 0 ? s * 32768 : s * 32767;
        max = Math.max(max, Math.abs(s));
      }
      peak = peak * 0.6 + max * 0.4;
      const bytes = new Uint8Array(pcm.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      onChunk(btoa(bin));
    }
  };
  source.connect(node);

  return {
    format: rate === 24000 ? 'pcm' : `pcm_${rate}`,
    level: () => Math.min(1, peak * 2.5),
    stop: () => {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

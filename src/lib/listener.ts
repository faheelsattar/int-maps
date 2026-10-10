// Microphone -> Gradium STT, with Gradium's semantic VAD deciding when the listener is done.
// The browser talks to Gradium directly using a short-lived, single-use token from our server.

const GRADIUM_ASR = 'wss://api.gradium.ai/api/speech/asr';
const RATE = 24000; // Gradium "pcm" input: 24 kHz, 16-bit signed little-endian, mono
const CHUNK = 1920; // 80 ms

const VAD_THRESHOLD = 0.5; // end of turn when the longest-horizon inactivity probability stays above this...
const VAD_STEPS = 3; // ...for this many consecutive 80 ms steps
const NO_SPEECH_MS = 7000;
const MAX_MS = 15000;

// Collects mic samples into 80 ms Int16 chunks off the main thread.
const WORKLET = `
class PcmChunker extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(${CHUNK}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      const v = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.n === ${CHUNK}) { this.port.postMessage(this.buf.buffer, [this.buf.buffer]); this.buf = new Int16Array(${CHUNK}); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('pcm-chunker', PcmChunker);
`;

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const clean = (t: string) => t.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();

export interface Listening {
  /** Resolves with the final transcript ('' if nothing was said). */
  result: Promise<string>;
  /** End the turn now and keep what was heard. */
  finish: () => void;
  /** Drop everything. */
  cancel: () => void;
}

export async function listen(opts: { onPartial?: (text: string) => void; language?: string } = {}): Promise<Listening> {
  const tokenRes = await fetch('/api/voice-token');
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.token) throw new Error(tokenData.error || 'Could not start voice input');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    throw new Error('Microphone access was blocked. Allow it in your browser to talk to Echoes.');
  }

  const ctx = new AudioContext({ sampleRate: RATE });
  const workletUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(workletUrl);
  URL.revokeObjectURL(workletUrl);
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'pcm-chunker');
  source.connect(node);

  const url = new URL(GRADIUM_ASR);
  url.searchParams.set('token', tokenData.token);
  const ws = new WebSocket(url);

  let transcript = '';
  let ready = false;
  let quietSteps = 0;
  let done = false;
  const pending: string[] = [];
  let resolve!: (t: string) => void;
  let reject!: (e: Error) => void;
  const result = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const stopMic = () => {
    node.port.onmessage = null;
    source.disconnect();
    node.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };

  // Stop the mic, let Gradium transcribe what's still buffered, then resolve.
  const finish = (keep = true) => {
    if (done) return;
    done = true;
    clearTimeout(noSpeech);
    clearTimeout(maxTimer);
    stopMic();
    if (!keep) {
      ws.close();
      resolve('');
      return;
    }
    const settle = () => {
      clearTimeout(grace);
      ws.close();
      resolve(clean(transcript));
    };
    const grace = setTimeout(settle, 1500);
    ws.addEventListener('close', settle);
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'end_of_stream' }));
    else settle();
  };

  const noSpeech = setTimeout(() => !transcript && finish(), NO_SPEECH_MS);
  const maxTimer = setTimeout(() => finish(), MAX_MS);

  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    const msg = JSON.stringify({ type: 'audio', audio: toBase64(e.data) });
    if (ready && ws.readyState === WebSocket.OPEN) ws.send(msg);
    else if (pending.length < 40) pending.push(msg); // keep ~3 s while the socket comes up
  };

  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        type: 'setup',
        model_name: 'default',
        input_format: 'pcm',
        json_config: { language: opts.language ?? 'en', delay_in_frames: 10 },
      }),
    );
  };

  ws.onmessage = (e) => {
    let msg: { type: string; text?: string; vad?: { inactivity_prob?: number }[]; message?: string };
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      ready = true;
      pending.splice(0).forEach((m) => ws.send(m));
    } else if (msg.type === 'text' && msg.text) {
      transcript = `${transcript} ${msg.text}`.replace(/\s+/g, ' ');
      opts.onPartial?.(clean(transcript));
    } else if (msg.type === 'step' && !done) {
      const p = msg.vad?.[msg.vad.length - 1]?.inactivity_prob ?? 0;
      quietSteps = p > VAD_THRESHOLD ? quietSteps + 1 : 0;
      if (quietSteps >= VAD_STEPS && transcript.trim()) finish();
    } else if (msg.type === 'end_of_stream') {
      ws.close();
    } else if (msg.type === 'error') {
      if (!done) {
        done = true;
        clearTimeout(noSpeech);
        clearTimeout(maxTimer);
        stopMic();
      }
      ws.close();
      reject(new Error(`Gradium: ${msg.message || 'speech recognition error'}`));
    }
  };

  ws.onerror = () => {
    if (done) return;
    done = true;
    clearTimeout(noSpeech);
    clearTimeout(maxTimer);
    stopMic();
    reject(new Error('Lost connection to Gradium speech recognition'));
  };

  return { result, finish: () => finish(true), cancel: () => finish(false) };
}

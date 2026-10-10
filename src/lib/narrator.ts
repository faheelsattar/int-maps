import type { TimedWord } from './align';

const SAMPLE_RATE = 48000; // Gradium "pcm" output: 48 kHz, 16-bit signed, mono
const PREROLL = 0.25; // seconds of buffer before the first chunk plays

export type NarratorState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

let sharedCtx: AudioContext | null = null;

/** Must be called from a user gesture at least once so browsers allow audio. */
export function unlockAudio() {
  if (!sharedCtx) sharedCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

/**
 * Streams Gradium TTS (NDJSON of base64 PCM + word timestamps) and plays it
 * gap-free through Web Audio as it arrives.
 */
export class Narrator {
  readonly analyser: AnalyserNode;
  words: TimedWord[] = [];
  state: NarratorState = 'idle';
  error = '';

  private ctx: AudioContext;
  private gain: GainNode;
  private sources: AudioBufferSourceNode[] = [];
  private startTime = 0;
  private nextTime = 0;
  private gaps = 0;
  private streamDone = false;
  private abort = new AbortController();
  private endTimer = 0;
  private listeners = new Set<() => void>();

  constructor() {
    this.ctx = unlockAudio();
    this.gain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.75;
    this.gain.connect(this.analyser).connect(this.ctx.destination);
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private set(state: NarratorState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }

  /** Seconds of audio actually heard so far. */
  get position() {
    if (!this.startTime) return 0;
    return Math.max(0, this.ctx.currentTime - this.startTime - this.gaps);
  }

  /** Duration of the audio received so far (the full length once the stream ends). */
  get duration() {
    return this.startTime ? this.nextTime - this.startTime - this.gaps : 0;
  }

  get complete() {
    return this.streamDone;
  }

  async play(paragraphs: string[], voiceId: string, speed = 0) {
    this.set('loading');
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    try {
      const res = await fetch('/api/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraphs, voiceId, speed }),
        signal: this.abort.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Narration failed (${res.status})`);
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) this.handle(JSON.parse(line));
        }
      }
      if (buf.trim()) this.handle(JSON.parse(buf));
      this.streamDone = true;
      this.scheduleEnd();
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      this.error = (err as Error).message;
      this.set('error');
    }
  }

  private handle(msg: { type: string; audio?: string; text?: string; start_s?: number; stop_s?: number; message?: string }) {
    if (msg.type === 'audio' && msg.audio) this.enqueue(msg.audio);
    else if (msg.type === 'text' && msg.text != null && msg.start_s != null) {
      this.words.push({ text: msg.text, start: msg.start_s, stop: msg.stop_s ?? msg.start_s });
    } else if (msg.type === 'error') throw new Error(msg.message || 'Gradium error');
  }

  private enqueue(b64: string) {
    const bin = atob(b64);
    const n = bin.length >> 1;
    if (!n) return;
    const buffer = this.ctx.createBuffer(1, n, SAMPLE_RATE);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      ch[i] = v / 0x8000;
    }
    const now = this.ctx.currentTime;
    if (!this.startTime) {
      this.startTime = this.nextTime = now + PREROLL;
    } else if (this.nextTime < now + 0.02) {
      // Network stalled: we fell behind, so shift everything and remember the gap.
      this.gaps += now + 0.05 - this.nextTime;
      this.nextTime = now + 0.05;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain);
    src.start(this.nextTime);
    this.nextTime += buffer.duration;
    this.sources.push(src);
    if (this.state === 'loading') this.set('playing');
  }

  private scheduleEnd() {
    clearTimeout(this.endTimer);
    if (this.state === 'paused' || this.state === 'error') return;
    const remaining = this.nextTime - this.ctx.currentTime;
    this.endTimer = window.setTimeout(() => {
      if (this.state === 'playing' || this.state === 'loading') this.set('ended');
    }, Math.max(0, remaining * 1000) + 150);
  }

  async pause() {
    if (this.state !== 'playing') return;
    clearTimeout(this.endTimer);
    await this.ctx.suspend();
    this.set('paused');
  }

  async resume() {
    if (this.state !== 'paused') return;
    await this.ctx.resume();
    this.set('playing');
    if (this.streamDone) this.scheduleEnd();
  }

  stop() {
    this.abort.abort();
    clearTimeout(this.endTimer);
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* not started */
      }
    });
    this.gain.disconnect();
    this.listeners.clear();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }
}

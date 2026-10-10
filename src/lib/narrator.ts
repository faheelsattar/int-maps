import type { TimedWord } from './align';
import { readNdjson } from './stream';

const SAMPLE_RATE = 48000; // Gradium "pcm" output: 48 kHz, 16-bit signed, mono
const PREROLL = 0.25; // seconds of buffer before the first chunk plays

export type NarratorState = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface GradiumMsg {
  type: string;
  audio?: string;
  text?: string;
  start_s?: number;
  stop_s?: number;
  message?: string;
}

/**
 * Gradium usually times single words, but sometimes a whole phrase arrives as one
 * segment. Split it into words, sharing the time span by character length.
 */
function splitSegment(text: string, start: number, stop: number): TimedWord[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [{ text, start, stop }];
  const total = parts.reduce((n, p) => n + p.length + 1, 0);
  const span = Math.max(0, stop - start);
  let t = start;
  return parts.map((p) => {
    const d = (span * (p.length + 1)) / total;
    const w = { text: p, start: t, stop: t + d };
    t += d;
    return w;
  });
}

let unlockCtx: AudioContext | null = null;

/** Call from a user gesture so the browser allows audio for the rest of the session. */
export function unlockAudio() {
  unlockCtx ??= new AudioContext();
  if (unlockCtx.state === 'suspended') void unlockCtx.resume();
}

/**
 * Plays Gradium audio (base64 PCM + word timestamps) gap-free as it arrives. Each
 * narrator owns its AudioContext so the story, intro and answers pause independently.
 * Feed it from any source: a live story stream, a replay, or an answer.
 */
export class Narrator {
  readonly analyser: AnalyserNode;
  words: TimedWord[] = [];
  state: NarratorState = 'loading';
  error = '';

  private ctx: AudioContext;
  private gain: GainNode;
  private sources: AudioBufferSourceNode[] = [];
  private startTime = 0;
  private nextTime = 0;
  private gaps = 0;
  private streamDone = false;
  private abortCtl = new AbortController();
  private endTimer = 0;
  private listeners = new Set<() => void>();
  private stopped = false;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    this.gain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.75;
    this.gain.connect(this.analyser).connect(this.ctx.destination);
  }

  get signal() {
    return this.abortCtl.signal;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private set(state: NarratorState) {
    if (this.state === state) return;
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

  /** Feed one Gradium message. */
  feed(msg: GradiumMsg) {
    if (this.stopped) return;
    if (msg.type === 'audio' && msg.audio) this.enqueue(msg.audio);
    else if (msg.type === 'text' && msg.text != null && msg.start_s != null) {
      this.words.push(...splitSegment(msg.text, msg.start_s, msg.stop_s ?? msg.start_s));
    } else if (msg.type === 'error') this.fail(msg.message || 'Narration failed');
  }

  /** No more audio is coming. */
  finish() {
    this.streamDone = true;
    this.scheduleEnd();
  }

  /** Report a failure; whatever audio already arrived keeps playing. */
  fail(message: string) {
    if (this.stopped) return;
    this.error = message;
    if (!this.startTime) {
      this.streamDone = true;
      this.set('error');
    } else this.finish();
  }

  /** Plays an NDJSON stream of Gradium messages (e.g. /api/narrate). */
  async playFrom(url: string, body: unknown) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: this.abortCtl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Narration failed (${res.status})`);
      await readNdjson(res, (m) => this.feed(m as unknown as GradiumMsg));
      this.finish();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') this.fail((err as Error).message);
    }
  }

  private enqueue(b64: string) {
    if (this.ctx.state === 'suspended' && this.state !== 'paused') void this.ctx.resume();
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
    if (this.streamDone) this.scheduleEnd();
  }

  private scheduleEnd() {
    clearTimeout(this.endTimer);
    if (this.state === 'paused' || this.state === 'error' || this.stopped) return;
    if (!this.startTime) return void this.set('ended');
    const remaining = this.nextTime - this.ctx.currentTime;
    this.endTimer = window.setTimeout(() => {
      if (this.state === 'playing' || this.state === 'loading') this.set('ended');
    }, Math.max(0, remaining * 1000) + 150);
  }

  async pause() {
    if (this.state !== 'playing' && this.state !== 'loading') return;
    clearTimeout(this.endTimer);
    this.set('paused');
    await this.ctx.suspend();
  }

  async resume() {
    if (this.state !== 'paused') return;
    await this.ctx.resume();
    this.set(this.startTime ? 'playing' : 'loading');
    if (this.streamDone) this.scheduleEnd();
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.abortCtl.abort();
    clearTimeout(this.endTimer);
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* not started */
      }
    });
    this.listeners.clear();
    void this.ctx.close().catch(() => {});
  }
}

/**
 * Synthesize a soft, authentic antique parchment page-turn rustle using Web Audio API.
 * Operates purely via Web Audio with no external asset dependencies.
 */
let audioCtx: AudioContext | null = null;

export function playPageTurnSound() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }

    const t = audioCtx.currentTime;
    const duration = 0.48;
    const bufferSize = Math.floor(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    // Natural parchment paper friction texture
    for (let i = 0; i < bufferSize; i++) {
      const p = i / bufferSize;
      const envelope = Math.sin(p * Math.PI) * (1 - p * 0.35);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    // Bandpass filter centered on paper rustle frequencies
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, t);
    filter.frequency.exponentialRampToValueAtTime(650, t + duration);
    filter.Q.value = 1.6;

    // Gain envelope
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.005, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noise.start(t);
  } catch {
    // Silently ignore if Web Audio is blocked prior to user interaction
  }
}

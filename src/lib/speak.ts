// Short spoken replies (acknowledgements, answers) in the narrator's voice via Gradium.
// They get their own AudioContext so they still play while the story is paused.
import { Narrator } from './narrator';

let ctx: AudioContext | null = null;
let current: { narrator: Narrator; done: () => void } | null = null;

/** Call from a user gesture (e.g. the mic tap) so the browser allows playback. */
export function unlockReplyAudio() {
  if (!ctx) ctx = new AudioContext({ sampleRate: 48000 });
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function stopSpeaking() {
  if (!current) return;
  const c = current;
  current = null;
  c.narrator.stop();
  c.done();
}

/** Speaks `text`; resolves when it finishes, fails, or is interrupted. */
export function speak(text: string, voiceId: string, speed = 0): Promise<void> {
  stopSpeaking();
  if (!text.trim()) return Promise.resolve();
  const narrator = new Narrator(unlockReplyAudio());
  return new Promise((resolve) => {
    const done = () => {
      unsub();
      if (current?.narrator === narrator) current = null;
      resolve();
    };
    const unsub = narrator.subscribe(() => {
      if (narrator.state === 'ended' || narrator.state === 'error') done();
    });
    current = { narrator, done };
    void narrator.play([text], voiceId, speed);
  });
}

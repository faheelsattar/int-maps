import { useCallback, useEffect, useRef, useState } from 'react';
import { sendCommand, type Command, type CommandContext } from './api';
import { listen, type Listening } from './listener';
import { speak, stopSpeaking, unlockReplyAudio } from './speak';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceControl {
  state: VoiceState;
  /** What the listener is saying / said. */
  heard: string;
  /** The last command and its spoken reply (with sources for answers). */
  last: Command | null;
  error: string;
  /** Tap the mic: start listening, or end the turn early if already listening. */
  toggle: () => void;
  cancel: () => void;
  dismiss: () => void;
}

interface Options {
  voiceId: string;
  speed: number;
  getContext: () => CommandContext;
  /** Runs the command (navigate, change settings...). Must not wait for long work like story generation. */
  execute: (cmd: Command) => void;
  /** Called before listening starts (e.g. pause the story). */
  onListen?: () => void;
  /** Called when the exchange is over; cmd is null if nothing usable was heard. */
  onDone?: (cmd: Command | null) => void;
}

/**
 * The voice loop: Gradium STT (with its turn detection) -> Gemini intent -> app action -> Gradium TTS reply.
 */
export function useVoice(opts: Options): VoiceControl {
  const [state, setState] = useState<VoiceState>('idle');
  const [heard, setHeard] = useState('');
  const [last, setLast] = useState<Command | null>(null);
  const [error, setError] = useState('');
  const session = useRef<{ listening: Listening | null; abort: AbortController; id: number } | null>(null);
  const counter = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const run = useCallback(async () => {
    const id = ++counter.current;
    const abort = new AbortController();
    session.current = { listening: null, abort, id };
    const live = () => session.current?.id === id && !abort.signal.aborted;

    unlockReplyAudio(); // we're inside the mic tap, so the browser allows audio
    stopSpeaking();
    optsRef.current.onListen?.();
    setError('');
    setHeard('');
    setLast(null);
    setState('listening');

    let cmd: Command | null = null;
    try {
      const listening = await listen({ onPartial: (t) => live() && setHeard(t) });
      if (!live()) return listening.cancel();
      session.current.listening = listening;
      const text = await listening.result;
      if (!live()) return;
      setHeard(text);
      if (!text) {
        setError("I didn't hear anything. Tap the mic and say a city.");
        return;
      }

      setState('thinking');
      cmd = await sendCommand(text, optsRef.current.getContext(), abort.signal);
      if (!live()) return;
      setLast(cmd);
      optsRef.current.execute(cmd);

      if (cmd.reply) {
        setState('speaking');
        await speak(cmd.reply, optsRef.current.voiceId, optsRef.current.speed);
      }
    } catch (e) {
      if (live() && (e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      if (session.current?.id === id) {
        session.current = null;
        setState('idle');
        optsRef.current.onDone?.(cmd);
      }
    }
  }, []);

  const cancel = useCallback(() => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    s.abort.abort();
    s.listening?.cancel();
    stopSpeaking();
    setState('idle');
    optsRef.current.onDone?.(null);
  }, []);

  const toggle = useCallback(() => {
    const s = session.current;
    if (s?.listening && state === 'listening') return s.listening.finish();
    if (s) cancel(); // thinking/speaking: interrupt and listen again
    void run();
  }, [cancel, run, state]);

  const dismiss = useCallback(() => {
    setLast(null);
    setError('');
    setHeard('');
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  return { state, heard, last, error, toggle, cancel, dismiss };
}

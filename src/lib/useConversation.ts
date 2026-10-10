import { useCallback, useEffect, useRef, useState } from 'react';
import { askQuestion, type Authority, type CommandContext, type Source, type Story } from './api';
import { speak, stopSpeaking, unlockReplyAudio } from './speak';

export interface Turn {
  id: number;
  q: string;
  a?: string;
  sources?: Source[];
  authority?: Authority;
  error?: string;
}

export interface Conversation {
  turns: Turn[];
  /** True while the historian is looking up an answer. Asking again while he speaks interrupts him. */
  busy: boolean;
  ask: (question: string) => void;
  /** Records a question already answered elsewhere (e.g. asked by voice). */
  record: (turn: Omit<Turn, 'id'>) => void;
}

interface Options {
  story: Story | null;
  voiceId: string;
  speed: number;
  getContext: () => CommandContext;
  /** Called before the answer (pause the story) and after it has been spoken (resume). */
  onStart?: () => void;
  onEnd?: () => void;
}

/** Questions to the historian about the current story, answered aloud in the narrator's voice. */
export function useConversation(opts: Options): Conversation {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);
  const current = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  // A new story starts a new conversation.
  useEffect(() => {
    current.current?.abort();
    setTurns([]);
    setBusy(false);
  }, [opts.story]);

  const record = useCallback((turn: Omit<Turn, 'id'>) => setTurns((t) => [...t, { ...turn, id: ++counter.current }]), []);

  const ask = useCallback((question: string) => {
    const q = question.trim();
    if (!q) return;
    unlockReplyAudio(); // inside the click, so the browser allows audio
    current.current?.abort();
    stopSpeaking();
    const ctrl = new AbortController();
    current.current = ctrl;
    const id = ++counter.current;
    const history = turnsRef.current.filter((t) => t.a).slice(-4).map((t) => ({ q: t.q, a: t.a! }));
    setTurns((t) => [...t, { id, q }]);
    setBusy(true);
    optsRef.current.onStart?.();

    void (async () => {
      try {
        const answer = await askQuestion(q, { ...optsRef.current.getContext(), history }, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, a: answer.reply, sources: answer.sources, authority: answer.authority } : x)));
        setBusy(false);
        await speak(answer.reply, optsRef.current.voiceId, optsRef.current.speed);
      } catch (e) {
        if ((e as Error).name === 'AbortError' || ctrl.signal.aborted) return;
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, error: (e as Error).message } : x)));
      } finally {
        if (current.current === ctrl) {
          current.current = null;
          setBusy(false);
          optsRef.current.onEnd?.();
        }
      }
    })();
  }, []);

  return { turns, busy, ask, record };
}

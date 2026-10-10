import { useEffect, useMemo, useRef, useState } from 'react';
import { Narrator, type NarratorState } from './narrator';
import { alignWords } from './align';

export interface Narration {
  state: NarratorState;
  error: string;
  activeWord: number; // index into the flattened display words, -1 before speech
  position: number;
  duration: number;
  narrator: Narrator | null;
  toggle: () => void;
  restart: () => void;
}

/** Plays `paragraphs` with Gradium as soon as they're set, and tracks the spoken word. */
export function useNarration(paragraphs: string[] | null, voiceId: string, speed: number): Narration {
  const [narrator, setNarrator] = useState<Narrator | null>(null);
  const [state, setState] = useState<NarratorState>('idle');
  const [activeWord, setActiveWord] = useState(-1);
  const [clock, setClock] = useState({ position: 0, duration: 0 });
  const [run, setRun] = useState(0);
  const displayWords = useMemo(() => (paragraphs ?? []).flatMap((p) => p.split(/\s+/).filter(Boolean)), [paragraphs]);
  const alignment = useRef<{ count: number; map: number[] }>({ count: 0, map: [] });

  useEffect(() => {
    if (!paragraphs?.length) return;
    const n = new Narrator();
    alignment.current = { count: 0, map: [] };
    setNarrator(n);
    setState('loading');
    setActiveWord(-1);
    const unsub = n.subscribe(() => setState(n.state));
    void n.play(paragraphs, voiceId, speed);

    let raf = 0;
    const tick = () => {
      const t = n.position;
      const words = n.words;
      if (words.length !== alignment.current.count) {
        alignment.current = { count: words.length, map: alignWords(displayWords, words) };
      }
      let k = -1;
      for (let i = 0; i < words.length && words[i].start <= t; i++) k = i;
      setActiveWord(k >= 0 ? alignment.current.map[k] : -1);
      const next = { position: Math.floor(t * 4) / 4, duration: Math.floor(n.duration * 4) / 4 };
      setClock((c) => (c.position === next.position && c.duration === next.duration ? c : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
      n.stop();
    };
  }, [paragraphs, voiceId, speed, run, displayWords]);

  return {
    state,
    error: narrator?.error ?? '',
    activeWord: state === 'ended' ? displayWords.length : activeWord,
    position: clock.position,
    duration: clock.duration,
    narrator,
    toggle: () => {
      if (!narrator) return;
      if (state === 'playing') void narrator.pause();
      else if (state === 'paused') void narrator.resume();
      else if (state === 'ended' || state === 'error') setRun((r) => r + 1);
    },
    restart: () => setRun((r) => r + 1),
  };
}

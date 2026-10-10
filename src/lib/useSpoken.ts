import { useEffect, useMemo, useRef, useState } from 'react';
import type { Narrator, NarratorState } from './narrator';
import { alignWords } from './align';

export interface Spoken {
  state: NarratorState;
  error: string;
  /** Index into the flattened display words; -1 before speech. */
  activeWord: number;
  position: number;
  duration: number;
}

/** Tracks which displayed word the narrator is saying, frame by frame. */
export function useSpoken(narrator: Narrator | null, paragraphs: string[]): Spoken {
  const [state, setState] = useState<NarratorState>('idle');
  const [activeWord, setActiveWord] = useState(-1);
  const [clock, setClock] = useState({ position: 0, duration: 0 });
  const displayWords = useMemo(() => paragraphs.flatMap((p) => p.split(/\s+/).filter(Boolean)), [paragraphs]);
  const display = useRef(displayWords);
  display.current = displayWords;

  useEffect(() => {
    setActiveWord(-1);
    setClock({ position: 0, duration: 0 });
    if (!narrator) {
      setState('idle');
      return;
    }
    setState(narrator.state);
    const unsub = narrator.subscribe(() => setState(narrator.state));
    let aligned = { words: -1, display: -1, map: [] as number[] };
    let raf = 0;
    const tick = () => {
      const words = narrator.words;
      const disp = display.current;
      if (words.length !== aligned.words || disp.length !== aligned.display) {
        aligned = { words: words.length, display: disp.length, map: alignWords(disp, words) };
      }
      // Light the word a touch early: it reads as "in sync" to the ear.
      const lead = narrator.position + 0.08;
      let k = -1;
      for (let i = 0; i < words.length && words[i].start <= lead; i++) k = i;
      setActiveWord(k >= 0 ? aligned.map[k] : -1);
      const next = { position: Math.floor(narrator.position * 4) / 4, duration: Math.floor(narrator.duration * 4) / 4 };
      setClock((c) => (c.position === next.position && c.duration === next.duration ? c : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [narrator]);

  return {
    state,
    error: narrator?.error ?? '',
    activeWord: state === 'ended' ? displayWords.length : activeWord,
    position: clock.position,
    duration: clock.duration,
  };
}

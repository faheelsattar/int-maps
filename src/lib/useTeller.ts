import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSaved, splitParagraphs, type NearbyEcho, type Story } from './api';
import { Narrator, type GradiumMsg } from './narrator';
import { readNdjson } from './stream';

export type Phase = 'idle' | 'research' | 'writing' | 'done' | 'error';

export interface Teller {
  story: Story | null;
  phase: Phase;
  error: string;
  /** Paragraphs to display: growing while Gemini writes, final afterwards. */
  paragraphs: string[];
  narrator: Narrator | null;
  /** Start a streamed story: /api/story, /api/journey or /api/retell. */
  start: (url: string, body: unknown) => void;
  /** Clear the old story and silence it immediately while a new one is being prepared. */
  prepare: () => void;
  load: (id: string) => Promise<Story | null>;
  replay: () => void;
  cancel: () => void;
}

/**
 * Drives one story at a time: research → streamed writing → streamed narration.
 * Text and audio arrive on the same NDJSON stream and are played as they come.
 */
export function useTeller(onDone?: (s: Story) => void): Teller {
  const [story, setStory] = useState<Story | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [liveText, setLiveText] = useState('');
  const [narrator, setNarrator] = useState<Narrator | null>(null);
  const run = useRef<{ abort: AbortController; narrator: Narrator | null; intro: Narrator | null; nearby?: NearbyEcho[] | null } | null>(null);
  const storyRef = useRef<Story | null>(null);
  storyRef.current = story;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const stopAll = useCallback(() => {
    const r = run.current;
    if (!r) return;
    r.abort.abort();
    r.narrator?.stop();
    r.intro?.stop();
    run.current = null;
  }, []);

  useEffect(() => stopAll, [stopAll]);

  const start = useCallback(
    (url: string, body: unknown) => {
      stopAll();
      const r = { abort: new AbortController(), narrator: null as Narrator | null, intro: null as Narrator | null, nearby: null as NearbyEcho[] | null };
      run.current = r;
      setStory(null);
      setNarrator(null);
      setLiveText('');
      setError('');
      setPhase('research');

      const handle = (m: Record<string, unknown>) => {
        if (run.current !== r) return;
        switch (m.type) {
          case 'intro':
            r.intro ??= new Narrator();
            r.intro.feed(m.msg as GradiumMsg);
            break;
          case 'story': {
            const s = m.story as Story;
            // Nearby suggestions often arrive before the story itself.
            setStory({ ...s, nearby: s.nearby?.length ? s.nearby : (r.nearby ?? []) });
            r.narrator = new Narrator();
            setNarrator(r.narrator);
            setPhase('writing');
            break;
          }
          case 'nearby':
            r.nearby = m.nearby as NearbyEcho[];
            setStory((prev) => (prev ? { ...prev, nearby: r.nearby! } : prev));
            break;
          case 'delta':
            setLiveText((t) => t + (m.text as string));
            break;
          case 'tts':
            r.narrator?.feed(m.msg as GradiumMsg);
            break;
          case 'written':
            setStory((prev) => (prev ? { ...prev, paragraphs: m.paragraphs as string[] } : prev));
            break;
          case 'done': {
            const s = m.story as Story;
            setStory(s);
            setPhase('done');
            r.narrator?.finish();
            try {
              history.replaceState(null, '', `?s=${encodeURIComponent(s.id)}`);
            } catch {
              /* ignore */
            }
            onDoneRef.current?.(s);
            break;
          }
          case 'error':
            if (m.audioOnly) r.narrator?.fail(m.message as string);
            else {
              r.narrator?.fail(m.message as string);
              setError(m.message as string);
              setPhase('error');
            }
            break;
        }
      };

      (async () => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: r.abort.signal,
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
          await readNdjson(res, handle);
          if (run.current === r) {
            r.intro?.finish();
            r.narrator?.finish();
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError' || run.current !== r) return;
          setError((err as Error).message);
          setPhase('error');
        }
      })();
    },
    [stopAll],
  );

  /** Replays the finished story (cached server-side, so it starts instantly). */
  const replay = useCallback(() => {
    const s = storyRef.current;
    if (!s?.paragraphs.length) return;
    run.current?.narrator?.stop();
    run.current?.intro?.stop();
    const n = new Narrator();
    run.current = { abort: new AbortController(), narrator: n, intro: null };
    setNarrator(n);
    void n.playFrom('/api/narrate', { paragraphs: s.paragraphs, voiceId: s.voice.id, speed: s.speed, kind: s.kind });
  }, []);

  /** Opens a saved/shared story; playback starts when the user presses play. */
  const load = useCallback(
    async (id: string) => {
      stopAll();
      setNarrator(null);
      setError('');
      setPhase('research');
      try {
        const s = await fetchSaved(id);
        setStory(s);
        setPhase('done');
        return s;
      } catch (err) {
        setError((err as Error).message);
        setPhase('error');
        return null;
      }
    },
    [stopAll],
  );

  const prepare = useCallback(() => {
    stopAll();
    setStory(null);
    setNarrator(null);
    setError('');
    setPhase('research');
  }, [stopAll]);

  const cancel = useCallback(() => {
    stopAll();
    setStory(null);
    setNarrator(null);
    setLiveText('');
    setPhase('idle');
    setError('');
    try {
      history.replaceState(null, '', location.pathname);
    } catch {
      /* ignore */
    }
  }, [stopAll]);

  const paragraphs = phase === 'writing' && !story?.paragraphs?.length ? splitParagraphs(liveText) : (story?.paragraphs ?? []);

  return { story, phase, error, paragraphs, narrator, start, prepare, load, replay, cancel };
}

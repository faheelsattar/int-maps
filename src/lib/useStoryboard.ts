import { useEffect, useMemo, useState } from 'react';
import { fetchShot, type Story } from './api';

/**
 * Paints a story's shots as soon as it arrives. All are requested at once, in story order (the server paints
 * a few at a time, first come first served); each URL appears once its image has loaded. Null while painting.
 */
export function useStoryboard(story: Story | null): (string | null)[] {
  const [board, setBoard] = useState<{ story: Story; urls: (string | null)[] } | null>(null);

  useEffect(() => {
    if (!story?.shots?.length) return;
    const ctrl = new AbortController();
    setBoard({ story, urls: story.shots.map(() => null) });
    story.shots.forEach((shot, i) =>
      fetchShot(story, shot, ctrl.signal)
        .then(
          (url) =>
            new Promise<string>((ok, fail) => {
              const img = new Image();
              img.onload = () => ok(url);
              img.onerror = fail;
              img.src = url;
            }),
        )
        .then((url) => !ctrl.signal.aborted && setBoard((b) => (b?.story === story ? { story, urls: b.urls.map((u, k) => (k === i ? url : u)) } : b)))
        .catch(() => {}), // that shot stays unpainted; the previous one keeps playing
    );
    return () => ctrl.abort();
  }, [story]);

  return board?.story === story ? board.urls : [];
}

/** Where the narration is: the paragraph being read and the shot that covers it. */
export function useReading(story: Story, activeWord: number) {
  const starts = useMemo(() => {
    let n = 0;
    return story.paragraphs.map((p) => {
      const at = n;
      n += p.split(/\s+/).filter(Boolean).length;
      return at;
    });
  }, [story]);
  const paragraph = Math.max(0, starts.filter((s) => s <= activeWord).length - 1);
  const shot = Math.max(0, (story.shots ?? []).filter((s) => s.from <= paragraph).length - 1);
  return { paragraph, shot };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Story } from './api';

export interface Scene {
  image?: string;
  video?: string;
  imageError?: string;
  videoError?: string;
}

export interface Scenes {
  scenes: Scene[];
  status: 'idle' | 'working' | 'done' | 'error';
  error: string;
  video: boolean;
  start: () => void;
}

/**
 * Generates one Nano Banana keyframe per paragraph, then Omni Flash clips,
 * streamed in as they finish. Results are cached per story.
 */
export function useScenes(story: Story | null): Scenes {
  const cache = useRef(new Map<Story, { scenes: Scene[]; status: Scenes['status']; video: boolean }>());
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), [story]);

  const start = useCallback(() => {
    if (!story) return;
    const existing = cache.current.get(story);
    if (existing && existing.status !== 'error') return;
    const entry = { scenes: story.paragraphs.map(() => ({}) as Scene), status: 'working' as Scenes['status'], video: true, error: '' };
    cache.current.set(story, entry);
    rerender();

    const ctrl = new AbortController();
    abort.current = ctrl;
    (async () => {
      const res = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: story.title, date: story.date, year: story.year, place: story.place, artStyle: story.artStyle, scenes: story.scenes }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `Scene request failed (${res.status})`);
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
          if (!line) continue;
          const msg = JSON.parse(line);
          const sc = entry.scenes[msg.index];
          if (msg.type === 'start') entry.video = msg.video;
          else if (msg.type === 'image' && sc) sc.image = msg.src;
          else if (msg.type === 'video' && sc) sc.video = msg.src;
          else if (msg.type === 'error' && sc) sc[msg.kind === 'video' ? 'videoError' : 'imageError'] = msg.message;
          entry.scenes = [...entry.scenes];
          rerender();
        }
      }
      entry.status = entry.scenes.every((s) => s.imageError) ? 'error' : 'done';
      rerender();
    })().catch((err) => {
      if ((err as Error).name === 'AbortError') {
        cache.current.delete(story);
        return;
      }
      entry.status = 'error';
      entry.error = (err as Error).message;
      rerender();
    });
  }, [story]);

  const entry = story ? cache.current.get(story) : undefined;
  return {
    scenes: entry?.scenes ?? [],
    status: entry?.status ?? 'idle',
    error: (entry as { error?: string } | undefined)?.error ?? '',
    video: entry?.video ?? true,
    start,
  };
}

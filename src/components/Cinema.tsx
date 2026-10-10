import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatYear, type Story } from '../lib/api';
import type { Narration } from '../lib/useNarration';
import type { Scene, Scenes } from '../lib/useScenes';
import type { Voice } from '../lib/voices';

interface Props {
  story: Story;
  scenes: Scenes;
  narration: Narration;
  voice: Voice;
  onClose: () => void;
}

/** Full-screen "animated story": keyframes/clips synced to the narration, with live subtitles. */
export function Cinema({ story, scenes, narration, voice, onClose }: Props) {
  const [begun, setBegun] = useState(false);
  const { activeWord, state } = narration;
  const paused = state === 'paused';

  // Kick off generation, hold the narration until the opening scene is painted.
  useEffect(() => {
    scenes.start();
    void narration.narrator?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstReady = !!scenes.scenes[0]?.image || !!scenes.scenes[0]?.imageError || scenes.status === 'error';
  useEffect(() => {
    if (begun) return;
    const go = () => {
      setBegun(true);
      narration.restart();
    };
    if (firstReady) return go();
    const t = setTimeout(go, 45000); // never keep the audience waiting forever
    return () => clearTimeout(t);
  }, [firstReady, begun]); // eslint-disable-line react-hooks/exhaustive-deps

  // Word index → paragraph → sentence, for scene switching and subtitles.
  const layout = useMemo(() => {
    let offset = 0;
    return story.paragraphs.map((p) => {
      const words = p.split(/\s+/).filter(Boolean);
      const start = offset;
      offset += words.length;
      const sentences: { start: number; words: string[] }[] = [];
      let cur: string[] = [];
      let curStart = start;
      words.forEach((w, i) => {
        cur.push(w);
        if (/[.!?]["”’)]?$/.test(w) || i === words.length - 1) {
          sentences.push({ start: curStart, words: cur });
          curStart = start + i + 1;
          cur = [];
        }
      });
      return { start, end: offset, sentences };
    });
  }, [story]);

  const word = begun ? Math.max(0, activeWord) : -1;
  const para = Math.max(0, layout.findIndex((l) => word < l.end) === -1 ? layout.length - 1 : layout.findIndex((l) => word < l.end));
  const sentence = begun && activeWord >= 0 ? layout[para]?.sentences.find((s) => word < s.start + s.words.length) : undefined;

  // Show this paragraph's scene, or the closest one already painted.
  const shownIndex = pickScene(scenes.scenes, para);
  const shown = shownIndex >= 0 ? scenes.scenes[shownIndex] : undefined;
  const ended = begun && state === 'ended';
  const showTitle = !begun || narration.position < 4.5;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-50 overflow-hidden bg-black text-white"
    >
      {/* Stage */}
      <div className="absolute inset-0">
        <AnimatePresence initial={false}>
          {shown && (shown.video || shown.image) && (
            <motion.div
              key={`${shownIndex}-${shown.video ? 'v' : 'i'}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
              className="absolute inset-0"
            >
              <div className={`kb kb-${shownIndex % 4}`} style={{ animationPlayState: paused || !begun ? 'paused' : 'running' }}>
                {shown.video ? (
                  <Clip src={shown.video} paused={paused || !begun} />
                ) : (
                  <img src={shown.image} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!shown?.image && !shown?.video && <div className="cinema-placeholder absolute inset-0" />}
      </div>

      <div className="cinema-vignette pointer-events-none absolute inset-0" />
      <div className="grain pointer-events-none absolute -inset-[10%]" />
      <div className="absolute inset-x-0 top-0 h-[6vh] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[6vh] bg-black" />

      {/* Title card */}
      <AnimatePresence>
        {showTitle && !ended && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center"
          >
            <div>
              <p className="eyebrow !text-amber-100/70">Echoes presents</p>
              <h2 className="mt-3 font-display text-4xl leading-tight text-white drop-shadow-[0_4px_30px_rgba(0,0,0,0.8)] md:text-6xl">{story.title}</h2>
              <p className="mt-3 text-sm text-white/70 md:text-base">
                {formatYear(story.year)} · {story.place}
              </p>
              {!begun && (
                <p className="mt-8 inline-flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-xs text-white/70 backdrop-blur">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-amber-200" />
                  Painting the opening scene with Nano Banana…
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Subtitles */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(6vh+76px)] flex justify-center px-6">
        <AnimatePresence mode="wait">
          {sentence && !ended && (
            <motion.p
              key={sentence.start}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-3xl text-center font-display text-xl leading-snug drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] md:text-[1.7rem]"
            >
              {sentence.words.map((w, i) => (
                <span key={i} className={sentence.start + i <= word ? 'text-white' : 'text-white/45'} style={{ transition: 'color .2s' }}>
                  {w}{' '}
                </span>
              ))}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* End card */}
      <AnimatePresence>
        {ended && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center bg-black/55 px-6 text-center backdrop-blur-sm">
            <div>
              <p className="eyebrow !text-amber-100/70">The end</p>
              <h2 className="mt-3 font-display text-4xl md:text-5xl">{story.title}</h2>
              <p className="mx-auto mt-4 max-w-md text-sm text-white/60">This really happened. The sources are listed in the story panel.</p>
              <div className="mt-8 flex justify-center gap-3">
                <button onClick={narration.restart} className="btn-primary">↺ Watch again</button>
                <button onClick={onClose} className="btn-ghost">Back to the map</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <div className="absolute inset-x-0 top-[6vh] flex items-center justify-between gap-3 px-4 pt-3 md:px-6">
        <StatusChip scenes={scenes} />
        <div className="flex gap-2">
          <button
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
            className="cinema-btn hidden md:grid"
            aria-label="Toggle fullscreen"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
            </svg>
          </button>
          <button onClick={onClose} className="cinema-btn" aria-label="Close animated story">
            <svg width="12" height="12" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-[6vh] flex items-center gap-4 px-4 pb-4 md:px-6">
        <button onClick={narration.toggle} disabled={!begun || state === 'loading'} className="cinema-btn !h-11 !w-11" aria-label={state === 'playing' ? 'Pause' : 'Play'}>
          {state === 'playing' ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
          ) : state === 'loading' || !begun ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5Z" /></svg>
          )}
        </button>
        <div className="flex flex-1 gap-1.5">
          {layout.map((l, i) => {
            const fill = !begun ? 0 : i < para ? 1 : i > para ? 0 : (word - l.start + 1) / (l.end - l.start);
            const sc = scenes.scenes[i];
            return (
              <div key={i} className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/15" title={sc?.video ? 'Animated' : sc?.image ? 'Painted' : 'Painting…'}>
                {!sc?.image && !sc?.imageError && <div className="shimmer absolute inset-0" />}
                <div className="absolute inset-y-0 left-0 rounded-full bg-amber-100 transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(1, ended ? 1 : fill)) * 100}%` }} />
              </div>
            );
          })}
        </div>
        <span className="hidden text-xs text-white/50 sm:block">
          {voice.flag} {voice.name}
        </span>
      </div>
    </motion.div>
  );
}

function pickScene(scenes: Scene[], para: number) {
  for (let i = Math.min(para, scenes.length - 1); i >= 0; i--) if (scenes[i]?.image || scenes[i]?.video) return i;
  return scenes.findIndex((s) => s.image || s.video);
}

function StatusChip({ scenes }: { scenes: Scenes }) {
  const total = scenes.scenes.length;
  const painted = scenes.scenes.filter((s) => s.image).length;
  const animated = scenes.scenes.filter((s) => s.video).length;
  const videoPending = scenes.video && scenes.scenes.some((s) => s.image && !s.video && !s.videoError);
  let label: string;
  if (scenes.status === 'error') label = scenes.error || 'Could not paint scenes';
  else if (painted < total && scenes.status === 'working') label = `Nano Banana painting · ${painted}/${total}`;
  else if (videoPending) label = `Omni animating · ${animated}/${total}`;
  else label = animated ? `${animated}/${total} scenes animated` : `${painted} painted scenes`;
  const busy = scenes.status === 'working';
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs text-white/75 backdrop-blur">
      <span className={`h-1.5 w-1.5 rounded-full ${scenes.status === 'error' ? 'bg-rose-400' : busy ? 'animate-pulse bg-amber-300' : 'bg-emerald-300'}`} />
      {label}
    </span>
  );
}

/** A generated clip: plays once (frame holds at the end), ambient audio ducked under the narration. */
function Clip({ src, paused }: { src: string; paused: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.volume = 0.22;
    v.defaultPlaybackRate = v.playbackRate = 0.85;
    if (paused) v.pause();
    else
      v.play().catch(() => {
        v.muted = true;
        void v.play();
      });
  }, [paused]);
  return <video ref={ref} src={src} playsInline preload="auto" className="h-full w-full object-cover" />;
}

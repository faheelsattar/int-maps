import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatYear, type Shot, type Story } from '../lib/api';
import type { Narration } from '../lib/useNarration';
import { useReading } from '../lib/useStoryboard';

/** Start and end of the slow camera move over a frame (a Ken Burns effect). */
function cameraMove(shot: Shot | undefined) {
  const drift = 4; // percent
  switch (shot?.motion) {
    case 'zoom-out':
      return { from: { scale: 1.24, x: '0%', y: '0%' }, to: { scale: 1.06, x: '0%', y: '0%' } };
    case 'pan-left':
      return { from: { scale: 1.16, x: `${drift}%`, y: '0%' }, to: { scale: 1.16, x: `${-drift}%`, y: '0%' } };
    case 'pan-right':
      return { from: { scale: 1.16, x: `${-drift}%`, y: '0%' }, to: { scale: 1.16, x: `${drift}%`, y: '0%' } };
    case 'pan-up':
      return { from: { scale: 1.16, x: '0%', y: `${drift}%` }, to: { scale: 1.16, x: '0%', y: `${-drift}%` } };
    case 'pan-down':
      return { from: { scale: 1.16, x: '0%', y: `${-drift}%` }, to: { scale: 1.16, x: '0%', y: `${drift}%` } };
    default:
      return { from: { scale: 1.05, x: '0%', y: '0%' }, to: { scale: 1.24, x: '0%', y: '0%' } };
  }
}

/** A painted frame drifting slowly with its shot's camera move. */
export function KenBurns({ src, shot, duration = 30, className = '' }: { src: string; shot?: Shot; duration?: number; className?: string }) {
  const move = cameraMove(shot);
  return (
    <motion.img
      src={src}
      alt=""
      draggable={false}
      initial={move.from}
      animate={move.to}
      transition={{ duration, ease: 'linear' }}
      style={{ transformOrigin: `${shot?.focusX ?? 50}% ${shot?.focusY ?? 45}%` }}
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
    />
  );
}

/** Particles over the frame, matching the scene's weather and mood. */
function Atmosphere({ kind }: { kind: Shot['atmosphere'] }) {
  if (kind === 'none') return null;
  if (kind === 'mist') {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="mist mist-a" />
        <div className="mist mist-b" />
      </div>
    );
  }
  const count = { dust: 18, embers: 26, rain: 70, snow: 45 }[kind];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`particle particle-${kind}`}
          style={{
            left: `${(i * 37.7) % 100}%`,
            top: kind === 'dust' ? `${(i * 23.3) % 90}%` : undefined,
            animationDelay: `${-((i * 0.77) % 6)}s`,
            animationDuration: `${{ dust: 7, embers: 6, rain: 0.8, snow: 9 }[kind] + ((i * 0.37) % 3)}s`,
            opacity: 0.35 + ((i * 0.13) % 0.6),
          }}
        />
      ))}
    </div>
  );
}

/** Subtitle lines: whole sentences, split so no line runs past ~16 words. Indices are global word numbers. */
function useLines(story: Story) {
  return useMemo(() => {
    const words = story.paragraphs.flatMap((p) => p.split(/\s+/).filter(Boolean));
    const lines: { start: number; words: string[] }[] = [];
    let sentence: string[] = [];
    let start = 0;
    const flush = () => {
      const parts = Math.ceil(sentence.length / 16);
      const size = Math.ceil(sentence.length / parts);
      for (let k = 0; k < sentence.length; k += size) lines.push({ start: start + k, words: sentence.slice(k, k + size) });
      start += sentence.length;
      sentence = [];
    };
    words.forEach((w) => {
      sentence.push(w);
      if (/[.!?]["”’)]?$/.test(w)) flush();
    });
    if (sentence.length) flush();
    return lines;
  }, [story]);
}

interface Props {
  story: Story;
  shots: (string | null)[];
  /** Shown while the first shot is still being painted. */
  fallback: string;
  /** True when the fallback is the story's own establishing shot (shown clearly, not dimmed). */
  prologue?: boolean;
  narration: Narration;
  onAnother: () => void;
  onAsk: () => void;
}

/** The story as a film: painted shots with slow camera moves, atmosphere, and subtitles inking in as he speaks. */
export function Cinema({ story, shots, fallback, prologue = false, narration, onAnother, onAsk }: Props) {
  const { activeWord, state } = narration;
  const { shot: wanted } = useReading(story, activeWord);
  const lines = useLines(story);

  // The shot for this passage if it's painted, else the latest earlier one that is.
  let shown = -1;
  for (let i = wanted; i >= 0 && shown < 0; i--) if (shots[i]) shown = i;
  const painting = shown !== wanted && story.shots.length > 0 && !(prologue && shown < 0);
  const line = lines.filter((l) => l.start <= Math.max(0, activeWord)).pop() ?? lines[0];
  const opening = activeWord < 4 && state !== 'ended';
  const ended = state === 'ended';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} className="absolute inset-0 overflow-hidden bg-black">
      <AnimatePresence>
        <motion.div
          key={shown >= 0 ? `shot-${shown}` : 'fallback'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeInOut' }}
          className="absolute inset-0"
        >
          {shown >= 0 ? (
            <KenBurns src={shots[shown]!} shot={story.shots[shown]} />
          ) : (
            <KenBurns src={fallback} className={prologue ? '' : 'blur-[2px] brightness-50'} />
          )}
          <Atmosphere kind={shown >= 0 ? story.shots[shown].atmosphere : 'dust'} />
        </motion.div>
      </AnimatePresence>

      <div className="film-grain pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-radial-[ellipse_at_center] from-transparent via-transparent to-black/75" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      {painting && (
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1 text-[11px] text-amber-100/80 backdrop-blur">
          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-200/30 border-t-amber-200" />
          {shown < 0 ? 'Painting the first scene…' : 'Painting the next scene…'}
        </div>
      )}

      <AnimatePresence>
        {opening && (
          <motion.div
            key="title"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 1.2 } }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            className="absolute inset-0 grid place-items-center p-6 text-center"
          >
            <div>
              <p className="font-ancient text-[11px] uppercase tracking-[0.4em] text-amber-200/80 md:text-[1.1cqw]">— Chapter the First —</p>
              <h1 className="mt-3 font-blackletter text-4xl leading-tight text-amber-50 drop-shadow-[0_2px_18px_rgba(0,0,0,0.9)] md:text-[4.4cqw]">{story.title}</h1>
              <p className="mt-3 font-ancient text-base italic text-amber-100/80 md:text-[1.5cqw]">
                {story.date || formatYear(story.year)} · {story.place}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!opening && !ended && line && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center px-6 pb-7 md:px-[8%] md:pb-[3.2cqw]">
          <AnimatePresence mode="wait">
            <motion.p
              key={line.start}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35 }}
              className="max-w-4xl text-center font-ancient text-lg leading-snug md:text-[1.9cqw]"
            >
              {line.words.map((w, k) => {
                const i = line.start + k;
                return (
                  <span key={i} className={i === activeWord ? 'sub sub-active' : i < activeWord ? 'sub sub-read' : 'sub'}>
                    {w}{' '}
                  </span>
                );
              })}
            </motion.p>
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {ended && (
          <motion.div
            key="finis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0 grid place-items-center bg-black/55 p-6 text-center backdrop-blur-[2px]"
          >
            <div>
              <p className="font-blackletter text-5xl text-amber-100 md:text-[5cqw]">Finis</p>
              <p className="mt-2 font-ancient italic text-amber-100/70">{story.title}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button onClick={narration.restart} className="btn-ghost">↺ Watch again</button>
                <button onClick={onAsk} className="btn-ghost">💬 Ask the historian</button>
                <button onClick={onAnother} className="btn-primary">✦ Another story</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

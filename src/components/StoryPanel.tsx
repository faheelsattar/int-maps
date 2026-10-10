import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { formatYear, type NearbyEcho, type Story, type StoryChoice } from '../lib/api';
import type { Narration } from '../lib/useNarration';
import type { Voice } from '../lib/voices';
import type { Conversation } from '../lib/useConversation';
import type { VoiceControl } from '../lib/useVoice';
import { AskHistorian } from './AskHistorian';
import { StoryChoices } from './StoryChoices';
import { AuthorityBanner, FactList, SourceList } from './Authority';
import { MicButton } from './Voice';
import { Waveform } from './Waveform';

interface Props {
  story: Story | null;
  loading: boolean;
  error: string;
  place: string;
  voice: Voice;
  narration: Narration;
  voiceControl: VoiceControl;
  conversation: Conversation;
  /** Stories offered for this place, before one is chosen. */
  choices: { items: StoryChoice[]; loading: boolean } | null;
  onChoose: (c: StoryChoice) => void;
  onClose: () => void;
  onAnother: () => void;
  onEcho: (e: NearbyEcho) => void;
  onRetry: () => void;
  onOpenTome?: () => void;
}

export function StoryPanel(props: Props) {
  const { story, loading, error, onClose } = props;
  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="panel pointer-events-auto absolute z-20 flex flex-col overflow-hidden
        inset-x-2 bottom-2 max-h-[62vh] rounded-3xl
        md:inset-x-auto md:right-4 md:top-20 md:bottom-4 md:max-h-none md:w-[440px]"
    >
      <button
        onClick={onClose}
        aria-label="Close story"
        className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M1 1l12 12M13 1L1 13" />
        </svg>
      </button>
      {error ? (
        <ErrorState {...props} />
      ) : story && !loading ? (
        <StoryView {...props} story={story} />
      ) : props.choices && !props.choices.loading && !loading ? (
        <ChoicesView place={props.place} items={props.choices.items} onChoose={props.onChoose} />
      ) : (
        <LoadingState place={props.place} onOpenTome={props.onOpenTome} />
      )}
    </motion.aside>
  );
}

const LOADING_LINES = [
  'Dusting off the archives…',
  'Listening for echoes in the ground…',
  'Cross-checking the chronicles…',
  'Tracing old maps and letters…',
  'Separating legend from fact…',
];

function LoadingState({ place, onOpenTome }: { place: string; onOpenTome?: () => void }) {
  const [line, setLine] = useState(0);
  const [year, setYear] = useState(1900);
  useEffect(() => {
    const a = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 2200);
    const b = setInterval(() => setYear(Math.floor(-500 + Math.random() * 2520)), 90);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);
  return (
    <div className="flex flex-1 flex-col gap-5 p-7 pt-8">
      <div>
        <p className="eyebrow">Searching history near</p>
        <p className="mt-1 pr-10 text-sm text-white/70">{place || 'your pin'}</p>
      </div>
      <div className="font-display text-6xl tabular-nums text-amber-100/90">{formatYear(year)}</div>
      <motion.p key={line} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-sm italic text-white/60">
        {LOADING_LINES[line]}
      </motion.p>
      {onOpenTome && (
        <button
          onClick={onOpenTome}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-amber-300/30 bg-amber-400/10 px-3.5 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-400/20 active:scale-95"
        >
          <span>📖</span>
          <span>Open Historian's Tome</span>
        </button>
      )}
      <div className="space-y-3">
        {[92, 100, 84, 96, 70].map((w, i) => (
          <div key={i} className="shimmer h-3 rounded-full" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}

function ChoicesView({ place, items, onChoose }: { place: string; items: StoryChoice[]; onChoose: (c: StoryChoice) => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-7 pt-8">
      <p className="eyebrow">Choose a story</p>
      <h2 className="mt-1 pr-10 font-display text-2xl leading-tight text-white">Tales of {place.split(',')[0] || 'this place'}</h2>
      <p className="mt-1 text-sm text-white/50">Tap one, or say “the second one”.</p>
      <div className="mt-5">
        <StoryChoices items={items} onChoose={onChoose} />
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: Props) {
  return (
    <div className="flex flex-1 flex-col items-start gap-4 p-7 pt-10">
      <p className="eyebrow text-rose-300/80">The archives went quiet</p>
      <p className="pr-8 text-sm text-white/70">{error}</p>
      <button onClick={onRetry} className="btn-primary">
        Try again
      </button>
    </div>
  );
}

function StoryView({ story, voice, narration, voiceControl, conversation, onAnother, onEcho, onOpenTome }: Props & { story: Story }) {
  const { state, activeWord } = narration;
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);

  // Keep the spoken word comfortably in view, without fighting the user's scrolling too hard.
  useEffect(() => {
    const el = activeRef.current;
    const box = scrollRef.current;
    if (!el || !box || state !== 'playing') return;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top + 80 || r.bottom > b.bottom - 80) {
      box.scrollTo({ top: box.scrollTop + r.top - b.top - b.height * 0.35, behavior: 'smooth' });
    }
  }, [activeWord, state]);

  let wordIndex = 0;
  return (
    <>
      <div ref={scrollRef} className="scroll-fade flex-1 overflow-y-auto px-7 pb-6 pt-7">
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }}>
          <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2 pr-10">
            {story.year != null && <span className="chip chip-amber">{formatYear(story.year)}</span>}
            <span className="text-xs text-white/50">{story.date}</span>
            {onOpenTome && (
              <button
                onClick={onOpenTome}
                className="chip chip-amber ml-auto flex items-center gap-1.5 transition hover:brightness-110 active:scale-95"
                title="Watch historian open book animation"
              >
                <span>📖</span>
                <span>Open Tome</span>
              </button>
            )}
          </motion.div>
          <motion.h2 variants={fadeUp} className="mt-3 font-display text-[2rem] leading-[1.1] text-white">
            {story.title}
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-2 flex items-center gap-1.5 text-sm text-white/55">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-amber-200/80">
              <path d="M12 2C7.6 2 4 5.5 4 9.9 4 15.5 12 22 12 22s8-6.5 8-12.1C20 5.5 16.4 2 12 2Zm0 10.6a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z" />
            </svg>
            {story.place}
            {story.distanceKm != null && story.distanceKm >= 1 && <span className="text-white/35">· {Math.round(story.distanceKm)} km from your pin</span>}
          </motion.p>
          {story.hook && (
            <motion.p variants={fadeUp} className="mt-4 font-display text-lg italic leading-snug text-amber-100/80">
              “{story.hook}”
            </motion.p>
          )}
          {story.authority && (
            <motion.div variants={fadeUp}>
              <AuthorityBanner authority={story.authority} />
            </motion.div>
          )}

          <motion.div variants={fadeUp} className="mt-6 space-y-4 text-[15.5px] leading-[1.75]">
            {story.paragraphs.map((p, pi) => (
              <p key={pi}>
                {p.split(/\s+/).filter(Boolean).map((w) => {
                  const i = wordIndex++;
                  const cls = i === activeWord ? 'word word-active' : i < activeWord ? 'word word-spoken' : 'word';
                  return (
                    <span key={i} ref={i === activeWord ? activeRef : undefined} className={cls}>
                      {w}{' '}
                    </span>
                  );
                })}
              </p>
            ))}
          </motion.div>

          <motion.section variants={fadeUp} className="mt-8">
            <h3 className="eyebrow">Ask the historian</h3>
            <div className="mt-3">
              <AskHistorian conversation={conversation} voiceControl={voiceControl} narrator={voice.name} />
            </div>
          </motion.section>

          {story.facts.length > 0 && (
            <motion.section variants={fadeUp} className="mt-8">
              <h3 className="eyebrow">Key facts</h3>
              <FactList facts={story.facts} />
            </motion.section>
          )}

          {story.nearby.length > 0 && (
            <motion.section variants={fadeUp} className="mt-8">
              <h3 className="eyebrow">More stories in this city</h3>
              <div className="mt-3 grid gap-2">
                {story.nearby.map((n) => (
                  <button key={n.title} onClick={() => onEcho(n)} className="echo-card group">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-sky-300 shadow-[0_0_10px_2px_rgba(125,211,252,0.5)]" />
                    <span className="flex-1 text-left text-sm text-white/85">{n.title}</span>
                    <span className="text-xs tabular-nums text-white/40">{formatYear(n.year)}</span>
                    <span className="text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/70">→</span>
                  </button>
                ))}
              </div>
            </motion.section>
          )}

          {story.sources.length > 0 && (
            <motion.section variants={fadeUp} className="mt-8">
              <h3 className="eyebrow">Sources · ranked by authority</h3>
              <SourceList sources={story.sources} />
            </motion.section>
          )}
        </motion.div>
      </div>

      <Player voice={voice} narration={narration} voiceControl={voiceControl} onAnother={onAnother} />
    </>
  );
}

function Player({ voice, narration, voiceControl, onAnother }: { voice: Voice; narration: Narration; voiceControl: VoiceControl; onAnother: () => void }) {
  const { state, toggle, restart, position, duration, narrator, error } = narration;
  const playing = state === 'playing';
  const progress = duration > 0 && narrator?.complete ? Math.min(1, position / duration) : 0;
  return (
    <div className="border-t border-white/[0.06] bg-black/30 px-5 pb-5 pt-4">
      <div className="relative mb-4 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-200 to-amber-400 transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          disabled={state === 'loading'}
          aria-label={playing ? 'Pause' : 'Play'}
          className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-b from-amber-100 to-amber-300 text-[#1a1408] shadow-[0_8px_24px_-6px_rgba(251,191,36,0.6)] transition hover:scale-105 active:scale-95 disabled:opacity-80"
        >
          {state === 'loading' ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1408]/30 border-t-[#1a1408]" />
          ) : playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
          ) : state === 'ended' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5Z" /></svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <Waveform analyser={narrator?.analyser ?? null} active={playing} />
          <div className="mt-1 flex items-center justify-between text-[11px] text-white/45">
            <span className="truncate">
              {state === 'error' ? (
                <span className="text-rose-300/90">{error || 'Narration failed'}</span>
              ) : state === 'loading' ? (
                `${voice.name} is clearing their throat…`
              ) : (
                <>
                  {voice.flag} Narrated by <span className="text-white/75">{voice.name}</span> · {voice.accent}
                </>
              )}
            </span>
            <span className="tabular-nums">{fmt(position)}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <MicButton voice={voiceControl} size="md" />
        <button onClick={onAnother} className="btn-ghost flex-1">
          ✦ Another story here
        </button>
        <button onClick={restart} className="btn-ghost" aria-label="Replay from start">
          ↺ Replay
        </button>
      </div>
    </div>
  );
}

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } } };

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

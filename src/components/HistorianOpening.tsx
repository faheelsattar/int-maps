import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchIllustration, formatYear, type Story, type StoryChoice } from '../lib/api';
import { playPageTurnSound } from '../lib/tomeAudio';
import type { Conversation } from '../lib/useConversation';
import type { Narration } from '../lib/useNarration';
import { useReading, useStoryboard } from '../lib/useStoryboard';
import type { VoiceControl } from '../lib/useVoice';
import type { Voice } from '../lib/voices';
import { AskHistorian } from './AskHistorian';
import { Cinema, KenBurns } from './Cinema';
import { StoryChoices } from './StoryChoices';
import { MicButton } from './Voice';
import { Waveform } from './Waveform';

interface Props {
  story: Story | null;
  loading: boolean;
  error: string;
  place: string;
  isOpen: boolean;
  voice: Voice;
  /** False while the narrator's local voice is still being designed. */
  voiceReady: boolean;
  narration: Narration;
  voiceControl: VoiceControl;
  conversation: Conversation;
  /** Stories offered for this place, before one is chosen. */
  choices: { items: StoryChoice[]; loading: boolean } | null;
  onChoose: (c: StoryChoice) => void;
  /** The study painted for this place; null shows the default one. */
  scene: string | null;
  /** An establishing shot for the chosen story, painted while it was being written. */
  prologue: string | null;
  onClose: () => void;
  /** The cover is open: the historian starts reading. */
  onBookOpen: (story: Story) => void;
  onAnother: () => void;
}

type Stage = 'chair' | 'opening' | 'book';

// Where the book sits in historian-opening.jpg, so the camera pushes in on it.
const BOOK_FOCUS = '52% 64%';

/**
 * The story as a scene: the historian searches his shelves while the story loads, the camera moves in
 * on his book, the cover opens and he reads it aloud, the words inking onto the page as he speaks.
 */
export function HistorianOpening(props: Props) {
  const { story, loading, error, place, isOpen, narration, onClose, onBookOpen } = props;
  const [stage, setStage] = useState<Stage>('chair');
  const [asking, setAsking] = useState(false);
  // The story plays as a film of painted shots, or is read from the book; the choice is remembered.
  const [view, setView] = useState<'film' | 'book'>(() => {
    try {
      return localStorage.getItem('echoes:view') === 'book' ? 'book' : 'film';
    } catch {
      return 'film';
    }
  });
  const toggleView = () =>
    setView((v) => {
      const next = v === 'film' ? 'book' : 'film';
      try {
        localStorage.setItem('echoes:view', next);
      } catch {
        /* private mode */
      }
      return next;
    });
  const shots = useStoryboard(story);
  const opened = useRef<Story | null>(null);

  // A new search, or a return to the list of stories, starts back in the study.
  useEffect(() => {
    if (loading || !story) {
      setStage('chair');
      opened.current = null;
    }
  }, [loading, story]);

  // Reopened mid-story: go straight to the page being read.
  useEffect(() => {
    if (isOpen && story && opened.current === story) setStage('book');
    if (!isOpen) setStage('chair');
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Story found: push in on the book, open the cover, start reading.
  useEffect(() => {
    if (!isOpen || !story || loading || stage !== 'chair' || opened.current === story) return;
    const t = setTimeout(() => {
      playPageTurnSound();
      setStage('opening');
    }, 2200);
    return () => clearTimeout(t);
  }, [isOpen, story, loading, stage]);

  useEffect(() => {
    if (stage !== 'opening' || !story) return;
    const t = setTimeout(() => {
      opened.current = story;
      setStage('book');
    }, 950);
    return () => clearTimeout(t);
  }, [stage, story]);

  // The historian starts reading once the book is open; for the film, once its first scene is painted
  // (or after ten seconds at most), so it opens on a picture rather than a placeholder.
  const reading = useRef<Story | null>(null);
  const firstShot = shots[0] ?? props.prologue;
  useEffect(() => {
    if (stage !== 'book' || !story || reading.current === story) return;
    const begin = () => {
      if (reading.current === story) return;
      reading.current = story;
      onBookOpen(story);
    };
    if (view === 'book' || firstShot || !story.shots?.length) return begin();
    const t = setTimeout(begin, 10_000);
    return () => clearTimeout(t);
  }, [stage, story, view, firstShot, onBookOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="tome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-3 backdrop-blur-md md:p-6"
        >
          <button
            onClick={onClose}
            aria-label="Close the book and show the map"
            className="absolute right-4 top-4 z-50 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3.5 py-1.5 text-xs font-medium text-white/80 shadow-lg backdrop-blur-md transition hover:bg-white/10 hover:text-white"
          >
            <span>Back to map</span>
            <svg width="12" height="12" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>

          <div className="@container relative aspect-[3/4] w-full max-w-md overflow-hidden rounded-3xl border border-amber-500/20 bg-[#0f0b07] shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(245,158,11,0.12)] [perspective:1600px] md:aspect-[1408/768] md:w-[min(100%,calc((100dvh-150px)*1.833))] md:max-w-none">
            <AnimatePresence>
              {stage === 'chair' && <Study key="chair" {...props} />}
            </AnimatePresence>
            <AnimatePresence>{stage === 'opening' && <Cover key="cover" />}</AnimatePresence>
            {stage === 'book' && story && view === 'film' && (
              <Cinema
                story={story}
                shots={shots}
                fallback={props.prologue ?? props.scene ?? '/assets/historian-opening.jpg'}
                prologue={!!props.prologue}
                narration={narration}
                onAnother={props.onAnother}
                onAsk={() => setAsking(true)}
              />
            )}
            {stage === 'book' && story && view === 'book' && <Book story={story} narration={narration} shots={shots} />}
          </div>

          {stage === 'book' && story && <Controls {...props} asking={asking} onAsk={() => setAsking((a) => !a)} view={view} onView={toggleView} />}

          <AnimatePresence>
            {asking && stage === 'book' && story && (
              <motion.aside
                key="ask"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                className="panel absolute inset-x-3 bottom-24 top-14 z-50 flex flex-col overflow-hidden rounded-3xl md:inset-x-auto md:right-4 md:w-[400px]"
              >
                <div className="flex items-center justify-between px-5 pb-2 pt-4">
                  <p className="eyebrow">Ask the historian</p>
                  <button onClick={() => setAsking(false)} aria-label="Close questions" className="grid h-7 w-7 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white">
                    <svg width="11" height="11" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 1l12 12M13 1L1 13" /></svg>
                  </button>
                </div>
                <div className="min-h-0 flex-1 px-5 pb-5">
                  <AskHistorian conversation={props.conversation} voiceControl={props.voiceControl} narrator={props.voice.name} fill />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Stage 1: the historian in his chair, searching while the story loads. */
function Study({ story, loading, error, place, choices, onChoose, scene }: Props) {
  const found = !!story && !loading;
  const choosing = !story && !loading && !error && !!choices && !choices.loading;
  const town = place.split(',')[0] || 'this place';
  const mode = error ? 'error' : found ? 'found' : choosing ? 'choose' : loading ? 'search' : 'gather';
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="absolute inset-0">
      <motion.img
        key={scene ?? 'default'}
        src={scene ?? '/assets/historian-opening.jpg'}
        alt="A historian in an armchair, opening an old book"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transformOrigin: BOOK_FOCUS, objectPosition: '60% 50%' }}
        initial={{ scale: 1, opacity: 0 }}
        animate={found ? { scale: 2.1, opacity: 1 } : { scale: 1.08, opacity: 1 }}
        transition={found ? { duration: 2.2, ease: [0.6, 0, 0.3, 1] } : { duration: 10, ease: 'easeOut', opacity: { duration: 1.2 } }}
      />
      <div className="candle-glow pointer-events-none absolute inset-0 bg-radial-[circle_at_33%_45%] from-amber-400/25 via-amber-700/10 to-transparent mix-blend-screen" />
      <div className="candle-glow pointer-events-none absolute inset-0 bg-radial-[circle_at_95%_75%] from-orange-500/20 via-transparent to-transparent mix-blend-screen" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/60" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(14)].map((_, i) => (
          <div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-amber-200/50 shadow-[0_0_8px_rgba(253,224,71,0.8)]"
            style={{ left: `${15 + ((i * 6.5) % 75)}%`, top: `${30 + ((i * 7) % 55)}%`, animation: `floatMote ${3 + (i % 4)}s ease-in-out infinite`, animationDelay: `${i * 0.4}s` }}
          />
        ))}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex justify-center p-5 md:p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ duration: 0.4 }}
            className={`rounded-2xl border border-amber-300/20 px-5 py-4 text-center shadow-2xl backdrop-blur-md ${choosing ? 'w-full max-w-2xl bg-black/75' : 'max-w-xl bg-black/60'}`}
          >
            <p className="text-[11px] uppercase tracking-[0.25em] text-amber-300/80">
              {
                {
                  error: 'The archives went quiet',
                  found: 'The historian opens the chronicle',
                  choose: `The historian has found ${choices?.items.length ?? 'some'} tales`,
                  search: 'The historian searches the shelves',
                  gather: 'The historian gathers the chronicles',
                }[mode]
              }
            </p>
            <h2 className="mt-1 font-display text-xl text-amber-100 md:text-2xl">
              {mode === 'error' ? (
                error
              ) : mode === 'found' ? (
                story!.title
              ) : mode === 'choose' ? (
                'Which shall I read?'
              ) : (
                <>
                  {mode === 'search' ? 'For your story' : `Of ${town}`}
                  <span className="animate-pulse">…</span>
                </>
              )}
            </h2>
            {found && <p className="mt-1 text-sm italic text-amber-200/70">{story.date || formatYear(story.year)} · {story.place}</p>}
            {choosing && (
              <div className="mt-3 max-h-[min(46vh,400px)] overflow-y-auto text-left">
                <StoryChoices items={choices.items} onChoose={onChoose} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/** Stage 2: the leather cover swings open. */
function Cover() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="absolute inset-0 grid place-items-center bg-[#0a0704]">
      <div className="parchment-page absolute h-[85%] w-[88%] rounded-2xl shadow-2xl" />
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.8, 1.4, 2] }}
        transition={{ duration: 0.9 }}
        className="pointer-events-none absolute h-64 w-64 rounded-full bg-amber-400/40 blur-3xl"
      />
      <motion.div
        initial={{ rotateY: 0 }}
        animate={{ rotateY: -150 }}
        transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
        style={{ transformOrigin: 'left center' }}
        className="absolute left-[6%] h-[85%] w-[88%] rounded-2xl border-2 border-amber-900/60 bg-gradient-to-r from-[#29170a] via-[#3a200f] to-[#1e1006] p-6 shadow-[15px_0_35px_rgba(0,0,0,0.8)] [backface-visibility:hidden] md:w-[44%]"
      >
        <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-amber-500/30 p-4 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Echoes</div>
          <div className="my-3 h-px w-20 bg-amber-500/40" />
          <div className="font-blackletter text-2xl text-amber-200">Historia Mundi</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

type Chunk = { start: number; words: string[]; first: boolean };
type Page = { kind: 'title' } | ({ kind: 'para' } & Chunk);

const PAGE_WORDS = 45;

/** Splits paragraphs into page-sized runs of whole sentences, keeping the global word index of each run. */
function toChunks(paragraphs: string[]): Chunk[] {
  const out: Chunk[] = [];
  let index = 0;
  paragraphs.forEach((p, pi) => {
    const words = p.split(/\s+/).filter(Boolean);
    let run: string[] = [];
    let sentence: string[] = [];
    const flush = () => {
      if (run.length) out.push({ start: index - run.length - sentence.length, words: run, first: pi === 0 && !out.some((c) => c.start === 0) });
      run = [];
    };
    for (const w of words) {
      sentence.push(w);
      index++;
      if (/[.!?]["”’)]?$/.test(w)) {
        if (run.length && run.length + sentence.length > PAGE_WORDS) flush();
        run.push(...sentence);
        sentence = [];
      }
    }
    if (sentence.length) {
      if (run.length && run.length + sentence.length > PAGE_WORDS) flush();
      run.push(...sentence);
      sentence = [];
    }
    flush();
  });
  return out;
}

function useWide() {
  const query = '(min-width: 768px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

/** Stage 3: the open book. Pages follow the narration and turn when the reading reaches the next one. */
function Book({ story, narration, shots }: { story: Story; narration: Narration; shots: (string | null)[] }) {
  const wide = useWide();
  const { activeWord } = narration;

  const chunks = useMemo(() => toChunks(story.paragraphs), [story]);
  const reading = Math.max(0, chunks.filter((c) => c.start <= activeWord).length - 1);

  // Desktop: the painted plate for the passage on the left, a short run of prose on the right. Phone: one run per page.
  const spreads: Page[][] = useMemo(() => {
    const paras: Page[] = chunks.map((c) => ({ kind: 'para' as const, ...c }));
    return wide ? paras.map((p) => [{ kind: 'title' }, p]) : paras.map((p) => [p]);
  }, [chunks, wide]);
  const { shot: shotIndex } = useReading(story, activeWord);
  let painted = -1;
  for (let i = shotIndex; i >= 0 && painted < 0; i--) if (shots[i]) painted = i;
  const readingSpread = Math.max(0, spreads.findIndex((sp) => sp.some((p) => p.kind === 'para' && p.start === chunks[reading]?.start)));

  // Readers can leaf through by hand; the narration takes the page back when it moves on.
  const [manual, setManual] = useState<number | null>(null);
  useEffect(() => setManual(null), [readingSpread]);
  const spread = Math.min(manual ?? readingSpread, spreads.length - 1);

  const [turn, setTurn] = useState<{ n: number; dir: 1 | -1 }>({ n: 0, dir: 1 });
  const shown = useRef(spread);
  useEffect(() => {
    if (shown.current === spread) return;
    setTurn((t) => ({ n: t.n + 1, dir: spread > shown.current ? 1 : -1 }));
    shown.current = spread;
    playPageTurnSound();
  }, [spread]);

  const [plate, setPlate] = useState<string | null>(null);
  useEffect(() => setPlate(/rome/i.test(`${story.place} ${story.title}`) ? '/assets/plate-rome.jpg' : null), [story]);

  const page = (p: Page) =>
    p.kind === 'title' ? (
      <TitlePage story={story} plate={plate} onPlate={setPlate} shot={painted >= 0 ? { url: shots[painted]!, index: painted } : null} first={spread === 0} />
    ) : (
      <ParagraphPage {...p} activeWord={activeWord} reveal={writing && spread === readingSpread} story={wide || !p.first ? null : story} />
    );

  // While the historian reads, words ink onto the page as he says them; otherwise the page is already written.
  const writing = ['loading', 'playing', 'paused', 'idle'].includes(narration.state);

  const nav = (d: number) => setManual(Math.max(0, Math.min(spreads.length - 1, spread + d)));

  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="absolute inset-0 [perspective:1600px]">
      {wide ? (
        <>
          <img src="/assets/open-tome.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="candle-glow pointer-events-none absolute inset-0 bg-radial-[circle_at_11%_14%] from-amber-300/20 via-transparent to-transparent mix-blend-screen" />
          {/* Page areas measured on open-tome.jpg (1408×768). */}
          <AnimatePresence mode="popLayout">
            <motion.div key={spread} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, delay: 0.25 }}>
              <div className="absolute left-[34.5%] top-[16%] h-[66%] w-[20.5%]">{spreads[spread][0] && page(spreads[spread][0])}</div>
              <div className="absolute left-[60%] top-[10%] h-[66%] w-[21%] -rotate-[0.6deg]">{spreads[spread][1] && page(spreads[spread][1])}</div>
            </motion.div>
          </AnimatePresence>
          <Leaf turn={turn} className={turn.dir > 0 ? 'left-[57.5%] top-[7%] h-[76%] w-[30%]' : 'left-[32%] top-[13%] h-[73%] w-[28%]'} />
        </>
      ) : (
        <div className="parchment-page absolute inset-3 rounded-2xl p-6 shadow-inner">
          <AnimatePresence mode="popLayout">
            <motion.div key={spread} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, delay: 0.25 }} className="h-full">
              {page(spreads[spread][0])}
            </motion.div>
          </AnimatePresence>
          <Leaf turn={turn} className="inset-0 rounded-2xl" />
        </div>
      )}
      <PageNav onPrev={spread > 0 ? () => nav(-1) : undefined} onNext={spread < spreads.length - 1 ? () => nav(1) : undefined} />
    </motion.div>
  );
}

/** A parchment leaf sweeping over the spine on each page turn. */
function Leaf({ turn, className }: { turn: { n: number; dir: 1 | -1 }; className: string }) {
  if (!turn.n) return null;
  return (
    <motion.div
      key={turn.n}
      initial={{ rotateY: 0, opacity: 1 }}
      animate={{ rotateY: turn.dir * -180, opacity: [1, 1, 0] }}
      transition={{ duration: 0.75, ease: [0.45, 0, 0.25, 1] }}
      style={{ transformOrigin: turn.dir > 0 ? 'left center' : 'right center', transformStyle: 'preserve-3d' }}
      className={`parchment-page pointer-events-none absolute rounded-md shadow-[0_0_40px_rgba(0,0,0,0.5)] ${className}`}
    />
  );
}

function PageNav({ onPrev, onNext }: { onPrev?: () => void; onNext?: () => void }) {
  const cls = 'absolute bottom-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-amber-100/80 backdrop-blur transition hover:bg-black/60 disabled:opacity-0';
  return (
    <>
      <button onClick={onPrev} disabled={!onPrev} aria-label="Previous page" className={`${cls} left-3`}>‹</button>
      <button onClick={onNext} disabled={!onNext} aria-label="Next page" className={`${cls} right-3`}>›</button>
    </>
  );
}

function TitlePage({
  story,
  plate,
  onPlate,
  shot,
  first,
}: {
  story: Story;
  plate: string | null;
  onPlate: (url: string) => void;
  /** The painted shot for the passage being read, shown as a living plate. */
  shot: { url: string; index: number } | null;
  first: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const engrave = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await fetchIllustration({ title: story.title, place: story.place, year: story.year, fact: story.facts[0]?.text || story.hook });
      onPlate(res.imageUrl);
    } catch (e) {
      setErr((e as Error).message || 'Engraving failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full flex-col font-ancient text-[#2a1d12]">
      <p className="text-center text-[0.95cqw] uppercase tracking-[0.3em] text-[#784d1e]">— Chapter the First —</p>
      <h1 className="mt-[0.6cqw] text-center font-blackletter text-[2.4cqw] leading-[1.15]">{story.title}</h1>
      <p className="mt-[0.4cqw] text-center text-[1.05cqw] italic text-[#634320]">
        {story.date || formatYear(story.year)} · {story.place}
      </p>
      <div className="my-[0.8cqw] flex items-center gap-2 text-[#735028]/60">
        <div className="h-px flex-1 bg-[#735028]/30" />
        <span className="text-[1cqw]">❦</span>
        <div className="h-px flex-1 bg-[#735028]/30" />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-[#543b1f]/30">
        {shot ? (
          <AnimatePresence>
            <motion.div key={shot.index} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.4 }} className="absolute inset-0">
              <KenBurns src={shot.url} shot={story.shots[shot.index]} className="sepia-[0.35]" />
            </motion.div>
          </AnimatePresence>
        ) : story.shots?.length ? (
          <div className="grid h-full w-full place-items-center bg-[#f4e7cd]/40 p-2 text-center text-[0.9cqw] italic text-[#4a341e]">The engraver is at work on this plate…</div>
        ) : plate ? (
          <img src={plate} alt={`Engraving: ${story.title}`} className="h-full w-full object-cover sepia-[0.45] mix-blend-multiply" />
        ) : (
          <button onClick={engrave} disabled={busy} className="grid h-full w-full place-items-center bg-[#f4e7cd]/40 p-2 text-center text-[0.9cqw] text-[#4a341e] transition hover:bg-[#f4e7cd]/70">
            <span>
              {busy ? 'Engraving the plate…' : '🖋 Engrave an illustration'}
              {err && <span className="mt-1 block text-rose-800">{err}</span>}
            </span>
          </button>
        )}
      </div>
      {first && story.hook && <p className="mt-[0.8cqw] text-center text-[1.15cqw] italic leading-snug text-[#3b2715]">“{story.hook}”</p>}
    </div>
  );
}

/** A paragraph in ink: faint until read, dark once spoken, glowing on the spoken word. */
function ParagraphPage({ words, start, activeWord, first, reveal, story }: Chunk & { activeWord: number; reveal: boolean; story: Story | null }) {
  const activeRef = useRef<HTMLSpanElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = activeRef.current;
    const box = boxRef.current;
    if (el && box && (el.offsetTop > box.scrollTop + box.clientHeight - 40 || el.offsetTop < box.scrollTop)) {
      box.scrollTo({ top: el.offsetTop - box.clientHeight * 0.3, behavior: 'smooth' });
    }
  }, [activeWord]);
  return (
    <div ref={boxRef} className="relative h-full overflow-y-auto font-ancient [scrollbar-width:none] text-[#2a1d12]">
      {story && (
        <div className="mb-4 text-center">
          <h1 className="font-blackletter text-3xl leading-tight">{story.title}</h1>
          <p className="mt-1 text-xs italic text-[#634320]">{story.date || formatYear(story.year)} · {story.place}</p>
        </div>
      )}
      <p className="font-ancient text-[19px] leading-[1.8] md:text-[1.5cqw] md:leading-[1.8]">
        {words.map((w, k) => {
          const i = start + k;
          const cls = i === activeWord ? 'ink ink-active' : i < activeWord ? 'ink ink-read' : reveal ? 'ink ink-unwritten' : 'ink';
          return (
            <span key={i} ref={i === activeWord ? activeRef : undefined} className={cls}>
              {first && k === 0 ? <span className="drop-cap !font-blackletter md:!text-[4.2cqw]">{w[0]}</span> : null}
              {first && k === 0 ? w.slice(1) : w}{' '}
            </span>
          );
        })}
      </p>
    </div>
  );
}

/** Below the book: the narrator, a live waveform and the playback controls. */
function Controls({
  story,
  voice,
  voiceReady,
  narration,
  voiceControl,
  onAnother,
  scene,
  asking,
  onAsk,
  view,
  onView,
}: Props & { asking: boolean; onAsk: () => void; view: 'film' | 'book'; onView: () => void }) {
  const { state, toggle, restart, narrator, error } = narration;
  const playing = state === 'playing';
  const status =
    state === 'error' ? error || 'Narration failed'
    : !voiceReady ? `Auditioning local storytellers for ${story?.place.split(',').pop()?.trim() || 'this place'}…`
    : state === 'loading' || state === 'idle' ? `${voice.name} clears their throat…`
    : `${voice.flag} ${voice.name} reads · ${voice.accent}`;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass flex w-full max-w-2xl items-center gap-3 rounded-2xl px-3 py-2">
      <div className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 transition ${playing ? 'ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.6)]' : 'ring-white/15'}`}>
        <img src={scene ?? '/assets/historian-opening.jpg'} alt="" className="h-full w-full scale-[2.6] object-cover" style={{ transformOrigin: '69% 31%' }} />
      </div>
      <div className="min-w-0 flex-1">
        <Waveform analyser={narrator?.analyser ?? null} active={playing} />
        <p className={`truncate text-[11px] ${state === 'error' ? 'text-rose-300/90' : 'text-white/55'}`}>{status}</p>
      </div>
      <button onClick={toggle} disabled={!narrator || state === 'loading'} aria-label={playing ? 'Pause' : 'Play'} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-b from-amber-100 to-amber-300 text-[#1a1408] transition hover:scale-105 disabled:opacity-60">
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5Z" /></svg>
        )}
      </button>
      <button onClick={restart} disabled={!narrator} className="btn-ghost !px-3" aria-label="Read again from the start">↺</button>
      <MicButton voice={voiceControl} size="md" />
      <button onClick={onView} className="btn-ghost !px-3" title={view === 'film' ? 'Read it in the book' : 'Watch it as a film'}>
        {view === 'film' ? '📖' : '🎞'} <span className="hidden sm:inline">{view === 'film' ? 'Book' : 'Film'}</span>
      </button>
      <button onClick={onAsk} aria-pressed={asking} className={`btn-ghost !px-3 ${asking ? '!bg-amber-200/15 !text-amber-100' : ''}`}>
        💬 <span className="hidden sm:inline">Ask</span>
      </button>
      <button onClick={onAnother} className="btn-ghost hidden sm:block">✦ Another story</button>
    </motion.div>
  );
}

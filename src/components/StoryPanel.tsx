import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatYear, langLabel, type Mode, type NearbyEcho, type Story } from '../lib/api';
import type { Teller } from '../lib/useTeller';
import type { Spoken } from '../lib/useSpoken';
import type { useAsk } from '../lib/useAsk';
import { Waveform } from './Waveform';

type Ask = ReturnType<typeof useAsk>;

interface Props {
  teller: Teller;
  spoken: Spoken;
  ask: Ask;
  placeLabel: string;
  activeStop: number;
  onClose: () => void;
  onAnother: () => void;
  onEcho: (e: NearbyEcho) => void;
  onRetry: () => void;
  onRetell: (opts: { mode: Mode; lang: 'en' | 'local' }) => void;
  onStop: (index: number) => void;
}

export function StoryPanel(props: Props) {
  const { teller, onClose } = props;
  const { story, error, phase } = teller;
  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className="panel pointer-events-auto absolute z-20 flex flex-col overflow-hidden
        inset-x-2 bottom-2 max-h-[64vh] rounded-3xl
        md:inset-x-auto md:right-4 md:top-20 md:bottom-4 md:max-h-none md:w-[460px]"
    >
      <button
        onClick={onClose}
        aria-label="Close story"
        className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-ink/5 text-ink/60 transition hover:bg-ink/10 hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M1 1l12 12M13 1L1 13" />
        </svg>
      </button>
      {phase === 'error' && !story?.paragraphs.length ? (
        <ErrorState error={error} onRetry={props.onRetry} />
      ) : !story ? (
        <LoadingState place={props.placeLabel} />
      ) : (
        <StoryView {...props} story={story} />
      )}
    </motion.aside>
  );
}

const LOADING_LINES = [
  'Searching the web for what happened here…',
  'Listening for echoes in the ground…',
  'Matching every claim to a source…',
  'Tracing old maps and letters…',
  'Separating legend from fact…',
  'Double-checking dates and numbers…',
];

function LoadingState({ place }: { place: string }) {
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
    <div className="flex flex-1 flex-col gap-6 p-7 pt-8">
      <div>
        <p className="eyebrow">Researching</p>
        <p className="mt-1 pr-10 text-sm text-ink/70">{place || 'your pin'}</p>
      </div>
      <div className="font-display text-6xl tabular-nums text-accent/90">{formatYear(year)}</div>
      <motion.p key={line} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-sm italic text-ink/60">
        {LOADING_LINES[line]}
      </motion.p>
      <div className="space-y-3">
        {[92, 100, 84, 96, 70].map((w, i) => (
          <div key={i} className="shimmer h-3 rounded-full" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-start gap-4 p-7 pt-10">
      <p className="eyebrow text-bad/80">The archives went quiet</p>
      <p className="pr-8 text-sm text-ink/70">{error}</p>
      <button onClick={onRetry} className="btn-primary">
        Try again
      </button>
    </div>
  );
}

function StoryView({ story, teller, spoken, ask, activeStop, onAnother, onEcho, onRetell, onStop }: Props & { story: Story }) {
  const { activeWord, state } = spoken;
  const { paragraphs, phase } = teller;
  const writing = phase === 'writing';
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const journey = story.kind === 'journey';

  // Keep the spoken word comfortably in view.
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

  // Scroll a fresh answer into view.
  useEffect(() => {
    if (ask.thread.length) scrollRef.current?.querySelector('[data-qa-last]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [ask.thread.length]);

  const local = story.localLang ? langLabel(story.localLang) : null;
  const verifiedClaims = story.claims.filter((c) => c.verified);
  const leftOut = story.claims.length - verifiedClaims.length;

  let wordIndex = 0;
  return (
    <>
      <div ref={scrollRef} className="scroll-fade flex-1 overflow-y-auto px-7 pb-6 pt-7">
        <div className="flex flex-wrap items-center gap-2 pr-10">
          {story.year != null && <span className="chip chip-accent">{formatYear(story.year)}</span>}
          {journey && <span className="chip">🧭 Journey</span>}
          {story.mode === 'eyewitness' && <span className="chip">🎭 Eyewitness</span>}
          {story.lang !== 'en' && (
            <span className="chip">
              {langLabel(story.lang).flag} {langLabel(story.lang).name}
            </span>
          )}
          <span className="text-xs text-ink/50">{story.date}</span>
        </div>
        <h2 className="mt-3 font-display text-[2rem] leading-[1.1] text-ink">{story.title}</h2>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-ink/55">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-accent/80">
            <path d="M12 2C7.6 2 4 5.5 4 9.9 4 15.5 12 22 12 22s8-6.5 8-12.1C20 5.5 16.4 2 12 2Zm0 10.6a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z" />
          </svg>
          {story.place}
          {!journey && story.distanceKm != null && story.distanceKm > 1 && <span className="text-ink/35">· {Math.round(story.distanceKm)} km from your pin</span>}
        </p>
        {story.hook && <p className="mt-4 font-display text-lg italic leading-snug text-gold">“{story.hook}”</p>}

        {/* Retell switches */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Segmented
            disabled={writing}
            value={story.mode}
            options={[
              { id: 'narrator', label: '🎙 Narrator' },
              { id: 'eyewitness', label: '🎭 Eyewitness' },
            ]}
            onChange={(m) => onRetell({ mode: m as Mode, lang: story.lang === 'en' ? 'en' : 'local' })}
          />
          {local && !journey && (
            <Segmented
              disabled={writing}
              value={story.lang === 'en' ? 'en' : 'local'}
              options={[
                { id: 'en', label: '🇬🇧 English' },
                { id: 'local', label: `${local.flag} ${local.name}` },
              ]}
              onChange={(l) => onRetell({ mode: story.mode, lang: l as 'en' | 'local' })}
            />
          )}
        </div>
        {story.mode === 'eyewitness' && (
          <p className="mt-3 rounded-xl bg-ink/[0.04] px-3.5 py-2.5 text-xs leading-relaxed text-ink/60">
            🎭 Told by <span className="text-ink/80">{story.witness.role}</span>. A dramatised first-person retelling, built only from the verified facts below.
          </p>
        )}

        {/* Journey stops */}
        {journey && story.stops.length > 0 && (
          <ol className="mt-6 space-y-1">
            {story.stops.map((s, i) => (
              <li key={s.index}>
                <button
                  onClick={() => onStop(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${i === activeStop ? 'bg-accent/10' : 'hover:bg-ink/5'}`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                      i <= activeStop ? 'bg-accent text-accent-ink' : 'bg-ink/10 text-ink/60'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${i === activeStop ? 'font-medium text-ink' : 'text-ink/75'}`}>{s.name}</span>
                    <span className="block truncate text-[11px] text-ink/45">{s.date}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {/* Narration */}
        <div className="mt-6 space-y-4 text-[15.5px] leading-[1.75]">
          {paragraphs.map((p, pi) => (
            <div key={pi}>
              {journey && story.stops[pi] && (
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent/80">
                  Stop {pi + 1} · {story.stops[pi].name}
                </p>
              )}
              <p>
                {p.split(/\s+/).filter(Boolean).map((w) => {
                  const i = wordIndex++;
                  const cls = i === activeWord ? 'word word-active' : i < activeWord ? 'word word-spoken' : 'word';
                  return (
                    <span key={i} ref={i === activeWord ? activeRef : undefined} className={cls}>
                      {w}{' '}
                    </span>
                  );
                })}
                {writing && pi === paragraphs.length - 1 && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-accent" />}
              </p>
              {story.subtitles?.[pi] && <p className="mt-1.5 text-[13px] italic leading-relaxed text-ink/50">{story.subtitles[pi]}</p>}
            </div>
          ))}
          {writing && !paragraphs.length && (
            <p className="text-sm italic text-ink/50">
              {story.voice.flag} {story.voice.name} is starting the story…
            </p>
          )}
        </div>

        {/* Conversation */}
        {ask.thread.length > 0 && (
          <section className="mt-8 space-y-4">
            <h3 className="eyebrow">Your questions</h3>
            {ask.thread.map((qa, i) => (
              <div key={i} data-qa-last={i === ask.thread.length - 1 ? '' : undefined} className="space-y-2">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent/10 px-3.5 py-2 text-sm text-ink">{qa.q}</p>
                <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-ink/[0.04] px-3.5 py-2.5 text-sm leading-relaxed text-ink/85">
                  {qa.error ? (
                    <span className="text-bad">{qa.error}</span>
                  ) : qa.a ? (
                    qa.a
                  ) : (
                    <span className="inline-flex gap-1 text-ink/40">
                      <Dot /> <Dot d={150} /> <Dot d={300} />
                    </span>
                  )}
                  {qa.sources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {qa.sources.map((s) => (
                        <a key={s.uri} href={s.uri} target="_blank" rel="noreferrer" className="chip !py-0.5 !text-[11px] hover:bg-ink/10">
                          {s.title} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Fact check */}
        {story.claims.length > 0 && (
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="eyebrow">Every fact, sourced</h3>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${story.factCheck.partial ? 'bg-accent/10 text-accent' : 'bg-good/10 text-good'}`}>
                <CheckIcon /> {verifiedClaims.length}/{story.claims.length} matched to Google Search
              </span>
            </div>
            <Claims story={story} />
            {story.factCheck.partial ? (
              <p className="mt-3 text-xs text-accent">Few claims could be matched to sources for this one, so treat the details with care.</p>
            ) : (
              leftOut > 0 && (
                <p className="mt-3 text-xs text-ink/50">
                  {leftOut} claim{leftOut > 1 ? 's' : ''} couldn't be matched to a source and {leftOut > 1 ? 'were' : 'was'} left out of the story.
                </p>
              )
            )}
          </section>
        )}

        {!journey && story.nearby.length > 0 && (
          <section className="mt-8">
            <h3 className="eyebrow">More echoes nearby</h3>
            <div className="mt-3 grid gap-2">
              {story.nearby.map((n) => (
                <button key={n.title} onClick={() => onEcho(n)} className="echo-card group">
                  <span className="echo-dot !h-2.5 !w-2.5 shrink-0 rounded-full !border" />
                  <span className="flex-1 text-left text-sm text-ink/85">{n.title}</span>
                  <span className="text-xs tabular-nums text-ink/40">{formatYear(n.year)}</span>
                  <span className="text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-ink/70">→</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <Player story={story} teller={teller} spoken={spoken} ask={ask} onAnother={onAnother} />
    </>
  );
}

function Claims({ story }: { story: Story }) {
  const [all, setAll] = useState(false);
  const verified = story.claims.filter((c) => c.verified);
  const list = story.factCheck.partial ? story.claims : verified;
  const shown = all ? list : list.slice(0, 4);
  return (
    <>
      <ul className="mt-3 space-y-3">
        {shown.map((c) => (
          <li key={c.text} className="flex gap-3 text-sm text-ink/75">
            <span className={`mt-[3px] shrink-0 ${c.verified ? 'text-good' : 'text-ink/30'}`}>
              <CheckIcon />
            </span>
            <span>
              {c.text}
              {c.sources.length > 0 && (
                <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                  {c.sources.slice(0, 2).map((s) => (
                    <a key={s.uri} href={s.uri} target="_blank" rel="noreferrer" className="rounded-md bg-ink/[0.06] px-1.5 py-px text-[10.5px] text-ink/55 transition hover:bg-ink/10 hover:text-ink">
                      {s.title}
                    </a>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {list.length > 4 && (
        <button onClick={() => setAll((a) => !a)} className="mt-3 text-xs font-medium text-accent hover:underline">
          {all ? 'Show fewer' : `Show all ${list.length} facts`}
        </button>
      )}
    </>
  );
}

function Player({ story, teller, spoken, ask, onAnother }: { story: Story; teller: Teller; spoken: Spoken; ask: Ask; onAnother: () => void }) {
  const { state, position, duration, error } = spoken;
  const narrator = teller.narrator;
  const answering = ask.state === 'answering' || ask.state === 'thinking';
  const playing = state === 'playing';
  const progress = duration > 0 && narrator?.complete ? Math.min(1, position / duration) : 0;
  const [copied, setCopied] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  const toggle = () => {
    if (!narrator || state === 'ended' || state === 'error') return teller.replay();
    if (state === 'playing' || state === 'loading') void narrator.pause();
    else if (state === 'paused') void narrator.resume();
  };

  const share = async () => {
    const url = `${location.origin}${location.pathname}?s=${encodeURIComponent(story.id)}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: `Echoes · ${story.title}`, url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* cancelled */
    }
  };

  const voice = story.voice;
  const canShare = teller.phase === 'done';

  return (
    <div className="relative border-t border-ink/[0.06] bg-ink/[0.03] px-5 pb-5 pt-4">
      <AskBubble ask={ask} />
      <div className="relative mb-4 h-[3px] overflow-hidden rounded-full bg-ink/[0.06]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[var(--accent-2)] to-accent text-accent-ink shadow-[0_8px_24px_-6px_var(--glow)] transition hover:scale-105 active:scale-95 disabled:opacity-80"
        >
          {state === 'loading' ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
          ) : playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
          ) : state === 'ended' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5Z" /></svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <Waveform analyser={(answering ? ask.answerNarrator?.analyser : narrator?.analyser) ?? null} active={playing || ask.state === 'answering'} />
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-ink/45">
            <span className="truncate">
              {ask.state === 'answering' ? (
                <>
                  {voice.flag} <span className="text-ink/75">{voice.name}</span> is answering…
                </>
              ) : state === 'error' ? (
                <span className="text-bad/90">{error || 'Narration failed'}</span>
              ) : state === 'loading' ? (
                `${voice.name} is clearing their throat…`
              ) : !narrator ? (
                <>Press play to listen</>
              ) : (
                <>
                  {voice.flag} {story.mode === 'eyewitness' ? 'Voiced by' : 'Narrated by'} <span className="text-ink/75">{voice.name}</span>
                  {voice.accent ? ` · ${voice.accent}` : ''}
                </>
              )}
            </span>
            <span className="shrink-0 tabular-nums">{fmt(position)}</span>
          </div>
        </div>
        <MicButton ask={ask} disabled={teller.phase !== 'done'} />
      </div>
      <div className="mt-4 flex gap-2">
        {story.kind === 'place' && (
          <button onClick={onAnother} className="btn-ghost flex-1" disabled={teller.phase === 'writing'}>
            ✦ Another story
          </button>
        )}
        <button onClick={teller.replay} className="btn-ghost" disabled={!story.paragraphs.length} aria-label="Replay from start">
          ↺ Replay
        </button>
        <button onClick={() => setTyping((t) => !t)} className="btn-ghost" disabled={teller.phase !== 'done'} aria-label="Type a question">
          ⌨ Ask
        </button>
        <button onClick={share} className={`btn-ghost ${story.kind === 'journey' ? 'flex-1' : ''}`} disabled={!canShare}>
          {copied ? '✓ Copied' : '↗ Share'}
        </button>
      </div>
      <AnimatePresence>
        {typing && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              void ask.ask(draft);
              setDraft('');
              setTyping(false);
            }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex gap-2">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Ask ${voice.name} anything about this story…`}
                className="min-w-0 flex-1 rounded-xl border border-ink/10 bg-ink/[0.03] px-3 py-2 text-sm text-ink outline-none placeholder:text-ink/40 focus:border-accent/50"
              />
              <button className="btn-primary !py-2">Ask</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Hold to talk, or tap to start and tap again to send. */
function MicButton({ ask, disabled }: { ask: Ask; disabled: boolean }) {
  const pressedAt = useRef(0);
  const listening = ask.state === 'listening' || ask.state === 'connecting';
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!listening) return setLevel(0);
    let raf = 0;
    const tick = () => {
      setLevel(ask.level());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [listening, ask]);

  const down = () => {
    if (disabled) return;
    if (listening) return void ask.done(); // second tap sends
    pressedAt.current = Date.now();
    void ask.listen();
  };
  const up = () => {
    if (listening && pressedAt.current && Date.now() - pressedAt.current > 400) void ask.done(); // released after holding
    pressedAt.current = 0;
  };

  return (
    <button
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      disabled={disabled}
      aria-label={listening ? 'Send question' : 'Ask a question out loud'}
      title={disabled ? 'Available when the story is ready' : 'Hold to ask, or tap to start and tap again to send'}
      className={`relative grid h-12 w-12 shrink-0 select-none place-items-center rounded-full border transition disabled:opacity-40 ${
        listening ? 'border-accent bg-accent text-accent-ink' : 'border-ink/15 bg-ink/[0.04] text-ink/70 hover:text-ink'
      }`}
    >
      {listening && (
        <span className="absolute inset-0 rounded-full bg-accent/30" style={{ transform: `scale(${1 + level * 0.6})`, transition: 'transform 80ms' }} />
      )}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="relative">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v4" />
      </svg>
    </button>
  );
}

function AskBubble({ ask }: { ask: Ask }) {
  const show = ask.state === 'listening' || ask.state === 'connecting' || ask.state === 'thinking' || !!ask.error;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="panel absolute inset-x-4 bottom-full mb-3 rounded-2xl px-4 py-3 text-sm"
        >
          {ask.error && ask.state === 'idle' ? (
            <span className="text-bad">{ask.error}</span>
          ) : ask.state === 'thinking' ? (
            <span className="text-ink/60">Looking that up…</span>
          ) : (
            <>
              <span className="eyebrow !text-accent">{ask.state === 'connecting' ? 'Starting mic…' : 'Listening'}</span>
              <p className="mt-1 min-h-[1.25rem] text-ink/85">{ask.transcript || <span className="text-ink/40">Ask anything about this story…</span>}</p>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Segmented({ value, options, onChange, disabled }: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <div className={`inline-flex rounded-xl bg-ink/[0.05] p-0.5 ${disabled ? 'opacity-50' : ''}`}>
      {options.map((o) => (
        <button
          key={o.id}
          disabled={disabled || o.id === value}
          onClick={() => onChange(o.id)}
          className={`rounded-[10px] px-3 py-1.5 text-xs transition ${o.id === value ? 'bg-[var(--surface-strong)] font-medium text-ink shadow-sm' : 'text-ink/60 hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Dot({ d = 0 }: { d?: number }) {
  return <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />;
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 6.2l2.3 2.3 4.7-5" />
    </svg>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchIllustration, formatYear, type Story } from '../lib/api';
import { playPageTurnSound } from '../lib/tomeAudio';

interface Props {
  story: Story | null;
  loading: boolean;
  place: string;
  isOpen: boolean;
  onClose: () => void;
  onStartNarration?: () => void;
  isNarrating?: boolean;
}

type Stage = 'chair' | 'opening' | 'book';

export function HistorianOpening({ story, loading, place, isOpen, onClose, onStartNarration, isNarrating }: Props) {
  const [stage, setStage] = useState<Stage>('chair');
  const [illustrationUrl, setIllustrationUrl] = useState<string | null>(null);
  const [generatingArt, setGeneratingArt] = useState(false);
  const [artError, setArtError] = useState('');
  const autoOpened = useRef(false);

  // Default to pre-cached Rome engraving if available
  useEffect(() => {
    if (!story) return;
    const isRome = story.place.toLowerCase().includes('rome') || story.title.toLowerCase().includes('rome');
    if (isRome) {
      setIllustrationUrl('/assets/plate-rome.jpg');
    } else {
      setIllustrationUrl(null);
    }
    setArtError('');
  }, [story]);

  // When story finishes loading, automatically advance from chair to book after a moment
  useEffect(() => {
    if (isOpen && story && !loading && stage === 'chair' && !autoOpened.current) {
      autoOpened.current = true;
      const t = setTimeout(() => {
        handleOpenBook();
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [isOpen, story, loading, stage]);

  // Reset auto-open flag when closed
  useEffect(() => {
    if (!isOpen) {
      setStage('chair');
      autoOpened.current = false;
    }
  }, [isOpen]);

  const handleOpenBook = () => {
    playPageTurnSound();
    setStage('opening');
    setTimeout(() => {
      setStage('book');
    }, 950);
  };

  const handleReplay = () => {
    setStage('chair');
    autoOpened.current = false;
  };

  const handleGenerateIllustration = async () => {
    if (!story || generatingArt) return;
    setGeneratingArt(true);
    setArtError('');
    try {
      const res = await fetchIllustration({
        title: story.title,
        place: story.place,
        year: story.year,
        fact: story.facts[0]?.text || story.hook,
      });
      setIllustrationUrl(res.imageUrl);
    } catch (err) {
      setArtError((err as Error).message || 'Generation failed');
    } finally {
      setGeneratingArt(false);
    }
  };

  if (!isOpen) return null;

  // Chapter numeral calculation (e.g. from year or default I)
  const chapterNumber = story?.year ? toRoman(Math.abs(story.year) % 20 || 1) : 'I';
  const displayTitle = story?.title || (loading ? `Chronicle of ${place || 'the Realm'}` : 'The Unrecorded Annals');
  const displayFact = story?.hook || story?.facts[0]?.text || (loading ? 'Searching ancient scrolls, maps, and archival letters…' : 'Every cobblestone retains the memory of those who walked it.');
  const displayDate = story ? `${story.date || formatYear(story.year)} · ${story.place}` : (place || 'Uncharted coordinates');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-md md:p-6"
    >
      {/* Top right close button */}
      <button
        onClick={onClose}
        aria-label="Close chronicle"
        className="absolute right-4 top-4 z-50 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3.5 py-1.5 text-xs font-medium text-white/80 shadow-lg backdrop-blur-md transition hover:bg-white/10 hover:text-white"
      >
        <span>Close to map</span>
        <svg width="12" height="12" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M1 1l12 12M13 1L1 13" />
        </svg>
      </button>

      {/* Main Animation Container */}
      <div className="relative aspect-[16/10] w-full max-w-5xl overflow-hidden rounded-3xl border border-amber-500/20 bg-[#0f0b07] shadow-[0_25px_80px_rgba(0,0,0,0.9),0_0_50px_rgba(245,158,11,0.15)]">
        
        {/* ============================================================== */}
        {/* STAGE 1: HISTORIAN SITTING IN CHAIR OPENING THE BOOK           */}
        {/* ============================================================== */}
        <AnimatePresence>
          {stage === 'chair' && (
            <motion.div
              key="chair-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.15 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex flex-col justify-between overflow-hidden"
            >
              {/* Historian Image with Ken Burns zoom */}
              <motion.img
                src="/assets/historian-opening.jpg"
                alt="Historian sitting in armchair opening book"
                className="absolute inset-0 h-full w-full object-cover object-center"
                initial={{ scale: 1 }}
                animate={{ scale: 1.06 }}
                transition={{ duration: 8, ease: 'easeOut' }}
              />

              {/* Candlelight warm flicker vignette */}
              <div className="candle-glow pointer-events-none absolute inset-0 bg-radial-[circle_at_30%_55%] from-amber-400/25 via-amber-700/10 to-transparent mix-blend-screen" />
              <div className="candle-glow pointer-events-none absolute inset-0 bg-radial-[circle_at_95%_75%] from-orange-500/20 via-transparent to-transparent mix-blend-screen" />

              {/* Dark chiaroscuro edge vignettes */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/70" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />

              {/* Atmospheric dust motes */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {[...Array(14)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute h-1 w-1 rounded-full bg-amber-200/50 shadow-[0_0_8px_rgba(253,224,71,0.8)]"
                    style={{
                      left: `${15 + (i * 6.5) % 75}%`,
                      top: `${30 + (i * 7) % 55}%`,
                      animation: `floatMote ${3 + (i % 4)}s ease-in-out infinite`,
                      animationDelay: `${i * 0.4}s`,
                    }}
                  />
                ))}
              </div>

              {/* Header inscription */}
              <div className="relative z-10 p-6 md:p-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-black/50 px-3.5 py-1 text-xs uppercase tracking-widest text-amber-200 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
                  Archivum Historicum · Echoes
                </div>
              </div>

              {/* Bottom Inscription & Action */}
              <div className="relative z-10 flex flex-col items-center justify-end p-6 text-center md:p-10">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="max-w-2xl rounded-2xl border border-amber-300/20 bg-black/60 p-5 shadow-2xl backdrop-blur-md md:p-6"
                >
                  <p className="font-serif text-xs uppercase tracking-[0.25em] text-amber-300/80">
                    {loading ? 'Searching the Chronicles' : 'The Historian Unseals the Tome'}
                  </p>
                  <h2 className="mt-1 font-display text-2xl text-amber-100 sm:text-3xl">
                    {loading ? (
                      <span className="inline-flex items-center gap-2">
                        Retrieving lore from {place || 'the archives'}
                        <span className="inline-block animate-pulse">…</span>
                      </span>
                    ) : (
                      `"${displayTitle}"`
                    )}
                  </h2>
                  <p className="mt-2 text-sm italic text-amber-200/70">
                    {loading ? 'Consulting authoritative records, municipal charters and old accounts…' : `Chapter inscribed for ${place || 'this ground'}`}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <button
                      onClick={handleOpenBook}
                      className="group flex items-center gap-2 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 px-5 py-2.5 text-sm font-semibold text-black shadow-[0_0_25px_rgba(245,158,11,0.4)] transition hover:brightness-110 active:scale-95"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      <span>Open the Book</span>
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </button>

                    {story && onStartNarration && (
                      <button
                        onClick={() => {
                          handleOpenBook();
                          onStartNarration();
                        }}
                        className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-md transition hover:bg-white/20 active:scale-95"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        <span>Listen to Voice</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================================== */}
        {/* STAGE 2: 3D BOOK COVER HINGING OPEN                           */}
        {/* ============================================================== */}
        <AnimatePresence>
          {stage === 'opening' && (
            <motion.div
              key="opening-stage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center bg-[#0a0704] [perspective:1400px]"
            >
              {/* Backing open parchment */}
              <div className="parchment-page absolute h-[85%] w-[88%] rounded-2xl shadow-2xl" />

              {/* Golden light burst from spine */}
              <motion.div
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: [0, 0.9, 0], scale: [0.8, 1.4, 2] }}
                transition={{ duration: 0.9 }}
                className="pointer-events-none absolute h-64 w-64 rounded-full bg-amber-400/40 blur-3xl"
              />

              {/* Turning 3D Leather Cover */}
              <motion.div
                initial={{ rotateY: 0 }}
                animate={{ rotateY: -130 }}
                transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
                style={{ transformOrigin: 'left center' }}
                className="absolute left-[6%] h-[85%] w-[44%] rounded-l-2xl border-2 border-amber-900/60 bg-gradient-to-r from-[#29170a] via-[#3a200f] to-[#1e1006] p-6 shadow-[15px_0_35px_rgba(0,0,0,0.8)] [backface-visibility:hidden]"
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-amber-500/30 p-4 text-center">
                  <div className="font-serif text-xs uppercase tracking-[0.3em] text-amber-300/80">ECHOES</div>
                  <div className="my-3 h-[1px] w-20 bg-amber-500/40" />
                  <div className="font-display text-xl text-amber-200">HISTORIA MUNDI</div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================================== */}
        {/* STAGE 3: OPEN BOOK WITH CHAPTER NAMED AFTER EVENT / FACT       */}
        {/* ============================================================== */}
        <AnimatePresence>
          {stage === 'book' && (
            <motion.div
              key="book-stage"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 flex flex-col justify-between overflow-hidden"
            >
              {/* Antique Open Book Background */}
              <img
                src="/assets/open-tome.jpg"
                alt="Open antique tome"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />

              {/* Soft parchment warm overlay for text readability */}
              <div className="pointer-events-none absolute inset-0 bg-[#e7d7b5]/50 mix-blend-multiply" />
              <div className="pointer-events-none absolute inset-0 bg-radial-[circle_at_50%_50%] from-transparent via-black/10 to-black/60" />

              {/* Spine shadow in center */}
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-16 -translate-x-1/2 bg-gradient-to-r from-transparent via-black/25 to-transparent" />

              {/* Book Content Spread */}
              <div className="relative z-10 flex flex-1 flex-col overflow-y-auto px-6 py-6 md:px-12 md:py-8">
                
                {/* Header ribbon */}
                <div className="flex items-center justify-between border-b border-[#735028]/30 pb-3 text-xs tracking-wider text-[#543b1f]">
                  <span className="font-serif uppercase tracking-[0.2em]">Archivum Historicum · Vol. {chapterNumber}</span>
                  <span className="italic">{displayDate}</span>
                </div>

                {/* Main 2-column or responsive layout */}
                <div className="mt-4 grid flex-1 gap-6 md:grid-cols-12 md:gap-8">
                  
                  {/* Left Page: Chapter Header named after historic event / fact */}
                  <div className="flex flex-col justify-center md:col-span-7">
                    <div className="font-serif text-xs uppercase tracking-[0.3em] text-[#784d1e]">
                      — CHAPTER {chapterNumber} —
                    </div>

                    {/* Chapter Name: Named after the historic event */}
                    <h1 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-[#221509] sm:text-3xl md:text-4xl">
                      {displayTitle}
                    </h1>

                    <div className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#634320]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#8c3514]" />
                      <span>{story?.place || place}</span>
                      {story?.year != null && <span>· {formatYear(story.year)}</span>}
                    </div>

                    {/* Ornate Divider Flourish */}
                    <div className="my-3 flex items-center gap-2 text-[#735028]/60">
                      <div className="h-[1px] flex-1 bg-[#735028]/30" />
                      <span className="font-serif text-sm">❦</span>
                      <div className="h-[1px] flex-1 bg-[#735028]/30" />
                    </div>

                    {/* The Historic Fact / Hook inscribed on the parchment */}
                    <div className="text-[15px] leading-relaxed text-[#2a1d12]">
                      <span className="drop-cap">
                        {displayFact.charAt(0) || 'T'}
                      </span>
                      <span className="font-serif italic">
                        {displayFact.slice(1)}
                      </span>
                    </div>

                    {/* Additional facts from research brief */}
                    {story && story.facts.length > 1 && (
                      <div className="mt-4 rounded-xl border border-[#785028]/25 bg-[#efe2c5]/70 p-3.5 shadow-sm">
                        <p className="font-serif text-[11px] uppercase tracking-widest text-[#664320]">Recorded Facts:</p>
                        <ul className="mt-1.5 space-y-1 text-xs text-[#2c1e14]">
                          {story.facts.slice(0, 2).map((f, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="text-[#8c3514]">✦</span>
                              <span>{f.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Right Page: Engraving Plate (Nano Banana Pro🍌) */}
                  <div className="flex flex-col items-center justify-center md:col-span-5">
                    <div className="w-full overflow-hidden rounded-xl border-2 border-[#543b1f]/40 bg-[#3d2915]/10 p-2 shadow-md">
                      {illustrationUrl ? (
                        <div className="relative overflow-hidden rounded-lg">
                          <img
                            src={illustrationUrl}
                            alt={`Archival engraving: ${displayTitle}`}
                            className="aspect-[4/3] w-full object-cover sepia-[0.35]"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2 text-center text-[11px] text-amber-100">
                            Archival Engraving Plate · {story?.place || place}
                          </div>
                        </div>
                      ) : (
                        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-lg border border-dashed border-[#735028]/40 bg-[#f4e7cd]/50 p-4 text-center">
                          <span className="text-2xl">🏛️</span>
                          <p className="mt-2 font-serif text-xs font-medium text-[#4a341e]">
                            Archival Vignette Plate
                          </p>
                          <p className="mt-1 text-[11px] text-[#63482d]">
                            Generate a custom vintage etching using the Nano Banana model.
                          </p>

                          <button
                            onClick={handleGenerateIllustration}
                            disabled={generatingArt || !story}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#785028]/50 bg-[#8c3514] px-3 py-1.5 text-xs font-medium text-amber-100 shadow-sm transition hover:bg-[#a64018] active:scale-95 disabled:opacity-60"
                          >
                            {generatingArt ? (
                              <>
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-200/40 border-t-amber-100" />
                                <span>Generating with Nano Banana 🍌…</span>
                              </>
                            ) : (
                              <>
                                <span>🍌 Engrave Plate</span>
                              </>
                            )}
                          </button>

                          {artError && (
                            <p className="mt-2 text-[10px] text-rose-800">{artError}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Attribution note */}
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-[#614528]">
                      <span>Scriptorium Model:</span>
                      <span className="font-semibold text-[#8c3514]">Nano Banana Pro 🍌</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#735028]/30 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleReplay}
                      className="rounded-lg border border-[#735028]/40 bg-[#f3e5ca]/80 px-3 py-1.5 text-xs font-medium text-[#3b2715] transition hover:bg-[#ede0c3] active:scale-95"
                    >
                      ↺ Replay Historian
                    </button>

                    {illustrationUrl && !generatingArt && (
                      <button
                        onClick={handleGenerateIllustration}
                        className="rounded-lg border border-[#735028]/40 bg-[#f3e5ca]/80 px-3 py-1.5 text-xs font-medium text-[#3b2715] transition hover:bg-[#ede0c3]"
                      >
                        🍌 Re-engrave
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {onStartNarration && (
                      <button
                        onClick={onStartNarration}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-600/40 bg-[#8c3514] px-4 py-1.5 text-xs font-semibold text-amber-100 shadow-sm transition hover:bg-[#a64018] active:scale-95"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        <span>{isNarrating ? 'Playing Narration' : 'Narrate Chapter'}</span>
                      </button>
                    )}

                    <button
                      onClick={onClose}
                      className="rounded-lg border border-[#735028]/50 bg-[#3d2613] px-4 py-1.5 text-xs font-semibold text-amber-100 shadow transition hover:bg-[#4f3118] active:scale-95"
                    >
                      Read Full Story & Map →
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}

function toRoman(num: number): string {
  const romanMap: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let res = '';
  let n = num;
  for (const [val, sym] of romanMap) {
    while (n >= val) {
      res += sym;
      n -= val;
    }
  }
  return res || 'I';
}

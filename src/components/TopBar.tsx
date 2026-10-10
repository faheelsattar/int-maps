import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Era, LangPref, Mode, Pick, Tone } from '../lib/api';
import type { Theme } from '../lib/mapStyle';
import { SearchBar, type SearchResult } from './SearchBar';
import { VOICES, type Voice } from '../lib/voices';

export interface Settings {
  voice: Voice;
  era: Era;
  pick: Pick;
  mode: Mode;
  lang: LangPref;
  tone: Tone;
  speed: number;
}

const ERAS: { id: Era; label: string }[] = [
  { id: 'any', label: 'Any era' },
  { id: 'ancient', label: 'Ancient' },
  { id: 'medieval', label: 'Medieval' },
  { id: 'early', label: '1500–1900' },
  { id: 'modern', label: 'Modern' },
];

const PICKS: { id: Pick; label: string; icon: string; hint: string }[] = [
  { id: 'famous', label: 'Famous', icon: '⭐', hint: 'The landmark events' },
  { id: 'hidden', label: 'Hidden gems', icon: '💎', hint: 'Stories few people know' },
];

const TONES: { id: Tone; label: string; icon: string }[] = [
  { id: 'epic', label: 'Epic', icon: '⚔️' },
  { id: 'mystery', label: 'Mystery', icon: '🕯️' },
  { id: 'heartfelt', label: 'Heartfelt', icon: '🫶' },
  { id: 'witty', label: 'Witty', icon: '🎩' },
];

interface TopBarProps {
  settings: Settings;
  onChange: (s: Settings) => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  onSearch: (r: SearchResult) => void;
  onJourney: (query: string) => void;
}

export function TopBar({ settings, onChange, theme, onTheme, onSearch, onJourney }: TopBarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const tone = TONES.find((t) => t.id === settings.tone)!;
  const era = ERAS.find((e) => e.id === settings.era)!;
  const pick = PICKS.find((p) => p.id === settings.pick)!;

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 md:p-4">
      <div className="glass pointer-events-auto flex h-[42px] shrink-0 items-center gap-3 rounded-2xl px-2.5 md:h-auto md:px-4 md:py-2.5">
        <Logo />
        <div className="hidden leading-tight md:block">
          <h1 className="font-display text-xl tracking-tight text-ink">Echoes</h1>
          <p className="hidden text-[11px] text-ink/45 sm:block">Every place has a story</p>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 justify-center md:pt-1">
        <SearchBar onSelect={onSearch} onJourney={onJourney} />
      </div>

      <div ref={ref} className="pointer-events-auto relative flex shrink-0 items-start gap-2">
        <button
          onClick={() => onTheme(theme === 'light' ? 'dark' : 'light')}
          className="glass grid h-[42px] w-[42px] place-items-center rounded-2xl text-ink/75 transition hover:text-ink"
          aria-label={theme === 'light' ? 'Switch to night map' : 'Switch to day map'}
          title={theme === 'light' ? 'Night map' : 'Day map'}
        >
          {theme === 'light' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          )}
        </button>
        <button onClick={() => setOpen((o) => !o)} className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm text-ink/85 transition hover:bg-ink/[0.07]">
          <span className="text-lg leading-none">{settings.voice.flag}</span>
          <span className="font-medium">{settings.voice.name}</span>
          <span className="hidden text-ink/35 sm:inline">·</span>
          <span className="hidden text-ink/60 sm:inline">{pick.icon} {pick.label}</span>
          <span className="hidden text-ink/35 sm:inline">·</span>
          <span className="hidden text-ink/60 sm:inline">{tone.icon} {tone.label}</span>
          <span className="hidden text-ink/35 md:inline">·</span>
          <span className="hidden text-ink/60 md:inline">{era.label}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" className={`ml-1 text-ink/40 transition ${open ? 'rotate-180' : ''}`}>
            <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="panel absolute right-0 top-full mt-2 max-h-[calc(100vh-90px)] w-[min(360px,calc(100vw-24px))] origin-top-right overflow-y-auto rounded-3xl p-5"
            >
              <p className="eyebrow">Narrator</p>
              <div className="mt-3 grid gap-1.5">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => set({ voice: v })}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      v.id === settings.voice.id ? 'bg-accent/10 ring-1 ring-accent/40' : 'hover:bg-ink/5'
                    }`}
                  >
                    <span className="text-xl">{v.flag}</span>
                    <span className="flex-1">
                      <span className="block text-sm text-ink">
                        {v.name} <span className="text-ink/40">· {v.accent}</span>
                      </span>
                      <span className="block text-xs text-ink/45">{v.blurb}</span>
                    </span>
                    {v.id === settings.voice.id && <span className="text-accent">●</span>}
                  </button>
                ))}
              </div>

              <p className="eyebrow mt-5">Storyteller</p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'narrator', icon: '🎙', label: 'Narrator', hint: 'Your chosen voice' },
                    { id: 'eyewitness', icon: '🎭', label: 'Eyewitness', hint: 'Someone who was there' },
                  ] as const
                ).map((m) => (
                  <button key={m.id} onClick={() => set({ mode: m.id })} className={`seg !flex-row !justify-start gap-2.5 !px-3 text-left ${m.id === settings.mode ? 'seg-on' : ''}`}>
                    <span className="text-base">{m.icon}</span>
                    <span className="leading-tight">
                      <span className="block text-[12.5px] font-medium">{m.label}</span>
                      <span className="block text-[11px] opacity-60">{m.hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="eyebrow mt-5">Language</p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'en', icon: '🇬🇧', label: 'English', hint: 'Always' },
                    { id: 'local', icon: '🌍', label: 'Local', hint: 'FR · DE · ES · PT voices' },
                  ] as const
                ).map((m) => (
                  <button key={m.id} onClick={() => set({ lang: m.id })} className={`seg !flex-row !justify-start gap-2.5 !px-3 text-left ${m.id === settings.lang ? 'seg-on' : ''}`}>
                    <span className="text-base">{m.icon}</span>
                    <span className="leading-tight">
                      <span className="block text-[12.5px] font-medium">{m.label}</span>
                      <span className="block text-[11px] opacity-60">{m.hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="eyebrow mt-5">Discover</p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {PICKS.map((p) => (
                  <button key={p.id} onClick={() => set({ pick: p.id })} className={`seg !flex-row !justify-start gap-2.5 !px-3 text-left ${p.id === settings.pick ? 'seg-on' : ''}`}>
                    <span className="text-base">{p.icon}</span>
                    <span className="leading-tight">
                      <span className="block text-[12.5px] font-medium">{p.label}</span>
                      <span className="block text-[11px] opacity-60">{p.hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="eyebrow mt-5">Mood</p>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {TONES.map((t) => (
                  <button key={t.id} onClick={() => set({ tone: t.id })} className={`seg ${t.id === settings.tone ? 'seg-on' : ''}`}>
                    <span className="text-base">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              <p className="eyebrow mt-5">Era</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ERAS.map((e) => (
                  <button key={e.id} onClick={() => set({ era: e.id })} className={`chip ${e.id === settings.era ? 'chip-accent' : 'hover:bg-ink/10'}`}>
                    {e.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <p className="eyebrow">Pace</p>
                <span className="text-xs text-ink/45">{settings.speed > 0.3 ? 'Slow & dramatic' : settings.speed < -0.3 ? 'Brisk' : 'Natural'}</span>
              </div>
              <input
                type="range"
                min={-1.5}
                max={1.5}
                step={0.5}
                value={-settings.speed}
                onChange={(e) => set({ speed: -Number(e.target.value) })}
                className="range mt-3 w-full"
                aria-label="Narration pace"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14.5" fill="none" style={{ stroke: 'var(--accent)' }} strokeOpacity=".3" />
      <circle cx="16" cy="16" r="9.5" fill="none" style={{ stroke: 'var(--accent)' }} strokeOpacity=".55" />
      <circle cx="16" cy="16" r="4.5" style={{ fill: 'var(--accent)' }} />
    </svg>
  );
}

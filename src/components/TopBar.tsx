import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Era, Tone } from '../lib/api';
import { VOICES, type Voice } from '../lib/voices';

export interface Settings {
  voice: Voice;
  era: Era;
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

const TONES: { id: Tone; label: string; icon: string }[] = [
  { id: 'epic', label: 'Epic', icon: '⚔️' },
  { id: 'mystery', label: 'Mystery', icon: '🕯️' },
  { id: 'heartfelt', label: 'Heartfelt', icon: '🫶' },
  { id: 'witty', label: 'Witty', icon: '🎩' },
];

export function TopBar({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
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

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 md:p-4">
      <div className="glass pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-2.5">
        <Logo />
        <div className="leading-tight">
          <h1 className="font-display text-xl tracking-tight text-white">Echoes</h1>
          <p className="hidden text-[11px] text-white/45 sm:block">Every place has a story</p>
        </div>
      </div>

      <div ref={ref} className="pointer-events-auto relative">
        <button onClick={() => setOpen((o) => !o)} className="glass flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm text-white/85 transition hover:bg-white/[0.07]">
          <span className="text-lg leading-none">{settings.voice.flag}</span>
          <span className="font-medium">{settings.voice.name}</span>
          <span className="hidden text-white/35 sm:inline">·</span>
          <span className="hidden text-white/60 sm:inline">{tone.icon} {tone.label}</span>
          <span className="hidden text-white/35 md:inline">·</span>
          <span className="hidden text-white/60 md:inline">{era.label}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" className={`ml-1 text-white/40 transition ${open ? 'rotate-180' : ''}`}>
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
              className="panel absolute right-0 mt-2 w-[min(360px,calc(100vw-24px))] origin-top-right rounded-3xl p-5"
            >
              <p className="eyebrow">Narrator</p>
              <div className="mt-3 grid gap-1.5">
                {VOICES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => set({ voice: v })}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                      v.id === settings.voice.id ? 'bg-amber-200/10 ring-1 ring-amber-200/40' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="text-xl">{v.flag}</span>
                    <span className="flex-1">
                      <span className="block text-sm text-white">
                        {v.name} <span className="text-white/40">· {v.accent}</span>
                      </span>
                      <span className="block text-xs text-white/45">{v.blurb}</span>
                    </span>
                    {v.id === settings.voice.id && <span className="text-amber-200">●</span>}
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
                  <button key={e.id} onClick={() => set({ era: e.id })} className={`chip ${e.id === settings.era ? 'chip-amber' : 'hover:bg-white/10'}`}>
                    {e.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <p className="eyebrow">Pace</p>
                <span className="text-xs text-white/45">{settings.speed > 0.3 ? 'Slow & dramatic' : settings.speed < -0.3 ? 'Brisk' : 'Natural'}</span>
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
      <circle cx="16" cy="16" r="14.5" fill="none" stroke="#f6d08a" strokeOpacity=".25" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#f6d08a" strokeOpacity=".5" />
      <circle cx="16" cy="16" r="4.5" fill="#f6d08a" />
    </svg>
  );
}

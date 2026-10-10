import { AnimatePresence, motion } from 'framer-motion';
import type { VoiceControl, VoiceState } from '../lib/useVoice';
import { AuthorityBanner, SourceList } from './Authority';

const STATE_LABEL: Record<VoiceState, string> = {
  idle: 'Tap to talk',
  listening: 'Listening… tap when done',
  thinking: 'Thinking…',
  speaking: 'Speaking… tap to interrupt',
};

/** The primary input: tap, speak, Gradium decides when you've finished. */
export function MicButton({ voice, size = 'lg' }: { voice: VoiceControl; size?: 'lg' | 'md' }) {
  const { state } = voice;
  const dim = size === 'lg' ? 'h-14 w-14' : 'h-12 w-12';
  const active = state === 'listening';
  return (
    <button
      onClick={voice.toggle}
      aria-label={STATE_LABEL[state]}
      title={`${STATE_LABEL[state]} (M)`}
      className={`relative grid ${dim} shrink-0 place-items-center rounded-full transition hover:scale-105 active:scale-95 ${
        active
          ? 'bg-rose-400 text-white shadow-[0_0_0_6px_rgba(251,113,133,0.25),0_10px_30px_-6px_rgba(251,113,133,0.7)]'
          : 'bg-gradient-to-b from-amber-100 to-amber-300 text-[#1a1408] shadow-[0_8px_24px_-6px_rgba(251,191,36,0.6)]'
      }`}
    >
      {active && <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/40" />}
      {state === 'thinking' ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1408]/30 border-t-[#1a1408]" />
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="relative">
          <rect x="9" y="3" width="6" height="11" rx="3" fill={active ? 'currentColor' : 'none'} />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      )}
    </button>
  );
}

/** Live transcript, the spoken reply, and sources for answers. */
export function VoiceToast({ voice }: { voice: VoiceControl }) {
  const { state, heard, last, error } = voice;
  const visible = state !== 'idle' || !!error || !!last;
  const answer = last?.action === 'ask' ? last : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="voice-toast"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-3 md:top-4"
        >
          <div className="panel pointer-events-auto relative w-[min(460px,100%)] rounded-3xl p-4 pr-11" aria-live="polite">
            <button
              onClick={state === 'idle' ? voice.dismiss : voice.cancel}
              aria-label={state === 'idle' ? 'Dismiss' : 'Cancel'}
              className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
            >
              <svg width="11" height="11" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M1 1l12 12M13 1L1 13" />
              </svg>
            </button>
            <p className="eyebrow">{state === 'idle' ? 'You said' : STATE_LABEL[state]}</p>
            <p className="mt-1 font-display text-lg leading-snug text-white">
              {heard ? `“${heard}”` : state === 'listening' ? <span className="text-white/40">Try “Take me to Rome” or “Who built this?”</span> : null}
            </p>
            {error && <p className="mt-2 text-sm text-rose-200/90">{error}</p>}
            {last?.reply && (
              <div className="mt-3 border-t border-white/[0.06] pt-3">
                <p className="text-sm leading-relaxed text-white/80">{last.reply}</p>
                {answer?.authority && <AuthorityBanner authority={answer.authority} />}
                {answer?.sources && answer.sources.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto">
                    <SourceList sources={answer.sources} compact />
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

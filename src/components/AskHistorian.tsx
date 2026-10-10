import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Conversation } from '../lib/useConversation';
import type { VoiceControl } from '../lib/useVoice';
import { AuthorityBanner, SourceList } from './Authority';
import { MicButton } from './Voice';

const SUGGESTIONS = ['Who were the people involved?', 'What happened next?', 'Why did it happen here?', 'What can I still see today?'];

/**
 * A conversation with the narrator: type or tap a question, or ask out loud with the mic.
 * `fill`: take the parent's height, scrolling the conversation and keeping the question box in view.
 */
export function AskHistorian({
  conversation,
  voiceControl,
  narrator,
  fill = false,
}: {
  conversation: Conversation;
  voiceControl: VoiceControl;
  narrator: string;
  fill?: boolean;
}) {
  const { turns, busy, ask } = conversation;
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns]);

  const asked = new Set(turns.map((t) => t.q));
  const send = (q: string) => {
    if (!q.trim() || busy) return;
    ask(q);
    setDraft('');
  };

  return (
    <div className={`flex flex-col gap-3 ${fill ? 'h-full' : ''}`}>
      <div className={`flex flex-col gap-3 ${fill ? 'min-h-0 flex-1 overflow-y-auto pr-1' : ''}`}>
        {turns.length === 0 && <p className="text-sm text-white/55">Curious about something? Ask {narrator} anything about this story or place.</p>}

        {turns.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">
            <p className="self-end rounded-2xl rounded-br-md bg-amber-200/15 px-3.5 py-2 text-sm text-amber-50">{t.q}</p>
            <div className="self-start rounded-2xl rounded-bl-md bg-white/[0.05] px-3.5 py-2.5 text-sm leading-relaxed text-white/85">
              {t.error ? (
                <span className="text-rose-200/90">{t.error}</span>
              ) : t.a ? (
                <>
                  {t.a}
                  {t.authority && <AuthorityBanner authority={t.authority} />}
                  {t.sources && t.sources.length > 0 && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-white/45 hover:text-white/70">{t.sources.length} sources</summary>
                      <SourceList sources={t.sources} compact />
                    </details>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-2 italic text-white/50">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-amber-200" />
                  {narrator} is checking the archives…
                </span>
              )}
            </div>
          </motion.div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.filter((s) => !asked.has(s)).map((s) => (
          <button key={s} onClick={() => send(s)} disabled={busy} className="chip transition hover:bg-white/10 disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Ask ${narrator} a question…`}
          aria-label={`Ask ${narrator} a question`}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-amber-200/40 focus:outline-none"
        />
        <button type="submit" disabled={!draft.trim() || busy} className="btn-primary !py-2.5 disabled:opacity-50">
          Ask
        </button>
        <MicButton voice={voiceControl} size="md" />
      </form>
    </div>
  );
}

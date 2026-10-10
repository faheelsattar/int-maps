import { motion } from 'framer-motion';
import { formatYear, type StoryChoice } from '../lib/api';

/** The historian's shelf: real stories from the place, for the listener to pick. */
export function StoryChoices({ items, onChoose }: { items: StoryChoice[]; onChoose: (c: StoryChoice) => void }) {
  return (
    <motion.ol initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="grid gap-2">
      {items.map((c, i) => (
        <motion.li key={`${c.year}-${c.title}`} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <button
            onClick={() => onChoose(c)}
            className="group flex w-full items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 text-left transition hover:border-amber-200/30 hover:bg-amber-200/[0.06]"
          >
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-200/10 text-xs text-amber-200/80">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="font-display text-base leading-snug text-white">{c.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-amber-200/70">{formatYear(c.year)}</span>
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-white/55">{c.teaser}</span>
            </span>
            <span className="mt-1 text-amber-200/0 transition group-hover:text-amber-200/80">→</span>
          </button>
        </motion.li>
      ))}
    </motion.ol>
  );
}

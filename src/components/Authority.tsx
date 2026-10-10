import type { Authority, Fact, Source, Tier } from '../lib/api';

const TIER_STYLE: Record<Tier, string> = {
  authoritative: 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200',
  reputable: 'border-sky-300/40 bg-sky-300/10 text-sky-200',
  unrated: 'border-white/15 bg-white/5 text-white/55',
  low: 'border-rose-300/40 bg-rose-300/10 text-rose-200',
};

const LEVEL = {
  strong: { label: 'Well sourced', cls: 'border-emerald-300/30 bg-emerald-300/[0.07] text-emerald-100', dot: 'bg-emerald-300' },
  mixed: { label: 'Partly sourced', cls: 'border-amber-300/30 bg-amber-300/[0.07] text-amber-100', dot: 'bg-amber-300' },
  weak: { label: 'Weakly sourced: treat as unverified', cls: 'border-rose-300/40 bg-rose-300/[0.09] text-rose-100', dot: 'bg-rose-300' },
} as const;

/** Story-level verdict on how well the claims are backed. */
export function AuthorityBanner({ authority }: { authority: Authority }) {
  const l = LEVEL[authority.level];
  return (
    <div className={`mt-4 rounded-2xl border px-3.5 py-2.5 ${l.cls}`} role={authority.level === 'weak' ? 'alert' : undefined}>
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <span className={`h-2 w-2 shrink-0 rounded-full ${l.dot}`} />
        {l.label}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed opacity-75">{authority.note}</p>
    </div>
  );
}

export function TierBadge({ tier, label }: { tier: Tier; label?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ${TIER_STYLE[tier]}`}>
      {label ?? tier}
    </span>
  );
}

const BACKING_TEXT: Record<Fact['backing'], string> = {
  authoritative: 'Backed by an authoritative source',
  reputable: 'Backed by a reputable source',
  unrated: 'Backed only by an unrated source',
  low: 'Backed only by a low-authority source',
  unlinked: 'Not linked to a specific source',
};

const BACKING_DOT: Record<Fact['backing'], string> = {
  authoritative: 'bg-emerald-300',
  reputable: 'bg-sky-300',
  unrated: 'bg-white/40',
  low: 'bg-rose-300',
  unlinked: 'bg-white/25',
};

export function FactList({ facts }: { facts: Fact[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {facts.map((f) => (
        <li key={f.text} className="flex gap-3 text-sm text-white/75" title={BACKING_TEXT[f.backing]}>
          <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${BACKING_DOT[f.backing]}`} aria-hidden />
          <span>
            {f.text}
            {f.status === 'corrected' && <span className="ml-2 rounded-full bg-amber-300/10 px-1.5 py-px text-[10.5px] text-amber-200/90">corrected</span>}
            <span className="sr-only"> ({BACKING_TEXT[f.backing]})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SourceList({ sources, compact = false }: { sources: Source[]; compact?: boolean }) {
  return (
    <ul className={`mt-3 grid ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {sources.map((s) => (
        <li key={s.uri}>
          <a
            href={s.uri}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-white/80 transition hover:bg-white/5"
            title={s.cited ? 'Cited for a specific claim' : 'Consulted, not linked to a specific claim'}
          >
            <TierBadge tier={s.tier} label={s.label} />
            <span className="min-w-0 flex-1 truncate">{s.domain || s.title}</span>
            {!s.cited && <span className="text-[10px] text-white/35">consulted</span>}
            <span className="text-white/35">↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

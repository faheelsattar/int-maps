import { motion } from 'framer-motion';
import { formatYear, type NearbyEcho, type Stop } from '../lib/api';

/** The traveller's dropped pin: bounces in, pulses while a story is loading. */
export function DropPin({ loading }: { loading: boolean }) {
  return (
    <div className="relative -translate-x-1/2 -translate-y-full pointer-events-none">
      <span className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 block">
        <span className="pin-ring" />
        {loading && <span className="pin-ring pin-ring-delay" />}
        <span className="block h-2 w-5 rounded-[50%] bg-black/35 blur-[2px]" />
      </span>
      <motion.svg
        initial={{ y: -120, opacity: 0, scale: 0.6 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 18, mass: 0.8 }}
        width="36"
        height="48"
        viewBox="0 0 36 48"
        className="relative drop-shadow-[0_6px_10px_rgba(0,0,0,0.25)]"
      >
        <defs>
          <linearGradient id="pinG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--accent-2)' }} />
            <stop offset="1" style={{ stopColor: 'var(--accent)' }} />
          </linearGradient>
        </defs>
        <path d="M18 47C18 47 34 29.6 34 17.5 34 8.4 26.8 1 18 1S2 8.4 2 17.5C2 29.6 18 47 18 47Z" fill="url(#pinG)" stroke="#000" strokeOpacity=".2" />
        <circle cx="18" cy="17.5" r="6" fill="#fffaf2" />
        {loading && (
          <circle cx="18" cy="17.5" r="3" style={{ fill: 'var(--accent)' }}>
            <animate attributeName="r" values="1.5;4;1.5" dur="1.2s" repeatCount="indefinite" />
          </circle>
        )}
      </motion.svg>
    </div>
  );
}

/** Where the story actually happened, glowing beacon with year label. */
export function EventBeacon({ year }: { year: number | null }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
      className="relative -translate-x-1/2 -translate-y-1/2 pointer-events-none"
    >
      <span className="beacon" />
      <span className="beacon-dot relative block h-3.5 w-3.5 rounded-full border-2 border-white" />
      {year != null && (
        <span className="map-label absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap">
          {formatYear(year)}
        </span>
      )}
    </motion.div>
  );
}

/** Clickable "other echoes" suggested near the pin. */
export function EchoDot({ echo, index, onSelect }: { echo: NearbyEcho; index: number; onSelect: (e: NearbyEcho) => void }) {
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.6 + index * 0.15, type: 'spring', stiffness: 400, damping: 22 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(echo);
      }}
      className="group relative -translate-x-1/2 -translate-y-1/2 cursor-pointer"
      aria-label={`Hear the story of ${echo.title}`}
    >
      <span className="echo-dot block h-3.5 w-3.5 rounded-full transition group-hover:scale-150" />
      <span className="map-tooltip pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-left text-xs opacity-0 transition group-hover:opacity-100">
        <span className="block font-display text-sm">{echo.title}</span>
        <span className="text-echo">{formatYear(echo.year)} · tap to listen</span>
      </span>
    </motion.button>
  );
}

/** Numbered journey stop; the active one gets a pulse and its name. */
export function StopMarker({ stop, number, state, onSelect }: { stop: Stop; number: number; state: 'past' | 'active' | 'next'; onSelect: () => void }) {
  return (
    <motion.button
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: number * 0.12, type: 'spring', stiffness: 400, damping: 22 }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className="group relative -translate-x-1/2 -translate-y-1/2 cursor-pointer"
      aria-label={`Stop ${number}: ${stop.name}`}
    >
      {state === 'active' && <span className="beacon" />}
      <span
        className={`relative grid h-7 w-7 place-items-center rounded-full border-2 border-white text-[12px] font-semibold shadow-md transition group-hover:scale-110 ${
          state === 'next' ? 'bg-[var(--surface-strong)] text-ink/70' : 'bg-accent text-accent-ink'
        }`}
      >
        {number}
      </span>
      <span
        className={`map-label pointer-events-none absolute left-1/2 top-9 -translate-x-1/2 whitespace-nowrap transition ${
          state === 'active' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {stop.name}
        {stop.year != null && <span className="ml-1 text-ink/50">{formatYear(stop.year)}</span>}
      </span>
    </motion.button>
  );
}

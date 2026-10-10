import { motion } from 'framer-motion';
import { formatYear, type NearbyEcho } from '../lib/api';

/** The traveller's dropped pin: bounces in, pulses while a story is loading. */
export function DropPin({ loading }: { loading: boolean }) {
  return (
    <div className="relative -translate-x-1/2 -translate-y-full pointer-events-none">
      <span className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 block">
        <span className="pin-ring" />
        {loading && <span className="pin-ring pin-ring-delay" />}
        <span className="block h-2 w-5 rounded-[50%] bg-black/60 blur-[2px]" />
      </span>
      <motion.svg
        initial={{ y: -120, opacity: 0, scale: 0.6 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 18, mass: 0.8 }}
        width="36"
        height="48"
        viewBox="0 0 36 48"
        className="relative drop-shadow-[0_6px_14px_rgba(232,185,99,0.45)]"
      >
        <defs>
          <linearGradient id="pinG" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe3a3" />
            <stop offset="1" stopColor="#e0a548" />
          </linearGradient>
        </defs>
        <path d="M18 47C18 47 34 29.6 34 17.5 34 8.4 26.8 1 18 1S2 8.4 2 17.5C2 29.6 18 47 18 47Z" fill="url(#pinG)" stroke="#1a1408" strokeOpacity=".35" />
        <circle cx="18" cy="17.5" r="6" fill="#14171f" />
        {loading && (
          <circle cx="18" cy="17.5" r="3" fill="#ffe3a3">
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
      <span className="relative block h-3.5 w-3.5 rounded-full bg-amber-200 ring-4 ring-amber-300/30 shadow-[0_0_24px_6px_rgba(251,211,141,0.6)]" />
      {year != null && (
        <span className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 font-display text-xs text-amber-100 backdrop-blur">
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
      <span className="block h-3 w-3 rounded-full border-2 border-sky-200/90 bg-sky-400/40 shadow-[0_0_14px_3px_rgba(125,211,252,0.45)] transition group-hover:scale-150" />
      <span className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#0f1219]/95 px-2.5 py-1.5 text-left text-xs text-white/90 opacity-0 shadow-xl backdrop-blur transition group-hover:opacity-100">
        <span className="block font-display text-sm">{echo.title}</span>
        <span className="text-sky-200/80">{formatYear(echo.year)} · tap to listen</span>
      </span>
    </motion.button>
  );
}

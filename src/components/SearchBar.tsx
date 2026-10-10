import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import type { LatLng } from '../lib/api';

export interface SearchResult extends LatLng {
  name: string;
}

interface Suggestion {
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

const JOURNEYS = [
  "Napoleon's march on Moscow",
  "Shackleton's Endurance expedition",
  'The voyage of the Titanic',
  'Lewis and Clark expedition',
  "Hannibal's crossing of the Alps",
  "Magellan's circumnavigation",
  'The Underground Railroad',
  "Marco Polo's journey to China",
  "Lindbergh's flight across the Atlantic",
  'The Silk Road',
];

/**
 * Place search with Google Places autocomplete. If the Places API isn't enabled
 * on the key, Enter falls back to the Geocoding API.
 */
export function SearchBar({ onSelect, onJourney }: { onSelect: (r: SearchResult) => void; onJourney: (query: string) => void }) {
  const [mode, setMode] = useState<'place' | 'journey'>('place');
  const places = useMapsLibrary('places');
  const geocoding = useMapsLibrary('geocoding');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const placesBroken = useRef(false);

  // Suggestions as you type (debounced).
  useEffect(() => {
    setError('');
    const q = query.trim();
    if (mode === 'journey' || !places || placesBroken.current || q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        token.current ??= new places.AutocompleteSessionToken();
        const { suggestions: res } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: token.current,
        });
        if (cancelled) return;
        setSuggestions(
          res
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .slice(0, 5)
            .map((p) => ({ main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? '', prediction: p })),
        );
        setActive(0);
      } catch (err) {
        console.warn('Places autocomplete unavailable, falling back to geocoding on Enter.', err);
        placesBroken.current = true;
        setSuggestions([]);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, places, mode]);

  // "/" focuses the search, like many map apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, []);

  const finish = (r: SearchResult) => {
    token.current = null; // a session ends with a selection
    setQuery(r.name);
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.blur();
    onSelect(r);
  };

  const choose = async (s: Suggestion) => {
    setBusy(true);
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
      const loc = place.location;
      if (!loc) throw new Error('No location');
      finish({ lat: loc.lat(), lng: loc.lng(), name: place.formattedAddress || place.displayName || s.main });
    } catch {
      await geocode(`${s.main} ${s.secondary}`);
    } finally {
      setBusy(false);
    }
  };

  const geocode = async (address: string) => {
    if (!geocoding) return;
    setBusy(true);
    try {
      const { results } = await new geocoding.Geocoder().geocode({ address });
      const r = results[0];
      if (!r) throw new Error();
      finish({ lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), name: r.formatted_address });
    } catch {
      setError(`Couldn't find "${address}"`);
    } finally {
      setBusy(false);
    }
  };

  const journeyIdeas =
    mode === 'journey' ? JOURNEYS.filter((j) => !query.trim() || j.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6) : [];

  const startJourney = (q: string) => {
    if (!q.trim()) return;
    setQuery(q);
    setOpen(false);
    inputRef.current?.blur();
    onJourney(q.trim());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mode === 'journey') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, journeyIdeas.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        startJourney(active >= 0 && journeyIdeas[active] ? journeyIdeas[active] : query);
      } else if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestions[active]) void choose(suggestions[active]);
      else if (query.trim()) void geocode(query.trim());
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showList = open && (mode === 'journey' ? journeyIdeas.length > 0 : suggestions.length > 0 || !!error);

  return (
    <div ref={boxRef} className="pointer-events-auto relative w-full max-w-md">
      <div className="glass flex h-[42px] items-center gap-2.5 rounded-2xl px-3.5 transition focus-within:ring-2 focus-within:ring-accent/40">
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'place' ? 'journey' : 'place'));
            setSuggestions([]);
            setActive(-1);
            setOpen(true);
            inputRef.current?.focus();
          }}
          title={mode === 'place' ? 'Switch to journeys' : 'Switch to places'}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-ink/[0.06] px-2 py-1 text-[11.5px] font-medium text-ink/70 transition hover:bg-ink/10 hover:text-ink"
        >
          {mode === 'place' ? '📍 Place' : '🧭 Journey'}
        </button>
        {busy ? (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink/15 border-t-accent" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-ink/45">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onKeyDown={onKeyDown}
          placeholder={mode === 'place' ? 'Search a city, battlefield, landmark…' : 'A voyage, march or route…'}
          aria-label="Search for a place"
          role="combobox"
          aria-expanded={showList}
          aria-controls="search-results"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
        />
        {query ? (
          <button
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink/40 transition hover:bg-ink/10 hover:text-ink"
            aria-label="Clear search"
          >
            <svg width="10" height="10" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        ) : (
          <kbd className="hidden shrink-0 rounded-md border border-ink/15 px-1.5 text-[11px] text-ink/40 md:block">/</kbd>
        )}
      </div>

      <AnimatePresence>
        {showList && (
          <motion.ul
            id="search-results"
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="panel absolute inset-x-0 mt-2 overflow-hidden rounded-2xl p-1.5"
          >
            {mode === 'journey' && (
              <li className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Try a journey</li>
            )}
            {mode === 'journey' &&
              journeyIdeas.map((j, i) => (
                <li key={j} role="option" aria-selected={i === active}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => startJourney(j)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-ink transition ${i === active ? 'bg-accent/10' : ''}`}
                  >
                    <span className={i === active ? 'text-accent' : 'text-ink/35'}>🧭</span>
                    {j}
                  </button>
                </li>
              ))}
            {mode === 'place' && error && <li className="px-3 py-2.5 text-sm text-ink/60">{error}</li>}
            {suggestions.map((s, i) => (
              <li key={s.prediction.placeId} role="option" aria-selected={i === active}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => void choose(s)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${i === active ? 'bg-accent/10' : ''}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={`shrink-0 ${i === active ? 'text-accent' : 'text-ink/35'}`}>
                    <path d="M12 2C7.6 2 4 5.5 4 9.9 4 15.5 12 22 12 22s8-6.5 8-12.1C20 5.5 16.4 2 12 2Zm0 10.6a2.7 2.7 0 1 1 0-5.4 2.7 2.7 0 0 1 0 5.4Z" />
                  </svg>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{s.main}</span>
                    {s.secondary && <span className="block truncate text-xs text-ink/50">{s.secondary}</span>}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import type { LatLng } from '../lib/api';

interface Suggestion {
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

/**
 * Type a place instead of saying it, with Google Places suggestions for the exact spelling.
 * `onSearch` geocodes free text (resolves false when not found); `onPick` takes a chosen suggestion.
 */
export function PlaceSearch({ onSearch, onPick }: { onSearch: (query: string) => Promise<boolean>; onPick: (p: LatLng, name: string) => void }) {
  const places = useMapsLibrary('places');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // One billing session per search: from the first keystroke to the chosen place's details.
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  // "/" jumps to the search box, as on most sites.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || (e.target as HTMLElement).closest('input, textarea')) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!places || q.length < 2) {
      setSuggestions([]);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      session.current ??= new places.AutocompleteSessionToken();
      try {
        const { suggestions: found } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: q, sessionToken: session.current });
        if (stale) return;
        setSuggestions(
          found
            .map((s) => s.placePrediction)
            .filter((p): p is google.maps.places.PlacePrediction => !!p)
            .slice(0, 5)
            .map((p) => ({ main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? '', prediction: p })),
        );
        setHighlight(-1);
      } catch (err) {
        console.warn('[places] autocomplete unavailable:', (err as Error).message);
        if (!stale) setSuggestions([]);
      }
    }, 180);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query, places]);

  const reset = () => {
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    session.current = null;
    input.current?.blur();
  };

  const pick = async (s: Suggestion) => {
    setBusy(true);
    setError('');
    setQuery(s.secondary ? `${s.main}, ${s.secondary}` : s.main);
    setOpen(false);
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ['location'] });
      const loc = place.location;
      if (!loc) throw new Error('no location');
      onPick({ lat: loc.lat(), lng: loc.lng() }, s.prediction.text.text);
      reset();
    } catch {
      // Details failed: fall back to geocoding the suggestion's text.
      if (await onSearch(s.prediction.text.text)) reset();
      else setError(`Couldn't find “${s.main}” on the map`);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const chosen = suggestions[highlight] ?? (open ? suggestions[0] : undefined);
    if (chosen) return pick(chosen);
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError('');
    const found = await onSearch(q);
    setBusy(false);
    if (found) reset();
    else setError(`Couldn't find “${q}” on the map`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setError('');
      if (open && suggestions.length) setOpen(false);
      else reset();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length) {
      e.preventDefault();
      setOpen(true);
      const n = suggestions.length;
      setHighlight((h) => (e.key === 'ArrowDown' ? (h + 1) % n : (h - 1 + n) % n));
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <form onSubmit={submit} role="search" className="pointer-events-auto relative min-w-0 flex-1 md:max-w-md">
      <div className={`glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5 transition focus-within:ring-1 ${error ? 'ring-1 ring-rose-300/50' : 'focus-within:ring-amber-200/40'}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-white/45">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError('');
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Type a place, e.g. Kyoto"
          aria-label="Type a place to hear its story"
          role="combobox"
          aria-expanded={showList}
          aria-controls="place-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={highlight >= 0 ? `place-option-${highlight}` : undefined}
          autoComplete="off"
          enterKeyHint="go"
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
        />
        {busy ? (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-amber-200" />
        ) : (
          query.trim() && (
            <button type="submit" className="shrink-0 rounded-lg bg-amber-200/15 px-2 py-0.5 text-xs font-medium text-amber-100 transition hover:bg-amber-200/25">
              Go
            </button>
          )
        )}
      </div>

      {showList && (
        <ul id="place-suggestions" role="listbox" className="panel absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-2xl py-1.5">
          {suggestions.map((s, i) => (
            <li
              key={s.prediction.placeId}
              id={`place-option-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus so blur doesn't close the list first
                void pick(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`flex cursor-pointer items-baseline gap-2 px-3.5 py-2 text-sm ${i === highlight ? 'bg-amber-200/10' : ''}`}
            >
              <span className="shrink-0 text-white">{s.main}</span>
              <span className="truncate text-xs text-white/45">{s.secondary}</span>
            </li>
          ))}
          <li aria-hidden className="px-3.5 pt-1 text-right text-[10px] text-white/30">Suggestions by Google</li>
        </ul>
      )}

      {error && !showList && <p className="glass absolute left-0 top-full mt-1.5 rounded-xl px-3 py-1.5 text-xs text-rose-200">{error}</p>}
    </form>
  );
}

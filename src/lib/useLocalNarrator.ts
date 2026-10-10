import { useEffect, useState } from 'react';
import { fetchLocalVoice } from './api';
import { flagOf, type Voice } from './voices';

// The chosen narrator already has these countries' accents.
const NATIVE: Record<string, string> = { IE: 'Irish', GB: 'British', US: 'American' };
// Countries where the region changes the accent (Scotland, Québec, French-speaking Switzerland).
const REGIONAL = new Set(['GB', 'CA', 'CH']);

/**
 * Who narrates at `where`: a narrator Gradium makes for the place's accent (prepared as soon as the
 * place is chosen), else the chosen narrator. `ready` is false while the local voice is being made.
 */
export function useLocalNarrator(
  where: { countryCode: string; place: string; accent?: string } | null,
  chosen: Voice,
  enabled: boolean,
): { voice: Voice; ready: boolean } {
  const cc = where?.countryCode.toUpperCase() ?? '';
  const native = NATIVE[cc] === chosen.accent && !/scotland|edinburgh|glasgow|aberdeen/i.test(where?.place ?? '');
  const key = enabled && cc && !native ? `${cc}|${REGIONAL.has(cc) ? where!.place : ''}|${chosen.gender}` : '';
  const [made, setMade] = useState<{ key: string; voice: Voice | null } | null>(null);

  useEffect(() => {
    if (!key || !where) return;
    const ctrl = new AbortController();
    fetchLocalVoice(where, chosen.gender, ctrl.signal)
      .then(({ id, accent }) =>
        setMade({ key, voice: { id, name: 'The Historian', accent, flag: flagOf(cc), blurb: `Local ${accent} storyteller`, gender: chosen.gender } }),
      )
      .catch((e) => (e as Error).name !== 'AbortError' && setMade({ key, voice: null }));
    return () => ctrl.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!key) return { voice: chosen, ready: true };
  if (made?.key !== key) return { voice: chosen, ready: false };
  return { voice: made.voice ?? chosen, ready: true };
}

// Curated Gradium flagship voices with distinctive accents.
// https://docs.gradium.ai/guides/voices/flagship-voices
export interface Voice {
  id: string;
  name: string;
  accent: string;
  flag: string;
  blurb: string;
  gender: 'f' | 'm';
}

export const VOICES: Voice[] = [
  { id: 'I7GYfpcKbafFrYUv', name: 'Declan', accent: 'Irish', flag: '🇮🇪', blurb: 'Calm, confident fireside storyteller', gender: 'm' },
  { id: 'gqn4ytOULe-TQfjl', name: 'Saoirse', accent: 'Irish', flag: '🇮🇪', blurb: 'Warm and deeply expressive', gender: 'f' },
  { id: 'kfzLbcdE_yXgLeUI', name: 'Archie', accent: 'British', flag: '🇬🇧', blurb: 'Bright, classic English charm', gender: 'm' },
  { id: 'CF0NgaMwHMMrHZn0', name: 'Reuben', accent: 'British', flag: '🇬🇧', blurb: 'Confident, energetic Brit', gender: 'm' },
  { id: '4rdlkbxRv4m3UQTW', name: 'Tilly', accent: 'British', flag: '🇬🇧', blurb: 'Welcoming English warmth', gender: 'f' },
  { id: 'POBHtemksfWQbng0', name: 'Garrett', accent: 'American', flag: '🇺🇸', blurb: 'Low, smooth and magnetic', gender: 'm' },
  { id: '6MFfc37kq0sBjBjy', name: 'Sterling', accent: 'American', flag: '🇺🇸', blurb: 'Theatrical movie-trailer flair', gender: 'm' },
];

export const DEFAULT_VOICE = VOICES[0];

// Local narrators, one per gender, for places Gradium has an accent for. They read the English story in their accent.
type Pair = { m: Voice; f: Voice };
const pair = (accent: string, flag: string, m: [string, string, string], f: [string, string, string]): Pair => ({
  m: { id: m[0], name: m[1], accent, flag, blurb: m[2], gender: 'm' },
  f: { id: f[0], name: f[1], accent, flag, blurb: f[2], gender: 'f' },
});

const byName = (name: string) => VOICES.find((v) => v.name === name)!;
const LOCAL: Record<string, Pair> = {
  irish: { m: byName('Declan'), f: byName('Saoirse') },
  british: { m: byName('Archie'), f: byName('Tilly') },
  american: { m: byName('Garrett'), f: { id: 'D6COLz20Hw7uh3UK', name: 'Brooklyn', accent: 'American', flag: '🇺🇸', blurb: 'Warm, effusive, welcoming', gender: 'f' } },
  french: pair('French', '🇫🇷', ['iEu63s1rhn_kegTr', 'Gaspard', 'Warm, grounded, friendly'], ['FXxJ9mANRq6BCTX5', 'Noémie', 'Warm, expressive Parisian']),
  quebec: pair('Québécois', '🇨🇦', ['xynYWquoAsrvM7UY', 'Mélanie', 'Warm, welcoming'], ['xynYWquoAsrvM7UY', 'Mélanie', 'Warm, welcoming']),
  german: pair('German', '🇩🇪', ['3ZKKapPOvuWFcw9f', 'Anton', 'Vibrant, guide-style'], ['aBNlTApBeOlVKa23', 'Lorena', 'Warm, gentle, lively']),
  bavarian: pair('Bavarian', '🇩🇪', ['2cx941cbFIXRc0ok', 'Wastl', 'Lively, comedic timing'], ['MAYVpVTYBzLRqNC7', 'Resi', 'Warm, measured, trustworthy']),
  austrian: pair('Austrian', '🇦🇹', ['3ZKKapPOvuWFcw9f', 'Anton', 'Vibrant, guide-style'], ['TXbEUrHXNFlYBBKb', 'Sophie', 'Warm, easy-going']),
  castilian: pair('Spanish', '🇪🇸', ['t-_TS1e-0GzDAX02', 'Iker', 'Easy-going, friendly'], ['iTQW2xFICXk8riV4', 'Vera', 'Sweet, expressive, soft']),
  latin: pair('Latin American', '🇲🇽', ['n7vovxcDTVG4gClo', 'Diego', 'Lively, expressive storyteller'], ['VDwnGxAo68C8U8vC', 'Ximena', 'Playful, expressive storyteller']),
  brazilian: pair('Brazilian', '🇧🇷', ['AByHrwi1S-yLzW-s', 'Mateus', 'Bright, welcoming'], ['uCqxlQCKi8sPHwG2', 'Bianca', 'Bright, welcoming']),
  portuguese: pair('Portuguese', '🇵🇹', ['-n1BmuOkydfLDjxE', 'Ricardo', 'Confident, articulate'], ['tWO-Q6DxWPj7syQA', 'Sofia', 'Pleasant, engaging']),
};

const COUNTRY_ACCENT: Record<string, string> = {
  IE: 'irish',
  GB: 'british', IM: 'british', JE: 'british', GG: 'british',
  US: 'american', CA: 'american',
  FR: 'french', BE: 'french', LU: 'french', MC: 'french',
  DE: 'german', LI: 'german', CH: 'german',
  AT: 'austrian',
  ES: 'castilian',
  BR: 'brazilian',
  PT: 'portuguese', AO: 'portuguese', MZ: 'portuguese', CV: 'portuguese', GW: 'portuguese', ST: 'portuguese', TL: 'portuguese',
  ...Object.fromEntries(
    ['MX', 'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'CU', 'DO', 'PR', 'CO', 'VE', 'EC', 'PE', 'BO', 'CL', 'AR', 'UY', 'PY'].map((c) => [c, 'latin']),
  ),
};

// Regions with their own accent inside a country, matched on the story's place name.
const REGIONS: { country: string; match: RegExp; accent: string }[] = [
  { country: 'CA', match: /qu[ée]bec|montr[ée]al/i, accent: 'quebec' },
  { country: 'DE', match: /bavaria|bayern|munich|münchen|nuremberg|nürnberg|augsburg|regensburg|würzburg/i, accent: 'bavarian' },
  { country: 'CH', match: /gen[eè]v|lausanne|neuch[aâ]tel|fribourg|montreux|sion\b/i, accent: 'french' },
];

/**
 * The narrator for a story's place: a local accent where Gradium has one, matching the chosen narrator's gender.
 * Keeps the chosen narrator if it already has that accent, and falls back to it elsewhere.
 */
export function localVoice(place: { countryCode?: string | null; place?: string }, chosen: Voice): Voice {
  const cc = place.countryCode?.toUpperCase() ?? '';
  const region = REGIONS.find((r) => r.country === cc && r.match.test(place.place ?? ''));
  const key = region?.accent ?? COUNTRY_ACCENT[cc];
  if (!key) return chosen;
  const local = LOCAL[key];
  if (chosen.id === local.m.id || chosen.id === local.f.id || chosen.accent === local.m.accent) return chosen;
  return local[chosen.gender];
}

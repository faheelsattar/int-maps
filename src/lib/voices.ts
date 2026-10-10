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

/** Flag emoji for an ISO 3166-1 alpha-2 code. */
export const flagOf = (cc: string | null) =>
  cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌍';

// Curated Gradium flagship voices with distinctive accents.
// https://docs.gradium.ai/guides/voices/flagship-voices
export interface Voice {
  id: string;
  name: string;
  accent: string;
  flag: string;
  blurb: string;
}

export const VOICES: Voice[] = [
  { id: 'I7GYfpcKbafFrYUv', name: 'Declan', accent: 'Irish', flag: '🇮🇪', blurb: 'Calm, confident fireside storyteller' },
  { id: 'gqn4ytOULe-TQfjl', name: 'Saoirse', accent: 'Irish', flag: '🇮🇪', blurb: 'Warm and deeply expressive' },
  { id: 'kfzLbcdE_yXgLeUI', name: 'Archie', accent: 'British', flag: '🇬🇧', blurb: 'Bright, classic English charm' },
  { id: 'CF0NgaMwHMMrHZn0', name: 'Reuben', accent: 'British', flag: '🇬🇧', blurb: 'Confident, energetic Brit' },
  { id: '4rdlkbxRv4m3UQTW', name: 'Tilly', accent: 'British', flag: '🇬🇧', blurb: 'Welcoming English warmth' },
  { id: 'POBHtemksfWQbng0', name: 'Garrett', accent: 'American', flag: '🇺🇸', blurb: 'Low, smooth and magnetic' },
  { id: '6MFfc37kq0sBjBjy', name: 'Sterling', accent: 'American', flag: '🇺🇸', blurb: 'Theatrical movie-trailer flair' },
];

export const DEFAULT_VOICE = VOICES[0];

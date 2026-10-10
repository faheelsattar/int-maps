export type Era = 'any' | 'ancient' | 'medieval' | 'early' | 'modern';
export type Tone = 'epic' | 'mystery' | 'heartfelt' | 'witty';
export type Pick = 'famous' | 'hidden';
export type Mode = 'narrator' | 'eyewitness';
export type LangPref = 'en' | 'local';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NearbyEcho extends LatLng {
  title: string;
  year: number | null;
}

export interface Source {
  uri: string;
  title: string;
}

export interface Claim {
  text: string;
  stop: number | null;
  verified: boolean;
  sources: Source[];
}

export interface Stop extends LatLng {
  index: number;
  name: string;
  date: string;
  year: number | null;
}

export interface StoryVoice {
  id: string;
  name: string;
  accent: string;
  flag: string;
}

export interface Story {
  id: string;
  kind: 'place' | 'journey';
  title: string;
  date: string;
  year: number | null;
  place: string;
  country: string;
  eventLat: number;
  eventLng: number;
  distanceKm: number | null;
  hook: string;
  witness: { role: string; gender: string; age: string; accent: string };
  claims: Claim[];
  stops: Stop[];
  nearby: NearbyEcho[];
  sources: Source[];
  factCheck: { searched: boolean; verified: number; total: number; partial: boolean };
  mode: Mode;
  tone: Tone;
  lang: string;
  language: string;
  localLang: string | null;
  voice: StoryVoice;
  speed: number;
  paragraphs: string[];
  subtitles?: string[];
}

export interface SavedStory {
  id: string;
  kind: 'place' | 'journey';
  title: string;
  year: number | null;
  place: string;
  mode: Mode;
  lang: string;
}

export async function fetchSaved(id: string): Promise<Story> {
  const res = await fetch(`/api/stories/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Story not found');
  return data as Story;
}

export async function listSaved(): Promise<SavedStory[]> {
  const res = await fetch('/api/stories');
  return res.ok ? res.json() : [];
}

export function formatYear(year: number | null) {
  if (year == null) return '';
  return year < 0 ? `${Math.abs(year)} BCE` : String(year);
}

export function splitParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const LANG_NAMES: Record<string, { name: string; flag: string }> = {
  en: { name: 'English', flag: '🇬🇧' },
  fr: { name: 'Français', flag: '🇫🇷' },
  de: { name: 'Deutsch', flag: '🇩🇪' },
  es: { name: 'Español', flag: '🇪🇸' },
  pt: { name: 'Português', flag: '🇵🇹' },
};

export function langLabel(code: string | null | undefined) {
  return LANG_NAMES[code ?? 'en'] ?? LANG_NAMES.en;
}

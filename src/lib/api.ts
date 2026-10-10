export type Era = 'any' | 'ancient' | 'medieval' | 'early' | 'modern';
export type Tone = 'epic' | 'mystery' | 'heartfelt' | 'witty';
export type Pick = 'famous' | 'hidden';

export interface Fact {
  text: string;
  status: 'confirmed' | 'corrected' | 'unchecked';
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NearbyEcho extends LatLng {
  title: string;
  year: number | null;
}

export interface Story {
  title: string;
  date: string;
  year: number | null;
  place: string;
  eventLat: number;
  eventLng: number;
  distanceKm: number | null;
  hook: string;
  paragraphs: string[];
  facts: Fact[];
  nearby: NearbyEcho[];
  sources: { uri: string; title: string }[];
  factCheck: { checked: boolean; corrections: string[] };
}

export async function fetchStory(
  body: LatLng & { place?: string; era: Era; tone: Tone; pick: Pick; exclude?: string[]; focus?: string },
  signal?: AbortSignal,
): Promise<Story> {
  const res = await fetch('/api/story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Story request failed (${res.status})`);
  return data as Story;
}

export function formatYear(year: number | null) {
  if (year == null) return '';
  return year < 0 ? `${Math.abs(year)} BCE` : String(year);
}

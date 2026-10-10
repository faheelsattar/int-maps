export type Era = 'any' | 'ancient' | 'medieval' | 'early' | 'modern';
export type Tone = 'epic' | 'mystery' | 'heartfelt' | 'witty';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NearbyEcho extends LatLng {
  title: string;
  year: number | null;
}

export type Tier = 'authoritative' | 'reputable' | 'unrated' | 'low';

export interface Source {
  uri: string;
  title: string;
  domain: string;
  tier: Tier;
  label: string;
  cited: boolean;
}

export interface Fact {
  text: string;
  /** Strongest source tier backing this fact, or 'unlinked' when Gemini didn't link claims to sources. */
  backing: Tier | 'unlinked';
}

export interface Authority {
  level: 'strong' | 'mixed' | 'weak';
  coverage: number | null;
  note: string;
}

export interface Story {
  title: string;
  date: string;
  year: number | null;
  place: string;
  /** ISO 3166-1 alpha-2 country of the place, used to pick a narrator with the local accent. */
  countryCode: string | null;
  eventLat: number;
  eventLng: number;
  distanceKm: number | null;
  hook: string;
  paragraphs: string[];
  facts: Fact[];
  nearby: NearbyEcho[];
  sources: Source[];
  authority: Authority;
}

export async function fetchStory(
  body: LatLng & { place?: string; era: Era; tone: Tone; exclude?: string[]; focus?: string },
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

export type Action =
  | 'go_to' | 'another_story' | 'ask' | 'set_era' | 'set_tone' | 'set_voice'
  | 'pause' | 'resume' | 'replay' | 'stop' | 'surprise' | 'unclear';

export interface Command {
  transcript: string;
  action: Action;
  reply: string;
  place?: string;
  era?: Era;
  tone?: Tone;
  voice?: string;
  retell?: boolean;
  question?: string;
  sources?: Source[];
  authority?: Authority;
}

export interface CommandContext {
  place: string;
  narration: string;
  era: Era;
  tone: Tone;
  voices: string[];
  story: { title: string; date: string; year: number | null; place: string; text: string } | null;
}

export async function sendCommand(transcript: string, context: CommandContext, signal?: AbortSignal): Promise<Command> {
  const res = await fetch('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, context }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Command failed (${res.status})`);
  return data as Command;
}

export interface IllustrationResponse {
  imageUrl: string;
  cached: boolean;
}

export async function fetchIllustration(
  body: { title: string; place: string; year?: number | null; fact?: string },
  signal?: AbortSignal,
): Promise<IllustrationResponse> {
  const res = await fetch('/api/illustrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Illustration request failed (${res.status})`);
  return data as IllustrationResponse;
}


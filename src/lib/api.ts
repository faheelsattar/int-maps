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

/** One painted frame of a story's animated narration, covering paragraphs from `from` to the next shot. */
export interface Shot {
  from: number;
  prompt: string;
  motion: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';
  focusX: number;
  focusY: number;
  atmosphere: 'dust' | 'embers' | 'rain' | 'snow' | 'mist' | 'none';
}

export interface Story {
  title: string;
  date: string;
  year: number | null;
  place: string;
  /** ISO 3166-1 alpha-2 country of the place, used to pick a narrator with the local accent. */
  countryCode: string | null;
  /** How a local of the place sounds speaking English, e.g. "Egyptian Arabic". */
  accent: string | null;
  eventLat: number;
  eventLng: number;
  distanceKm: number | null;
  hook: string;
  paragraphs: string[];
  facts: Fact[];
  nearby: NearbyEcho[];
  sources: Source[];
  authority: Authority;
  /** Art direction shared by every shot. */
  look: string;
  shots: Shot[];
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
  | 'pause' | 'resume' | 'replay' | 'stop' | 'surprise' | 'choose' | 'unclear';

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
  /** For choose: 1-based position in the offered stories. */
  choice?: number;
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
  /** Recent questions and answers, so follow-ups like "why?" make sense. */
  history?: { q: string; a: string }[];
  /** Stories currently offered, so "the second one" can be chosen by voice. */
  choices?: string[];
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

/** A narrator with the accent of a place, made by Gradium at runtime (the first time takes a while). */
export async function fetchLocalVoice(
  where: { countryCode: string; place: string; accent?: string },
  gender: 'f' | 'm',
  signal?: AbortSignal,
): Promise<{ id: string; accent: string }> {
  const res = await fetch('/api/local-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...where, gender }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Voice failed (${res.status})`);
  return data as { id: string; accent: string };
}

export interface Answer {
  question: string;
  reply: string;
  sources: Source[];
  authority: Authority;
}

export async function askQuestion(question: string, context: CommandContext, signal?: AbortSignal): Promise<Answer> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Question failed (${res.status})`);
  return data as Answer;
}

/** A story on the historian's shelf, before it is told. */
export interface StoryChoice {
  year: number;
  title: string;
  teaser: string;
}

export async function fetchStories(
  body: LatLng & { place?: string; era: Era; exclude?: string[] },
  signal?: AbortSignal,
): Promise<StoryChoice[]> {
  const res = await fetch('/api/stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Could not list stories (${res.status})`);
  return data.stories as StoryChoice[];
}

/** The historian's study painted for a place (a local historian, local decor). */
export async function fetchScene(place: string, gender: 'f' | 'm', signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/scene', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ place, gender }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Scene failed (${res.status})`);
  return data.url as string;
}

/** Paints one shot of the storyboard (Nano Banana); resolves to the image URL. */
export async function fetchShot(story: Pick<Story, 'look' | 'place' | 'year'>, shot: Shot, signal?: AbortSignal): Promise<string> {
  const res = await fetch('/api/shot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: shot.prompt, look: story.look, place: story.place, year: story.year }),
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Shot failed (${res.status})`);
  return data.url as string;
}

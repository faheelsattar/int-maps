import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GEMINI_MODEL,
  answerPrompt,
  nearbyEvents,
  parseWitness,
  researchJourney,
  researchPlace,
  splitParagraphs,
  streamText,
  toNum,
  translate,
  writePrompt,
} from './gemini.js';
import { BREAK, STOP_BREAK, browserToken, openTTS, readable, ttsChain } from './gradium.js';
import { audioKey, audioRecorder, getStory, hasAudio, listStories, newId, readAudio, saveStory } from './store.js';
import { localFor, witnessVoice } from './voices.js';

const PORT = Number(process.env.PORT || 8787);

if (!process.env.GEMINI_API_KEY) console.warn('⚠️  GEMINI_API_KEY is not set');
if (!process.env.GRADIUM_API_KEY) console.warn('⚠️  GRADIUM_API_KEY is not set');

const app = express();
app.use(express.json({ limit: '256kb' }));

// ---------- helpers ----------

/** Starts an NDJSON response; send() is a no-op once the client disconnects. */
function ndjson(req, res) {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (msg) => !controller.signal.aborted && res.write(JSON.stringify(msg) + '\n');
  return { send, signal: controller.signal };
}

const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const ENGLISH = { lang: 'en', language: 'English' };

function cleanVoice(v) {
  if (!v || typeof v.id !== 'string') return null;
  return { id: v.id.slice(0, 64), name: str(v.name, 40) || 'Narrator', accent: str(v.accent, 40), flag: str(v.flag, 8) };
}

/** Turns grounded research into the story skeleton the client renders before any text exists. */
function skeleton(kind, research, { lat, lng, place }) {
  const f = research.fields;
  const verified = research.claims.filter((c) => c.verified);
  const stops =
    kind === 'journey'
      ? research.stops.filter((s) => s.lat != null && s.lng != null).sort((a, b) => a.index - b.index)
      : [];
  return {
    kind,
    title: f.TITLE || 'An untold story',
    date: f.DATE || '',
    year: toNum(f.YEAR),
    place: f.PLACE || place || '',
    country: (f.COUNTRY || '').toLowerCase(),
    eventLat: toNum(f.LAT) ?? stops[0]?.lat ?? lat,
    eventLng: toNum(f.LNG) ?? stops[0]?.lng ?? lng,
    distanceKm: toNum(f.DISTANCE_KM),
    hook: f.HOOK || '',
    witness: parseWitness(f.WITNESS),
    claims: research.claims,
    stops,
    nearby: research.nearby.filter((n) => n.lat != null && n.lng != null && n.title).slice(0, 3),
    sources: research.sources.slice(0, 10),
    factCheck: {
      searched: research.searched,
      verified: verified.length,
      total: research.claims.length,
      partial: verified.length < 3,
    },
  };
}

/**
 * Writes the story with Gemini (streamed) and speaks it with Gradium (streamed) at the
 * same time, forwarding text deltas and audio to the client as they happen.
 */
async function tell({ send, signal, base, mode, langPref, tone, voice, speed, nearby }) {
  const local = base.kind === 'place' && langPref === 'local' ? localFor(base.country) : null;
  const lang = local ?? ENGLISH;
  const chosenVoice =
    mode === 'eyewitness' ? witnessVoice(base.witness, lang.lang) : local ? local.voice : voice || { id: 'I7GYfpcKbafFrYUv', name: 'Declan', accent: 'Irish', flag: '🇮🇪' };

  const claims = base.factCheck.partial ? base.claims : base.claims.filter((c) => c.verified);
  const story = {
    ...base,
    id: newId(base.title),
    mode,
    tone,
    lang: lang.lang,
    language: lang.language,
    localLang: localFor(base.country)?.lang ?? null,
    voice: chosenVoice,
    speed,
    paragraphs: [],
  };
  send({ type: 'story', story });
  send({ type: 'stage', stage: 'writing' });

  const gap = base.kind === 'journey' ? STOP_BREAK : BREAK;
  const recorder = audioRecorder();
  let ttsError = null;
  const tts = ttsChain({
    voiceId: chosenVoice.id,
    speed,
    gap,
    onMessage: (msg) => {
      recorder.add(msg);
      send({ type: 'tts', msg });
    },
    onError: (err) => (ttsError ??= err),
  });
  signal.addEventListener('abort', () => tts.abort());

  try {
    const prompt = writePrompt({
      kind: base.kind,
      research: { fields: { TITLE: base.title, DATE: base.date, PLACE: base.place } },
      claims,
      tone,
      mode,
      witness: base.witness,
      language: lang.language,
      stops: base.stops,
    });
    const { text } = await streamText(
      prompt,
      (delta) => {
        send({ type: 'delta', text: delta });
        tts.push(delta);
      },
      { signal },
    );
    story.paragraphs = splitParagraphs(text);
    send({ type: 'written', paragraphs: story.paragraphs });

    await tts.end();
    if (ttsError) send({ type: 'error', message: readable(ttsError.message), audioOnly: true });
    else recorder.save(audioKey(story.paragraphs, chosenVoice.id, speed, gap));

    if (lang.lang !== 'en') {
      try {
        story.subtitles = await translate(story.paragraphs, 'English');
      } catch (err) {
        console.error('[tell] subtitles failed:', err.message);
      }
    }
    if (nearby) story.nearby = dropSame(await nearby, story.title);
    saveStory(story);
    send({ type: 'done', story });
  } catch (err) {
    tts.abort();
    if (signal.aborted) return;
    throw err;
  }
}

const INTROS = [
  (p) => `${p}. Let me dig through the archives.`,
  (p) => `${p}. Let's see what happened here.`,
  (p) => `${p}. Give me a moment, there's a story here.`,
];

/** A short spoken line while research runs, so the app never sits in silence. */
function speakIntro(send, voice, place, speed) {
  if (!voice?.id) return;
  const name = (place || '').split(',').slice(0, 2).join(',').trim() || 'Right here';
  const text = INTROS[Math.floor(Math.random() * INTROS.length)](name);
  const tts = openTTS({ voiceId: voice.id, speed, onMessage: (msg) => send({ type: 'intro', msg }) });
  tts.text(text);
  tts.end();
  tts.done.catch((err) => console.error('[intro]', err.message));
}

/** Nearby suggestions can include the main event itself; drop it. */
export function dropSame(list, title) {
  const words = (t) => new Set(String(t).toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const main = words(title);
  return list.filter((n) => {
    const w = [...words(n.title)];
    return !w.length || w.filter((x) => main.has(x)).length / w.length < 0.5;
  });
}

function fail(send, err, where) {
  console.error(`[${where}]`, err);
  send({ type: 'error', message: readable(err?.message || String(err)) });
}

// ---------- routes ----------

// Drop a pin (or search a place): research → write + speak, streamed.
app.post('/api/story', async (req, res) => {
  const b = req.body ?? {};
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'lat and lng are required numbers' });
  const { send, signal } = ndjson(req, res);
  try {
    send({ type: 'stage', stage: 'research' });
    if (b.intro !== false && !b.focus) speakIntro(send, cleanVoice(b.voice), str(b.place), Number(b.speed) || 0);
    const nearby = nearbyEvents({ lat, lng, place: str(b.place) })
      .then((list) => (send({ type: 'nearby', nearby: list }), list))
      .catch((err) => (console.error('[nearby]', err.message), []));
    const research = await researchPlace({
      lat,
      lng,
      place: str(b.place),
      era: b.era,
      pick: b.pick,
      exclude: Array.isArray(b.exclude) ? b.exclude.slice(0, 10).map((t) => str(t, 120)) : [],
      focus: str(b.focus),
    });
    if (signal.aborted) return;
    await tell({
      send,
      signal,
      base: skeleton('place', research, { lat, lng, place: str(b.place) }),
      mode: b.mode === 'eyewitness' ? 'eyewitness' : 'narrator',
      langPref: b.lang === 'local' ? 'local' : 'en',
      tone: str(b.tone, 20) || 'epic',
      voice: cleanVoice(b.voice),
      speed: Number(b.speed) || 0,
      nearby,
    });
  } catch (err) {
    fail(send, err, 'story');
  }
  res.end();
});

// A narrated route ("Napoleon's march on Moscow"): stops + one paragraph per stop.
app.post('/api/journey', async (req, res) => {
  const b = req.body ?? {};
  const query = str(b.query, 200).trim();
  if (!query) return res.status(400).json({ error: 'query is required' });
  const { send, signal } = ndjson(req, res);
  try {
    send({ type: 'stage', stage: 'research' });
    if (b.intro !== false) speakIntro(send, cleanVoice(b.voice), query.replace(/[.!?]+$/, ''), Number(b.speed) || 0);
    const research = await researchJourney({ query });
    if (signal.aborted) return;
    const base = skeleton('journey', research, { lat: 0, lng: 0, place: '' });
    if (base.stops.length < 2) throw new Error("Couldn't map that journey. Try naming a specific voyage, march or route.");
    await tell({
      send,
      signal,
      base,
      mode: b.mode === 'eyewitness' ? 'eyewitness' : 'narrator',
      langPref: 'en',
      tone: str(b.tone, 20) || 'epic',
      voice: cleanVoice(b.voice),
      speed: Number(b.speed) || 0,
    });
  } catch (err) {
    fail(send, err, 'journey');
  }
  res.end();
});

// Retell a saved story in another mode/language, reusing its verified research (no new search).
app.post('/api/retell', async (req, res) => {
  const b = req.body ?? {};
  const saved = getStory(str(b.storyId, 80));
  if (!saved) return res.status(404).json({ error: 'Story not found' });
  const { send, signal } = ndjson(req, res);
  try {
    const { id, paragraphs, subtitles, voice, mode, lang, language, localLang, tone, speed, savedAt, ...base } = saved;
    await tell({
      send,
      signal,
      base,
      mode: b.mode === 'eyewitness' ? 'eyewitness' : 'narrator',
      langPref: b.lang === 'local' ? 'local' : 'en',
      tone: str(b.tone, 20) || tone || 'epic',
      voice: cleanVoice(b.voice),
      speed: Number(b.speed ?? speed) || 0,
    });
  } catch (err) {
    fail(send, err, 'retell');
  }
  res.end();
});

// Replays: serve cached audio when we have it, otherwise synthesise (and cache) it.
app.post('/api/narrate', async (req, res) => {
  const { paragraphs, voiceId, speed = 0, kind } = req.body ?? {};
  if (!Array.isArray(paragraphs) || !paragraphs.length || typeof voiceId !== 'string') {
    return res.status(400).json({ error: 'paragraphs and voiceId are required' });
  }
  const clean = paragraphs.map((p) => String(p).trim()).filter(Boolean).slice(0, 12);
  const gap = kind === 'journey' ? STOP_BREAK : BREAK;
  const key = audioKey(clean, voiceId, speed, gap);
  if (hasAudio(key)) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    return readAudio(key).pipe(res);
  }
  const { send, signal } = ndjson(req, res);
  const recorder = audioRecorder();
  let ttsError = null;
  const tts = ttsChain({
    voiceId,
    speed,
    gap,
    onMessage: (msg) => {
      recorder.add(msg);
      send(msg);
    },
    onError: (err) => (ttsError ??= err),
  });
  signal.addEventListener('abort', () => tts.abort());
  tts.paragraphs(clean);
  await tts.end();
  if (ttsError) send({ type: 'error', message: readable(ttsError.message) });
  else if (!signal.aborted) recorder.save(key);
  res.end();
});

// Spoken follow-up questions: Gemini answers (with search), Gradium speaks it, both streamed.
app.post('/api/ask', async (req, res) => {
  const b = req.body ?? {};
  const story = getStory(str(b.storyId, 80));
  const question = str(b.question, 500).trim();
  if (!story || !question) return res.status(400).json({ error: 'storyId and question are required' });
  const { send, signal } = ndjson(req, res);
  const tts = ttsChain({ voiceId: story.voice.id, speed: story.speed ?? 0, onMessage: (msg) => send({ type: 'tts', msg }) });
  signal.addEventListener('abort', () => tts.abort());
  try {
    const history = Array.isArray(b.history) ? b.history.slice(-4).map((h) => ({ q: str(h.q, 300), a: str(h.a, 600) })) : [];
    const { text, sources } = await streamText(
      answerPrompt({ story, question, history, mode: story.mode, witness: story.witness, language: story.language || 'English' }),
      (delta) => {
        send({ type: 'delta', text: delta });
        tts.push(delta.replace(/\n\s*\n/g, ' '));
      },
      { search: true, signal },
    );
    await tts.end();
    send({ type: 'done', answer: text.trim(), sources: sources.slice(0, 4) });
  } catch (err) {
    tts.abort();
    if (!signal.aborted) fail(send, err, 'ask');
  }
  res.end();
});

// The browser opens Gradium STT directly with a short-lived token (our key never leaves the server).
app.post('/api/stt-token', async (_req, res) => {
  try {
    res.json(await browserToken());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/stories', (_req, res) => res.json(listStories(20)));
app.get('/api/stories/:id', (req, res) => {
  const s = getStory(req.params.id);
  return s ? res.json(s) : res.status(404).json({ error: 'Story not found' });
});

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, model: GEMINI_MODEL, gemini: !!process.env.GEMINI_API_KEY, gradium: !!process.env.GRADIUM_API_KEY }),
);

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`🗺️  Echoes API on http://localhost:${PORT} (model: ${GEMINI_MODEL})`));

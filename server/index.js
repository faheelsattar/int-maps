import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const PORT = Number(process.env.PORT || 8787);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GRADIUM_URL = process.env.GRADIUM_URL || 'https://api.gradium.ai/api/post/speech/tts';

if (!process.env.GEMINI_API_KEY) console.warn('⚠️  GEMINI_API_KEY is not set');
if (!process.env.GRADIUM_API_KEY) console.warn('⚠️  GRADIUM_API_KEY is not set');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const app = express();
app.use(express.json({ limit: '64kb' }));

const ERAS = {
  any: 'any period of recorded history',
  ancient: 'antiquity (before 500 AD)',
  medieval: 'the medieval period (500–1500 AD)',
  early: 'the early modern era (1500–1900)',
  modern: 'the 20th or 21st century',
};

const TONES = {
  epic: 'epic and cinematic, like the opening of a historical blockbuster',
  mystery: 'hushed and suspenseful, like a campfire mystery',
  heartfelt: 'warm and intimate, focused on the human beings involved',
  witty: 'dry, witty and wry, like a mischievous museum guide',
};

function buildPrompt({ lat, lng, place, era, tone, exclude, focus }) {
  return `You are "Echoes", a master storyteller who narrates TRUE historical events tied to real places.

A traveller has dropped a pin at latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}${
    place ? ` (reverse-geocoded as: "${place}")` : ''
  }.

Task:
${focus ? `0. The traveller specifically asked for this event: "${focus}". Tell THAT story (verify it with search and correct any wrong details).\n` : ''}1. Use Google Search to find ONE real, well-documented, verifiable event from ${ERAS[era] || ERAS.any} that happened at, or as close as possible to, this exact spot. Prefer within 25 km. If the pin is remote (ocean, desert, ice), choose the nearest genuinely documented event (shipwreck, expedition, battle, discovery, flight, disaster, etc.).
2. Prefer surprising, vivid, lesser-known events over the most obvious tourist fact, but NEVER invent anything. Every name, date, number and detail must be historically accurate and supported by sources.
${exclude?.length ? `3. Do NOT use any of these already-told stories: ${exclude.map((t) => `"${t}"`).join(', ')}.\n` : ''}
Narration style: ${TONES[tone] || TONES.epic}. Write for the ear, it will be read aloud by a voice actor:
- 170 to 230 words, split into 3 to 5 short paragraphs.
- Open with an immersive hook that places the listener at the spot and moment ("It is the winter of 1814...").
- Short, rhythmic sentences. No lists, no markdown, no parentheses, no emoji, no URLs, no citation markers like [1].
- Write years as digits; spell out abbreviations.
- End with a resonant line connecting the past to the spot today.

Reply with ONLY a JSON object (no code fences) of this exact shape:
{
  "title": "short evocative title, max 7 words",
  "date": "human readable date, e.g. 14 April 1912",
  "year": 1912,
  "place": "specific place name of the event, city/region, country",
  "eventLat": 41.7325,
  "eventLng": -49.9469,
  "distanceKm": 12,
  "hook": "one-sentence teaser, max 18 words",
  "paragraphs": ["...", "..."],
  "facts": ["3 short verified facts, each max 16 words"],
  "nearby": [
    {"title": "another true event near the pin, max 6 words", "year": 1066, "lat": 0.0, "lng": 0.0}
  ]
}
"year" is negative for BCE. "nearby" holds 3 OTHER real events located near the pin, with accurate coordinates.`;
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function sourcesFrom(response) {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set();
  const out = [];
  for (const c of chunks) {
    const uri = c.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    out.push({ uri, title: c.web?.title || c.web?.domain || new URL(uri).hostname });
  }
  return out.slice(0, 6);
}

// Upstream errors often arrive as JSON strings; surface just the human-readable part.
function readable(msg) {
  try {
    const j = JSON.parse(msg);
    return j.error?.message || j.detail || j.message || msg;
  } catch {
    return msg;
  }
}

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

app.post('/api/story', async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required numbers' });
  }
  const { place, era = 'any', tone = 'epic', exclude = [], focus } = req.body;
  const prompt = buildPrompt({
    lat,
    lng,
    place: typeof place === 'string' ? place.slice(0, 200) : '',
    era,
    tone,
    exclude: Array.isArray(exclude) ? exclude.slice(0, 10).map(String) : [],
    focus: typeof focus === 'string' ? focus.slice(0, 200) : '',
  });

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.8,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      const data = extractJson(response.text ?? '');
      const paragraphs = (Array.isArray(data.paragraphs) ? data.paragraphs : [String(data.narration ?? '')])
        .map((p) => String(p).replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim())
        .filter(Boolean);
      if (!paragraphs.length) throw new Error('Empty narration');

      return res.json({
        title: String(data.title ?? 'An untold story'),
        date: String(data.date ?? ''),
        year: num(data.year, null),
        place: String(data.place ?? place ?? ''),
        eventLat: num(data.eventLat, lat),
        eventLng: num(data.eventLng, lng),
        distanceKm: num(data.distanceKm, null),
        hook: String(data.hook ?? ''),
        paragraphs,
        facts: (data.facts ?? []).map(String).slice(0, 4),
        nearby: (data.nearby ?? [])
          .filter((n) => Number.isFinite(Number(n.lat)) && Number.isFinite(Number(n.lng)))
          .map((n) => ({ title: String(n.title), year: num(n.year, null), lat: Number(n.lat), lng: Number(n.lng) }))
          .slice(0, 3),
        sources: sourcesFrom(response),
      });
    } catch (err) {
      lastErr = err;
      console.error(`[story] attempt ${attempt + 1} failed:`, err.message);
    }
  }
  res.status(502).json({ error: `Gemini: ${readable(lastErr?.message || 'Story generation failed')}` });
});

// Streams Gradium's NDJSON (base64 PCM chunks + word timestamps) straight to the browser.
app.post('/api/narrate', async (req, res) => {
  const { paragraphs, voiceId, speed = 0 } = req.body ?? {};
  if (!Array.isArray(paragraphs) || !paragraphs.length || !voiceId) {
    return res.status(400).json({ error: 'paragraphs and voiceId are required' });
  }
  // Dramatic pauses between paragraphs; Gradium requires spaces around the tag.
  const text = paragraphs.map((p) => String(p).trim()).join(' <break time="0.9s" /> ').slice(0, 4000);

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  try {
    const upstream = await fetch(GRADIUM_URL, {
      method: 'POST',
      headers: { 'x-api-key': process.env.GRADIUM_API_KEY ?? '', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice_id: voiceId,
        output_format: 'pcm',
        only_audio: false,
        json_config: { padding_bonus: Math.max(-2, Math.min(2, Number(speed) || 0)), temp: 0.7 },
      }),
      signal: controller.signal,
    });
    if (!upstream.ok || !upstream.body) {
      const msg = await upstream.text();
      console.error('[narrate] gradium error:', upstream.status, msg);
      return res.status(502).json({ error: `Gradium: ${readable(msg) || upstream.status}` });
    }
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    Readable.fromWeb(upstream.body).on('error', () => res.end()).pipe(res);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('[narrate] failed:', err);
    if (!res.headersSent) res.status(502).json({ error: err.message });
  }
});

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, model: GEMINI_MODEL, gemini: !!process.env.GEMINI_API_KEY, gradium: !!process.env.GRADIUM_API_KEY }),
);

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`🗺️  Echoes API on http://localhost:${PORT} (model: ${GEMINI_MODEL})`));

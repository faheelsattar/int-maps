import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const PORT = Number(process.env.PORT || 8787);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FACT_CHECK = process.env.FACT_CHECK !== 'false';
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
  epic: 'gripping and dramatic, building tension toward the big moment',
  mystery: 'quiet and suspenseful, like a good story told around a campfire',
  heartfelt: 'warm and personal, focused on the people involved and what they went through',
  witty: 'light and playful with a dry sense of humour, like a favourite tour guide',
};

const PICKS = {
  famous:
    'Pick the most famous, historically significant event at or near this spot, the one most people would expect to hear about (e.g. at Dunkirk, the 1940 evacuation).',
  hidden: 'Pick a surprising, lesser-known event over the most obvious, famous one, a hidden gem most people have never heard of.',
};

function buildPrompt({ lat, lng, place, era, tone, exclude, focus, pick }) {
  return `You are "Echoes", a great storyteller who tells TRUE historical stories tied to real places, the way a gifted podcast host or documentary narrator would.

A traveller has dropped a pin at latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}${
    place ? ` (reverse-geocoded as: "${place}")` : ''
  }.

Task:
${focus ? `0. The traveller specifically asked for this event: "${focus}". Tell THAT story (verify it with search and correct any wrong details).\n` : ''}1. Use Google Search to find ONE real, well-documented, verifiable event from ${ERAS[era] || ERAS.any} that happened at, or as close as possible to, this exact spot. Prefer within 25 km. If the pin is remote (ocean, desert, ice), choose the nearest genuinely documented event (shipwreck, expedition, battle, discovery, flight, disaster, etc.).
2. ${PICKS[pick] || PICKS.famous} NEVER invent anything. Every name, date, number and detail must be historically accurate and supported by sources.
   Only describe actions, orders, quotes, numbers and moments that your sources actually report. You may set the scene with things that are certain (the sea, the season, the uniforms), but do not make up who did what, motives, feelings or dramatic moments the sources don't describe. If you are unsure about a detail, leave it out.
${exclude?.length ? `3. Do NOT use any of these already-told stories: ${exclude.map((t) => `"${t}"`).join(', ')}.\n` : ''}
Narration style: ${TONES[tone] || TONES.epic}. It will be read aloud, so write the way a person talks to a friend, not the way a history book reads:
- 170 to 230 words, split into 3 to 5 short paragraphs.
- Use plain, everyday words that anyone can follow on the first listen. Explain every period or military term the first time it appears, in a few plain words ("a galleon, a big Spanish sailing ship", "royalists, soldiers still loyal to the exiled king"). Do not assume the listener knows words like flank, rout, siege, garrison or relief force; use the plain version or explain them.
- Keep the drama in WHAT happened, not in fancy words. Concrete details (a name, a number, a sound, a moment) beat grand descriptions.
- Mix short punchy sentences with medium ones; most sentences under 18 words. One idea per sentence, no stacked clauses.
- Avoid flowery or bookish phrasing such as "tapestry", "testament to", "echoes of history", "etched in time", "little did they know", "amidst", "whilst", "harbinger".
- Start by dropping the listener into the moment ("It's a freezing night in January 1814..."), and end with a simple line linking that moment to this spot today.
- No lists, no markdown, no parentheses, no emoji, no URLs, no citation markers like [1]. Write years as digits; spell out abbreviations.

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
  "facts": ["3 short key facts from the story, each max 16 words"],
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

/**
 * Second pass: Gemini re-checks every claim with Google Search, fixes errors and strips
 * details it cannot confirm, changing as little as possible.
 */
async function factCheck(story) {
  const prompt = `You are a meticulous fact-checker for a history storytelling app. Use Google Search to verify every factual claim in this story: dates, numbers, names, places, who did what, orders given, and specific dramatic actions.

STORY:
${JSON.stringify({ title: story.title, date: story.date, place: story.place, paragraphs: story.paragraphs, facts: story.facts }, null, 2)}

Rules:
- If a claim is wrong, correct it. If a specific detail cannot be confirmed by reliable sources, remove it or make it more general. Never add new unconfirmed details.
- Change as little as possible. Keep the same paragraph count, the plain spoken storytelling style and roughly the same length. If everything checks out, return the text unchanged.
- Check each fact the same way and fix it if needed.

Reply with ONLY a JSON object (no code fences):
{
  "date": "corrected date if needed",
  "paragraphs": ["..."],
  "facts": [{"text": "...", "status": "confirmed" or "corrected"}],
  "corrections": ["one short plain sentence per change, e.g. 'The treaty promised 6,000 troops; about 3,000 fought in the battle.'"]
}`;
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: { tools: [{ googleSearch: {} }], temperature: 0.2, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
  });
  const data = extractJson(response.text ?? '');
  const paragraphs = (data.paragraphs ?? []).map((p) => String(p).replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim()).filter(Boolean);
  const facts = (data.facts ?? [])
    .filter((f) => f?.text)
    .map((f) => ({ text: String(f.text), status: f.status === 'corrected' ? 'corrected' : 'confirmed' }))
    .slice(0, 4);
  if (!paragraphs.length || !facts.length) throw new Error('Fact-check returned an incomplete result');
  return {
    date: data.date ? String(data.date) : story.date,
    paragraphs,
    facts,
    corrections: (data.corrections ?? []).map(String).filter(Boolean).slice(0, 6),
    sources: sourcesFrom(response),
  };
}

function mergeSources(a, b) {
  const seen = new Set();
  return [...a, ...b].filter((s) => !seen.has(s.uri) && seen.add(s.uri)).slice(0, 8);
}

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

app.post('/api/story', async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required numbers' });
  }
  const { place, era = 'any', tone = 'epic', exclude = [], focus, pick = 'famous' } = req.body;
  const prompt = buildPrompt({
    lat,
    lng,
    place: typeof place === 'string' ? place.slice(0, 200) : '',
    era,
    tone,
    exclude: Array.isArray(exclude) ? exclude.slice(0, 10).map(String) : [],
    focus: typeof focus === 'string' ? focus.slice(0, 200) : '',
    pick,
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

      const story = {
        title: String(data.title ?? 'An untold story'),
        date: String(data.date ?? ''),
        year: num(data.year, null),
        place: String(data.place ?? place ?? ''),
        eventLat: num(data.eventLat, lat),
        eventLng: num(data.eventLng, lng),
        distanceKm: num(data.distanceKm, null),
        hook: String(data.hook ?? ''),
        paragraphs,
        facts: (data.facts ?? []).map((f) => ({ text: String(f?.text ?? f), status: 'unchecked' })).slice(0, 4),
        nearby: (data.nearby ?? [])
          .filter((n) => Number.isFinite(Number(n.lat)) && Number.isFinite(Number(n.lng)))
          .map((n) => ({ title: String(n.title), year: num(n.year, null), lat: Number(n.lat), lng: Number(n.lng) }))
          .slice(0, 3),
        sources: sourcesFrom(response),
        factCheck: { checked: false, corrections: [] },
      };

      if (FACT_CHECK) {
        try {
          const fc = await factCheck({ ...story, facts: story.facts.map((f) => f.text) });
          Object.assign(story, {
            date: fc.date,
            paragraphs: fc.paragraphs,
            facts: fc.facts,
            sources: mergeSources(story.sources, fc.sources),
            factCheck: { checked: true, corrections: fc.corrections },
          });
        } catch (err) {
          // Still tell the story, just without the fact-checked badge.
          console.error('[story] fact-check failed:', err.message);
        }
      }
      return res.json(story);
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

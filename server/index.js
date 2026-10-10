import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { assessAuthority, rateFacts, rateResearch, summarize } from './sources.js';

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

const SOURCE_RULES = `Source authority matters. Use, in this order: official and government sites, archives, libraries, museums, universities and scholarly encyclopedias; then Wikipedia and established news or history publishers. Do not rely on travel blogs, forums, social media, Q&A or review sites. If an event is only documented by weak sources, choose a better-documented one.`;

/** Step 1: grounded research brief in plain prose (prose is reliably cited; JSON output often wasn't). */
function researchPrompt({ lat, lng, place, era, exclude, focus }) {
  return `Research brief for a storyteller. Run Google Search before writing, and take every claim from your search results, not from memory.

A traveller dropped a pin at latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}${place ? ` ("${place}")` : ''}.
Work at CITY level: the city or town the pin falls in. If the pin is outside any settlement, use the nearest town; for open ocean, desert or ice, the nearest genuinely documented site.

${focus ? `The traveller asked for this specific event: "${focus}". Research THAT event and correct any wrong details.` : `Find ONE real, well-documented event from ${ERAS[era] || ERAS.any} that happened in that city. Prefer surprising, lesser-known events over the most obvious tourist fact.`}
${exclude?.length ? `Do NOT choose any of these already-told stories: ${exclude.map((t) => `"${t}"`).join(', ')}.` : ''}
${SOURCE_RULES}

Write 10 to 14 plain factual sentences, no headings, no lists, no markdown:
- what happened, the exact date, and exactly where in the city (district, street or landmark);
- the people involved and why it mattered;
- what everyday life was like there at the time;
- what remains of it today;
- then 3 other well-documented events in the same city, each with its year and location.
Never invent anything; if a detail is uncertain, leave it out.`;
}

/** Step 2: turn the brief into the narrated story, using only the brief. */
function storyPrompt({ brief, tone, place }) {
  return `You are "Echoes", a master storyteller. Turn the numbered research brief below into a narrated story about ${place || 'this city'}.
Use ONLY facts stated in the brief. Do not add names, dates, numbers or events that are not in it.

Narration style: ${TONES[tone] || TONES.epic}. Write for the ear, it will be read aloud by a voice actor:
- 170 to 230 words, split into 3 to 5 short paragraphs.
- Open with an immersive hook that places the listener in the city at that moment ("It is the winter of 1814...").
- Include a few sentences on what everyday life was like then, if the brief describes it.
- Short, rhythmic sentences. No lists, no markdown, no parentheses, no emoji, no URLs, no sentence numbers.
- Write years as digits; spell out abbreviations.
- End with a resonant line connecting the past to the city today.

Research brief:
${brief.map((s) => `[${s.n}] ${s.text}`).join('\n')}

Reply with ONLY a JSON object (no code fences) of this exact shape:
{
  "title": "short evocative title, max 7 words",
  "date": "human readable date, e.g. 14 April 1912",
  "year": 1912,
  "place": "where in the city it happened, e.g. Old Town, Basel, Switzerland",
  "countryCode": "CH",
  "eventLat": 47.5596,
  "eventLng": 7.5886,
  "hook": "one-sentence teaser, max 18 words",
  "paragraphs": ["...", "..."],
  "facts": [{"text": "short fact, max 16 words", "from": [3]}],
  "nearby": [{"title": "another event from the brief, max 6 words", "year": 1066, "lat": 0.0, "lng": 0.0}]
}
"facts": exactly 3, each restating brief sentences; "from" lists the numbers of the brief sentences it comes from.
"countryCode" is the ISO 3166-1 alpha-2 code of the country the place is in today (empty string for open sea or Antarctica). "year" is negative for BCE. "eventLat"/"eventLng" and the nearby "lat"/"lng" are your best real coordinates for the locations named in the brief. "nearby" holds the 3 other events from the brief.`;
}

function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * Search-grounded generation via the Interactions API. On current models this is where citations
 * come back (url_citation annotations on the text); generateContent returned no grounding metadata.
 * Returns the text plus the citations reshaped into grounding chunks/supports for assessAuthority.
 */
async function grounded(prompt, { temperature = 0.4 } = {}) {
  const it = await ai.interactions.create({
    model: GEMINI_MODEL,
    input: prompt,
    tools: [{ type: 'google_search' }],
    generation_config: { temperature, thinking_level: 'low' },
  });
  const blocks = (it.steps ?? [])
    .filter((st) => st.type === 'model_output')
    .flatMap((st) => st.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string');
  const searched = (it.steps ?? []).some((st) => st.type === 'google_search_call');
  if (process.env.DEBUG_GROUNDING) {
    for (const st of it.steps ?? []) {
      const c = (st.content ?? []).map((x) => `${x.type}(${x.text?.length ?? 0} chars, ${x.annotations?.length ?? 0} ann)`).join(' ');
      console.log('[grounding]', st.type, c, st.type.startsWith('google_search') ? JSON.stringify(st).slice(0, 400) : '');
    }
  }
  const text = blocks.map((b) => b.text).join('') || it.output_text || '';

  const chunkIndex = new Map();
  const groundingChunks = [];
  const groundingSupports = [];
  let offset = 0;
  for (const b of blocks) {
    for (const a of b.annotations ?? []) {
      if (a.type !== 'url_citation' || !a.url) continue;
      if (!chunkIndex.has(a.url)) {
        chunkIndex.set(a.url, groundingChunks.length);
        groundingChunks.push({ web: { uri: a.url, title: a.title } });
      }
      groundingSupports.push({
        segment: { text: b.text.slice(a.start_index ?? 0, a.end_index ?? 0), startIndex: offset + (a.start_index ?? 0) },
        groundingChunkIndices: [chunkIndex.get(a.url)],
      });
    }
    offset += b.text.length;
  }
  return { text, searched, groundingMetadata: { groundingChunks, groundingSupports } };
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

const num = (v, fallback) =>
  v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? fallback : Number(v);

// Great-circle distance in km, computed here rather than trusted from the model.
function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

app.post('/api/story', async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required numbers' });
  }
  const { place, era = 'any', tone = 'epic', exclude = [], focus } = req.body;
  const args = {
    lat,
    lng,
    place: typeof place === 'string' ? place.slice(0, 200) : '',
    era,
    tone,
    exclude: Array.isArray(exclude) ? exclude.slice(0, 10).map(String) : [],
    focus: typeof focus === 'string' ? focus.slice(0, 200) : '',
  };

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const t0 = Date.now();
      // 1. Research with Google Search; rate every sentence by the sources cited for it.
      const research = await grounded(researchPrompt(args), { temperature: 0.4 });
      const rated = rateResearch({ groundingMetadata: research.groundingMetadata, text: research.text });
      if (rated.sentences.length < 4) throw new Error('Research came back empty');
      const t1 = Date.now();

      // 2. Write the story from the brief only.
      const written = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: storyPrompt({ brief: rated.sentences, tone, place: args.place }),
        config: { responseMimeType: 'application/json', temperature: 0.6, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      });
      const data = extractJson(written.text ?? '');
      const paragraphs = (Array.isArray(data.paragraphs) ? data.paragraphs : [String(data.narration ?? '')])
        .map((p) => String(p).replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim())
        .filter(Boolean);
      if (!paragraphs.length) throw new Error('Empty narration');

      const rawFacts = (Array.isArray(data.facts) ? data.facts : [])
        .map((f) => (typeof f === 'string' ? { text: f, from: [] } : { text: String(f?.text ?? ''), from: Array.isArray(f?.from) ? f.from.map(Number) : [] }))
        .filter((f) => f.text)
        .slice(0, 4);
      const verdict = summarize({
        chunkInfo: rated.chunkInfo,
        linked: rated.linked,
        claimTiers: rated.sentences.map((x) => x.tier),
        facts: rateFacts(rawFacts, rated.sentences),
      });
      console.log(
        `[story] "${data.title}": research ${t1 - t0} ms (searched=${research.searched}, ${rated.sentences.length} sentences), write ${Date.now() - t1} ms, ` +
          `authority ${verdict.authority.level}, ${verdict.sources.length} sources, ${verdict.droppedFacts} unbacked facts dropped`,
      );

      const eventLat = num(data.eventLat, lat);
      const eventLng = num(data.eventLng, lng);
      return res.json({
        title: String(data.title ?? 'An untold story'),
        date: String(data.date ?? ''),
        year: num(data.year, null),
        place: String(data.place ?? place ?? ''),
        countryCode: /^[A-Za-z]{2}$/.test(String(data.countryCode ?? '')) ? String(data.countryCode).toUpperCase() : null,
        eventLat,
        eventLng,
        distanceKm: Math.round(haversineKm({ lat, lng }, { lat: eventLat, lng: eventLng }) * 10) / 10,
        hook: String(data.hook ?? ''),
        paragraphs,
        facts: verdict.facts,
        nearby: (Array.isArray(data.nearby) ? data.nearby : [])
          .filter((n) => num(n?.lat, null) !== null && num(n?.lng, null) !== null)
          .map((n) => ({ title: String(n.title), year: num(n.year, null), lat: num(n.lat), lng: num(n.lng) }))
          .slice(0, 3),
        sources: verdict.sources,
        authority: verdict.authority,
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
        json_config: JSON.stringify({ padding_bonus: Math.max(-2, Math.min(2, Number(speed) || 0)), temp: 0.7 }),
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

// ---------------------------------------------------------------------------
// Voice: the browser streams the mic straight to Gradium STT with a short-lived,
// single-use token, so the API key never leaves the server.
app.get('/api/voice-token', async (_req, res) => {
  try {
    const url = 'https://api.gradium.ai/api/api-keys/token';
    const headers = { 'x-api-key': process.env.GRADIUM_API_KEY ?? '' };
    let r = await fetch(url, { headers });
    if (r.status === 405) r = await fetch(url, { method: 'POST', headers });
    const body = await r.text();
    if (!r.ok) {
      console.error('[voice-token] gradium error:', r.status, body);
      return res.status(502).json({ error: `Gradium: ${readable(body) || r.status}` });
    }
    const { token, expires_at } = JSON.parse(body);
    res.set('Cache-Control', 'no-store').json({ token, expiresAt: expires_at });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

const ACTIONS = ['go_to', 'another_story', 'ask', 'set_era', 'set_tone', 'set_voice', 'pause', 'resume', 'replay', 'stop', 'surprise', 'unclear'];

const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    place: { type: 'string', description: 'For go_to: the city or town to go to, with country if known' },
    era: { type: 'string', enum: Object.keys(ERAS) },
    tone: { type: 'string', enum: Object.keys(TONES) },
    voice: { type: 'string', description: 'For set_voice: one of the available narrator names' },
    retell: { type: 'boolean', description: 'For set_era/set_tone: true if the listener wants a new story now' },
    question: { type: 'string', description: 'For ask: the question, rewritten to stand alone' },
    reply: { type: 'string', description: 'Short spoken acknowledgement, max 12 words. Empty for ask.' },
  },
  required: ['action', 'reply'],
};

function intentPrompt(transcript, ctx) {
  return `You are the voice interface of "Echoes", a map app that narrates true history about the city where a pin is dropped.
Turn the listener's spoken request into ONE action.

Current state:
- City: ${ctx.place || 'none yet'}
- Story being told: ${ctx.storyTitle ? `"${ctx.storyTitle}" (${ctx.storyYear ?? 'unknown year'})` : 'none'}
- Narration: ${ctx.narration || 'idle'}
- Era filter: ${ctx.era || 'any'} (options: ${Object.keys(ERAS).join(', ')})
- Mood: ${ctx.tone || 'epic'} (options: ${Object.keys(TONES).join(', ')})
- Narrators: ${(ctx.voices || []).join(', ')}

Actions:
- go_to: they name a city, town or place to hear about ("take me to Rome", "what happened in Basel?"). Put it in "place".
- another_story: a different story in the same city ("another one", "tell me something else").
- ask: a question about the story or the city ("who was he?", "what happened next?", "why there?"). Put a standalone version in "question".
- set_era / set_tone: change the era or mood ("only medieval stories", "make it spooky" = mystery). Set retell=true if they want a new story now.
- set_voice: switch narrator ("use Declan").
- pause, resume ("continue", "go on"), replay ("start again"), stop ("stop", "close", "never mind").
- surprise: "surprise me", "anywhere", "random place".
- unclear: anything else, or speech that makes no sense (likely mis-transcribed).

"reply" is what the app says back, spoken aloud: warm, max 12 words, e.g. "Heading to Rome." For ask, leave reply empty. For unclear, gently suggest saying a city name.

Listener said: "${transcript.replace(/"/g, "'")}"`;
}

/** Grounded answer to a follow-up question, rated the same way as stories. */
async function answerQuestion(question, ctx) {
  const story = ctx.story;
  const prompt = `You are "Echoes", a storyteller answering a listener's spoken follow-up question.
${story ? `They have just heard this story: "${story.title}" (${story.date || story.year || 'date unknown'}), ${story.place}.\nStory text: ${String(story.text).slice(0, 2500)}` : `They are exploring the city: ${ctx.place || 'unknown'}.`}

Question: "${question.replace(/"/g, "'")}"

Run Google Search before answering and take every claim from the results, not from memory. ${SOURCE_RULES}
Answer in 2 to 4 short sentences written for the ear: plain text, no lists, no markdown, no URLs, years as digits.
Only state what your sources support. If it is not well documented, say so plainly instead of guessing.`;
  const response = await grounded(prompt, { temperature: 0.3 });
  const text = response.text.replace(/\[\d+(?:,\s*\d+)*\]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Empty answer');
  const rated = assessAuthority({ groundingMetadata: response.groundingMetadata, text: response.text });
  return { reply: text, sources: rated.sources, authority: rated.authority };
}

app.post('/api/command', async (req, res) => {
  const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript.trim().slice(0, 500) : '';
  if (!transcript) return res.status(400).json({ error: 'transcript is required' });
  const raw = req.body?.context ?? {};
  const ctx = {
    place: String(raw.place ?? '').slice(0, 200),
    storyTitle: raw.story ? String(raw.story.title ?? '').slice(0, 200) : '',
    storyYear: raw.story?.year ?? null,
    narration: String(raw.narration ?? '').slice(0, 20),
    era: String(raw.era ?? ''),
    tone: String(raw.tone ?? ''),
    voices: Array.isArray(raw.voices) ? raw.voices.slice(0, 20).map(String) : [],
    story: raw.story
      ? {
          title: String(raw.story.title ?? '').slice(0, 200),
          date: String(raw.story.date ?? '').slice(0, 100),
          year: raw.story.year ?? null,
          place: String(raw.story.place ?? '').slice(0, 200),
          text: String(raw.story.text ?? '').slice(0, 3000),
        }
      : null,
  };

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: intentPrompt(transcript, ctx),
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: INTENT_SCHEMA,
        temperature: 0,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
    const intent = extractJson(response.text ?? '');
    const action = ACTIONS.includes(intent.action) ? intent.action : 'unclear';
    const out = {
      transcript,
      action,
      reply: String(intent.reply ?? '').slice(0, 200),
      place: typeof intent.place === 'string' ? intent.place.slice(0, 200) : undefined,
      era: ERAS[intent.era] ? intent.era : undefined,
      tone: TONES[intent.tone] ? intent.tone : undefined,
      voice: typeof intent.voice === 'string' ? intent.voice : undefined,
      retell: !!intent.retell,
    };
    if (action === 'go_to' && !out.place) out.action = 'unclear';
    if (action === 'ask') {
      const question = String(intent.question || transcript);
      Object.assign(out, { question }, await answerQuestion(question, ctx));
    }
    if (out.action === 'unclear' && !out.reply) out.reply = "Sorry, I didn't catch that. Try saying a city, like Rome.";
    console.log(`[command] "${transcript}" -> ${out.action}${out.place ? ` (${out.place})` : ''}`);
    res.json(out);
  } catch (err) {
    console.error('[command] failed:', err.message);
    res.status(502).json({ error: `Gemini: ${readable(err.message || 'Command failed')}` });
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

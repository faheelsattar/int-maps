import 'dotenv/config';
import express from 'express';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { assessAuthority, rateFacts, rateResearch, summarize } from './sources.js';
import { isCandidate, localNarrator, retireOldVoices, speechRequest, speechSlot } from './voices.js';

const PORT = Number(process.env.PORT || 8787);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const NANO_BANANA_MODEL = process.env.NANO_BANANA_MODEL || 'nano-banana-pro-preview';
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

// Which stories to look for: the landmark events, or hidden gems.
const PICKS = {
  famous: 'Pick the most famous, historically significant events in that city, the ones most people would expect to hear about (e.g. at Dunkirk, the 1940 evacuation).',
  hidden: 'Pick surprising, lesser-known events over the most obvious, famous ones: hidden gems most people have never heard of.',
};
const FACT_CHECK = process.env.FACT_CHECK !== 'false';

const SOURCE_RULES = `Source authority matters. Use, in this order: official and government sites, archives, libraries, museums, universities and scholarly encyclopedias; then Wikipedia and established news or history publishers. Do not rely on travel blogs, forums, social media, Q&A or review sites. If an event is only documented by weak sources, choose a better-documented one.`;

/** Step 1: grounded research brief in plain prose (prose is reliably cited; JSON output often wasn't). */
function researchPrompt({ lat, lng, place, era, exclude, focus, pick }) {
  return `Research brief for a storyteller. Run Google Search before writing, and take every claim from your search results, not from memory.

A traveller dropped a pin at latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}${place ? ` ("${place}")` : ''}.
Work at CITY level: the city or town the pin falls in. If the pin is outside any settlement, use the nearest town; for open ocean, desert or ice, the nearest genuinely documented site.

${focus ? `The traveller asked for this specific event: "${focus}". Research THAT event and correct any wrong details.` : `Find ONE real, well-documented event from ${ERAS[era] || ERAS.any} that happened in that city. ${PICKS[pick] || PICKS.famous}`}
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
  return `You are "Echoes", a great storyteller who tells TRUE historical stories tied to real places, the way a gifted podcast host or documentary narrator would. Turn the numbered research brief below into a story about ${place || 'this city'}.
Use ONLY facts stated in the brief: never add names, dates, numbers or events that are not in it.
Only describe actions, orders, quotes, numbers and moments the brief reports. You may set the scene with things that are certain (the sea, the season, the uniforms), but do not make up who did what, motives, feelings or dramatic moments the brief doesn't describe. If you are unsure about a detail, leave it out.

Narration style: ${TONES[tone] || TONES.epic}. It will be read aloud, so write the way a person talks to a friend, not the way a history book reads:
- 170 to 230 words, split into 3 to 5 short paragraphs.
- Use plain, everyday words that anyone can follow on the first listen. Explain every period or military term the first time it appears, in a few plain words ("a galleon, a big Spanish sailing ship", "royalists, soldiers still loyal to the exiled king"). Do not assume the listener knows words like flank, rout, siege, garrison or relief force; use the plain version or explain them.
- Keep the drama in WHAT happened, not in fancy words. Concrete details (a name, a number, a sound, a moment) beat grand descriptions.
- Mix short punchy sentences with medium ones; most sentences under 18 words. One idea per sentence, no stacked clauses.
- Avoid flowery or bookish phrasing such as "tapestry", "testament to", "echoes of history", "etched in time", "little did they know", "amidst", "whilst", "harbinger".
- Start by dropping the listener into the moment ("It's a freezing night in January 1814..."), and end with a simple line linking that moment to this city today.
- No lists, no markdown, no parentheses, no emoji, no URLs, no sentence numbers. Write years as digits; spell out abbreviations.

Research brief:
${brief.map((s) => `[${s.n}] ${s.text}`).join('\n')}

Reply with ONLY a JSON object (no code fences) of this exact shape:
{
  "title": "short evocative title, max 7 words",
  "date": "human readable date, e.g. 14 April 1912",
  "year": 1912,
  "place": "where in the city it happened, e.g. Old Town, Basel, Switzerland",
  "countryCode": "CH",
  "accent": "Swiss German",
  "eventLat": 47.5596,
  "eventLng": 7.5886,
  "hook": "one-sentence teaser, max 18 words",
  "paragraphs": ["...", "..."],
  "facts": [{"text": "short fact, max 16 words", "from": [3]}],
  "nearby": [{"title": "another event from the brief, max 6 words", "year": 1066, "lat": 0.0, "lng": 0.0}],
  "look": "one art direction line shared by every illustration: medium, palette, light, e.g. oil painting in muted ochres and slate blues, low winter light",
  "shots": [{"from": 0, "prompt": "...", "motion": "zoom-in", "focusX": 50, "focusY": 40, "atmosphere": "dust"}]
}
"facts": exactly 3, each restating brief sentences; "from" lists the numbers of the brief sentences it comes from.
"countryCode" is the ISO 3166-1 alpha-2 code of the country the place is in today (empty string for open sea or Antarctica). "accent" names the accent a local of that place has when speaking English, e.g. "Egyptian Arabic", "Neapolitan Italian", "Japanese" (empty string if none). "year" is negative for BCE. "eventLat"/"eventLng" and the nearby "lat"/"lng" are your best real coordinates for the locations named in the brief. "nearby" holds the 3 other events from the brief.
"shots" is the storyboard for an animated, illustrated narration: 3 to 5 shots in story order, each covering the paragraphs from "from" (0-based paragraph index; the first shot has from 0) until the next shot.
- "prompt": a vivid, concrete description of one painted frame, 40 to 70 words: the setting, the people and what they are doing, period-accurate clothing, architecture and objects for the year and place, the light and the camera framing (wide establishing shot, medium shot, close-up on hands or an object). Describe any recurring person with the same words in every shot so they look consistent. Show only what the story says; never anything gory. No text, signs or writing in the frame.
- "motion": the slow camera move over the frame: zoom-in, zoom-out, pan-left, pan-right, pan-up or pan-down. "focusX"/"focusY" (0 to 100) is the point of interest the camera drifts towards.
- "atmosphere": dust, embers, rain, snow, mist or none, matching the scene.`;
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

/**
 * Second pass: Gemini re-checks every claim with Google Search, fixes errors and strips details it
 * cannot confirm, changing as little as possible. Its sources are rated like the research's.
 */
async function factCheck(story) {
  const prompt = `You are a meticulous fact-checker for a history storytelling app. Use Google Search to verify every factual claim in this story: dates, numbers, names, places, who did what, orders given, and specific dramatic actions.

STORY:
${JSON.stringify({ title: story.title, date: story.date, place: story.place, paragraphs: story.paragraphs, facts: story.facts.map((f) => f.text) }, null, 2)}

Rules:
- If a claim is wrong, correct it. If a specific detail cannot be confirmed by reliable sources, remove it or make it more general. Never add new unconfirmed details.
- Change as little as possible. Keep exactly the same number of paragraphs, the plain spoken storytelling style and roughly the same length. If everything checks out, return the text unchanged.
- Check each fact the same way and fix it if needed.
${SOURCE_RULES}

Reply with ONLY a JSON object (no code fences):
{
  "date": "corrected date if needed",
  "paragraphs": ["..."],
  "facts": [{"text": "...", "status": "confirmed" or "corrected"}],
  "corrections": ["one short plain sentence per change, e.g. 'The treaty promised 6,000 troops; about 3,000 fought in the battle.'"]
}`;
  const response = await grounded(prompt, { temperature: 0.2 });
  const data = extractJson(response.text);
  const paragraphs = (data.paragraphs ?? []).map((p) => String(p).replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim()).filter(Boolean);
  const facts = (data.facts ?? [])
    .filter((f) => f?.text)
    .map((f, i) => ({ text: String(f.text), status: f.status === 'corrected' ? 'corrected' : 'confirmed', backing: story.facts[i]?.backing ?? 'unlinked' }))
    .slice(0, 4);
  if (!facts.length) throw new Error('Fact-check returned no facts');
  // The storyboard is tied to paragraph positions, so a rewrite that changes their number is not applied.
  if (paragraphs.length !== story.paragraphs.length) throw new Error(`Fact-check returned ${paragraphs.length} paragraphs, expected ${story.paragraphs.length}`);
  const rated = assessAuthority({ groundingMetadata: response.groundingMetadata, text: response.text });
  return {
    date: data.date ? String(data.date) : story.date,
    paragraphs,
    facts,
    corrections: (data.corrections ?? []).map(String).filter(Boolean).slice(0, 6),
    sources: rated.sources,
  };
}

function mergeSources(a, b) {
  const seen = new Set();
  return [...a, ...b].filter((s) => !seen.has(s.uri) && seen.add(s.uri)).slice(0, 10);
}

const MOTIONS = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down'];
const ATMOSPHERES = ['dust', 'embers', 'rain', 'snow', 'mist', 'none'];

/** Cleans the model's shot list: in paragraph order, starting at the first paragraph, at most 5. */
function storyboard(shots, paragraphCount) {
  const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, num(v, d)));
  const list = (Array.isArray(shots) ? shots : [])
    .filter((s) => s && typeof s.prompt === 'string' && s.prompt.trim())
    .map((s) => ({
      from: clamp(s.from, 0, paragraphCount - 1, 0),
      prompt: s.prompt.trim().slice(0, 700),
      motion: MOTIONS.includes(s.motion) ? s.motion : 'zoom-in',
      focusX: clamp(s.focusX, 0, 100, 50),
      focusY: clamp(s.focusY, 0, 100, 45),
      atmosphere: ATMOSPHERES.includes(s.atmosphere) ? s.atmosphere : 'dust',
    }))
    .sort((a, b) => a.from - b.from)
    .filter((s, i, all) => i === 0 || s.from > all[i - 1].from)
    .slice(0, 5);
  if (list[0]) list[0].from = 0;
  return list;
}

app.post('/api/story', async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required numbers' });
  }
  const { place, era = 'any', tone = 'epic', pick = 'famous', exclude = [], focus } = req.body;
  const args = {
    lat,
    lng,
    place: typeof place === 'string' ? place.slice(0, 200) : '',
    era,
    tone,
    pick: PICKS[pick] ? pick : 'famous',
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
      const story = {
        title: String(data.title ?? 'An untold story'),
        date: String(data.date ?? ''),
        year: num(data.year, null),
        place: String(data.place ?? place ?? ''),
        countryCode: /^[A-Za-z]{2}$/.test(String(data.countryCode ?? '')) ? String(data.countryCode).toUpperCase() : null,
        accent: String(data.accent ?? '').replace(/[^\p{L}\s'-]/gu, '').trim().slice(0, 40) || null,
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
        look: String(data.look ?? '').slice(0, 300),
        shots: storyboard(data.shots, paragraphs.length),
        factCheck: { checked: false, corrections: [] },
      };

      if (FACT_CHECK) {
        const t2 = Date.now();
        try {
          const fc = await factCheck(story);
          Object.assign(story, {
            date: fc.date,
            paragraphs: fc.paragraphs,
            facts: fc.facts,
            sources: mergeSources(story.sources, fc.sources),
            factCheck: { checked: true, corrections: fc.corrections },
          });
          console.log(`[story] fact-check ${Date.now() - t2} ms, ${fc.corrections.length} corrections`);
        } catch (err) {
          // Still tell the story, just without the fact-checked badge.
          console.error('[story] fact-check failed:', err.message);
        }
      }
      prepaintShots(story);
      return res.json(story);
    } catch (err) {
      lastErr = err;
      console.error(`[story] attempt ${attempt + 1} failed:`, err.message);
    }
  }
  res.status(502).json({ error: `Gemini: ${readable(lastErr?.message || 'Story generation failed')}` });
});

// The historian's shelf: several real stories from the place, for the listener to choose from.
app.post('/api/stories', async (req, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'lat and lng are required numbers' });
  const place = typeof req.body?.place === 'string' ? req.body.place.slice(0, 200) : '';
  const era = ERAS[req.body?.era] ? req.body.era : 'any';
  const pick = PICKS[req.body?.pick] ? req.body.pick : 'famous';
  const exclude = Array.isArray(req.body?.exclude) ? req.body.exclude.slice(0, 10).map((t) => String(t).slice(0, 120)) : [];

  const prompt = `Run Google Search, and take every event from your search results, not from memory.
A traveller dropped a pin at latitude ${lat.toFixed(5)}, longitude ${lng.toFixed(5)}${place ? ` ("${place}")` : ''}. Work at CITY level: the city or town the pin falls in, or the nearest documented site.
List 6 different real, well-documented events from ${ERAS[era]} that happened there, spread across different periods where possible. ${PICKS[pick]}
${exclude.length ? `Leave out these already-told stories: ${exclude.map((t) => `"${t}"`).join(', ')}.` : ''}
${SOURCE_RULES}
Write exactly one line per event, nothing else, in this format:
YEAR | TITLE | TEASER
YEAR is a number, negative for BCE. TITLE is evocative, at most 7 words. TEASER is one intriguing sentence of at most 18 words that makes the listener want to hear more.`;

  try {
    const t0 = Date.now();
    const { text } = await grounded(prompt, { temperature: 0.6 });
    const stories = text
      .replace(/\[\d+(?:,\s*\d+)*\]/g, '')
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, '').split('|').map((x) => x.replace(/\*\*/g, '').trim()))
      .filter((parts) => parts.length >= 3 && /^-?\d{1,4}$/.test(parts[0]) && parts[1])
      .map(([year, title, ...rest]) => ({ year: Number(year), title: title.slice(0, 80), teaser: rest.join(' ').slice(0, 200) }))
      .slice(0, 6);
    if (stories.length < 2) throw new Error('No stories found for this place');
    console.log(`[stories] ${place || `${lat},${lng}`}: ${stories.length} in ${Date.now() - t0} ms`);
    res.json({ stories });
  } catch (err) {
    console.error('[stories] failed:', err.message);
    res.status(502).json({ error: `Gemini: ${readable(err.message || 'Could not list stories')}` });
  }
});

const SAMPLE_RATE = 48000; // Gradium "pcm": 48 kHz, 16-bit, mono
const PARAGRAPH_PAUSE = 0.9;

/** Splits text into pieces of at most `max` characters, breaking at sentence ends (then commas, then spaces). */
function splitText(text, max) {
  const out = [];
  let rest = text.trim();
  while (rest.length > max) {
    const head = rest.slice(0, max + 1);
    const cut = Math.max(head.search(/[.!?]["”’)]?\s(?!.*[.!?]["”’)]?\s)/), -1);
    const at = cut > max * 0.4 ? cut + 1 : head.lastIndexOf(', ') > max * 0.4 ? head.lastIndexOf(', ') + 1 : head.lastIndexOf(' ');
    out.push(rest.slice(0, at > 0 ? at : max).trim());
    rest = rest.slice(at > 0 ? at : max).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function gradiumTts(text, voiceId, speed, signal) {
  return speechRequest(
    {
      text,
      voice_id: voiceId,
      output_format: 'pcm',
      only_audio: false,
      json_config: JSON.stringify({ padding_bonus: Math.max(-2, Math.min(2, Number(speed) || 0)), temp: 0.7 }),
    },
    signal,
  );
}

/**
 * One piece of narration, requested now. Messages collect in `msgs` and go to `listener` as they
 * arrive, so the piece being played streams live while later ones buffer. `done` resolves to its length in seconds.
 */
function ttsPiece(text, voiceId, speed, signal) {
  const piece = { msgs: [], listener: null };
  piece.done = speechSlot(async () => {
    const r = await gradiumTts(text, voiceId, speed, signal);
    if (!r.ok || !r.body) throw new Error(`Gradium: ${readable(await r.text()) || r.status}`);
    const decoder = new TextDecoder();
    let buf = '';
    let samples = 0;
    const take = (line) => {
      if (!line.trim()) return;
      const m = JSON.parse(line);
      if (m.type === 'error') throw new Error(`Gradium: ${m.message || 'error'}`);
      if (m.type === 'audio' && m.audio) samples += Buffer.from(m.audio, 'base64').length / 2;
      piece.msgs.push(m);
      piece.listener?.(m);
    };
    for await (const chunk of r.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        take(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    take(buf);
    return samples / SAMPLE_RATE;
  });
  piece.done.catch(() => {}); // awaited in order below
  return piece;
}

// Streams Gradium's NDJSON (base64 PCM chunks + word timestamps) straight to the browser.
// Local-accent voices only speak ~300 characters per request, so their text goes in pieces,
// fetched ahead and stitched back together with word timings shifted onto one timeline.
app.post('/api/narrate', async (req, res) => {
  const { paragraphs, voiceId, speed = 0 } = req.body ?? {};
  if (!Array.isArray(paragraphs) || !paragraphs.length || !voiceId) {
    return res.status(400).json({ error: 'paragraphs and voiceId are required' });
  }
  const controller = new AbortController();
  res.on('close', () => controller.abort());

  try {
    if (!isCandidate(voiceId)) {
      // Dramatic pauses between paragraphs; Gradium requires spaces around the tag.
      const text = paragraphs.map((p) => String(p).trim()).join(' <break time="0.9s" /> ').slice(0, 4000);
      return await speechSlot(async () => {
        const upstream = await gradiumTts(text, voiceId, speed, controller.signal);
        if (!upstream.ok || !upstream.body) {
          const msg = await upstream.text();
          console.error('[narrate] gradium error:', upstream.status, msg);
          return res.status(502).json({ error: `Gradium: ${readable(msg) || upstream.status}` });
        }
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        await new Promise((done) => Readable.fromWeb(upstream.body).on('error', () => (res.end(), done())).on('end', done).pipe(res));
      });
    }

    const pieces = paragraphs.flatMap((p, i) => splitText(String(p), 280).map((text, k, all) => ({ text, pause: k === all.length - 1 && i < paragraphs.length - 1 })));
    const pending = [];
    const fetchAhead = (i) => {
      if (i < pieces.length && !pending[i]) pending[i] = ttsPiece(pieces[i].text, voiceId, speed, controller.signal);
    };
    fetchAhead(0);
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    const silence = Buffer.alloc(Math.round(PARAGRAPH_PAUSE * SAMPLE_RATE) * 2).toString('base64');
    let offset = 0;
    for (let i = 0; i < pieces.length; i++) {
      fetchAhead(i + 1);
      const piece = pending[i];
      const send = (m) => {
        if (m.type === 'text' && m.start_s != null) res.write(JSON.stringify({ ...m, start_s: m.start_s + offset, stop_s: (m.stop_s ?? m.start_s) + offset }) + '\n');
        else if (m.type === 'audio') res.write(JSON.stringify(m) + '\n');
      };
      // What has arrived so far, then the rest live, with no gap in between.
      piece.msgs.forEach(send);
      piece.listener = send;
      const seconds = await piece.done;
      piece.listener = null;
      offset += seconds;
      if (pieces[i].pause) {
        res.write(JSON.stringify({ type: 'audio', audio: silence }) + '\n');
        offset += PARAGRAPH_PAUSE;
      }
    }
    res.end();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('[narrate] failed:', err.message);
    if (!res.headersSent) res.status(502).json({ error: err.message });
    else res.end(JSON.stringify({ type: 'error', message: err.message }) + '\n');
  }
});

// A narrator with the accent of the place, made at runtime (see voices.js).
retireOldVoices().catch(() => {});
app.post('/api/local-voice', async (req, res) => {
  const b = req.body ?? {};
  try {
    const voice = await localNarrator(
      {
        countryCode: /^[A-Za-z]{2}$/.test(String(b.countryCode ?? '')) ? String(b.countryCode) : '',
        place: String(b.place ?? '').slice(0, 150),
        accent: String(b.accent ?? '').replace(/[^\p{L}\s'-]/gu, '').trim().slice(0, 40),
        gender: b.gender === 'f' ? 'f' : 'm',
      },
      { ai, model: GEMINI_MODEL },
    );
    if (!voice) return res.status(404).json({ error: 'No local accent for this place' });
    res.json(voice);
  } catch (err) {
    console.error('[voice] failed:', err.message);
    res.status(502).json({ error: err.message });
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

const ACTIONS = ['go_to', 'another_story', 'choose', 'ask', 'set_era', 'set_tone', 'set_voice', 'pause', 'resume', 'replay', 'stop', 'surprise', 'unclear'];

const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    place: { type: 'string', description: 'For go_to: the city or town to go to, with country if known' },
    era: { type: 'string', enum: Object.keys(ERAS) },
    tone: { type: 'string', enum: Object.keys(TONES) },
    voice: { type: 'string', description: 'For set_voice: one of the available narrator names' },
    choice: { type: 'integer', description: 'For choose: the number of the chosen story in the list on offer, starting at 1' },
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
- Stories on offer: ${ctx.choices.length ? ctx.choices.map((c, i) => `${i + 1}. ${c}`).join('; ') : 'none'}

Actions:
- go_to: they name a city, town or place to hear about ("take me to Rome", "what happened in Basel?"). Put it in "place".
- choose: they pick one of the stories on offer, by number, position or name ("the second one", "the last one", "tell me about the fire"). Put its number in "choice".
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
  const history = (ctx.history ?? []).map((t) => `Listener: ${t.q}\nYou: ${t.a}`).join('\n');
  const prompt = `You are the historian narrating "Echoes", answering a listener's follow-up question in conversation.
${story ? `They have just heard this story: "${story.title}" (${story.date || story.year || 'date unknown'}), ${story.place}.\nStory text: ${String(story.text).slice(0, 2500)}` : `They are exploring the city: ${ctx.place || 'unknown'}.`}
${history ? `Earlier in this conversation:\n${history}\n` : ''}
Question: "${question.replace(/"/g, "'")}"

Run Google Search before answering and take every claim from the results, not from memory. ${SOURCE_RULES}
Answer in 2 to 4 short sentences written for the ear, warmly, as the historian speaking: plain text, no lists, no markdown, no URLs, years as digits.
Only state what your sources support. If it is not well documented, say so plainly instead of guessing.`;
  const response = await grounded(prompt, { temperature: 0.3 });
  const text = response.text.replace(/\[\d+(?:,\s*\d+)*\]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Empty answer');
  const rated = assessAuthority({ groundingMetadata: response.groundingMetadata, text: response.text });
  return { reply: text, sources: rated.sources, authority: rated.authority };
}

function parseContext(raw) {
  raw ??= {};
  return {
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
    choices: (Array.isArray(raw.choices) ? raw.choices : []).slice(0, 8).map((c) => String(c).slice(0, 120)),
    history: (Array.isArray(raw.history) ? raw.history : [])
      .slice(-4)
      .map((t) => ({ q: String(t?.q ?? '').slice(0, 300), a: String(t?.a ?? '').slice(0, 600) }))
      .filter((t) => t.q && t.a),
  };
}

app.post('/api/ask', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 300) : '';
  if (!question) return res.status(400).json({ error: 'question is required' });
  try {
    const answer = await answerQuestion(question, parseContext(req.body?.context));
    console.log(`[ask] "${question}" -> ${answer.authority.level}`);
    res.json({ question, ...answer });
  } catch (err) {
    console.error('[ask] failed:', err.message);
    res.status(502).json({ error: `Gemini: ${readable(err.message || 'Answer failed')}` });
  }
});

app.post('/api/command', async (req, res) => {
  const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript.trim().slice(0, 500) : '';
  if (!transcript) return res.status(400).json({ error: 'transcript is required' });
  const ctx = parseContext(req.body?.context);

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
      choice: Number.isInteger(intent.choice) && intent.choice >= 1 && intent.choice <= ctx.choices.length ? intent.choice : undefined,
    };
    if (action === 'choose' && !out.choice) out.action = 'unclear';
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

const illustrationCache = new Map();

app.post('/api/illustrate', async (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 150);
  const place = String(req.body?.place || '').trim().slice(0, 150);
  const year = req.body?.year != null ? Number(req.body.year) : null;
  const fact = String(req.body?.fact || '').trim().slice(0, 200);

  if (!title && !place) {
    return res.status(400).json({ error: 'title or place is required' });
  }

  const cacheKey = `${title.toLowerCase()}|${place.toLowerCase()}|${year}`;
  if (illustrationCache.has(cacheKey)) {
    return res.json({ imageUrl: illustrationCache.get(cacheKey), cached: true });
  }

  // Pre-cached Rome plate match
  if (place.toLowerCase().includes('rome') || title.toLowerCase().includes('rome')) {
    const romeUrl = '/assets/plate-rome.jpg';
    illustrationCache.set(cacheKey, romeUrl);
    return res.json({ imageUrl: romeUrl, cached: true });
  }

  try {
    const prompt = `An antique archival book illustration plate, sepia etching and ink engraving with fine hatch lines, depicting: ${title} in ${place}${year ? ` (${year > 0 ? `${year} AD` : `${Math.abs(year)} BC`})` : ''}. ${fact ? `Historical context: ${fact}. ` : ''}Classical vintage vignette illustration for an ancient chronicle book, ornate sepia tone, detailed historical etching.`;

    console.log(`[illustrate] Generating with ${NANO_BANANA_MODEL}: "${title}" (${place})`);
    const response = await ai.models.generateContent({
      model: NANO_BANANA_MODEL,
      contents: prompt,
    });

    const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData?.data) {
      throw new Error('No image returned by Nano Banana model');
    }

    const mimeType = part.inlineData.mimeType || 'image/jpeg';
    const imageUrl = `data:${mimeType};base64,${part.inlineData.data}`;
    illustrationCache.set(cacheKey, imageUrl);

    res.json({ imageUrl, cached: false });
  } catch (err) {
    console.error('[illustrate] failed:', err.message);
    res.status(502).json({ error: `Nano Banana: ${readable(err.message || 'Image generation failed')}` });
  }
});

// ---------------------------------------------------------------------------
// The historian's study, painted for each place: Nano Banana reimagines the default scene with a local
// historian and local decor, keeping its composition so the camera push-in and portrait still line up.
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCENE_DIR = path.join(SERVER_DIR, '.scene-cache');
const BASE_SCENE = path.resolve(SERVER_DIR, '../public/assets/historian-opening.jpg');
const SHOT_DIR = path.join(SERVER_DIR, '.shot-cache');
const painting = new Map();
let painters = 0;
const easel = [];

/**
 * Paints one 16:9 image with Nano Banana (optionally from a reference image) into `dir`, once per key.
 * At most three paint at a time; the rest wait their turn.
 */
async function paint(dir, key, prompt, reference) {
  const id = createHash('sha1').update(key).digest('hex').slice(0, 16);
  const file = path.join(dir, `${id}.jpg`);
  if (await readFile(file).then(() => true, () => false)) return id;
  if (painting.has(file)) return painting.get(file);

  const job = (async () => {
    while (painters >= 3) await new Promise((ok) => easel.push(ok));
    painters++;
    try {
      const parts = reference ? [{ inlineData: { mimeType: 'image/jpeg', data: reference.toString('base64') } }, { text: prompt }] : [{ text: prompt }];
      const response = await ai.models.generateContent({
        model: NANO_BANANA_MODEL,
        contents: [{ role: 'user', parts }],
        config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } },
      });
      const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!part) throw new Error('No image returned');
      await mkdir(dir, { recursive: true });
      await writeFile(file, Buffer.from(part.inlineData.data, 'base64'));
      return id;
    } finally {
      painters--;
      easel.shift()?.();
    }
  })().finally(() => painting.delete(file));
  painting.set(file, job);
  return job;
}

async function paintScene(place, gender) {
  const base = await readFile(BASE_SCENE);
  const prompt = `Repaint this scene for a storyteller app, set in ${place}. Keep exactly the same composition and camera: an elderly ${gender === 'f' ? 'woman' : 'man'}, a historian, seated in a high-backed armchair right of centre, face in the upper middle, opening a large antique book held low in the centre of the frame, candles on the left, warm firelight on the right.
Make the historian a local of ${place}, with the features and the traditional or period clothing a respected local scholar there would wear. Make the study evoke ${place}: its architecture, furniture, textiles, maps, artefacts and objects from its history.
Warm, candlelit, painterly oil-painting style like the original. No text, letters or writing anywhere in the image.`;
  return paint(SCENE_DIR, `${place.toLowerCase()}|${gender}`, prompt, base);
}

/** The full Nano Banana prompt for one shot of a story's animated narration. */
function shotPrompt({ prompt, look, place, year }) {
  const when = year == null ? '' : year < 0 ? `${-year} BCE` : `${year} CE`;
  return `A cinematic illustration for a historical documentary${place ? ` set in ${place}` : ''}${when ? `, ${when}` : ''}.
${prompt}
Art direction: ${look || 'rich painterly oil painting, cinematic light, muted historical palette'}. Wide 16:9 composition, period-accurate detail, painterly brushwork, atmospheric depth. No text, letters, captions, signs or writing anywhere in the image. Nothing gory.`;
}

/** Starts painting a story's shots straight away, so they're under way before the browser asks. */
function prepaintShots(story) {
  for (const shot of story.shots) {
    const full = shotPrompt({ prompt: shot.prompt, look: story.look, place: story.place, year: story.year });
    paint(SHOT_DIR, full, full).catch((e) => console.warn('[shot] prepaint failed:', e.message));
  }
}

// One frame of a story's animated narration.
app.post('/api/shot', async (req, res) => {
  const prompt = String(req.body?.prompt ?? '').trim().slice(0, 700);
  const look = String(req.body?.look ?? '').trim().slice(0, 300);
  const where = String(req.body?.place ?? '').trim().slice(0, 150);
  const year = req.body?.year != null && Number.isFinite(Number(req.body.year)) ? Number(req.body.year) : null;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  const full = shotPrompt({ prompt, look, place: where, year });
  try {
    const t0 = Date.now();
    const id = await paint(SHOT_DIR, full, full);
    console.log(`[shot] ${prompt.slice(0, 50)}…: ${Date.now() - t0} ms`);
    res.json({ url: `/api/shot/${id}.jpg` });
  } catch (err) {
    console.error('[shot] failed:', err.message);
    res.status(502).json({ error: `Nano Banana: ${readable(err.message || 'Shot failed')}` });
  }
});

app.get('/api/shot/:file', (req, res) => {
  if (!/^[0-9a-f]{16}\.jpg$/.test(req.params.file)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').sendFile(req.params.file, { root: SHOT_DIR, dotfiles: 'allow' });
});

app.post('/api/scene', async (req, res) => {
  const place = String(req.body?.place ?? '').trim().slice(0, 150);
  const gender = req.body?.gender === 'f' ? 'f' : 'm';
  if (!place) return res.status(400).json({ error: 'place is required' });
  try {
    const t0 = Date.now();
    const id = await paintScene(place, gender);
    console.log(`[scene] ${place}: ${Date.now() - t0} ms`);
    res.json({ url: `/api/scene/${id}.jpg` });
  } catch (err) {
    console.error('[scene] failed:', err.message);
    res.status(502).json({ error: `Nano Banana: ${readable(err.message || 'Scene failed')}` });
  }
});

app.get('/api/scene/:file', (req, res) => {
  if (!/^[0-9a-f]{16}\.jpg$/.test(req.params.file)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').sendFile(req.params.file, { root: SCENE_DIR, dotfiles: 'allow' });
});

app.get('/api/health', (_req, res) =>
  res.json({ ok: true, model: GEMINI_MODEL, nanoBanana: NANO_BANANA_MODEL, gemini: !!process.env.GEMINI_API_KEY, gradium: !!process.env.GRADIUM_API_KEY }),
);

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`🗺️  Echoes API on http://localhost:${PORT} (model: ${GEMINI_MODEL})`));

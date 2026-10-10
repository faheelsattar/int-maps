import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const FAST_MODEL = process.env.FAST_MODEL || 'gemini-3.5-flash-lite';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ERAS = {
  any: 'any period of recorded history',
  ancient: 'antiquity (before 500 AD)',
  medieval: 'the medieval period (500–1500 AD)',
  early: 'the early modern era (1500–1900)',
  modern: 'the 20th or 21st century',
};

const PICKS = {
  famous:
    'Pick the most famous, historically significant event at this spot, the one people would expect to hear about here (e.g. at Dunkirk, the 1940 evacuation). Famous for this place, not just famous nearby.',
  hidden: 'Pick a surprising, lesser-known event over the most obvious, famous one, a hidden gem most people have never heard of.',
};

const TONES = {
  epic: 'gripping and dramatic, building tension toward the big moment',
  mystery: 'quiet and suspenseful, like a good story told around a campfire',
  heartfelt: 'warm and personal, focused on the people involved and what they went through',
  witty: 'light and playful with a dry sense of humour, like a favourite tour guide',
};

const STYLE = `- Use plain, everyday words that anyone can follow on the first listen. Explain every period or military term the first time it appears, in a few plain words ("a galleon, a big Spanish sailing ship", "royalists, soldiers still loyal to the exiled king"). Do not assume the listener knows words like flank, rout, siege, garrison or relief force.
- Keep the drama in WHAT happened, not in fancy words. Concrete details (a name, a number, a sound, a moment) beat grand descriptions.
- Mix short punchy sentences with medium ones; most sentences under 18 words. One idea per sentence, no stacked clauses.
- Avoid flowery or bookish phrasing such as "tapestry", "testament to", "echoes of history", "etched in time", "little did they know", "amidst", "whilst", "harbinger".
- No lists, headings, markdown, parentheses, emoji, URLs or citation markers. Write years as digits; spell out abbreviations.`;

// Phrasing matters: asking a direct "Search the web: …" question makes the model actually
// run Google Search far more reliably than a rules-first prompt.
const REPORT_RULES = `Look up the facts with Google Search, then report only what the search results support.`;

// ---------- Research (grounded) ----------

export async function researchPlace({ lat, lng, place, era, pick, exclude, focus }) {
  const where = `${place ? `${place} ` : ''}(latitude ${lat.toFixed(4)}, longitude ${lng.toFixed(4)})`;
  // The pin's own town/neighbourhood, e.g. "93230 Romainville, France" → "Romainville".
  const locality = (place || '').split(',')[0].replace(/^[\d\s-]+/, '').trim();
  const nearest = locality
    ? `Look for events in ${locality} itself first: the town, village or neighbourhood the pin is in. Only if nothing notable and well documented happened in ${locality}, use the nearest event outside it, as close to the pin as possible.`
    : `Prefer events within a few km of the pin; if the spot is remote (ocean, desert, ice), use the nearest well-documented event such as a shipwreck, expedition or battle.`;
  const question = focus
    ? `Search the web: what happened in "${focus}" near ${where}? Correct any wrong details in its name or date.`
    : `Search the web: what ${pick === 'hidden' ? 'surprising, lesser-known' : 'most famous'} real historical event from ${ERAS[era] || ERAS.any} happened at or as close as possible to ${where}? ${nearest} ${PICKS[pick] || PICKS.famous}`;
  const prompt = `${question}
${
  exclude?.length && !focus
    ? `The traveller has recently heard these stories, so pick a DIFFERENT event unless the pin is within about 1 km of where one of them happened: ${exclude.map((t) => `"${t}"`).join(', ')}.`
    : ''
}
${REPORT_RULES}

Reply in exactly this plain-text format, one item per line, no markdown:
TITLE: short evocative title, max 7 words
DATE: human readable date, e.g. 14 April 1912
YEAR: number, negative for BCE
PLACE: specific place of the event, region, country
COUNTRY: two-letter ISO country code of where the event happened (or XX at sea)
LAT: latitude of the event
LNG: longitude of the event
DISTANCE_KM: distance from the pin in km
HOOK: one-sentence teaser in plain words, max 18 words
WITNESS: an ordinary, unnamed person who could have been there | male or female | young, adult or old | nationality
CLAIM: one standalone factual sentence about the event (write 8 to 10 CLAIM lines covering who, what, when, where, key numbers, the key moments in order, and the outcome)`;
  return groundedResearch(prompt);
}

/** Quick, ungrounded suggestions for other events nearby (each is researched properly when opened). */
export async function nearbyEvents({ lat, lng, place, exclude }) {
  const response = await ai.models.generateContent({
    model: FAST_MODEL,
    contents: `List 3 real, well-documented historical events that happened close to ${place || 'this spot'} (latitude ${lat.toFixed(4)}, longitude ${lng.toFixed(4)}): within about 15 km, each at a DIFFERENT place, the closest ones first${exclude ? `, other than "${exclude}"` : ''}. Use accurate coordinates of where each happened. If the spot is remote, use the nearest well-documented events.
Reply with ONLY a JSON array: [{"title": "max 6 words", "year": 1066, "lat": 0.0, "lng": 0.0}]`,
    config: { temperature: 0.4, responseMimeType: 'application/json' },
  });
  const out = JSON.parse(response.text ?? '[]');
  return (Array.isArray(out) ? out : [])
    .map((n) => ({ title: String(n.title ?? ''), year: toNum(n.year), lat: toNum(n.lat), lng: toNum(n.lng) }))
    .filter((n) => n.title && n.lat != null && n.lng != null)
    .slice(0, 3);
}

export async function researchJourney({ query }) {
  const prompt = `Search the web: what was the route of "${query}"? It must be a real, well-documented historical journey, campaign, voyage or route.
Plan a narrated map journey with 4 to 6 stops in chronological order, at real places with accurate coordinates, that tell the story from start to finish.
${REPORT_RULES}

Reply in exactly this plain-text format, one item per line, no markdown:
TITLE: short evocative title, max 7 words
DATE: the date span, e.g. June to December 1812
YEAR: start year, negative for BCE
PLACE: the overall region, e.g. Western Russia
HOOK: one-sentence teaser in plain words, max 18 words
WITNESS: an ordinary, unnamed person who could have travelled along | male or female | young, adult or old | nationality
STOP 1: place name | date | year | lat | lng
CLAIM 1: one standalone factual sentence about what happened at stop 1 (2 to 3 CLAIM lines per stop, numbered by stop)
STOP 2: ...
CLAIM 2: ...
(continue for every stop)`;
  return groundedResearch(prompt);
}

async function groundedResearch(prompt) {
  let best = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], temperature: 0.3, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
    const parsed = parseResearch(response);
    if (!parsed.title || !parsed.claims.length) continue;
    if (!best || parsed.verifiedCount > best.verifiedCount) best = parsed;
    // Enough source-backed claims to tell a good story.
    if (parsed.verifiedCount >= Math.min(5, parsed.claims.length)) break;
  }
  if (!best) throw new Error('Gemini could not research this place. Try another spot.');
  return best;
}

/** Parses the line format and attaches Google Search sources to each CLAIM via grounding supports. */
function parseResearch(response) {
  const cand = response.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  const gm = cand?.groundingMetadata ?? {};
  const chunks = gm.groundingChunks ?? [];
  const supports = gm.groundingSupports ?? [];

  const out = { fields: {}, claims: [], stops: [], nearby: [], sources: [], searched: !!gm.webSearchQueries?.length };
  parts.forEach((part, partIndex) => {
    if (typeof part.text !== 'string' || part.thought) return;
    let byte = 0;
    for (const line of part.text.split('\n')) {
      const len = Buffer.byteLength(line);
      const range = [byte, byte + len];
      byte += len + 1;
      const m = line.trim().match(/^([A-Z_]+)(?:\s+(\d+))?\s*:\s*(.+)$/);
      if (!m) continue;
      const [, key, num, value] = m;
      if (key === 'CLAIM') out.claims.push({ text: value.trim(), stop: num ? Number(num) : null, partIndex, range });
      else if (key === 'STOP') out.stops.push(splitPipes(value, num));
      else if (key === 'NEARBY') out.nearby.push(splitPipes(value));
      else out.fields[key] ??= value.trim();
    }
  });

  // A claim is source-backed when a grounding support covers most of its line.
  const sourceIndex = new Map();
  for (const claim of out.claims) {
    const idx = new Set();
    const [a, b] = claim.range;
    for (const s of supports) {
      const seg = s.segment ?? {};
      if ((seg.partIndex ?? 0) !== claim.partIndex) continue;
      const overlap = Math.min(b, seg.endIndex ?? 0) - Math.max(a, seg.startIndex ?? 0);
      if (overlap > 0.5 * (b - a)) (s.groundingChunkIndices ?? []).forEach((i) => idx.add(i));
    }
    claim.sources = [...idx]
      .map((i) => chunks[i]?.web)
      .filter((w) => w?.uri)
      .map((w) => {
        if (!sourceIndex.has(w.uri)) sourceIndex.set(w.uri, { uri: w.uri, title: w.title || w.domain || 'source' });
        return sourceIndex.get(w.uri);
      });
    claim.verified = claim.sources.length > 0;
    delete claim.range;
    delete claim.partIndex;
  }
  out.sources = [...sourceIndex.values()];
  out.verifiedCount = out.claims.filter((c) => c.verified).length;
  out.title = out.fields.TITLE;
  return out;
}

function splitPipes(value, num) {
  const p = value.split('|').map((s) => s.trim());
  if (num != null) {
    // STOP n: name | date | year | lat | lng
    return { index: Number(num), name: p[0], date: p[1] ?? '', year: toNum(p[2]), lat: toNum(p[3]), lng: toNum(p[4]) };
  }
  // NEARBY: title | year | lat | lng
  return { title: p[0], year: toNum(p[1]), lat: toNum(p[2]), lng: toNum(p[3]) };
}

export function toNum(v) {
  const n = Number(String(v ?? '').replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
}

export function parseWitness(value) {
  const [role, gender, age, accent] = String(value || '').split('|').map((s) => s.trim());
  return { role: role || 'someone who was there', gender: gender || 'male', age: age || 'adult', accent: accent || '' };
}

// ---------- Writing (streamed, ungrounded: only uses verified claims) ----------

function claimList(claims) {
  return claims.map((c) => `- ${c.stop ? `[stop ${c.stop}] ` : ''}${c.text}`).join('\n');
}

export function writePrompt({ kind, research, claims, tone, mode, witness, language, stops }) {
  const voiceRule =
    mode === 'eyewitness'
      ? `Tell it in the FIRST PERSON, present tense, as ${witness.role}: an ordinary, unnamed person who was there. Never claim to be a named historical figure. You may describe what this person sees, hears and feels in a restrained way, but every historical fact must come from the facts below.`
      : `Tell it as a narrator who is ${TONES[tone] || TONES.epic}. Write the way a gifted podcast host talks to a friend, not the way a history book reads.`;
  const shape =
    kind === 'journey'
      ? `Write EXACTLY ${stops.length} paragraphs, one per stop, in this order: ${stops.map((s, i) => `${i + 1}) ${s.name}`).join('; ')}. Each paragraph is 55 to 85 words and opens by placing the listener at that stop and moment. Separate paragraphs with one blank line.`
      : `Write 170 to 230 words in 3 to 5 short paragraphs separated by one blank line. Start by dropping the listener into the moment, and end with a simple line linking that moment to this spot today.`;

  return `Write a spoken story about: ${research.fields.TITLE} (${research.fields.DATE}, ${research.fields.PLACE}).

${voiceRule}

Use ONLY these verified facts for anything historical. Do not add names, numbers, dates, orders, quotes or events that are not listed. Set the scene only with things that are certain. If a detail is not in the list, leave it out:
${claimList(claims)}

${shape}
Write the story in ${language}.
${STYLE}

Output only the story text.`;
}

/** Streams generated text; calls onDelta for every chunk. Resolves with the full text. */
export async function streamText(prompt, onDelta, { search = false, signal } = {}) {
  const stream = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      temperature: 0.7,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      ...(search ? { tools: [{ googleSearch: {} }] } : {}),
      abortSignal: signal,
    },
  });
  let full = '';
  let sources = [];
  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
    if (text) {
      full += text;
      onDelta(text);
    }
    const gm = chunk.candidates?.[0]?.groundingMetadata;
    if (gm?.groundingChunks?.length) {
      sources = gm.groundingChunks.map((c) => c.web).filter((w) => w?.uri).map((w) => ({ uri: w.uri, title: w.title || 'source' }));
    }
  }
  return { text: full, sources };
}

export function answerPrompt({ story, question, history, mode, witness, language }) {
  const persona =
    mode === 'eyewitness'
      ? `You are ${witness?.role || 'an eyewitness'} who lived through "${story.title}". Answer in the first person, staying in character, but never invent historical facts.`
      : `You are the narrator of the story "${story.title}".`;
  return `${persona}
A listener asked a follow-up question out loud. Answer it truthfully. Use Google Search when you need facts beyond the story below. If nobody knows for sure, say so plainly.

STORY (${story.date}, ${story.place}):
${story.paragraphs.join('\n\n')}

${history?.length ? `Earlier questions:\n${history.map((h) => `Q: ${h.q}\nA: ${h.a}`).join('\n')}\n` : ''}QUESTION: ${question}

Answer in ${language}, in 2 to 4 spoken sentences (max 70 words). Plain everyday words, no lists, no markdown, no citation markers. Output only the answer.`;
}

export async function translate(paragraphs, language) {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: `Translate this spoken story into natural, plain ${language} that sounds good read aloud. Keep the same number of paragraphs and the same meaning. Reply with ONLY a JSON array of strings, one per paragraph.

${JSON.stringify(paragraphs)}`,
    config: { temperature: 0.3, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, responseMimeType: 'application/json' },
  });
  const out = JSON.parse(response.text ?? '[]');
  if (!Array.isArray(out) || !out.length) throw new Error('Translation failed');
  return out.map(String);
}

export function splitParagraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim())
    .filter(Boolean);
}

// Narrators with the accent of a place, made at runtime with Gradium and auditioned by Gemini.
//
// Where Gradium can localize to the accent (General American, Indian English, Quebecois French,
// Rioplatense Spanish…), a deep, calm narrator voice is localized to it; anywhere else (Egyptian,
// Japanese…) Voice Design creates one from a description. Either way several takes read the same
// English line, Gemini listens and keeps the most authentic and authoritative one.
// The winning take is used as it is (a 30-day candidate) rather than saved, since plans only have a
// handful of custom-voice slots; candidates speak 300 characters at a time, so /api/narrate splits text.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ThinkingLevel } from '@google/genai';

const API = 'https://api.gradium.ai/api';
const VERSION = 3;
const CANDIDATE_DAYS = 29;
const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.voice-cache.json');

// Narrators to localize from, chosen for gravitas: the judge picks between their takes.
const BASES = {
  m: ['POBHtemksfWQbng0' /* Garrett: low, smooth, calm */, 'I7GYfpcKbafFrYUv' /* Declan: calm, confident */],
  f: ['MAYVpVTYBzLRqNC7' /* Resi: warm, measured, trustworthy */, 'gqn4ytOULe-TQfjl' /* Saoirse: warm, natural */],
};

// Accents Gradium knows. English ones (`en`, a Gradium accent name) are made by localizing a base narrator.
// For the others, Gradium's own native speakers (`natives`) are auditioned: a voice localized to French or
// Spanish loses most of its accent when it reads English, and Voice Design makes neutral English for the
// languages Gradium speaks. Accents without natives of their own borrow the closest ones (`like`).
// Voice Design (from `describe`) is only for accents of other languages: Egyptian Arabic, Japanese…
const ACCENTS = {
  american: { en: 'General American', label: 'American', natives: { m: ['POBHtemksfWQbng0'], f: ['D6COLz20Hw7uh3UK'] } },
  british: { en: 'Standard British', label: 'British', natives: { m: ['s_k3kLBbgeK9-xUg'], f: ['4rdlkbxRv4m3UQTW'] } },
  irish: { en: 'Irish', label: 'Irish', natives: { m: ['I7GYfpcKbafFrYUv'], f: ['gqn4ytOULe-TQfjl'] } },
  scottish: { en: 'Scottish', label: 'Scottish' },
  australian: { en: 'Australian', label: 'Australian' },
  indian: { en: 'Indian English', label: 'Indian' },
  french: { describe: 'French', label: 'French', natives: { m: ['iEu63s1rhn_kegTr', 'Tek4tJXiX6_yvXq7'], f: ['FXxJ9mANRq6BCTX5', '6oIkS98REoVZ1dEw'] } },
  quebec: { describe: 'Québécois French', label: 'Québécois', natives: { f: ['xynYWquoAsrvM7UY', 'sBLwTd5womVX8JOw'] }, like: 'french' },
  german: { describe: 'German', label: 'German', natives: { m: ['yyS1KYWs6mXoEw7D', '3ZKKapPOvuWFcw9f'], f: ['MAYVpVTYBzLRqNC7', 'aBNlTApBeOlVKa23'] } },
  austrian: { describe: 'Austrian German', label: 'Austrian', natives: { f: ['TXbEUrHXNFlYBBKb'] }, like: 'german' },
  swiss: { describe: 'Swiss German', label: 'Swiss', like: 'german' },
  castilian: { describe: 'Castilian Spanish', label: 'Spanish', natives: { m: ['t-_TS1e-0GzDAX02', 'jvPx8j8zLGQ3utZz'], f: ['iTQW2xFICXk8riV4', 'u2UscyAnHilpiwmf'] } },
  mexican: { describe: 'Mexican Spanish', label: 'Mexican', natives: { m: ['n7vovxcDTVG4gClo', 'tWll9uiMafMXfOGw'], f: ['VDwnGxAo68C8U8vC', 'B36pbz5_UoWn4BDl'] } },
  caribbean: { describe: 'Caribbean Spanish', label: 'Caribbean', like: 'mexican' },
  colombian: { describe: 'Colombian Spanish', label: 'Colombian', like: 'mexican' },
  rioplatense: { describe: 'Argentine Rioplatense Spanish', label: 'Argentine', like: 'mexican' },
  chilean: { describe: 'Chilean Spanish', label: 'Chilean', like: 'mexican' },
  brazilian: { describe: 'Brazilian Portuguese', label: 'Brazilian', natives: { m: ['AByHrwi1S-yLzW-s', 'NuUr_x5V90hSHzCJ'], f: ['uCqxlQCKi8sPHwG2', 'CtNvKUUMrx1h56ih'] } },
  portuguese: { describe: 'European Portuguese', label: 'Portuguese', natives: { m: ['-n1BmuOkydfLDjxE', '7iWpEw5Nt05GC1B0'], f: ['tWO-Q6DxWPj7syQA', '7yIuXOsv9bkpmRVv'] } },
};

const all = (accent, ...codes) => Object.fromEntries(codes.map((c) => [c, accent]));
const COUNTRIES = {
  ...all('american', 'US', 'CA'),
  ...all('british', 'GB', 'IM', 'JE', 'GG'),
  IE: 'irish',
  ...all('australian', 'AU', 'NZ'),
  IN: 'indian',
  ...all('french', 'FR', 'BE', 'LU', 'MC'),
  ...all('german', 'DE'),
  ...all('swiss', 'CH', 'LI'),
  AT: 'austrian',
  ES: 'castilian',
  ...all('mexican', 'MX', 'GT', 'HN', 'SV', 'NI', 'CR', 'PE', 'EC', 'BO'),
  ...all('caribbean', 'CU', 'DO', 'PR', 'PA', 'VE'),
  CO: 'colombian',
  ...all('rioplatense', 'AR', 'UY', 'PY'),
  CL: 'chilean',
  BR: 'brazilian',
  ...all('portuguese', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'),
};
// Regions with their own accent inside a country, matched on the place name.
const REGIONS = [
  { country: 'GB', match: /scotland|edinburgh|glasgow|aberdeen|dundee|inverness|stirling|perth/i, accent: 'scottish' },
  { country: 'CA', match: /qu[ée]bec|montr[ée]al|gatineau|sherbrooke|trois-rivi/i, accent: 'quebec' },
  { country: 'CH', match: /gen[eè]v|lausanne|neuch[aâ]tel|fribourg|montreux|sion\b|valais|vaud|jura/i, accent: 'french' },
];

const headers = () => ({ 'x-api-key': process.env.GRADIUM_API_KEY ?? '', 'Content-Type': 'application/json' });
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Gradium allows two speech sessions at once per key: every TTS request in the app waits for a slot.
const SPEECH_SLOTS = 2;
let speaking = 0;
const waiting = [];
export async function speechSlot(fn) {
  while (speaking >= SPEECH_SLOTS) await new Promise((ok) => waiting.push(ok));
  speaking++;
  try {
    return await fn();
  } finally {
    speaking--;
    waiting.shift()?.();
  }
}

/** POST to Gradium TTS, retrying while the key's concurrency limit is hit elsewhere (another app, another tab). */
export async function speechRequest(body, signal) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${API}/post/speech/tts`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
    if (r.ok || attempt >= 5) return r;
    const text = await r.clone().text();
    if (r.status !== 429 && !/concurrency limit/i.test(text)) return r;
    await sleep(800 * (attempt + 1));
  }
}

async function gradium(method, url, body) {
  const r = await fetch(`${API}${url}`, { method, headers: headers(), body: body && JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`Gradium ${url}: ${r.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

let cache = null;
const load = async () => (cache ??= new Map(Object.entries(await readFile(CACHE, 'utf8').then(JSON.parse).catch(() => ({})))));
const save = () => writeFile(CACHE, JSON.stringify(Object.fromEntries(cache), null, 1)).catch(() => {});

/** True for a voice that only speaks short texts (an unsaved candidate). */
export const isCandidate = (voiceId) => String(voiceId).startsWith('vox_emb_');

/** Frees the custom-voice slots of narrators made by older versions of this pipeline. */
export async function retireOldVoices() {
  await load();
  for (const [key, v] of cache) {
    if (v.v === VERSION) continue;
    if (!v.id.startsWith('vox_emb_')) await gradium('DELETE', `/voices/${v.id}`).catch(() => {});
    cache.delete(key);
  }
  await save();
}

const country = (cc) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) ?? '';
  } catch {
    return '';
  }
};

/** Works out how to voice a place: which accent, and whether to localize or design it. */
export function planVoice({ countryCode, place, accent }) {
  const cc = String(countryCode ?? '').toUpperCase();
  const known = REGIONS.find((r) => r.country === cc && r.match.test(place ?? ''))?.accent ?? COUNTRIES[cc];
  if (known) return { key: known, ...ACCENTS[known] };
  const described = String(accent ?? '').trim() || country(cc) || String(place ?? '').split(',').pop().trim();
  return described ? { key: `design:${described.toLowerCase()}`, describe: described, label: described } : null;
}

/** Takes to audition: made candidates (vox_emb_ ids, which need to finish rendering) and native speakers. */
async function candidates(plan, gender, ai, model) {
  const own = plan.natives?.[gender] ?? [];
  const natives = own.length ? own : (plan.like && ACCENTS[plan.like].natives?.[gender]) || [];
  if (plan.en) {
    const runs = await Promise.all(
      BASES[gender].map((src_voice) =>
        gradium('POST', '/voice-generator/localize', { src_voice, target_language: 'en', accent: plan.en, gender: gender === 'f' ? 'female' : 'male', n_samples: 2 }).catch(
          (e) => (console.warn('[voice] localize failed:', e.message), { embeddings: [] }),
        ),
      ),
    );
    return { made: runs.flatMap((r) => r.embeddings.map((e) => e.embedding_id)), natives };
  }
  if (!plan.key.startsWith('design:')) return { made: [], natives };
  // Voice Design: name the accent precisely first if all we have is a country.
  let accent = plan.describe;
  if (plan.key.startsWith('design:') && !/\s/.test(accent)) {
    const r = await ai.models
      .generateContent({
        model,
        contents: `Name the native language and region of a typical person from ${accent}, in 1 to 3 words, as used to describe their accent (e.g. "Egyptian Arabic", "Neapolitan Italian", "Japanese"). Reply with those words only.`,
        config: { temperature: 0, thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      })
      .catch(() => null);
    accent = r?.text?.trim().replace(/["'.]/g, '').replace(/\s+(english|accent)\b.*$/i, '').slice(0, 40) || accent;
  }
  plan.describe = accent;
  if (plan.key.startsWith('design:')) plan.label = accent;
  const who = gender === 'f' ? 'woman' : 'man';
  const prompt = `A distinguished ${who} in their late fifties, a native ${accent} speaker who learned English as an adult, speaking fluent, educated English with a strong, authentic ${accent} accent, its real vowels, rhythm and intonation, never neutral or American. A seasoned documentary narrator and historian: deep, resonant, measured, authoritative, calm gravitas, clear diction, unhurried.`;
  const r = await gradium('POST', '/voice-generator/generate', { prompt: prompt.slice(0, 500), language: 'en', n_samples: 3 }).catch(
    (e) => (console.warn('[voice] design failed:', e.message), { embeddings: [] }),
  );
  return { made: r.embeddings.map((e) => e.embedding_id), natives };
}

async function whenReady(ids) {
  const ready = new Set();
  for (const t0 = Date.now(); ready.size < ids.length && Date.now() - t0 < 60_000; await sleep(800)) {
    await Promise.all(
      ids
        .filter((id) => !ready.has(id))
        .map(async (id) => {
          const e = await gradium('GET', `/voice-generator/embeddings?embedding_id=${id}`).catch(() => null);
          if ((e?.embeddings?.[0] ?? e?.[0] ?? e)?.ready) ready.add(id);
        }),
    );
  }
  return ids.filter((id) => ready.has(id));
}

async function audition(id, text) {
  for (let attempt = 0; ; attempt++) {
    let failure;
    try {
      const r = await speechSlot(async () => {
        const res = await speechRequest({ text, voice_id: id, output_format: 'wav', only_audio: true });
        return { ok: res.ok, status: res.status, body: Buffer.from(await res.arrayBuffer()) };
      });
      if (r.ok) return r.body;
      failure = `${r.status} ${r.body.toString('utf8', 0, 160)}`;
      if (![409, 429, 500, 502, 503].includes(r.status)) attempt = 2; // not worth retrying
    } catch (e) {
      failure = e.message; // dropped connection
    }
    if (attempt >= 2) throw new Error(`audition ${id}: ${failure}`);
    await sleep(1500 * (attempt + 1));
  }
}

/** Auditions every take (speechSlot keeps it within Gradium's concurrency limit). */
async function auditionAll(ids, text) {
  const takes = await Promise.all(ids.map((id) => audition(id, text).then((audio) => ({ id, audio }), (e) => (console.warn('[voice]', e.message), null))));
  return takes.filter(Boolean);
}

/** Gemini listens to every take and picks the most authentic, authoritative narrator. */
async function judge(takes, plan, place, ai, model) {
  const accent = plan.en ?? plan.describe;
  const parts = [
    {
      text: `You are casting the narrator for a history app. Each sample below is a candidate voice reading the same English line about ${place}. We want a narrator who sounds like a real native speaker with a ${accent} accent, and who sounds like an authoritative historian.
Score each sample from 1 to 10 on:
- accent: how authentic and clearly ${accent} the accent sounds (a neutral or wrong accent scores low);
- authority: gravitas, depth and calm confidence of a documentary narrator (bubbly, young or salesy scores low);
- clarity: natural, intelligible English with no glitches, slurring, mispronunciations or robotic artefacts.`,
    },
  ];
  takes.forEach((t, i) => parts.push({ text: `Sample ${i + 1}:` }, { inlineData: { mimeType: 'audio/wav', data: t.audio.toString('base64') } }));
  const r = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        properties: {
          scores: {
            type: 'array',
            items: {
              type: 'object',
              properties: { sample: { type: 'integer' }, accent: { type: 'number' }, authority: { type: 'number' }, clarity: { type: 'number' } },
              required: ['sample', 'accent', 'authority', 'clarity'],
            },
          },
        },
        required: ['scores'],
      },
    },
  });
  const { scores } = JSON.parse(r.text ?? '{}');
  // Accent first, but a glitchy or unintelligible take never wins.
  const ranked = scores
    .filter((s) => takes[s.sample - 1])
    .map((s) => ({ ...s, total: s.clarity < 5 ? 0 : 0.45 * s.accent + 0.35 * s.authority + 0.2 * s.clarity }))
    .sort((a, b) => b.total - a.total);
  return ranked;
}

const making = new Map();

/** A narrator for the place, made once per accent and gender. Resolves to { id, accent } or null. */
export async function localNarrator({ countryCode, place, accent, gender }, { ai, model }) {
  const plan = planVoice({ countryCode, place, accent });
  if (!plan) return null;
  const g = gender === 'f' ? 'f' : 'm';
  const key = `v${VERSION}|${plan.key}|${g}`;
  await load();
  const hit = cache.get(key);
  if (hit && Date.parse(hit.expiresAt) > Date.now() + 86_400_000) return { id: hit.id, accent: hit.label };
  if (making.has(key)) return making.get(key);

  const job = (async () => {
    const t0 = Date.now();
    const { made, natives } = await candidates(plan, g, ai, model);
    const ids = [...(await whenReady(made)), ...natives];
    if (!ids.length) throw new Error('No voice candidates were ready');
    const city = String(place ?? '').split(',')[0].trim().slice(0, 40) || 'the old town';
    const line = `It is the spring of 1871. In the old heart of ${city}, the morning bells ring out across the rooftops, and a quiet crowd gathers to hear news that will change everything.`;
    const takes = await auditionAll(ids, line);
    console.log(`[voice] ${plan.label} (${g}): ${made.length} made, ${ids.length - natives.length} ready, ${natives.length} native, ${takes.length} auditioned`);
    if (!takes.length) throw new Error('No voice candidate could speak');

    let best = takes[0];
    try {
      const ranked = await judge(takes, plan, place || city, ai, model);
      if (ranked[0]) best = takes[ranked[0].sample - 1];
      const tag = (n) => (isCandidate(takes[n - 1].id) ? 'made' : 'native');
      console.log(`[voice] ${plan.label} (${g}) scores:`, ranked.map((s) => `#${s.sample}${tag(s.sample)} a${s.accent}/au${s.authority}/c${s.clarity}`).join(' '));
    } catch (e) {
      console.warn('[voice] judging failed, keeping the first take:', e.message);
    }

    // Made takes expire after 30 days and are made afresh; a native speaker never expires.
    const expiresAt = new Date(Date.now() + (isCandidate(best.id) ? CANDIDATE_DAYS : 3650) * 86_400_000).toISOString();
    cache.set(key, { id: best.id, label: plan.label, expiresAt, v: VERSION });
    await save();
    console.log(`[voice] ${plan.label} (${g}) narrator ${best.id} in ${Date.now() - t0} ms`);
    return { id: best.id, accent: plan.label };
  })().finally(() => making.delete(key));
  making.set(key, job);
  return job;
}

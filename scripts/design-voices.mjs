// Creates the eyewitness persona voices with Gradium Voice Design (run once):
//   npm run voices:design
// Each persona becomes a permanent custom voice; ids are saved to server/data/personas.json.
// Re-running skips personas that already exist. Delete them in Gradium Studio if unwanted.
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://api.gradium.ai/api';
const KEY = process.env.GRADIUM_API_KEY;
const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server/data/personas.json');

const PERSONAS = [
  {
    name: 'Echoes · Young British soldier',
    label: 'young British soldier',
    gender: 'male',
    age: 'young',
    accents: ['british', 'english'],
    prompt: 'A young British man around 20, a common foot soldier with a plain working-class English accent. Tired but brave, speaks simply and honestly, slightly hushed as if remembering something hard.',
  },
  {
    name: 'Echoes · Old Scottish sailor',
    label: 'old Scottish sailor',
    gender: 'male',
    age: 'old',
    accents: ['scottish', 'scot'],
    prompt: 'An old Scottish sailor in his late 60s, gravelly and weathered voice, slow and deliberate, a natural storyteller by the fire with a warm Scottish accent.',
  },
  {
    name: 'Echoes · American townswoman',
    label: 'American townswoman',
    gender: 'female',
    age: 'adult',
    accents: ['american', 'us', 'united states'],
    prompt: 'An American woman in her 30s, steady and observant, a warm plain-spoken voice recounting what she saw in her town, calm but with feeling underneath.',
  },
  {
    name: 'Echoes · Young English nurse',
    label: 'young English nurse',
    gender: 'female',
    age: 'young',
    accents: ['british', 'english'],
    prompt: 'A young English woman around 20, a field nurse, earnest and quick, emotional but controlled, clear Southern English accent, speaking softly and urgently.',
  },
  {
    name: 'Echoes · American farmer',
    label: 'American farmer',
    gender: 'male',
    age: 'adult',
    accents: ['american', 'us', 'united states', 'southern'],
    prompt: 'An American man in his 40s, a plain-spoken farmer, deep calm voice with a slight Southern drawl, unhurried and sincere.',
  },
  {
    name: 'Echoes · Elderly Irish woman',
    label: 'elderly Irish woman',
    gender: 'female',
    age: 'old',
    accents: ['irish', 'ireland'],
    prompt: 'An elderly Irish woman in her 70s, soft and wise, gently remembering her youth, a lilting Irish accent and a warm, slightly fragile voice.',
  },
  {
    name: 'Echoes · French villager',
    label: 'French villager',
    gender: 'male',
    age: 'adult',
    accents: ['french', 'france', 'belgian', 'belgium'],
    prompt: 'A French man in his 40s speaking English with a natural French accent, a villager describing what he witnessed, warm, expressive and a little weary.',
  },
  {
    name: 'Echoes · German soldier',
    label: 'German soldier',
    gender: 'male',
    age: 'young',
    accents: ['german', 'germany', 'austrian', 'prussian'],
    prompt: 'A young German man in his 20s speaking English with a German accent, a conscript soldier, quiet, honest and haunted, speaking carefully.',
  },
];

if (!KEY) {
  console.error('GRADIUM_API_KEY is not set in .env');
  process.exit(1);
}

async function api(method, url, body) {
  const r = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const existing = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : [];
const out = [...existing];

for (const p of PERSONAS) {
  if (out.some((e) => e.name === p.name && e.voiceId)) {
    console.log(`✓ ${p.label} (already created)`);
    continue;
  }
  process.stdout.write(`… ${p.label}: generating`);
  try {
    const gen = await api('POST', '/voice-generator/generate', { prompt: p.prompt, language: 'en', n_samples: 1 });
    const id = gen.embeddings?.[0]?.embedding_id;
    if (!id) throw new Error('no candidate returned');
    for (let i = 0; i < 60; i++) {
      const s = await api('GET', `/voice-generator/embeddings?embedding_id=${encodeURIComponent(id)}`);
      if (s.embeddings?.[0]?.ready) break;
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 2000));
    }
    const voice = await api('POST', '/voices/from-embedding', { voxium_embedding_id: id, name: p.name, description: p.prompt.slice(0, 200) });
    out.push({ name: p.name, label: p.label, gender: p.gender, age: p.age, accents: p.accents, voiceId: voice.uid });
    mkdirSync(path.dirname(FILE), { recursive: true });
    writeFileSync(FILE, JSON.stringify(out, null, 2));
    console.log(` ✓ ${voice.uid}`);
  } catch (err) {
    console.log(` ✗ ${err.message}`);
    if (/limit/i.test(err.message)) break;
  }
}
console.log(`\n${out.length} persona voices saved to ${path.relative(process.cwd(), FILE)}`);

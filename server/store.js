import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Stories and narration audio are saved to disk so share links (and demo-day
// replays) work instantly, without calling Gemini or Gradium again.
const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data');
const STORIES = path.join(DATA, 'stories');
const AUDIO = path.join(DATA, 'audio');
mkdirSync(STORIES, { recursive: true });
mkdirSync(AUDIO, { recursive: true });

export function newId(title) {
  const slug = String(title || 'story')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .replace(/-+$/, '');
  return `${slug || 'story'}-${randomBytes(3).toString('hex')}`;
}

const safe = (id) => /^[\w-]{1,80}$/.test(id);

export function saveStory(story) {
  writeFileSync(path.join(STORIES, `${story.id}.json`), JSON.stringify({ ...story, savedAt: new Date().toISOString() }));
}

export function getStory(id) {
  if (!safe(id)) return null;
  const file = path.join(STORIES, `${id}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export function listStories(limit = 20) {
  return readdirSync(STORIES)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: statSync(path.join(STORIES, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map(({ f }) => {
      const s = JSON.parse(readFileSync(path.join(STORIES, f), 'utf8'));
      return { id: s.id, kind: s.kind, title: s.title, year: s.year, place: s.place, mode: s.mode, lang: s.lang };
    });
}

/** Cache key for one narration: exact paragraphs + voice + pace. */
export function audioKey(paragraphs, voiceId, speed, joiner) {
  return createHash('sha1').update(JSON.stringify({ p: paragraphs, v: voiceId, s: Number(speed) || 0, j: joiner })).digest('hex');
}

export function audioPath(key) {
  return path.join(AUDIO, `${key}.ndjson`);
}

export function hasAudio(key) {
  return existsSync(audioPath(key));
}

export function readAudio(key) {
  return createReadStream(audioPath(key));
}

/** Collects Gradium messages during a live session, then writes them as one cache file. */
export function audioRecorder() {
  const lines = [];
  return {
    add(msg) {
      if (msg.type === 'audio') lines.push(JSON.stringify({ type: 'audio', audio: msg.audio }));
      else if (msg.type === 'text') lines.push(JSON.stringify({ type: 'text', text: msg.text, start_s: msg.start_s, stop_s: msg.stop_s }));
    },
    save(key) {
      if (lines.length) writeFileSync(audioPath(key), lines.join('\n') + '\n');
    },
  };
}

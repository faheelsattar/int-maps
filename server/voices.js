import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data');
export const PERSONAS_FILE = path.join(DATA, 'personas.json');

// Native Gradium flagship voices for local-language narration, by country.
// https://docs.gradium.ai/guides/voices/flagship-voices
const LOCAL = {
  fr: { lang: 'fr', language: 'French', voice: { id: 'iEu63s1rhn_kegTr', name: 'Gaspard', accent: 'French', flag: '🇫🇷' } },
  be: { lang: 'fr', language: 'French', voice: { id: 'iEu63s1rhn_kegTr', name: 'Gaspard', accent: 'French', flag: '🇧🇪' } },
  lu: { lang: 'fr', language: 'French', voice: { id: 'iEu63s1rhn_kegTr', name: 'Gaspard', accent: 'French', flag: '🇱🇺' } },
  ch: { lang: 'fr', language: 'French', voice: { id: 'iEu63s1rhn_kegTr', name: 'Gaspard', accent: 'French', flag: '🇨🇭' } },
  mc: { lang: 'fr', language: 'French', voice: { id: 'iEu63s1rhn_kegTr', name: 'Gaspard', accent: 'French', flag: '🇲🇨' } },
  de: { lang: 'de', language: 'German', voice: { id: 'yyS1KYWs6mXoEw7D', name: 'Henrik', accent: 'German', flag: '🇩🇪' } },
  at: { lang: 'de', language: 'German', voice: { id: 'TXbEUrHXNFlYBBKb', name: 'Sophie', accent: 'Austrian', flag: '🇦🇹' } },
  es: { lang: 'es', language: 'Spanish', voice: { id: 't-_TS1e-0GzDAX02', name: 'Iker', accent: 'Castilian', flag: '🇪🇸' } },
  mx: { lang: 'es', language: 'Spanish', voice: { id: 'n7vovxcDTVG4gClo', name: 'Diego', accent: 'Mexican', flag: '🇲🇽' } },
  pt: { lang: 'pt', language: 'Portuguese', voice: { id: '-n1BmuOkydfLDjxE', name: 'Ricardo', accent: 'European Portuguese', flag: '🇵🇹' } },
  br: { lang: 'pt', language: 'Portuguese', voice: { id: 'NuUr_x5V90hSHzCJ', name: 'Davi', accent: 'Brazilian', flag: '🇧🇷' } },
};
// Other Spanish-speaking countries use the Mexican (Latin American) voice.
for (const cc of ['ar', 'cl', 'co', 'pe', 've', 'ec', 'bo', 'py', 'uy', 'cu', 'do', 'gt', 'hn', 'sv', 'ni', 'cr', 'pa']) {
  LOCAL[cc] = { ...LOCAL.mx, voice: { ...LOCAL.mx.voice, flag: flagOf(cc) } };
}

function flagOf(cc) {
  return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/** Language + native voice for a country code, or null when we only have English. */
export function localFor(countryCode) {
  return LOCAL[String(countryCode || '').toLowerCase()] ?? null;
}

// Fallback eyewitness voices (flagship) when no designed personas exist.
const FALLBACK_WITNESS = {
  en: {
    male: { id: 'I7GYfpcKbafFrYUv', name: 'Declan' },
    female: { id: 'gqn4ytOULe-TQfjl', name: 'Saoirse' },
  },
  fr: { male: { id: 'iEu63s1rhn_kegTr', name: 'Gaspard' }, female: { id: 'YhIHaAfQ0cQPDV9R', name: 'Solène' } },
  de: { male: { id: 'yyS1KYWs6mXoEw7D', name: 'Henrik' }, female: { id: 'MAYVpVTYBzLRqNC7', name: 'Resi' } },
  es: { male: { id: 't-_TS1e-0GzDAX02', name: 'Iker' }, female: { id: 'B36pbz5_UoWn4BDl', name: 'Valentina' } },
  pt: { male: { id: '-n1BmuOkydfLDjxE', name: 'Ricardo' }, female: { id: '7yIuXOsv9bkpmRVv', name: 'Joana' } },
};

function loadPersonas() {
  try {
    return existsSync(PERSONAS_FILE) ? JSON.parse(readFileSync(PERSONAS_FILE, 'utf8')) : [];
  } catch {
    return [];
  }
}

/**
 * Picks the closest designed persona voice for an eyewitness
 * ({gender, age, accent}), falling back to a flagship voice.
 */
export function witnessVoice(witness, lang = 'en') {
  const gender = /female|woman|girl/i.test(witness?.gender ?? '') ? 'female' : 'male';
  const age = /old|elder|aged|senior/i.test(witness?.age ?? '') ? 'old' : /young|teen|boy|girl|child/i.test(witness?.age ?? '') ? 'young' : 'adult';
  if (lang === 'en') {
    const personas = loadPersonas().filter((p) => p.voiceId && p.gender === gender);
    if (personas.length) {
      const accent = String(witness?.accent ?? '').toLowerCase();
      const score = (p) => (p.age === age ? 2 : 0) + (accent && p.accents?.some((a) => accent.includes(a)) ? 3 : 0);
      const best = personas.sort((a, b) => score(b) - score(a))[0];
      return { id: best.voiceId, name: best.name, accent: best.label, flag: '🎭' };
    }
  }
  const v = (FALLBACK_WITNESS[lang] ?? FALLBACK_WITNESS.en)[gender];
  return { ...v, accent: 'eyewitness', flag: '🎭' };
}

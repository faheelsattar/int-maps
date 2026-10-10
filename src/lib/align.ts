// Maps Gradium's word timestamps onto the words we display, tolerating text
// normalisation (e.g. "1912" spoken as "nineteen twelve").
export interface TimedWord {
  text: string;
  start: number;
  stop: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Returns, for each timed word, the index of the matching display word (or -1). */
export function alignWords(display: string[], timed: TimedWord[]): number[] {
  const d = display.map(norm);
  const out: number[] = [];
  let cursor = 0;
  for (const t of timed) {
    const w = norm(t.text);
    let found = -1;
    if (w) {
      for (let i = cursor; i < Math.min(d.length, cursor + 8); i++) {
        if (d[i] === w) {
          found = i;
          break;
        }
      }
    }
    if (found >= 0) cursor = found + 1;
    out.push(found >= 0 ? found : Math.max(0, cursor - 1));
  }
  return out;
}

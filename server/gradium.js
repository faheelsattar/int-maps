import WebSocket from 'ws';

const API = process.env.GRADIUM_API || 'https://api.gradium.ai/api';
const TTS_WS = process.env.GRADIUM_TTS_WS || 'wss://api.gradium.ai/api/speech/tts';
const key = () => process.env.GRADIUM_API_KEY ?? '';

export const BREAK = 0.9; // seconds of silence between paragraphs
export const STOP_BREAK = 2.2; // between journey stops: time for the map to fly

const clampSpeed = (s) => Math.max(-2, Math.min(2, Number(s) || 0));

/**
 * Opens a streaming TTS session. Push text as it is generated; every Gradium
 * message (audio, word timestamps, errors) is passed to onMessage.
 */
export function openTTS({ voiceId, speed = 0, onMessage }) {
  const ws = new WebSocket(TTS_WS, { headers: { 'x-api-key': key() } });
  const pending = [];
  let open = false;
  let ended = false;
  let resolveDone;
  let rejectDone;
  const done = new Promise((res, rej) => ((resolveDone = res), (rejectDone = rej)));
  done.catch(() => {});

  const sendRaw = (obj) => (open ? ws.send(JSON.stringify(obj)) : pending.push(obj));

  ws.on('open', () => {
    ws.send(
      JSON.stringify({
        type: 'setup',
        model_name: 'default',
        voice_id: voiceId,
        output_format: 'pcm',
        json_config: { padding_bonus: clampSpeed(speed), temp: 0.7 },
      }),
    );
    open = true;
    pending.splice(0).forEach((m) => ws.send(JSON.stringify(m)));
  });
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === 'error') {
      rejectDone(new Error(`Gradium: ${msg.message || 'TTS error'}`));
      ws.close();
      return;
    }
    if (msg.type === 'audio' || msg.type === 'text') onMessage(msg);
    if (msg.type === 'end_of_stream') resolveDone();
  });
  ws.on('close', () => resolveDone());
  ws.on('error', (err) => rejectDone(err));

  return {
    /** Send a chunk of whole words (never split inside a word). */
    text(chunk) {
      if (!ended && chunk.trim()) sendRaw({ type: 'text', text: chunk });
    },
    end() {
      if (ended) return;
      ended = true;
      sendRaw({ type: 'text', text: '<flush>' });
      sendRaw({ type: 'end_of_stream' });
    },
    abort() {
      ended = true;
      ws.terminate();
    },
    done,
  };
}

const SAMPLE_RATE = 48000;

function silence(seconds) {
  return { type: 'audio', audio: Buffer.alloc(Math.round(seconds * SAMPLE_RATE) * 2).toString('base64') };
}

/**
 * Speaks streamed text as a chain of TTS sessions, one per paragraph: Gradium plans cap
 * how much text one session may take and how many run at once, so sessions run strictly
 * one after another. Word timestamps are shifted onto one continuous timeline and a
 * silent pause is inserted between paragraphs. Synthesis runs faster than real time, so
 * the listener never hears the hand-over.
 */
export function ttsChain({ voiceId, speed = 0, gap = BREAK, onMessage, onError }) {
  const paras = [{ phrases: [], ended: false }];
  let buf = '';
  let next = 0; // paragraph the active (or next) session speaks
  let active = null; // { tts, sent, seconds }
  let offset = 0;
  let closed = false;
  let aborted = false;
  let finishResolve;
  const finished = new Promise((r) => (finishResolve = r));
  const writing = () => paras[paras.length - 1];

  const drive = () => {
    if (aborted) return;
    if (!active) {
      if (next >= paras.length || (!paras[next].phrases.length && !paras[next].ended)) {
        if (closed && next >= paras.length) finishResolve();
        return;
      }
      const para = paras[next];
      if (!para.phrases.length) {
        // empty paragraph: skip
        next++;
        return drive();
      }
      const session = { sent: 0, seconds: 0 };
      session.tts = openTTS({
        voiceId,
        speed,
        onMessage: (msg) => {
          if (msg.type === 'audio') {
            session.seconds += Buffer.byteLength(msg.audio, 'base64') / 2 / SAMPLE_RATE;
            onMessage(msg);
          } else {
            onMessage({ ...msg, start_s: (msg.start_s ?? 0) + offset, stop_s: (msg.stop_s ?? msg.start_s ?? 0) + offset });
          }
        },
      });
      session.tts.done
        .catch((err) => onError?.(err))
        .finally(() => {
          if (aborted) return;
          offset += session.seconds;
          active = null;
          next++;
          const more = next < paras.length && (paras[next].phrases.length || !closed);
          if (more || !closed) {
            onMessage(silence(gap));
            offset += gap;
          }
          drive();
        });
      active = session;
    }
    const para = paras[next];
    while (active.sent < para.phrases.length) active.tts.text(para.phrases[active.sent++]);
    if (para.ended && !active.ending) {
      active.ending = true;
      active.tts.end();
    }
  };

  const takePhrases = (force) => {
    let m;
    while ((m = buf.match(/^([\s\S]*?[.!?…]["”’)]?)\s/) || (buf.length > 90 ? buf.match(/^([\s\S]{60,}?[,;:])\s/) : null))) {
      writing().phrases.push(m[1].trim());
      buf = buf.slice(m[0].length);
    }
    if (force && buf.trim()) {
      writing().phrases.push(buf.trim());
      buf = '';
    }
  };

  const endParagraph = () => {
    takePhrases(true);
    writing().ended = true;
    paras.push({ phrases: [], ended: false });
  };

  return {
    /** Feed streamed text; a blank line ends a paragraph. */
    push(delta) {
      buf += delta;
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const rest = buf.slice(idx + 2).replace(/^\s+/, '');
        buf = buf.slice(0, idx);
        endParagraph();
        buf = rest;
      }
      takePhrases(false);
      drive();
    },
    /** Feed whole paragraphs at once (replays). */
    paragraphs(list) {
      list.forEach((p) => {
        buf = p;
        endParagraph();
      });
      drive();
    },
    end() {
      takePhrases(true);
      writing().ended = true;
      closed = true;
      // drop a trailing empty paragraph
      if (!writing().phrases.length) paras.pop();
      drive();
      return finished;
    },
    abort() {
      aborted = true;
      active?.tts.abort();
      finishResolve();
    },
  };
}

/** Short-lived single-use token so the browser can open STT WebSockets without our key. */
export async function browserToken() {
  const r = await fetch(`${API}/api-keys/token`, { headers: { 'x-api-key': key() } });
  if (!r.ok) throw new Error(`Gradium token: ${readable(await r.text()) || r.status}`);
  return r.json();
}

export function readable(msg) {
  msg = String(msg ?? '');
  try {
    const j = JSON.parse(msg);
    return j.error?.message || j.detail || j.message || msg;
  } catch {
    // Errors often embed a JSON body inside a longer string.
    return msg.match(/"message":\s*"([^"]+)"/)?.[1] ?? msg;
  }
}

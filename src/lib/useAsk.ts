import { useCallback, useEffect, useRef, useState } from 'react';
import type { Source, Story } from './api';
import { startMic, type Mic } from './mic';
import { Narrator, type GradiumMsg } from './narrator';
import { readNdjson } from './stream';

export interface QA {
  q: string;
  a: string;
  sources: Source[];
  pending: boolean;
  error?: string;
}

export type AskState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'answering';

/**
 * "Ask the narrator": the mic streams straight to Gradium speech-to-text (with a
 * short-lived token), Gemini answers with Google Search, and Gradium speaks the answer
 * in the story's voice. The story pauses while you talk and resumes afterwards.
 */
export function useAsk(story: Story | null, storyNarrator: Narrator | null) {
  const [state, setState] = useState<AskState>('idle');
  const [transcript, setTranscript] = useState('');
  const [thread, setThread] = useState<QA[]>([]);
  const [error, setError] = useState('');
  const [answerNarrator, setAnswerNarrator] = useState<Narrator | null>(null);
  const session = useRef<{ ws: WebSocket; mic: Mic | null; text: string[]; closed: Promise<void> } | null>(null);
  const resumeStory = useRef(false);
  const answerRef = useRef<{ abort: AbortController; narrator: Narrator } | null>(null);
  const levelRef = useRef<() => number>(() => 0);

  // New story: clear the conversation.
  useEffect(() => {
    setThread([]);
    setTranscript('');
    setError('');
    answerRef.current?.abort.abort();
    answerRef.current?.narrator.stop();
    answerRef.current = null;
    setAnswerNarrator(null);
    setState('idle');
  }, [story?.id]);

  const pauseStory = () => {
    if (storyNarrator && (storyNarrator.state === 'playing' || storyNarrator.state === 'loading')) {
      resumeStory.current = true;
      void storyNarrator.pause();
    }
  };

  const ask = useCallback(
    async (question: string) => {
      if (!story || !question.trim()) return;
      pauseStory();
      answerRef.current?.abort.abort();
      answerRef.current?.narrator.stop();
      const narrator = new Narrator();
      const abort = new AbortController();
      answerRef.current = { abort, narrator };
      setAnswerNarrator(narrator);
      setState('thinking');
      const history = thread.filter((t) => !t.pending && t.a).map((t) => ({ q: t.q, a: t.a }));
      setThread((t) => [...t, { q: question.trim(), a: '', sources: [], pending: true }]);
      const patch = (fn: (qa: QA) => QA) => setThread((t) => t.map((qa, i) => (i === t.length - 1 ? fn(qa) : qa)));

      narrator.subscribe(() => {
        if (narrator.state === 'playing') setState('answering');
        if (narrator.state === 'ended' || narrator.state === 'error') {
          setState('idle');
          if (resumeStory.current && storyNarrator && storyNarrator.state === 'paused') void storyNarrator.resume();
          resumeStory.current = false;
        }
      });

      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: story.id, question, history }),
          signal: abort.signal,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not answer');
        await readNdjson(res, (m) => {
          if (m.type === 'delta') patch((qa) => ({ ...qa, a: qa.a + (m.text as string) }));
          else if (m.type === 'tts') narrator.feed(m.msg as GradiumMsg);
          else if (m.type === 'done') patch((qa) => ({ ...qa, a: (m.answer as string) || qa.a, sources: (m.sources as Source[]) ?? [], pending: false }));
          else if (m.type === 'error') throw new Error(m.message as string);
        });
        narrator.finish();
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        patch((qa) => ({ ...qa, pending: false, error: (err as Error).message }));
        narrator.fail((err as Error).message);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [story, storyNarrator, thread],
  );

  /** Start listening (press-and-hold or tap). */
  const listen = useCallback(async () => {
    if (!story || session.current) return;
    setError('');
    setTranscript('');
    setState('connecting');
    pauseStory();
    answerRef.current?.narrator.pause();
    try {
      // Mic first: the permission prompt can take a while on first use.
      const text: string[] = [];
      let ws: WebSocket | null = null;
      const mic = await startMic((b64) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'audio', audio: b64 })));
      levelRef.current = mic.level;
      let resolveClosed!: () => void;
      const closed = new Promise<void>((r) => (resolveClosed = r));
      const s = { ws: null as unknown as WebSocket, mic, text, closed };
      session.current = s;

      const tok = await fetch('/api/stt-token', { method: 'POST' }).then((r) => r.json());
      if (!tok.token) throw new Error(tok.error || 'Could not start speech recognition');
      const url = new URL('wss://api.gradium.ai/api/speech/asr');
      url.searchParams.set('token', tok.token);
      ws = new WebSocket(url);
      s.ws = ws;
      const socket = ws;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'setup', model_name: 'default', input_format: mic.format, json_config: { language: story.lang || 'en' } }));
        if (session.current === s) setState('listening');
      };
      socket.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'text' && m.text) {
          text.push(m.text);
          setTranscript(text.join(' '));
        } else if (m.type === 'end_of_stream') socket.close();
        else if (m.type === 'error') setError(m.message || 'Speech recognition error');
      };
      socket.onclose = () => resolveClosed();
      socket.onerror = () => resolveClosed();
    } catch (err) {
      session.current?.mic?.stop();
      session.current = null;
      setError((err as Error).name === 'NotAllowedError' ? 'Microphone access was blocked.' : (err as Error).message);
      setState('idle');
      if (resumeStory.current) void storyNarrator?.resume();
      resumeStory.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, storyNarrator]);

  /** Stop listening and send the question. */
  const done = useCallback(async () => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    s.mic?.stop();
    levelRef.current = () => 0;
    if (s.ws?.readyState === WebSocket.OPEN) {
      s.ws.send(JSON.stringify({ type: 'end_of_stream' }));
      await Promise.race([s.closed, new Promise((r) => setTimeout(r, 2000))]);
    }
    if (s.ws?.readyState === WebSocket.OPEN) s.ws.close();
    const q = s.text.join(' ').trim();
    if (!q) {
      setState('idle');
      setError("I didn't catch that. Try again?");
      if (resumeStory.current) void storyNarrator?.resume();
      resumeStory.current = false;
      return;
    }
    setTranscript('');
    void ask(q);
  }, [ask, storyNarrator]);

  return { state, transcript, thread, error, answerNarrator, listen, done, ask, level: () => levelRef.current() };
}

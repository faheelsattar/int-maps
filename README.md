# Echoes 📍 Every place has a story

Drop a pin, search a place, or pick a journey. **Gemini** (grounded with Google Search) finds a *true* historical event, every claim is matched to a source, and **Gradium** tells it out loud in real time, in a narrator's voice, an eyewitness's voice, or the local language. Then you can **ask it questions out loud**.

## Run it

```bash
npm install
cp .env.example .env     # GEMINI_API_KEY, GRADIUM_API_KEY, VITE_GOOGLE_MAPS_API_KEY
npm run voices:design    # once: creates the eyewitness voices with Gradium Voice Design
npm run dev              # web on http://localhost:5173, API on :8787
```

## Features

| | |
|---|---|
| 📍 **Places** | Click the map or search (Places autocomplete). Era, mood and Famous / Hidden gems filters. |
| ⚡ **Streams in seconds** | A spoken intro plays instantly; Gemini's text streams into Gradium's realtime TTS so the story starts speaking while it's still being written. |
| ✅ **Every fact, sourced** | Research returns one claim per line; Google Search grounding supports are mapped onto each claim. Only source-backed claims reach the writer, and each fact shows its sources. |
| 🎭 **Eyewitness mode** | First-person retelling by an ordinary person who was there, voiced by persona voices made with **Gradium Voice Design**. |
| 🌍 **Local language** | French, German, Spanish and Portuguese with native Gradium voices, plus English subtitles. Switch any story with one tap (reuses its verified research, no new search). |
| 🎙 **Ask the narrator** | Hold the mic: the browser streams to **Gradium STT** (short-lived token), Gemini answers with search, Gradium speaks the answer in the story's voice. |
| 🧭 **Journeys** | "Napoleon's march on Moscow": 4–6 stops; the narration drives the camera from stop to stop along the route. |
| ↗ **Share links & demo mode** | Every story and its audio is saved (`server/data`). `/?s=<id>` replays instantly with zero API calls; 📚 *Saved* lists them. |

## How it works

```
click ─► /api/story (NDJSON stream)
          ├─ intro line ──────────────► Gradium TTS ─► 🔊 (0.2 s)
          ├─ nearby suggestions ──────► Gemini Flash-Lite (parallel)
          ├─ research ────────────────► Gemini + Google Search → CLAIM lines + grounding supports
          └─ write (streamed) ────────► Gradium TTS session chain ─► 🔊 + word timestamps
                                         (one session per paragraph, sequential, re-timed into one timeline)
```

- `server/gemini.js` research, claim/source mapping, streamed writing, answers, translation
- `server/gradium.js` realtime TTS sessions + chain, STT tokens
- `server/voices.js` native local voices, eyewitness persona matching
- `server/store.js` saved stories + audio cache (share links / demo mode)
- `src/lib/narrator.ts` gap-free PCM playback; `useTeller` story stream; `useSpoken` karaoke; `useAsk` mic → STT → answer

Gradium plan limits handled: per-session text cap (one session per paragraph), 2 concurrent sessions (sessions run sequentially), 6 custom voices (persona fallback to flagship voices).

Keyboard: `/` search · `Space` play/pause · `Esc` close.

# Echoes 📍 Every place has a story

Say a city, or drop a pin. **Gradium** is the main input: tap the mic and speak ("take me to Rome", "who survived?", "make it spooky"). Gradium transcribes you and detects when you've finished, **Gemini** works out what you meant, and Gradium answers out loud. Stories are narrated with karaoke-style word highlighting.

## How stories stay honest

1. **Research:** Gemini writes a plain-prose research brief using Google Search (via the Interactions API, which returns citations). Every sentence is rated by the strongest source cited for it: *authoritative* (official, archives, museums, universities, scholarly encyclopedias), *reputable* (Wikipedia, established publishers), *unrated*, or *low* (forums, social media, blogs). See `server/sources.js`.
2. **Story:** a second call writes the narration **only from the brief**. Each "key fact" names the brief sentences it came from, so it inherits their source rating. Facts with no backing are dropped.
3. **Verdict:** every story and spoken answer shows *Well sourced*, *Partly sourced* or *Weakly sourced: treat as unverified*, plus its sources ranked by authority.

## Run it

```bash
npm install
cp .env.example .env   # then fill in the three keys
npm run dev            # web on http://localhost:5173, API on :8787
```

| Key | Where to get it |
| --- | --- |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `GRADIUM_API_KEY` | https://studio.gradium.ai |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud Console → enable **Maps JavaScript API** and **Geocoding API** (needed for spoken city names) |

Keyboard: **M** talk, **Space** play/pause, **Esc** cancel/close. Set `DEBUG_GROUNDING=1` to log Gemini's search and citation steps.
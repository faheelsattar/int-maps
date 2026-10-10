# Echoes 📍 Every place has a story

Drop a pin anywhere on Earth. **Gemini** (grounded with Google Search) digs up a *true* historical event that happened there, and **Gradium** narrates it with an accented storyteller voice, streamed in real time with karaoke-style word highlighting.

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
| `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud Console → enable **Maps JavaScript API** (+ **Geocoding API**, optional) |
import { useCallback, useEffect, useRef, useState } from 'react';
import { APIProvider, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { AnimatePresence, motion } from 'framer-motion';
import { HistorianOpening } from './components/HistorianOpening';
import { MapView } from './components/MapView';
import { StoryPanel } from './components/StoryPanel';
import { TopBar, type Settings } from './components/TopBar';
import { MicButton, VoiceToast } from './components/Voice';
import { fetchScene, fetchShot, fetchStories, fetchStory, type Command, type CommandContext, type StoryChoice, type Era, type LatLng, type NearbyEcho, type Story, type Tone } from './lib/api';
import { flyTo } from './lib/flyTo';
import { unlockAudio } from './lib/narrator';
import { useNarration } from './lib/useNarration';
import { speak, stopSpeaking } from './lib/speak';
import { useVoice } from './lib/useVoice';
import { useConversation } from './lib/useConversation';
import { useLocalNarrator } from './lib/useLocalNarrator';
import { DEFAULT_VOICE, VOICES } from './lib/voices';

type Focus = NearbyEcho & { teaser?: string };
type Choices = { pin: LatLng; items: StoryChoice[]; loading: boolean };

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const SURPRISES: (LatLng & { name: string })[] = [
  { name: 'Atlantic Ocean, south of Newfoundland', lat: 41.73, lng: -49.95 },
  { name: 'Pripyat, Ukraine', lat: 51.389, lng: 30.099 },
  { name: 'Pompeii, Italy', lat: 40.749, lng: 14.485 },
  { name: 'Kitty Hawk, North Carolina', lat: 36.019, lng: -75.668 },
  { name: 'Tunguska, Siberia', lat: 60.886, lng: 101.894 },
  { name: 'Roanoke Island, North Carolina', lat: 35.909, lng: -75.708 },
  { name: 'Halifax Harbour, Nova Scotia', lat: 44.669, lng: -63.598 },
  { name: 'Sutton Hoo, England', lat: 52.089, lng: 1.338 },
  { name: 'Dyatlov Pass, Russia', lat: 61.755, lng: 59.422 },
  { name: 'Elephant Island, Antarctica', lat: -61.13, lng: -55.12 },
  { name: 'Boston Molasses Flood site', lat: 42.368, lng: -71.056 },
  { name: 'Giza, Egypt', lat: 29.979, lng: 31.134 },
  { name: 'Machu Picchu, Peru', lat: -13.163, lng: -72.545 },
  { name: 'Krakatoa, Indonesia', lat: -6.102, lng: 105.423 },
];

export default function App() {
  if (!MAPS_KEY) return <MissingKey />;
  return (
    <APIProvider apiKey={MAPS_KEY}>
      <Experience />
    </APIProvider>
  );
}

function Experience() {
  const map = useMap();
  const geocoding = useMapsLibrary('geocoding');
  const [settings, setSettings] = useState<Settings>({ voice: DEFAULT_VOICE, localAccent: true, historianBook: true, era: 'any', pick: 'famous', tone: 'epic', speed: 0.5 });
  const [pin, setPin] = useState<LatLng | null>(null);
  const [place, setPlace] = useState('');
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTome, setShowTome] = useState(false);
  const told = useRef<string[]>([]);
  const request = useRef<AbortController | null>(null);
  const lastQuery = useRef<{ pin: LatLng; focus?: Focus } | null>(null);
  // Stories offered for the current pin. `shelf` remembers them so "another story" can reopen the list.
  const [choices, setChoices] = useState<Choices | null>(null);
  const shelf = useRef<{ pin: LatLng; items: StoryChoice[]; offered: string[] } | null>(null);
  // The historian's study, painted for the place while the list loads (null: the default study).
  const [scene, setScene] = useState<string | null>(null);
  // An establishing shot painted while the chosen story is being written, so the film opens on it.
  const [prologue, setPrologue] = useState<{ title: string; url: string } | null>(null);
  // Where the pin is, so the local narrator can be prepared while the listener picks a story.
  const [locale, setLocale] = useState<{ countryCode: string; place: string } | null>(null);
  const sceneFor = useRef('');

  // With local accent on, a story is narrated (and questions about it answered) in the accent of its place.
  const { voice: narrator, ready: narratorReady } = useLocalNarrator(
    pin && {
      countryCode: locale?.countryCode || story?.countryCode || '',
      place: locale?.place || story?.place || place,
      accent: story?.accent ?? undefined,
    },
    settings.voice,
    settings.localAccent,
  );
  // The historian starts reading once his book is open (or straight away if the book was closed).
  const [bookOpen, setBookOpen] = useState<Story | null>(null);
  const [released, setReleased] = useState<Story | null>(null);
  useEffect(() => {
    if (story && (!showTome || bookOpen === story)) setReleased(story);
  }, [story, showTome, bookOpen]);
  const narration = useNarration(story && released === story && narratorReady ? story.paragraphs : null, narrator.id, settings.speed);
  const narrationRef = useRef(narration);
  narrationRef.current = narration;

  /** The place name for a point, plus its country so a local narrator can be prepared early. */
  const locate = useCallback(
    async (p: LatLng): Promise<{ name: string; countryCode: string }> => {
      if (!geocoding) return { name: '', countryCode: '' };
      try {
        const geocoder = new geocoding.Geocoder();
        const { results } = await Promise.race([
          geocoder.geocode({ location: p }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
        ]);
        const best = results.find((r) => r.types.some((t) => ['locality', 'administrative_area_level_2', 'administrative_area_level_1', 'country', 'natural_feature'].includes(t)));
        const country = results.flatMap((r) => r.address_components).find((c) => c.types.includes('country'));
        return { name: (best ?? results[0])?.formatted_address ?? '', countryCode: country?.short_name ?? '' };
      } catch {
        return { name: '', countryCode: '' }; // Geocoding API not enabled, or open ocean, Gemini works from coordinates alone.
      }
    },
    [geocoding],
  );
  const reverseGeocode = useCallback(async (p: LatLng) => (await locate(p)).name, [locate]);

  const tellStory = useCallback(
    async (p: LatLng, opts: { fresh?: boolean; focus?: Focus; era?: Era; tone?: Tone; name?: string } = {}) => {
      unlockAudio();
      request.current?.abort();
      const ctrl = new AbortController();
      request.current = ctrl;
      lastQuery.current = { pin: p, focus: opts.focus };
      if (opts.fresh) told.current = [];

      setPin(p);
      setStory(null);
      setChoices(null);
      setError('');
      setLoading(true);
      setShowTome(settings.historianBook);
      if (map && (map.getZoom() ?? 0) < 5) flyTo(map, p, 6);
      else map?.panTo(p);

      const name = opts.name ?? (opts.focus ? opts.focus.title : await reverseGeocode(p));
      if (ctrl.signal.aborted) return;
      setPlace(name);
      try {
        const s = await fetchStory(
          {
            ...p,
            place: name,
            era: opts.era ?? settings.era,
            tone: opts.tone ?? settings.tone,
            pick: settings.pick,
            exclude: told.current,
            ...(opts.focus
              ? { focus: `${opts.focus.title}${opts.focus.year != null ? ` (${opts.focus.year})` : ''}${opts.focus.teaser ? `: ${opts.focus.teaser}` : ''}` }
              : {}),
          },
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return;
        told.current = [...told.current, s.title].slice(-8);
        stopSpeaking(); // the story's own narration takes over from any spoken acknowledgement
        setStory(s);
        frameStory(map, p, s);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [map, reverseGeocode, settings.era, settings.tone, settings.pick, settings.historianBook],
  );

  /** A place was chosen: the historian lays out several of its stories to pick from. */
  const explore = useCallback(
    async (p: LatLng, opts: { fresh?: boolean; era?: Era; name?: string } = {}) => {
      unlockAudio();
      request.current?.abort();
      const ctrl = new AbortController();
      request.current = ctrl;
      lastQuery.current = { pin: p };
      if (opts.fresh) told.current = [];
      const offered = shelf.current?.pin === p ? shelf.current.offered : [];

      setPin(p);
      setStory(null);
      setError('');
      setLoading(false);
      setChoices({ pin: p, items: [], loading: true });
      setShowTome(settings.historianBook);
      if (map && (map.getZoom() ?? 0) < 5) flyTo(map, p, 6);
      else map?.panTo(p);

      const where = await locate(p);
      const name = opts.name ?? where.name;
      if (ctrl.signal.aborted) return;
      setPlace(name);
      setLocale({ countryCode: where.countryCode, place: name });
      if (settings.historianBook && name && sceneFor.current !== name) {
        sceneFor.current = name;
        setScene(null);
        fetchScene(name, settings.voice.gender)
          .then((url) => {
            const img = new Image();
            img.onload = () => sceneFor.current === name && setScene(url);
            img.src = url;
          })
          .catch(() => {}); // keep the default study
      }
      try {
        const items = await fetchStories({ ...p, place: name, era: opts.era ?? settings.era, pick: settings.pick, exclude: [...told.current, ...offered].slice(-10) }, ctrl.signal);
        if (ctrl.signal.aborted) return;
        shelf.current = { pin: p, items, offered: [...offered, ...items.map((c) => c.title)] };
        setChoices({ pin: p, items, loading: false });
      } catch (e) {
        if ((e as Error).name === 'AbortError' || ctrl.signal.aborted) return;
        setChoices(null);
        setError((e as Error).message);
      }
    },
    [map, locate, settings.era, settings.pick, settings.historianBook, settings.voice.gender],
  );

  /** The listener picked a story from the list. */
  const choose = useCallback(
    (c: StoryChoice) => {
      if (!pin) return;
      if (shelf.current?.pin === pin) shelf.current.items = shelf.current.items.filter((x) => x !== c);
      setPrologue(null);
      if (settings.historianBook)
        fetchShot(
          { look: 'cinematic oil painting, warm low light, muted historical palette', place, year: c.year },
          { from: 0, prompt: `Wide establishing shot that sets the scene for this moment in history: ${c.title}. ${c.teaser}`, motion: 'zoom-in', focusX: 50, focusY: 45, atmosphere: 'dust' },
        )
          .then((url) => {
            const img = new Image();
            img.onload = () => setPrologue({ title: c.title, url });
            img.src = url;
          })
          .catch(() => {}); // the film opens on the study instead
      void tellStory(pin, { focus: { title: c.title, year: c.year, teaser: c.teaser, lat: pin.lat, lng: pin.lng }, name: place });
    },
    [pin, place, tellStory, settings.historianBook],
  );

  /** "Another story here": back to the list (fetching more once it runs out). */
  const another = useCallback(() => {
    if (!pin) return;
    const left = shelf.current?.pin === pin ? shelf.current.items : [];
    if (!left.length) return void explore(pin, { name: place });
    request.current?.abort();
    lastQuery.current = { pin };
    setStory(null);
    setError('');
    setLoading(false);
    setChoices({ pin, items: left, loading: false });
    setShowTome(settings.historianBook);
  }, [pin, place, explore, settings.historianBook]);

  const close = useCallback(() => {
    request.current?.abort();
    setPin(null);
    setStory(null);
    setChoices(null);
    setScene(null);
    setLocale(null);
    sceneFor.current = '';
    setLoading(false);
    setShowTome(false);
    setError('');
    told.current = [];
  }, []);

  const surprise = useCallback(() => {
    const s = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
    void explore({ lat: s.lat, lng: s.lng }, { fresh: true });
  }, [explore]);

  // ---- Voice: Gradium is the main input. Speak a city, a question, or a command. ----
  const resumeAfterVoice = useRef(false);

  /** Geocodes a spoken or typed place and tells its story; false if it isn't on the map. */
  const findPlace = useCallback(
    async (query: string) => {
      try {
        if (!geocoding) return false;
        const { results } = await new geocoding.Geocoder().geocode({ address: query });
        const loc = results[0]?.geometry.location;
        if (!loc) return false;
        void explore({ lat: loc.lat(), lng: loc.lng() }, { fresh: true });
        return true;
      } catch {
        return false;
      }
    },
    [geocoding, explore],
  );

  const goTo = useCallback(
    async (query: string) => {
      if (!(await findPlace(query))) void speak(`Sorry, I couldn't find ${query} on the map.`, settings.voice.id, settings.speed);
    },
    [findPlace, settings.voice.id, settings.speed],
  );

  const commandContext = (): CommandContext => ({
    place: story?.place || place,
    narration: narrationRef.current.state,
    era: settings.era,
    tone: settings.tone,
    voices: VOICES.map((v) => v.name),
    story: story ? { title: story.title, date: story.date, year: story.year, place: story.place, text: story.paragraphs.join(' ') } : null,
    choices: choices?.items.map((c) => `${c.title} (${c.year})`),
  });

  // Questions to the narrator: the story pauses while the historian answers, then carries on.
  const resumeAfterAsk = useRef(false);
  const conversation = useConversation({
    story,
    voiceId: narrator.id,
    speed: settings.speed,
    getContext: commandContext,
    onStart: () => {
      const n = narrationRef.current;
      if (n.state === 'playing') {
        resumeAfterAsk.current = true;
        void n.narrator?.pause();
      }
    },
    onEnd: () => {
      const n = narrationRef.current;
      if (resumeAfterAsk.current && n.state === 'paused') void n.narrator?.resume();
      resumeAfterAsk.current = false;
    },
  });
  const { record } = conversation;

  const execute = useCallback(
    (cmd: Command) => {
      const n = narrationRef.current;
      switch (cmd.action) {
        case 'go_to':
          if (cmd.place) void goTo(cmd.place);
          break;
        case 'another_story':
          another();
          break;
        case 'choose': {
          const c = cmd.choice ? choices?.items[cmd.choice - 1] : undefined;
          if (c) choose(c);
          break;
        }
        case 'surprise':
          surprise();
          break;
        case 'set_era':
        case 'set_tone': {
          const patch = cmd.action === 'set_era' ? { era: cmd.era ?? settings.era } : { tone: cmd.tone ?? settings.tone };
          setSettings((s) => ({ ...s, ...patch }));
          if (cmd.retell && pin) {
            // A new era needs a new list; a new mood retells the current story.
            if ('era' in patch) void explore(pin, { era: patch.era, name: place });
            else if (story) void tellStory(pin, { tone: patch.tone, name: place, focus: { title: story.title, year: story.year, lat: pin.lat, lng: pin.lng } });
          }
          break;
        }
        case 'set_voice': {
          const v = VOICES.find((x) => x.name.toLowerCase() === cmd.voice?.toLowerCase());
          if (v) setSettings((s) => ({ ...s, voice: v, localAccent: false }));
          break;
        }
        case 'resume':
          resumeAfterVoice.current = true;
          break;
        case 'pause':
          resumeAfterVoice.current = false;
          break;
        case 'replay':
          resumeAfterVoice.current = false;
          n.restart();
          break;
        case 'stop':
          resumeAfterVoice.current = false;
          close();
          break;
        case 'ask':
          record({ q: cmd.question || cmd.transcript, a: cmd.reply, sources: cmd.sources, authority: cmd.authority });
          break;
        // 'unclear': the spoken reply is the whole response.
      }
      if (['go_to', 'another_story', 'surprise'].includes(cmd.action) || (cmd.retell && pin)) resumeAfterVoice.current = false;
    },
    [goTo, pin, place, story, choices, tellStory, explore, choose, another, surprise, settings.era, settings.tone, close, record],
  );

  const voice = useVoice({
    voiceId: narrator.id,
    speed: settings.speed,
    getContext: () => ({
      ...commandContext(),
      history: conversation.turns.filter((t) => t.a).slice(-4).map((t) => ({ q: t.q, a: t.a! })),
    }),
    execute,
    onListen: () => {
      const n = narrationRef.current;
      resumeAfterVoice.current = n.state === 'playing';
      if (n.state === 'playing') void n.narrator?.pause();
    },
    onDone: () => {
      const n = narrationRef.current;
      if (resumeAfterVoice.current && n.state === 'paused') void n.narrator?.resume();
      resumeAfterVoice.current = false;
    },
  });

  // Keyboard: space = play/pause, esc = close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'Escape') {
        if (showTome) {
          setShowTome(false);
        } else if (voice.state !== 'idle') {
          voice.cancel();
        } else {
          close();
        }
      }
      if ((e.key === 'b' || e.key === 'B') && pin && settings.historianBook) {
        e.preventDefault();
        setShowTome((s) => !s);
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        voice.toggle();
      }
      if (e.key === ' ' && story) {
        e.preventDefault();
        narration.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, narration, story, voice, showTome, pin, settings.historianBook]);

  const panelOpen = !!pin;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView
        pin={pin}
        story={story}
        loading={loading}
        onDrop={(p) => void explore(p, { fresh: true })}
        onEcho={(e) => void tellStory({ lat: e.lat, lng: e.lng }, { focus: e })}
      />
      <div className="vignette pointer-events-none absolute inset-0" />
      <TopBar settings={settings} onChange={setSettings} onSearch={findPlace} onPick={(p, name) => void explore(p, { fresh: true, name })} onOpenTome={pin && settings.historianBook ? () => setShowTome(true) : undefined} />
      <VoiceToast voice={voice} />

      <HistorianOpening
        story={story}
        loading={loading}
        place={place}
        isOpen={showTome}
        error={error}
        voice={narrator}
        voiceReady={narratorReady}
        narration={narration}
        voiceControl={voice}
        conversation={conversation}
        choices={choices}
        onChoose={choose}
        scene={scene}
        prologue={prologue?.url ?? null}
        onClose={() => setShowTome(false)}
        onBookOpen={setBookOpen}
        onAnother={another}
      />

      <AnimatePresence>
        {panelOpen && (
          <StoryPanel
            key="panel"
            story={story}
            loading={loading}
            error={error}
            place={place}
            voice={narrator}
            narration={narration}
            voiceControl={voice}
            conversation={conversation}
            onClose={close}
            onAnother={another}
            onEcho={(e) => void tellStory({ lat: e.lat, lng: e.lng }, { focus: e })}
            choices={choices}
            onChoose={choose}
            onRetry={() => {
              const q = lastQuery.current;
              if (q?.focus) void tellStory(q.pin, { focus: q.focus, name: place });
              else if (q) void explore(q.pin, { name: place });
            }}
            onOpenTome={settings.historianBook ? () => setShowTome(true) : undefined}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!panelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.2 }}
            className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4"
          >
            <div className="glass pointer-events-auto flex items-center gap-3 rounded-full py-2 pl-2 pr-2 shadow-2xl">
              <MicButton voice={voice} />
              <span className="text-sm text-white/80">
                <span className="hidden sm:inline">
                  Tap the mic and name a city, <span className="text-white/50">type one above, or drop a pin</span>
                </span>
                <span className="sm:hidden">Tap the mic and name a city</span>
              </span>
              <button onClick={surprise} className="btn-primary !rounded-full !py-2">
                🎲 Surprise me
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Fit the dropped pin, event site and nearby echoes in view, leaving room for the panel. */
function frameStory(map: google.maps.Map | null, pin: LatLng, s: Story) {
  if (!map) return;
  const pts = [pin, { lat: s.eventLat, lng: s.eventLng }, ...s.nearby];
  const bounds = new google.maps.LatLngBounds();
  pts.forEach((p) => bounds.extend(p));
  const desktop = window.innerWidth >= 768;
  const span = Math.max(...pts.map((p) => Math.abs(p.lat - pin.lat) + Math.abs(p.lng - pin.lng)));
  if (span < 0.02) {
    flyTo(map, pin, 12);
    return;
  }
  map.fitBounds(bounds, desktop ? { top: 120, bottom: 80, left: 80, right: 520 } : { top: 100, bottom: window.innerHeight * 0.62 + 20, left: 40, right: 40 });
  google.maps.event.addListenerOnce(map, 'idle', () => {
    if ((map.getZoom() ?? 0) > 13) map.setZoom(13);
  });
}

function MissingKey() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="panel max-w-md rounded-3xl p-8">
        <p className="eyebrow">Setup needed</p>
        <h1 className="mt-2 font-display text-3xl text-white">Add a Google Maps key</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/65">
          Set <code className="text-amber-200">VITE_GOOGLE_MAPS_API_KEY</code> in <code className="text-amber-200">.env</code> (enable the Maps JavaScript API, and
          optionally the Geocoding API), then restart <code className="text-amber-200">npm run dev</code>.
        </p>
      </div>
    </div>
  );
}

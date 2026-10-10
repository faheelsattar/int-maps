import { useCallback, useEffect, useRef, useState } from 'react';
import { APIProvider, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { AnimatePresence, motion } from 'framer-motion';
import { MapView } from './components/MapView';
import { StoryPanel } from './components/StoryPanel';
import { TopBar, type Settings } from './components/TopBar';
import { MicButton, VoiceToast } from './components/Voice';
import { fetchStory, type Command, type Era, type LatLng, type NearbyEcho, type Story, type Tone } from './lib/api';
import { flyTo } from './lib/flyTo';
import { unlockAudio } from './lib/narrator';
import { useNarration } from './lib/useNarration';
import { speak, stopSpeaking } from './lib/speak';
import { useVoice } from './lib/useVoice';
import { DEFAULT_VOICE, VOICES } from './lib/voices';

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
  const [settings, setSettings] = useState<Settings>({ voice: DEFAULT_VOICE, era: 'any', tone: 'epic', speed: 0.5 });
  const [pin, setPin] = useState<LatLng | null>(null);
  const [place, setPlace] = useState('');
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const told = useRef<string[]>([]);
  const request = useRef<AbortController | null>(null);
  const lastQuery = useRef<{ pin: LatLng; focus?: NearbyEcho } | null>(null);

  const narration = useNarration(story?.paragraphs ?? null, settings.voice.id, settings.speed);
  const narrationRef = useRef(narration);
  narrationRef.current = narration;

  const reverseGeocode = useCallback(
    async (p: LatLng) => {
      if (!geocoding) return '';
      try {
        const geocoder = new geocoding.Geocoder();
        const { results } = await Promise.race([
          geocoder.geocode({ location: p }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500)),
        ]);
        const best = results.find((r) => r.types.some((t) => ['locality', 'administrative_area_level_2', 'administrative_area_level_1', 'country', 'natural_feature'].includes(t)));
        return (best ?? results[0])?.formatted_address ?? '';
      } catch {
        return ''; // Geocoding API not enabled, or open ocean, Gemini works from coordinates alone.
      }
    },
    [geocoding],
  );

  const tellStory = useCallback(
    async (p: LatLng, opts: { fresh?: boolean; focus?: NearbyEcho; era?: Era; tone?: Tone } = {}) => {
      unlockAudio();
      request.current?.abort();
      const ctrl = new AbortController();
      request.current = ctrl;
      lastQuery.current = { pin: p, focus: opts.focus };
      if (opts.fresh) told.current = [];

      setPin(p);
      setStory(null);
      setError('');
      setLoading(true);
      if (map && (map.getZoom() ?? 0) < 5) flyTo(map, p, 6);
      else map?.panTo(p);

      const name = opts.focus ? opts.focus.title : await reverseGeocode(p);
      if (ctrl.signal.aborted) return;
      setPlace(name);
      try {
        const s = await fetchStory(
          {
            ...p,
            place: name,
            era: opts.era ?? settings.era,
            tone: opts.tone ?? settings.tone,
            exclude: told.current,
            ...(opts.focus ? { focus: `${opts.focus.title}${opts.focus.year != null ? ` (${opts.focus.year})` : ''}` } : {}),
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
    [map, reverseGeocode, settings.era, settings.tone],
  );

  const close = useCallback(() => {
    request.current?.abort();
    setPin(null);
    setStory(null);
    setLoading(false);
    setError('');
    told.current = [];
  }, []);

  const surprise = useCallback(() => {
    const s = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
    void tellStory({ lat: s.lat, lng: s.lng }, { fresh: true });
  }, [tellStory]);

  // ---- Voice: Gradium is the main input. Speak a city, a question, or a command. ----
  const resumeAfterVoice = useRef(false);

  const goTo = useCallback(
    async (query: string) => {
      try {
        if (!geocoding) throw new Error('no geocoder');
        const { results } = await new geocoding.Geocoder().geocode({ address: query });
        const loc = results[0]?.geometry.location;
        if (!loc) throw new Error('not found');
        void tellStory({ lat: loc.lat(), lng: loc.lng() }, { fresh: true });
      } catch {
        void speak(`Sorry, I couldn't find ${query} on the map.`, settings.voice.id, settings.speed);
      }
    },
    [geocoding, tellStory, settings.voice.id, settings.speed],
  );

  const execute = useCallback(
    (cmd: Command) => {
      const n = narrationRef.current;
      switch (cmd.action) {
        case 'go_to':
          if (cmd.place) void goTo(cmd.place);
          break;
        case 'another_story':
          if (pin) void tellStory(pin);
          break;
        case 'surprise':
          surprise();
          break;
        case 'set_era':
        case 'set_tone': {
          const patch = cmd.action === 'set_era' ? { era: cmd.era ?? settings.era } : { tone: cmd.tone ?? settings.tone };
          setSettings((s) => ({ ...s, ...patch }));
          if (cmd.retell && pin) void tellStory(pin, { fresh: true, ...patch });
          break;
        }
        case 'set_voice': {
          const v = VOICES.find((x) => x.name.toLowerCase() === cmd.voice?.toLowerCase());
          if (v) setSettings((s) => ({ ...s, voice: v }));
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
        // 'ask' and 'unclear': the spoken reply is the whole response.
      }
      if (['go_to', 'another_story', 'surprise'].includes(cmd.action) || (cmd.retell && pin)) resumeAfterVoice.current = false;
    },
    [goTo, pin, tellStory, surprise, settings.era, settings.tone, close],
  );

  const voice = useVoice({
    voiceId: settings.voice.id,
    speed: settings.speed,
    getContext: () => ({
      place: story?.place || place,
      narration: narrationRef.current.state,
      era: settings.era,
      tone: settings.tone,
      voices: VOICES.map((v) => v.name),
      story: story ? { title: story.title, date: story.date, year: story.year, place: story.place, text: story.paragraphs.join(' ') } : null,
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
        if (voice.state !== 'idle') voice.cancel();
        else close();
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
  }, [close, narration, story, voice]);

  const panelOpen = !!pin;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView
        pin={pin}
        story={story}
        loading={loading}
        onDrop={(p) => void tellStory(p, { fresh: true })}
        onEcho={(e) => void tellStory({ lat: e.lat, lng: e.lng }, { focus: e })}
      />
      <div className="vignette pointer-events-none absolute inset-0" />
      <TopBar settings={settings} onChange={setSettings} />
      <VoiceToast voice={voice} />

      <AnimatePresence>
        {panelOpen && (
          <StoryPanel
            key="panel"
            story={story}
            loading={loading}
            error={error}
            place={place}
            voice={settings.voice}
            narration={narration}
            voiceControl={voice}
            onClose={close}
            onAnother={() => pin && void tellStory(pin)}
            onEcho={(e) => void tellStory({ lat: e.lat, lng: e.lng }, { focus: e })}
            onRetry={() => lastQuery.current && void tellStory(lastQuery.current.pin, { focus: lastQuery.current.focus })}
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
                  Tap the mic and name a city, <span className="text-white/50">or drop a pin on the map</span>
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

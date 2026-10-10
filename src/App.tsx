import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { AnimatePresence, motion } from 'framer-motion';
import { MapView } from './components/MapView';
import { StoryPanel } from './components/StoryPanel';
import { TopBar, type Settings } from './components/TopBar';
import { formatYear, listSaved, type LatLng, type Mode, type NearbyEcho, type SavedStory, type Stop, type Story } from './lib/api';
import { flyTo } from './lib/flyTo';
import { unlockAudio } from './lib/narrator';
import { useAsk } from './lib/useAsk';
import { useSpoken } from './lib/useSpoken';
import { useTeller } from './lib/useTeller';
import { DEFAULT_VOICE } from './lib/voices';
import type { Theme } from './lib/mapStyle';

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
  const [theme, setTheme] = useTheme();
  const [settings, setSettings] = useState<Settings>({
    voice: DEFAULT_VOICE,
    era: 'any',
    tone: 'epic',
    pick: 'famous',
    mode: 'narrator',
    lang: 'en',
    speed: 0.5,
  });
  const [pin, setPin] = useState<LatLng | null>(null);
  const [placeLabel, setPlaceLabel] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const told = useRef<string[]>([]);
  const lastRequest = useRef<{ url: string; body: unknown } | null>(null);

  const teller = useTeller((s) => {
    told.current = [...told.current, s.title].slice(-8);
  });
  const { story } = teller;
  const spoken = useSpoken(teller.narrator, teller.paragraphs);
  const ask = useAsk(teller.phase === 'done' ? story : null, teller.narrator);

  const voicePayload = { id: settings.voice.id, name: settings.voice.name, accent: settings.voice.accent, flag: settings.voice.flag };

  const start = useCallback(
    (url: string, body: unknown) => {
      lastRequest.current = { url, body };
      teller.start(url, body);
    },
    [teller],
  );

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
        return ''; // Geocoding API not enabled, or open ocean: Gemini works from coordinates alone.
      }
    },
    [geocoding],
  );

  const tellPlace = useCallback(
    async (p: LatLng, opts: { fresh?: boolean; focus?: NearbyEcho; name?: string; zoom?: number } = {}) => {
      unlockAudio();
      // Silence and clear the previous story right away; the place lookup can take a moment.
      teller.prepare();
      setPin(p);
      setPanelOpen(true);
      setPlaceLabel(opts.focus?.title ?? opts.name ?? '');
      if (map && opts.zoom) flyTo(map, p, opts.zoom);
      else if (map && (map.getZoom() ?? 0) < 5) flyTo(map, p, 6);
      else map?.panTo(p);
      const name = opts.focus ? opts.focus.title : (opts.name ?? (await reverseGeocode(p)));
      setPlaceLabel(name);
      start('/api/story', {
        ...p,
        place: name,
        era: settings.era,
        tone: settings.tone,
        pick: settings.pick,
        mode: settings.mode,
        lang: settings.lang,
        voice: voicePayload,
        speed: settings.speed,
        exclude: told.current,
        ...(opts.focus ? { focus: `${opts.focus.title}${opts.focus.year != null ? ` (${opts.focus.year})` : ''}` } : {}),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, reverseGeocode, settings, start, teller],
  );

  const tellJourney = useCallback(
    (query: string) => {
      unlockAudio();
      setPin(null);
      setPanelOpen(true);
      setPlaceLabel(query);
      if (map) flyTo(map, map.getCenter()?.toJSON() ?? { lat: 30, lng: 10 }, 3);
      start('/api/journey', { query, tone: settings.tone, mode: settings.mode, voice: voicePayload, speed: settings.speed });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, settings, start],
  );

  const retell = useCallback(
    ({ mode, lang }: { mode: Mode; lang: 'en' | 'local' }) => {
      if (!story) return;
      unlockAudio();
      setPlaceLabel(story.title);
      start('/api/retell', { storyId: story.id, mode, lang, tone: settings.tone, voice: voicePayload, speed: settings.speed });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [story, settings, start],
  );

  const openSaved = useCallback(
    async (id: string) => {
      setPanelOpen(true);
      setPlaceLabel('');
      const s = await teller.load(id);
      if (!s) return;
      if (s.kind === 'place') setPin({ lat: s.eventLat, lng: s.eventLng });
      else setPin(null);
    },
    [teller],
  );

  // Shared links: /?s=<story id>
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('s');
    if (id) void openSaved(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = useCallback(() => {
    teller.cancel();
    setPanelOpen(false);
    setPin(null);
    told.current = [];
  }, [teller]);

  // Frame the map once the research is in.
  useEffect(() => {
    if (!map || !story) return;
    if (story.kind === 'journey') frameStops(map, story.stops);
    else frameStory(map, pin ?? { lat: story.eventLat, lng: story.eventLng }, story);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, story?.id]);

  // Journeys: the narration drives the camera from stop to stop.
  const activeStop = useMemo(() => {
    if (story?.kind !== 'journey' || spoken.activeWord < 0) return -1;
    let words = 0;
    for (let i = 0; i < teller.paragraphs.length; i++) {
      words += teller.paragraphs[i].split(/\s+/).filter(Boolean).length;
      if (spoken.activeWord < words) return Math.min(i, story.stops.length - 1);
    }
    return story.stops.length - 1;
  }, [story, spoken.activeWord, teller.paragraphs]);

  useEffect(() => {
    if (!map || !story || story.kind !== 'journey' || activeStop < 0) return;
    const stop = story.stops[activeStop];
    const prev = story.stops[activeStop - 1] ?? stop;
    flyTo(map, stop, zoomForHop(prev, stop));
  }, [map, story, activeStop]);

  const focusStop = (i: number) => {
    const stop = story?.stops[i];
    if (map && stop) flyTo(map, stop, 7);
  };

  const surprise = () => {
    const s = SURPRISES[Math.floor(Math.random() * SURPRISES.length)];
    void tellPlace({ lat: s.lat, lng: s.lng }, { fresh: true, name: s.name });
  };

  // Keyboard: space = play/pause, esc = close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'Escape') close();
      if (e.key === ' ' && story) {
        e.preventDefault();
        const n = teller.narrator;
        if (!n || n.state === 'ended' || n.state === 'error') teller.replay();
        else if (n.state === 'paused') void n.resume();
        else void n.pause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, story, teller]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView
        theme={theme}
        pin={pin}
        story={story}
        loading={teller.phase === 'research'}
        activeStop={activeStop}
        onStop={focusStop}
        onDrop={(p) => void tellPlace(p, { fresh: true })}
        onEcho={(e) => void tellPlace({ lat: e.lat, lng: e.lng }, { focus: e })}
      />
      <div className="vignette pointer-events-none absolute inset-0" />
      <TopBar
        settings={settings}
        onChange={setSettings}
        theme={theme}
        onTheme={setTheme}
        onSearch={(r) => void tellPlace({ lat: r.lat, lng: r.lng }, { fresh: true, name: r.name, zoom: 10 })}
        onJourney={tellJourney}
      />

      <AnimatePresence>
        {panelOpen && (
          <StoryPanel
            key="panel"
            teller={teller}
            spoken={spoken}
            ask={ask}
            placeLabel={placeLabel}
            activeStop={activeStop}
            onClose={close}
            onAnother={() => pin && void tellPlace(pin)}
            onEcho={(e) => void tellPlace({ lat: e.lat, lng: e.lng }, { focus: e })}
            onRetry={() => lastRequest.current && start(lastRequest.current.url, lastRequest.current.body)}
            onRetell={retell}
            onStop={focusStop}
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
            <div className="glass pointer-events-auto flex items-center gap-2 rounded-full py-2 pl-5 pr-2 shadow-2xl">
              <span className="relative mr-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
              </span>
              <span className="mr-1 text-sm text-ink/80">
                <span className="hidden lg:inline">Drop a pin anywhere on Earth to hear what happened there</span>
                <span className="lg:hidden">Tap anywhere to hear its story</span>
              </span>
              <SavedStories onOpen={(id) => void openSaved(id)} />
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

/** Previously generated stories (instant, cached): handy for demos. */
function SavedStories({ onOpen }: { onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<SavedStory[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    void listSaved().then(setList);
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost !rounded-full !py-2" title="Saved stories">
        📚 <span className="hidden sm:inline">Saved</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="panel absolute bottom-full left-1/2 mb-3 max-h-[50vh] w-[min(340px,90vw)] -translate-x-1/2 overflow-y-auto rounded-2xl p-1.5"
          >
            <p className="px-3 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink/40">Saved stories · play instantly</p>
            {list === null ? (
              <p className="px-3 py-3 text-sm text-ink/50">Loading…</p>
            ) : list.length === 0 ? (
              <p className="px-3 py-3 text-sm text-ink/50">Stories you hear are saved here.</p>
            ) : (
              list.map((s) => (
                <button key={s.id} onClick={() => (setOpen(false), onOpen(s.id))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ink/5">
                  <span>{s.kind === 'journey' ? '🧭' : s.mode === 'eyewitness' ? '🎭' : '📍'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{s.title}</span>
                    <span className="block truncate text-xs text-ink/50">
                      {formatYear(s.year)} · {s.place}
                      {s.lang !== 'en' ? ` · ${s.lang.toUpperCase()}` : ''}
                    </span>
                  </span>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Day/night look, remembered per browser. index.html applies it before first paint. */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0d13' : '#efe6d6');
    try {
      localStorage.setItem('echoes-theme', theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  return [theme, setTheme] as const;
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
  map.fitBounds(bounds, desktop ? { top: 120, bottom: 80, left: 80, right: 540 } : { top: 100, bottom: window.innerHeight * 0.62 + 20, left: 40, right: 40 });
  google.maps.event.addListenerOnce(map, 'idle', () => {
    if ((map.getZoom() ?? 0) > 13) map.setZoom(13);
  });
}

function frameStops(map: google.maps.Map, stops: Stop[]) {
  if (!stops.length) return;
  const bounds = new google.maps.LatLngBounds();
  stops.forEach((s) => bounds.extend(s));
  const desktop = window.innerWidth >= 768;
  map.fitBounds(bounds, desktop ? { top: 120, bottom: 80, left: 80, right: 540 } : { top: 100, bottom: window.innerHeight * 0.64 + 20, left: 40, right: 40 });
}

/** Zoom level for flying between two journey stops: wide for long hops, close for short ones. */
function zoomForHop(a: LatLng, b: LatLng) {
  const km = haversine(a, b);
  return km > 2500 ? 4 : km > 800 ? 5 : km > 250 ? 6 : km > 60 ? 7 : 8;
}

function haversine(a: LatLng, b: LatLng) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function MissingKey() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="panel max-w-md rounded-3xl p-8">
        <p className="eyebrow">Setup needed</p>
        <h1 className="mt-2 font-display text-3xl text-ink">Add a Google Maps key</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/65">
          Set <code className="text-accent">VITE_GOOGLE_MAPS_API_KEY</code> in <code className="text-accent">.env</code> (enable the Maps JavaScript API, and
          optionally the Geocoding API), then restart <code className="text-accent">npm run dev</code>.
        </p>
      </div>
    </div>
  );
}

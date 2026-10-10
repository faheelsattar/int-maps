import { useEffect } from 'react';
import { Map, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { MAP_THEMES, type Theme } from '../lib/mapStyle';
import type { LatLng, NearbyEcho, Stop, Story } from '../lib/api';
import { Overlay } from './Overlay';
import { DropPin, EchoDot, EventBeacon, StopMarker } from './Pins';

interface Props {
  pin: LatLng | null;
  story: Story | null;
  loading: boolean;
  theme: Theme;
  activeStop: number;
  onStop: (i: number) => void;
  onDrop: (p: LatLng) => void;
  onEcho: (e: NearbyEcho) => void;
}

export function MapView({ pin, story, loading, theme, activeStop, onStop, onDrop, onEcho }: Props) {
  const look = MAP_THEMES[theme];
  const handleClick = (e: MapMouseEvent) => {
    e.stop(); // suppress default POI info windows
    const ll = e.detail.latLng;
    if (ll) onDrop({ lat: ll.lat, lng: ll.lng });
  };

  const journey = story?.kind === 'journey' ? story.stops : null;
  const eventPos = story && !journey ? { lat: story.eventLat, lng: story.eventLng } : null;
  const showBeacon = eventPos && pin && distance(pin, eventPos) > 0.15;

  return (
    <Map
      className="absolute inset-0"
      defaultCenter={{ lat: 30, lng: 10 }}
      defaultZoom={3}
      minZoom={2}
      styles={look.styles}
      mapTypeId={look.mapTypeId}
      backgroundColor={look.background}
      gestureHandling="greedy"
      disableDefaultUI
      clickableIcons={false}
      draggableCursor="crosshair"
      draggingCursor="grabbing"
      onClick={handleClick}
    >
      {pin && (
        <Overlay key={`${pin.lat},${pin.lng}`} position={pin} zIndex={5}>
          <DropPin loading={loading} />
        </Overlay>
      )}
      {story && showBeacon && (
        <Overlay key={`beacon-${story.title}`} position={eventPos!} zIndex={4}>
          <EventBeacon year={story.year} />
        </Overlay>
      )}
      {journey && <Route stops={journey} active={activeStop} color={look.trail} />}
      {journey?.map((s, i) => (
        <Overlay key={`stop-${story!.id}-${s.index}`} position={s} zIndex={i === activeStop ? 6 : 4}>
          <StopMarker stop={s} number={i + 1} state={i < activeStop ? 'past' : i === activeStop ? 'active' : 'next'} onSelect={() => onStop(i)} />
        </Overlay>
      ))}
      {!journey && story?.nearby.map((n, i) => (
        <Overlay key={`${story.title}-${n.title}`} position={n} zIndex={3}>
          <EchoDot echo={n} index={i} onSelect={onEcho} />
        </Overlay>
      ))}
      {pin && story && showBeacon && <Trail from={pin} to={eventPos!} color={look.trail} />}
    </Map>
  );
}

/** Journey route: solid up to the current stop, dashed for what's still ahead. */
function Route({ stops, active, color }: { stops: Stop[]; active: number; color: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || stops.length < 2) return;
    const reached = stops.slice(0, Math.max(1, active + 1));
    const ahead = stops.slice(Math.max(0, active));
    const done = new google.maps.Polyline({
      map,
      path: reached,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: 0.9,
      strokeWeight: 3.5,
      clickable: false,
      zIndex: 2,
    });
    const dash = { path: 'M 0,-1 0,1', strokeOpacity: 0.55, strokeColor: color, scale: 2.5 };
    const todo = new google.maps.Polyline({
      map,
      path: ahead,
      geodesic: true,
      strokeOpacity: 0,
      icons: [{ icon: dash, offset: '0', repeat: '12px' }],
      clickable: false,
      zIndex: 1,
    });
    return () => {
      done.setMap(null);
      todo.setMap(null);
    };
  }, [map, stops, active, color]);
  return null;
}

/** Animated dashed great-circle trail from the dropped pin to the event site. */
function Trail({ from, to, color }: { from: LatLng; to: LatLng; color: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const dash = { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: color, scale: 2.5 };
    const line = new google.maps.Polyline({
      map,
      path: [from, to],
      geodesic: true,
      strokeOpacity: 0,
      icons: [{ icon: dash, offset: '0', repeat: '12px' }],
      clickable: false,
    });
    let offset = 0;
    const id = window.setInterval(() => {
      offset = (offset + 1) % 24;
      const icons = line.get('icons');
      icons[0].offset = `${offset}px`;
      line.set('icons', icons);
    }, 60);
    return () => {
      clearInterval(id);
      line.setMap(null);
    };
  }, [map, from.lat, from.lng, to.lat, to.lng, color]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function distance(a: LatLng, b: LatLng) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}

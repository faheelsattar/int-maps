import { useEffect } from 'react';
import { Map, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps';
import { MAP_STYLE } from '../lib/mapStyle';
import type { LatLng, NearbyEcho, Story } from '../lib/api';
import { Overlay } from './Overlay';
import { DropPin, EchoDot, EventBeacon } from './Pins';

interface Props {
  pin: LatLng | null;
  story: Story | null;
  loading: boolean;
  onDrop: (p: LatLng) => void;
  onEcho: (e: NearbyEcho) => void;
}

export function MapView({ pin, story, loading, onDrop, onEcho }: Props) {
  const handleClick = (e: MapMouseEvent) => {
    e.stop(); // suppress default POI info windows
    const ll = e.detail.latLng;
    if (ll) onDrop({ lat: ll.lat, lng: ll.lng });
  };

  const eventPos = story ? { lat: story.eventLat, lng: story.eventLng } : null;
  const showBeacon = eventPos && pin && distance(pin, eventPos) > 0.15;

  return (
    <Map
      className="absolute inset-0"
      defaultCenter={{ lat: 30, lng: 10 }}
      defaultZoom={3}
      minZoom={2}
      styles={MAP_STYLE}
      backgroundColor="#0a0d13"
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
      {story?.nearby.map((n, i) => (
        <Overlay key={`${story.title}-${n.title}`} position={n} zIndex={3}>
          <EchoDot echo={n} index={i} onSelect={onEcho} />
        </Overlay>
      ))}
      {pin && story && showBeacon && <Trail from={pin} to={eventPos!} />}
    </Map>
  );
}

/** Animated dashed great-circle trail from the dropped pin to the event site. */
function Trail({ from, to }: { from: LatLng; to: LatLng }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const dash = { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#f6d08a', scale: 2.5 };
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
  }, [map, from.lat, from.lng, to.lat, to.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function distance(a: LatLng, b: LatLng) {
  return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}

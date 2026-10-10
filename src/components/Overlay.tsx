import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from '@vis.gl/react-google-maps';

/**
 * Renders arbitrary React content anchored to a lat/lng on a styled
 * (non-mapId) Google Map, using an OverlayView.
 */
export function Overlay({ position, children, zIndex = 1 }: { position: google.maps.LatLngLiteral; children: ReactNode; zIndex?: number }) {
  const map = useMap();
  const container = useMemo(() => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    return el;
  }, []);
  const [overlay, setOverlay] = useState<google.maps.OverlayView | null>(null);

  useEffect(() => {
    if (!map) return;
    class PinOverlay extends google.maps.OverlayView {
      pos = new google.maps.LatLng(position);
      onAdd() {
        this.getPanes()!.overlayMouseTarget.appendChild(container);
        google.maps.OverlayView.preventMapHitsAndGesturesFrom(container);
      }
      draw() {
        const p = this.getProjection()?.fromLatLngToDivPixel(this.pos);
        if (!p) return;
        container.style.left = `${p.x}px`;
        container.style.top = `${p.y}px`;
      }
      onRemove() {
        container.remove();
      }
    }
    const o = new PinOverlay();
    o.setMap(map);
    setOverlay(o);
    return () => o.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, container]);

  useEffect(() => {
    if (!overlay) return;
    (overlay as unknown as { pos: google.maps.LatLng }).pos = new google.maps.LatLng(position);
    overlay.draw();
  }, [overlay, position.lat, position.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    container.style.zIndex = String(zIndex);
  }, [container, zIndex]);

  return createPortal(children, container);
}

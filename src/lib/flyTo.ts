// Smoothly pans + zooms a Google Map, stepping zoom one level at a time.
let token = 0;

export function flyTo(map: google.maps.Map, target: google.maps.LatLngLiteral, zoom: number) {
  const my = ++token;
  const current = map.getZoom() ?? 3;
  const step = (z: number) => {
    if (my !== token) return;
    map.setZoom(z);
    if (z !== zoom) setTimeout(() => step(z + Math.sign(zoom - z)), 140);
  };
  if (current > zoom + 1) {
    step(current - 1);
    setTimeout(() => my === token && map.panTo(target), 140 * Math.abs(current - zoom));
  } else {
    map.panTo(target);
    setTimeout(() => step(current + Math.sign(zoom - current) || current), 350);
  }
}

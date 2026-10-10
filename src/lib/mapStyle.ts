export type Theme = 'light' | 'dark';

// "Explorer's atlas": parchment land, soft sea, terrain relief, sepia labels.
export const ATLAS_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#efe6d4' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b5640' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f6f0e3' }, { weight: 3 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c4ae8c' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#a88a62' }, { weight: 1.2 }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#4a3826' }] },
  { featureType: 'administrative.province', elementType: 'geometry.stroke', stylers: [{ color: '#d2bf9f' }, { weight: 0.6 }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#3f2f20' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ebe1cc' }] },
  { featureType: 'landscape.natural.terrain', elementType: 'geometry', stylers: [{ color: '#e2d6bd' }] },
  { featureType: 'landscape.natural.landcover', elementType: 'geometry', stylers: [{ color: '#e4dcc4' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#e9dfcb' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#d9dfbf' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#fbf6ec' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f3dfb8' }] },
  { featureType: 'road.local', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#a9cbd3' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4f7c88' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#c4dce1' }] },
];

// "Night atlas": muted and dark so pins and stories glow.
export const NIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#14171f' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8f9c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d0f14' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2b303c' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#3a4152' }, { weight: 1 }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#b5b9c4' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d6c08f' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#171b24' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#1a1e28' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#16201d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#232836' }] },
  { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c3242' }] },
  { featureType: 'road.local', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0d13' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d4558' }] },
];

export const MAP_THEMES: Record<Theme, { styles: google.maps.MapTypeStyle[]; mapTypeId: string; background: string; trail: string }> = {
  light: { styles: ATLAS_STYLE, mapTypeId: 'terrain', background: '#a9cbd3', trail: '#c8462a' },
  dark: { styles: NIGHT_STYLE, mapTypeId: 'roadmap', background: '#0a0d13', trail: '#f6d08a' },
};

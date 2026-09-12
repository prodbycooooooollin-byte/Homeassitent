// Umrechnung zwischen Minecraft-Weltkoordinaten (X/Z, Y = Höhe getrennt
// behandelt) und Leaflet-"LatLng" bei CRS.Simple. Norden (-Z) zeigt nach
// oben, wie auf einer klassischen Karte - lat = -z, lng = x.
export function worldToLatLng(x: number, z: number): [number, number] {
  return [-z, x];
}

export function latLngToWorld(lat: number, lng: number): { x: number; z: number } {
  return { x: lng, z: -lat };
}

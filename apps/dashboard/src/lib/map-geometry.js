export function project(lat, lon, zoom) {
  const size = 256 * 2 ** zoom;
  const sin = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180);
  return { x: (lon + 180) / 360 * size, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}
export function unproject(x, y, zoom) {
  const size = 256 * 2 ** zoom;
  return { lon: ((x / size * 360) % 360 + 360) % 360 - 180, lat: Math.max(-85.05, Math.min(85.05, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI)) };
}

import { expect, it } from 'vitest';
import { project, unproject } from './map-geometry.js';
it.each([[41.0082, 28.9784], [0, 0], [-33.8688, 151.2093], [40.7128, -74.006], [85, 179.99]])('harita seçimi koordinatlarını korur: %s, %s', (lat, lon) => {
  for (const zoom of [2, 5, 18]) {
    const p = project(lat, lon, zoom);
    expect(unproject(p.x, p.y, zoom).lat).toBeCloseTo(lat, 6);
    expect(unproject(p.x, p.y, zoom).lon).toBeCloseTo(lon, 6);
  }
});
it('dünya sınırından taşan karoları doğru boylama sarar', () => {
  const p = project(0, 28, 5);
  expect(unproject(p.x + 256 * 2 ** 5, p.y, 5).lon).toBeCloseTo(28);
});

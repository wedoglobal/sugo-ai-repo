import { describe, expect, it } from 'vitest';
import { isRoamLand, roamTarget } from './server/location-roam.js';

const start = Date.parse('2026-11-25T09:00:00Z');
const minute = 60_000;
const istanbul = { latitude: 41.0082, longitude: 28.9784 };
const date = (ms) => new Date(ms).toISOString();
const poll = (minutes, since = start, center = istanbul, host = 'host') => roamTarget(host, 'sugo.live', {
  ...center, at: date(start + minutes * minute), idleSince: date(since),
});
function distance(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2
    + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

describe('Sugo konum gezintisi', () => {
  it('10 dakika bekler ve aynı dilimde aynı noktayı döndürür', async () => {
    expect(await poll(9.99)).toBeNull();
    const first = await poll(10);
    expect(first).toMatchObject({ stepAt: start + 10 * minute, center: istanbul });
    expect(await poll(11.99)).toEqual(first);
    expect(await poll(12)).toMatchObject({ stepAt: start + 12 * minute });
    expect(await poll(12)).not.toEqual(first);
    expect(await poll(10, start, istanbul, 'other')).not.toEqual(first);
  });
  it('son mesaj ve yeniden bağlantı sonrasında 10 dakika bekler, kaçırılan hareketleri geri oynatmaz', async () => {
    const since = start + 13 * minute;
    expect(await poll(22.99, since)).toBeNull();
    expect(await poll(23, since)).toMatchObject({ stepAt: start + 23 * minute });
    expect(await poll(60, since)).toMatchObject({ stepAt: start + 59 * minute });
  });
  it('İstanbul hedeflerini kara üzerinde ve ilk merkezin 50 km çevresinde tutar', async () => {
    const moves = await Promise.all(Array.from({ length: 160 }, (_, i) => poll(10 + i * 2)));
    for (const move of moves) {
      expect(move.center).toEqual(istanbul);
      expect(distance(istanbul, move)).toBeLessThanOrEqual(50);
      expect(isRoamLand(move.latitude, move.longitude)).toBe(true);
    }
    expect(new Set(moves.map((p) => p.latitude)).size).toBe(moves.length);
  });
  it('Marmara, Karadeniz, Boğaz ve büyük göllerden kaçınır', async () => {
    for (const [lat, lon] of [[40.84, 28.80], [41.32, 29.16], [41.069, 29.054], [42.36, -87.10]]) {
      expect(isRoamLand(lat, lon)).toBe(false);
    }
    expect(isRoamLand(41.073, 28.825)).toBe(true);
    expect(await poll(10, start, { latitude: 35, longitude: -40 })).toBeNull();
  });
});

import { expect, test } from 'vitest';
import { matchStats } from './stats.js';

test('eşleşmeleri günlük ve sürüm başına profil-saat oranıyla sayar', () => {
  const notices = [
    { host_id: 'h1', created_at: '2026-11-10T10:00:00Z' },
    { host_id: 'h1', created_at: '2026-11-10T11:00:00Z' },
    { host_id: 'h1', created_at: '2026-11-11T10:00:00Z' },
  ];
  const log = { h1: [{ v: '0.2.4', at: '2026-11-10T00:00:00Z' }, { v: '0.2.5', at: '2026-11-11T00:00:00Z' }] };
  const r = matchStats(notices, log, Date.parse('2026-11-12T00:00:00Z'));
  expect(r.days.map((d) => [d.day, d.total])).toEqual([['2026-11-11', 1], ['2026-11-10', 2]]);
  const [v25, v24] = r.versions;
  expect([v24.version, v24.matches, v24.hours, v24.perDay]).toEqual(['0.2.4', 2, 24, 2]);
  expect([v25.version, v25.matches, v25.hours, v25.perDay]).toEqual(['0.2.5', 1, 24, 1]);

  const b = matchStats(notices, { h1: [{ v: '0.2.5', at: '2026-11-11T00:00:00Z' }] }, Date.parse('2026-11-12T00:00:00Z'), { version: '0.2.3', hosts: [{ id: 'h1', from: '2026-11-10T00:00:00Z' }] });
  expect(b.versions.map((v) => [v.version, v.matches, v.hours])).toEqual([['0.2.5', 1, 24], ['0.2.3', 2, 24]]);
});

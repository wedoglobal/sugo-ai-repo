import { describe, expect, it } from 'vitest';
import { mergePermanent, newTempNotes, parseExtract } from './memory.js';

const now = new Date('2026-10-24T10:00:00Z');

describe('mergePermanent', () => {
  it('boş alana yeterli güvenle yazar, düşük güveni atlar', () => {
    const r = mergePermanent({}, { name: { value: 'Ali', confidence: 0.9 }, job: { value: 'x', confidence: 0.3 } }, now);
    expect(r.changed).toEqual(['name']);
    expect(r.permanent.name.value).toBe('Ali');
  });
  it('üzerine yazma için yüksek güven ister', () => {
    const cur = { residence: { value: 'Bursa', confidence: 0.9 } };
    expect(mergePermanent(cur, { residence: { value: 'İzmir', confidence: 0.7 } }, now).changed).toEqual([]);
    expect(mergePermanent(cur, { residence: { value: 'İzmir', confidence: 0.9 } }, now).permanent.residence.value).toBe('İzmir');
  });
  it('mantıksız yaşı reddeder', () => {
    expect(mergePermanent({}, { age: { value: 5, confidence: 1 } }, now).changed).toEqual([]);
    expect(mergePermanent({}, { age: { value: '25', confidence: 1 } }, now).permanent.age.value).toBe(25);
  });
});

describe('newTempNotes', () => {
  it('TTL verir, tekrarı ve üst sınırı uygular', () => {
    const notes = newTempNotes(['yorgun', 'Yorgun', 'iş çıkışı', '', 'a', 'b', 'c'], [], now);
    expect(notes.map((n) => n.text)).toEqual(['yorgun', 'iş çıkışı', 'a', 'b']);
    expect(notes[0].expires_at).toBe('2026-10-26T10:00:00.000Z');
    expect(newTempNotes(['x'], Array(12).fill('y').map((v, i) => v + i), now)).toEqual([]);
  });
});

describe('parseExtract', () => {
  it('bozuk JSON için boş sonuç döner, sarmalı JSON\'u okur', () => {
    expect(parseExtract('nope')).toEqual({ permanent: {}, temp: [] });
    expect(parseExtract('```json\n{"permanent":{},"temp":["a"]}\n```').temp).toEqual(['a']);
  });
});

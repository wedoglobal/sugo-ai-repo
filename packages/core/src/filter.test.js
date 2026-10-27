import { describe, expect, it } from 'vitest';
import { applyReplacements, parseReplacements } from './filter.js';
import { routineEntries, routineNow } from './routine.js';

describe('parseReplacements', () => {
  it('=> ve -> ayracını, yorum ve boş satırları işler', () => {
    expect(parseReplacements('sen naber => naber\n# not\n\nnaber hocam -> selam\nçok  =>')).toEqual([
      { from: 'sen naber', to: 'naber' }, { from: 'naber hocam', to: 'selam' }, { from: 'çok', to: '' },
    ]);
  });
});

describe('applyReplacements', () => {
  const rules = parseReplacements('sen naber => naber');
  it('büyük/küçük harf duyarsız ve Türkçe I/İ doğru', () => {
    expect(applyReplacements('Sen naber, ne yapıyosun', rules)).toBe('naber, ne yapıyosun');
    expect(applyReplacements('SEN NABER', rules)).toBe('naber');
    expect(applyReplacements('İyi misin, sen naber', parseReplacements('iyi misin => selam'))).toBe('selam, sen naber');
  });
  it('yalnız tam sözcük eşleşir', () => {
    expect(applyReplacements('sen naberci misin', rules)).toBe('sen naberci misin');
  });
  it('boş yerine silme ve boşluk temizliği yapar', () => {
    expect(applyReplacements('ya sen naber ya', parseReplacements('sen naber =>'))).toBe('ya ya');
  });
});

describe('routine', () => {
  const entries = routineEntries({ tuesday: [
    { start: '23:00', end: '00:00', place: 'ev', activity: 'dizi' },
    { start: '11:00', end: '12:00', place: 'atölye', activity: 'buket' },
    { start: '12:00', end: '13:00', place: 'atölye', activity: 'buket' },
  ] });
  it('şu anki bloğu bulur (İstanbul saati)', () => {
    expect(routineNow(entries, new Date('2026-10-27T09:30:00Z'))).toBe('atölye: buket'); // Salı 12:30
    expect(routineNow(entries, new Date('2026-10-27T20:30:00Z'))).toBe('ev: dizi'); // Salı 23:30
    expect(routineNow(entries, new Date('2026-10-27T02:00:00Z'))).toBe(''); // Salı 05:00
    expect(routineNow(entries, new Date('2026-10-26T09:30:00Z'))).toBe(''); // Pazartesi
  });
});

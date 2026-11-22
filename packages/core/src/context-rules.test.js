import { describe, expect, it } from 'vitest';
import { matchContextRules, suggestKeywords } from './context-rules.js';

const rules = [
  { when: 'Karşı taraf nedenini soruyor', rule: 'sebep söyle' },
  { when: 'beklendiği gibi değil', keywords: 'beklenti, hayal kırıklığı', rule: 'özür dile' },
  { when: 'kapalı', rule: 'x', active: false },
];

describe('bağlam kuralı eşleşmesi', () => {
  it('anahtar kelime yokken bağlam cümlesindeki genel olmayan sözcüklerin hepsi gerekir', () => {
    expect(matchContextRules(rules, ['Karşı taraf nedenini soruyor.']).map((r) => r.rule)).toEqual(['sebep söyle']);
    expect(matchContextRules(rules, ['Karşı taraf bir şey soruyor.'])).toEqual([]);
  });
  it('anahtar kelimelerden biri (çok sözcüklüyse hepsi) yeterlidir, ekler önemsizdir', () => {
    expect(matchContextRules(rules, ['hayal kırıklığına uğradığını söylüyor']).map((r) => r.rule)).toEqual(['özür dile']);
    expect(matchContextRules(rules, ['hayal kuruyor'])).toEqual([]);
  });
  it('yeni mesajlar da eşleşmede sayılır, pasif kural asla', () => {
    expect(matchContextRules(rules, ['kapalı', 'neden?']).map((r) => r.rule)).toEqual([]);
    expect(matchContextRules(rules, ['neden yazmadın nedenini söyle'])).toEqual([]);
  });
  it('anahtar kelime önerisi genel sözcükleri atar', () => {
    expect(suggestKeywords('Karşı taraf nedenini soruyor.')).toBe('nedenini, soruyor');
  });
});

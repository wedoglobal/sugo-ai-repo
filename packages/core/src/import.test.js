import { describe, expect, it } from 'vitest';
import { importPersona } from './import.js';

const raw = {
  character: { name: 'Mine', age: 23, city: 'İstanbul', current_city: 'İstanbul / Üsküdar', origin_city: 'Samsun / Atakum', occupation: 'çiçek atölyesi' },
  personal_information: [
    { title: 'Müzik', content: 'indie dinler', shareable: true },
    { title: 'Not', content: 'yalnız admin', shareable: false },
    { title: 'Rutin', content: 'x'.repeat(3000), shareable: true },
  ],
  conversation_style: { formality: 'Yok / çok az', length: 'Çok kısa', emoji: 'Yok / çok az', emoji_preferences: ['🙃'], spelling_imperfections: 'Az', explicit_style_instruction: 'kısa yaz. Answer AI identity questions honestly. Başka şey.' },
  example_messages: [{ user: 'a', assistant: 'selamm' }, { user: 'b', assistant: 'selamm' }, { user: 'c', assistant: '23' }],
};

describe('importPersona', () => {
  it('alanları host persona/knowledge şekline çevirir', () => {
    const r = importPersona(raw);
    expect(r.name).toBe('Mine');
    expect(r.persona).toMatchObject({ formality: 0, length: 'tiny', emoji: 1, typos: 1, capitals: 'normal', timeZone: 'Europe/Istanbul', instructions: 'kısa yaz. Başka şey.', examples: ['selamm', '23'], emojis: ['🙃'] });
    expect(r.persona.facts.map((f) => [f.label, f.value])).toEqual([['Ad', 'Mine'], ['Yaş', '23'], ['Şehir', 'İstanbul'], ['Memleket', 'Samsun'], ['Meslek', 'çiçek atölyesi']]);
    expect(r.knowledge).toEqual([{ title: 'Müzik', content: 'indie dinler', active: true }, { title: 'Not', content: 'yalnız admin', active: false }]);
    expect(r.skipped).toEqual(['Rutin: çok uzun']);
  });
  it('persona olmayan JSON reddedilir', () => {
    expect(() => importPersona({ a: 1 })).toThrow();
  });
});

describe('importPersona rutin', () => {
  it('weekly_routine gün başına girdi olur, yaşam rutini dökümü atlanır', () => {
    const slot = (start, end, activity) => ({ start, end, place: 'ev', activity });
    const r = importPersona({
      ...raw,
      personal_information: [...raw.personal_information, { title: 'Yaşam rutini', content: 'dökümü', shareable: true }],
      weekly_routine: { monday: [slot('00:00', '01:00', 'müzik'), slot('01:00', '02:00', 'müzik'), slot('02:00', '03:00', 'kolaj')] },
    });
    expect(r.knowledge.at(-1)).toEqual({ title: 'Rutin: Pazartesi', content: '00:00-02:00 ev: müzik; 02:00-03:00 ev: kolaj', active: true });
    expect(r.knowledge.some((k) => k.title === 'Yaşam rutini')).toBe(false);
    expect(r.skipped).toEqual(['Rutin: çok uzun']);
  });
});

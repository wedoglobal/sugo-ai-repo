import { describe, expect, it } from 'vitest';
import { buildReplyMessages, cleanReply, detectDisclosures, peerAsksAbout, readPersona, repeatedDisclosures } from './persona.js';

const persona = readPersona({
  formality: 'weird', length: 'tiny',
  facts: [{ label: 'Ad', value: 'Ahu' }, { label: 'Yaş', value: '24' }, { label: 'Gizli', value: 'x', shareable: false }],
});

describe('readPersona', () => {
  it('geçersiz değerleri varsayılana çeker', () => {
    expect(persona.formality).toBe(1);
    expect(persona.length).toBe('tiny');
    expect(persona.facts).toHaveLength(3);
  });
});

describe('readPersona düzeyleri', () => {
  it('eski metin değerlerini 0-3 düzeye çevirir, geçersiz saat dilimini varsayılana çeker', () => {
    const p = readPersona({ formality: 'very_casual', emoji: 'often', typos: true, laughter: 9, timeZone: 'Mars/Olympus' });
    expect(p).toMatchObject({ formality: 0, emoji: 3, typos: 1, laughter: 1, timeZone: 'Europe/Istanbul', laughCooldown: 2, laughMax: 0 });
    expect(readPersona({ typos: false, timeZone: 'Europe/Berlin' })).toMatchObject({ typos: 0, timeZone: 'Europe/Berlin' });
  });
});

describe('readPersona ses', () => {
  it('yalnız sunulan kadın seslerini kabul eder', () => {
    expect(readPersona({ voice: 'Kore' }).voice).toBe('Kore');
    expect(readPersona({ voice: 'Puck' }).voice).toBe('');
  });
});

describe('cleanReply', () => {
  it('tırnak ve satır sonlarını temizler, uzun/kod bloklu çıktıyı reddeder', () => {
    expect(cleanReply('"selam\nnaber"')).toBe('selam naber');
    expect(cleanReply('x'.repeat(301))).toBeNull();
    expect(cleanReply('```a```')).toBeNull();
    expect(cleanReply('  ')).toBeNull();
  });
});

describe('açıklama takibi', () => {
  it('cevaptaki persona bilgisini tespit eder', () => {
    expect(detectDisclosures('ben Ahu, 24 yaşındayım', persona.facts)).toEqual({ name: 'Ahu', age: '24' });
  });
  it('sorulmadıkça tekrarı yakalar, sorulduysa izin verir', () => {
    expect(repeatedDisclosures('ben Ahu yaa', { name: 'Ahu' }, ['naber'])).toEqual(['name']);
    expect(repeatedDisclosures('ben Ahu yaa', { name: 'Ahu' }, ['adın ne senin'])).toEqual([]);
    expect(peerAsksAbout('age', ['kaç yaşındasın'])).toBe(true);
  });
});

describe('buildReplyMessages', () => {
  it('son 12 mesajı sırasıyla tutar, örnekleri beşle sınırlar ve yeni mesajları korur', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ direction: 'in', text: `geçmiş-${i}!` }));
    const p = readPersona({ examples: Array.from({ length: 20 }, (_, i) => `örnek-${i}!`) });
    const user = buildReplyMessages({ kind: 'reply', persona: p, history, unread: ['yeni mesaj'] })[1].content;
    expect(user).not.toContain('geçmiş-7!');
    expect(user.indexOf('geçmiş-8!')).toBeLessThan(user.indexOf('geçmiş-19!'));
    expect(user).toContain('örnek-4!');
    expect(user).not.toContain('örnek-5!');
    expect(user).toContain('yeni mesaj');
    expect(history).toHaveLength(20);
    expect(p.examples).toHaveLength(20);
  });
  it('uzun geçmişte 6000 karakteri aşmaz ve en yeni mesajı tutar', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({ direction: 'out', text: `${i}: ${'x'.repeat(3990)}` }));
    const user = buildReplyMessages({ kind: 'reply', persona, history, unread: ['soru'] })[1].content;
    const context = user.split('Önceki konuşma (eski -> yeni):\n')[1].split('\n\nCevaplanacak')[0];
    expect(context.length).toBeLessThanOrEqual(6000);
    expect(context).toContain('19: ');
    expect(context).not.toContain('18: ');
    const huge = buildReplyMessages({ kind: 'reply', persona, history: [{ direction: 'in', text: 'a'.repeat(10000) }], unread: ['yeni'] })[1].content;
    expect(huge).toContain('…');
    expect(huge).toContain('yeni');
  });
  const msgs = buildReplyMessages({
    kind: 'reply', persona, disclosed: { name: 'Ahu' },
    permanent: { job: { value: 'doktor' } }, temp: ['yorgun'], unread: ['nasılsın'],
    history: [{ direction: 'out', text: 'selam' }],
  });
  it('söylenen bilgiyi "zaten söylediklerin" bölümüne, söylenmeyeni paylaşılabilire koyar', () => {
    const user = msgs[1].content;
    expect(user).toMatch(/ZATEN söylediklerin[^]*Ad: Ahu/);
    expect(user).toMatch(/Paylaşılabilir bilgiler[^]*Yaş: 24/);
    expect(user).not.toMatch(/Gizli/);
    expect(user).toMatch(/job: doktor/);
    expect(user).toMatch(/Sen: selam/);
    expect(user).toMatch(/- nasılsın/);
  });
});

describe('genel kurallar', () => {
  it('ortak kuralları sistem mesajına ekler, boşsa eklemez', () => {
    const base = { kind: 'reply', persona: readPersona({}), unread: ['selam'] };
    const withRules = buildReplyMessages({ ...base, rules: ['önce teşekkür et, sonra öv'] })[0].content;
    expect(withRules).toContain('Genel kurallar');
    expect(withRules).toContain('önce teşekkür et, sonra öv');
    expect(buildReplyMessages(base)[0].content).not.toContain('Genel kurallar');
  });
});

describe('bağlama göre kurallar', () => {
  it('kural varsa sistem metnine bağlamıyla yazılır, yoksa eklenmez', () => {
    const base = { kind: 'reply', persona: readPersona({}), temp: ['Karşı taraf nedenini soruyor.'], unread: ['neden?'] };
    const system = buildReplyMessages({ ...base, contextRules: [{ when: 'Karşı taraf nedenini soruyor', rule: 'kısa sebep söyle' }] })[0].content;
    expect(system).toContain('Karşı taraf nedenini soruyor: kısa sebep söyle');
    expect(buildReplyMessages(base)[0].content).not.toContain('Bağlama göre kurallar');
  });
});

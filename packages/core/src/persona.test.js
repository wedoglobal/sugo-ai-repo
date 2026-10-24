import { describe, expect, it } from 'vitest';
import { buildReplyMessages, cleanReply, detectDisclosures, peerAsksAbout, readPersona, repeatedDisclosures } from './persona.js';

const persona = readPersona({
  formality: 'weird', length: 'tiny',
  facts: [{ label: 'Ad', value: 'Ahu' }, { label: 'Yaş', value: '24' }, { label: 'Gizli', value: 'x', shareable: false }],
});

describe('readPersona', () => {
  it('geçersiz değerleri varsayılana çeker', () => {
    expect(persona.formality).toBe('casual');
    expect(persona.length).toBe('tiny');
    expect(persona.facts).toHaveLength(3);
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

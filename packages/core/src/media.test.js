import { describe, expect, it } from 'vitest';
import { asksForPhoto, asksForVoice, shouldUseCatalogVoice } from './media.js';

describe('normal akışta hazır ses', () => {
  it('ses kapalıysa açık talepte bile seçmez', () => {
    expect(shouldUseCatalogVoice(['ses at'], { voiceEnabled: false, random: () => 0 })).toBe(false);
  });
  it('normal sohbette yüzde 20 olasılıkla seçer', () => {
    expect(shouldUseCatalogVoice(['naber'], { voiceEnabled: true, random: () => 0.19 })).toBe(true);
    expect(shouldUseCatalogVoice(['naber'], { voiceEnabled: true, random: () => 0.2 })).toBe(false);
  });
  it('cinsel taleplerde ağırlığı artırır, küfrü talep saymaz', () => {
    expect(shouldUseCatalogVoice(['sexting yapalım mı'], { voiceEnabled: true, random: () => 0.69 })).toBe(true);
    expect(shouldUseCatalogVoice(['sexting yapalım mı'], { voiceEnabled: true, random: () => 0.7 })).toBe(false);
    expect(shouldUseCatalogVoice(['bu ne mk ya'], { voiceEnabled: true, random: () => 0.5 })).toBe(false);
    expect(shouldUseCatalogVoice(['sexting yapalım mı'], { voiceEnabled: true, age: 17, random: () => 0 })).toBe(false);
  });
  it('ses açıkken açık ses isteğini rastgele seçime bırakmaz', () => {
    expect(shouldUseCatalogVoice(['ses at'], { voiceEnabled: true, random: () => 0.99 })).toBe(true);
  });
});

describe('asksForPhoto', () => {
  it('foto isteklerini yakalar', () => {
    expect(asksForPhoto(['foto atar mısın'])).toBe(true);
    expect(asksForPhoto(['Fotoğrafını görebilir miyim'])).toBe(true);
    expect(asksForPhoto(['selfie göndersene'])).toBe(true);
    expect(asksForPhoto(['bi resim at'])).toBe(true);
  });
  it('alakasız mesajları yakalamaz', () => {
    expect(asksForPhoto(['naber'])).toBe(false);
    expect(asksForPhoto(['dün çok güzel bir foto çektim'])).toBe(false);
    expect(asksForPhoto([])).toBe(false);
  });
});

describe('asksForVoice', () => {
  it('ses isteklerini yakalar', () => {
    expect(asksForVoice(['sesini duyabilir miyim'])).toBe(true);
    expect(asksForVoice(['bi ses at'])).toBe(true);
    expect(asksForVoice(['sesli mesaj gönder'])).toBe(true);
  });
  it('alakasız mesajları yakalamaz', () => {
    expect(asksForVoice(['sesin güzelmiş'])).toBe(false);
    expect(asksForVoice(['naber'])).toBe(false);
  });
});

describe('asksForPhoto (üstü kapalı ifade listesi)', () => {
  const phrases = ['seni görmek istiyorum', 'görsene'];
  it('listedeki ifadeyi büyük/küçük harf, Türkçe karakter ve uzatma farkına bakmadan yakalar', () => {
    expect(asksForPhoto(['Seni görmek istiyorum çok'], phrases)).toBe(true);
    expect(asksForPhoto(['seni gormek istiyorum'], phrases)).toBe(true);
    expect(asksForPhoto(['görrrsene bi'], phrases)).toBe(true);
  });
  it('liste boşsa ya da ifade yoksa yakalamaz', () => {
    expect(asksForPhoto(['seni görmek istiyorum'], [])).toBe(false);
    expect(asksForPhoto(['seni görmek hoşuma gider'], phrases)).toBe(false);
    expect(asksForPhoto(['naber'], phrases)).toBe(false);
  });
});

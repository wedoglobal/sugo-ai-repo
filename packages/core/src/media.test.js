import { describe, expect, it } from 'vitest';
import { asksForPhoto, asksForVoice } from './media.js';

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

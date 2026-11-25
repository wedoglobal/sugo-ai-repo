import { describe, expect, it } from 'vitest';
import { onlineGreeting, parseGreetings, pickableGreetings } from './greetings.js';
import { isOnlineNotice } from './events.js';

describe('greetings', () => {
  it('satırları ayrıştırır, yorum ve boşları atar', () => {
    expect(parseGreetings('selam\n# not\n\n  naber  ')).toEqual(['selam', 'naber']);
  });
  it('yakın zamanda gönderilenleri dışarıda bırakır, hepsi kullanıldıysa listeyi korur', () => {
    expect(pickableGreetings(['a', 'b'], ['a'])).toEqual(['b']);
    expect(pickableGreetings(['a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });
  it('sabah şablonlarını profilin saat dilimine göre seçer ve aynı metni tekrar etmez', () => {
    const now = new Date('2026-11-25T06:00:00Z');
    const text = onlineGreeting(now, 'Europe/Istanbul', () => 0);
    expect(text).toBe('günaydın, nasılsın?');
    expect(onlineGreeting(now, 'Europe/Istanbul', () => 0, text)).toBe('günaydın :)');
    expect(onlineGreeting(now, 'America/New_York', () => 0)).toBe('selam, nasılsın?');
  });
  it('çevrim içi sistem bildirimini sohbet metninden ayırır', () => {
    expect(isOnlineNotice('Partner çevrim içi oldu.')).toBe(true);
    expect(isOnlineNotice('[Çevrimiçi]')).toBe(true);
    expect(isOnlineNotice('Partner çevrim içi oldu mu?')).toBe(false);
    expect(isOnlineNotice('çevrim içi misin?')).toBe(false);
  });
});

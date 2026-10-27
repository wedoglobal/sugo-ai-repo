import { describe, expect, it } from 'vitest';
import { createSpeech, pcmToWav } from './speech.js';

describe('pcmToWav', () => {
  it('44 baytlık WAV başlığı ekler', () => {
    const wav = pcmToWav(new Uint8Array([1, 2, 3, 4]));
    expect(wav.length).toBe(48);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(new DataView(wav.buffer).getUint32(40, true)).toBe(4);
  });
});

describe('createSpeech', () => {
  const res = (body, type = 'audio/pcm', status = 200) => async () => new Response(body, { status, headers: { 'content-type': type } });
  it('PCM yanıtı WAV olarak döner', async () => {
    const wav = await createSpeech({ apiKey: 'k', fetchImpl: res(new Uint8Array([1, 2, 3, 4])) })({ model: 'm', input: 'selam', voice: 'Kore' });
    expect(wav.length).toBe(48);
  });
  it('uzun metni ve beklenmeyen biçimi reddeder', async () => {
    await expect(createSpeech({ apiKey: 'k', fetchImpl: res('x') })({ model: 'm', input: 'x'.repeat(301), voice: 'Kore' })).rejects.toThrow();
    await expect(createSpeech({ apiKey: 'k', fetchImpl: res('x', 'application/json') })({ model: 'm', input: 'a', voice: 'Kore' })).rejects.toThrow();
  });
});

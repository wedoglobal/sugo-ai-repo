const URL = 'https://openrouter.ai/api/v1/audio/speech';
const SAMPLE_RATE = 24000;
const MAX_CHARS = 300;
const MAX_BYTES = 3_000_000;

export class SpeechError extends Error {}

/** Panelde sunulan Gemini TTS sesleri: yalnız kadın sesleri. */
export const SPEECH_VOICES = Object.freeze(['Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat']);

/** Sese çevirilecek satırın teslim biçimi: persona tarifi + doğal konuşma. @param {string} [style] */
export function speechInstructions(style = '') {
  const clean = String(style).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 160);
  return ['Speak naturally and briefly, like a person sending a voice message in a chat. Read the text exactly as written. The text is Turkish; pronounce it as a native speaker would.', clean && `Voice character: ${clean}.`].filter(Boolean).join(' ');
}

/** 16-bit mono PCM'i WAV dosyasına sarar. @param {Uint8Array} pcm */
export function pcmToWav(pcm, sampleRate = SAMPLE_RATE) {
  const header = new DataView(new ArrayBuffer(44));
  const text = (/** @type {number} */ o, /** @type {string} */ s) => [...s].forEach((c, i) => header.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); header.setUint32(4, 36 + pcm.length, true); text(8, 'WAVE'); text(12, 'fmt ');
  header.setUint32(16, 16, true); header.setUint16(20, 1, true); header.setUint16(22, 1, true);
  header.setUint32(24, sampleRate, true); header.setUint32(28, sampleRate * 2, true); header.setUint16(32, 2, true); header.setUint16(34, 16, true);
  text(36, 'data'); header.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header.buffer), 0);
  wav.set(pcm, 44);
  return wav;
}

/**
 * OpenRouter metin-ses istemcisi; WAV baytları döner. `fetchImpl` testlerde enjekte edilir.
 * @returns {(req: {model:string, input:string, voice:string, instructions?:string}) => Promise<Uint8Array>}
 */
export function createSpeech({ apiKey, fetchImpl = fetch, timeoutMs = 30000 }) {
  return async function speak({ model, input, voice, instructions }) {
    if (!apiKey) throw new SpeechError('OPENROUTER_API_KEY tanımlı değil');
    if (!input?.trim() || input.length > MAX_CHARS) throw new SpeechError('ses için metin boş veya 300 karakterden uzun');
    const res = await fetchImpl(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Sugo Host' },
      body: JSON.stringify({ model, input, voice, response_format: 'pcm', ...(instructions ? { instructions } : {}) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new SpeechError(`TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const type = res.headers.get('content-type') ?? '';
    if (!/^audio\/pcm/i.test(type)) throw new SpeechError(`TTS beklenmeyen biçim: ${type.slice(0, 60)}`);
    const pcm = new Uint8Array(await res.arrayBuffer());
    if (!pcm.length || pcm.length % 2 || pcm.length > MAX_BYTES) throw new SpeechError('TTS geçersiz ses verisi');
    return pcmToWav(pcm);
  };
}

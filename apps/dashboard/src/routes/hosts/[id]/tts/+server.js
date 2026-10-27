import { error } from '@sveltejs/kit';
import { SPEECH_VOICES, speechInstructions } from '@sugo/core';
import { deps } from '$lib/server/deps.js';

/** Panelde "sesi dinle": kaydedilmemiş ses ve karakterle verilen metni okutur, WAV döner. Hiçbir şey saklanmaz. */
export async function POST({ request }) {
  const b = await request.json().catch(() => null);
  const text = String(b?.text ?? '').trim();
  if (!SPEECH_VOICES.includes(b?.voice)) error(400, 'Geçerli bir ses seç');
  if (!text || text.length > 300) error(400, 'Metin 1-300 karakter olmalı');
  const d = deps();
  try {
    const wav = await d.speech({ model: d.models.speech, input: text, voice: b.voice, instructions: speechInstructions(String(b.voiceStyle ?? '')) });
    return new Response(wav, { headers: { 'content-type': 'audio/wav', 'cache-control': 'no-store' } });
  } catch (e) {
    error(502, e.message);
  }
}

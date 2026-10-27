import { speechInstructions } from './speech.js';

const tokens = (s) => String(s).toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

const PHOTO_NOUNS = ['foto', 'fotoğraf', 'fotograf', 'fotoğrafın', 'fotonu', 'fotun', 'resim', 'resmini', 'resminden', 'selfie', 'selfi', 'görsel', 'pic', 'pp'];
const REQUEST_CUES = ['at', 'atar', 'atarmısın', 'atsana', 'atsan', 'atabilir', 'gönder', 'gönderir', 'göndersene', 'göster', 'göstersene', 'yolla', 'yollasana', 'paylaş', 'görebilir', 'görelim', 'görmek', 'var', 'ister', 'istiyorum'];

/** Karşı tarafın mesajları bir fotoğraf istiyor mu? İsim (foto/resim...) ve istek sözcüğü birlikte aranır. */
export function asksForPhoto(texts) {
  return (Array.isArray(texts) ? texts : []).some((t) => {
    const words = tokens(t);
    const noun = words.some((w) => PHOTO_NOUNS.includes(w) || w.startsWith('fotoğraf') || w.startsWith('fotograf'));
    return noun && words.some((w) => REQUEST_CUES.includes(w));
  });
}

const VOICE_NOUNS = ['ses', 'sesli', 'sesin', 'sesini', 'sesinle', 'sesinden', 'voice'];
const VOICE_CUES = ['at', 'atar', 'atarmısın', 'atsana', 'atsan', 'atabilir', 'gönder', 'göndersene', 'yolla', 'yollasana', 'duyayım', 'duyabilir', 'duymak', 'dinle', 'dinleyeyim', 'dinlemek', 'dinleyebilir', 'kaydet', 'ister', 'istiyorum'];

/** Karşı tarafın mesajları bir ses kaydı istiyor mu? */
export function asksForVoice(texts) {
  return (Array.isArray(texts) ? texts : []).some((t) => {
    const words = tokens(t);
    return words.some((w) => VOICE_NOUNS.includes(w)) && words.some((w) => VOICE_CUES.includes(w));
  });
}

/** Host kataloğundan bu pair'e daha önce gönderilmemiş rastgele bir medya seçer (kind: 'image' | 'audio'); kalmadıysa null. */
export async function pickMedia(db, { hostId, pairId, kind = 'image' }) {
  const { data, error } = await db.from('media').select('id, content_type').eq('host_id', hostId).eq('generated', false);
  if (error) throw new Error(error.message);
  const all = data.filter((m) => m.content_type.startsWith(`${kind}/`));
  const { data: sent, error: err2 } = await db.from('media_sent').select('media_id').eq('pair_id', pairId);
  if (err2) throw new Error(err2.message);
  const used = new Set(sent.map((s) => s.media_id));
  const free = all.filter((m) => !used.has(m.id));
  return free.length ? free[Math.floor(Math.random() * free.length)] : null;
}

/**
 * Metni hostun sesiyle okutup geçici (katalog dışı) bir ses medyası olarak kaydeder; medya id'sini döner.
 * Gönderilince completeJob (ya da test için çağıran) siler.
 */
export async function createSpeechMedia(db, deps, { host, persona, text, label }) {
  const wav = await deps.speech({ model: deps.models.speech, input: text, voice: persona.voice, instructions: speechInstructions(persona.voiceStyle) });
  const path = `${host.id}/tts-${label}-${Date.now()}.wav`;
  const up = await db.storage.from('media').upload(path, wav, { contentType: 'audio/wav' });
  if (up.error) throw new Error(up.error.message);
  const { data, error } = await db.from('media').insert({ host_id: host.id, path, name: 'tts.wav', content_type: 'audio/wav', generated: true }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

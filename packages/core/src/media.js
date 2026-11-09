import { speechInstructions } from './speech.js';

const tokens = (s) => String(s).toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

const PHOTO_NOUNS = ['foto', 'fotoğraf', 'fotograf', 'fotoğrafın', 'fotonu', 'fotun', 'resim', 'resmini', 'resminden', 'selfie', 'selfi', 'görsel', 'pic', 'pp'];
const REQUEST_CUES = ['at', 'atar', 'atarmısın', 'atsana', 'atsan', 'atabilir', 'gönder', 'gönderir', 'göndersene', 'göster', 'göstersene', 'yolla', 'yollasana', 'paylaş', 'görebilir', 'görelim', 'görmek', 'var', 'ister', 'istiyorum'];

const fold = (s) => String(s).toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '').replace(/(\p{L})\1+/gu, '$1').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Mesaj, listedeki ifadelerden birini ardışık sözcükler olarak içeriyor mu? Büyük/küçük harf, Türkçe karakter ve harf uzatması (görsssene) önemsizdir. */
export function matchesPhrase(text, phrases) {
  const words = fold(text);
  return (Array.isArray(phrases) ? phrases : []).some((phrase) => {
    const want = fold(phrase);
    return want.length > 0 && words.some((_, i) => want.every((w, k) => words[i + k] === w));
  });
}

/**
 * Karşı tarafın mesajları bir fotoğraf istiyor mu? İsim (foto/resim...) ve istek sözcüğü birlikte aranır;
 * `phrases` (üstü kapalı istek ifadeleri, dashboard'daki liste) mesajda geçiyorsa da istek sayılır.
 */
export function asksForPhoto(texts, phrases = []) {
  return (Array.isArray(texts) ? texts : []).some((t) => {
    if (matchesPhrase(t, phrases)) return true;
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

/** Açık sesli/görüntülü arama istekleri; arama yerine sesli mesajla devam edilir. */
export function asksForCall(texts) {
  const phrases = ['beni ara', 'beni arasana', 'beni arar mısın', 'arayabilir misin', 'arayalım mı', 'seni arayayım', 'seni arayabilir miyim', 'sesli konuşalım', 'sesli konusalim', 'sesli ara', 'görüntülü ara', 'görüntülü konuşalım', 'aramak istiyorum', 'ara beni'];
  return texts.some((text) => matchesPhrase(text, phrases));
}

/** Hazır sesler normal akışta %20, cinsel talepte %70 olasılıkla seçilir; açık ses isteği önceliklidir. */
export function shouldUseCatalogVoice(texts, { voiceEnabled, random = Math.random, age } = {}) {
  if (!voiceEnabled) return false;
  const intimate = texts.some((text) => /\b(seks|sexting|erotik|cinsel)\b|sevi[şs]|tahrik|azd[ıi]m|soyun/iu.test(text));
  if (intimate && Number(age) > 0 && Number(age) < 18) return false;
  return asksForVoice(texts) || random() < (intimate ? 0.7 : 0.2);
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

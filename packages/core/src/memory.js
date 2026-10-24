import { MEMORY_FIELDS } from './persona.js';

export const TEMP_TTL_MS = 48 * 60 * 60 * 1000;
export const MAX_TEMP_NOTES = 12;
const MIN_CONFIDENCE = 0.6;
const OVERWRITE_CONFIDENCE = 0.8;

/** Extract LLM'ine verilecek mesajlar: sadece karşı tarafın sözlerinden çıkarım yapılır. */
export function buildExtractMessages({ permanent = {}, peerTexts, temp = [] }) {
  const system = [
    'Bir sohbette karşı tarafın mesajlarından bilgi çıkarıyorsun. Sadece JSON döndür.',
    'Şema: {"permanent":{"name":{"value":string,"confidence":0-1}?,"age":{"value":number,"confidence":0-1}?,"residence":...?,"hometown":...?,"job":...?},"temp":[string]}',
    'permanent: SADECE kişinin kendi hakkında açıkça söylediği ad, yaş, yaşadığı yer, memleket, meslek. Tahmin etme; söylenmediyse alanı ekleme.',
    'temp: kısa süreli bağlam (ruh hali, bugün yaptığı/yapacağı şey, konuşulan konu, bir istek). Her biri tek kısa cümle, en fazla 4 madde. Zaten bilinenleri tekrar etme.',
  ].join('\n');
  const user = JSON.stringify({
    knownPermanent: Object.fromEntries(MEMORY_FIELDS.filter((k) => permanent[k]).map((k) => [k, permanent[k].value])),
    knownTemp: temp,
    peerMessages: peerTexts,
  });
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseExtract(text) {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    const obj = JSON.parse(m ? m[0] : text);
    return { permanent: obj.permanent && typeof obj.permanent === 'object' ? obj.permanent : {}, temp: Array.isArray(obj.temp) ? obj.temp : [] };
  } catch {
    return { permanent: {}, temp: [] };
  }
}

/**
 * Çıkarılan kalıcı alanları mevcut hafızaya katar.
 * Yeni değer ancak boş alana (güven >= 0.6) veya yüksek güvenle (>= 0.8) üzerine yazar.
 * @returns {{permanent: object, changed: string[]}}
 */
export function mergePermanent(current = {}, extracted = {}, now = new Date()) {
  const next = { ...current };
  const changed = [];
  for (const field of MEMORY_FIELDS) {
    const e = extracted[field];
    const value = e?.value;
    const confidence = Number(e?.confidence);
    if (value === undefined || value === null || value === '' || !(confidence >= MIN_CONFIDENCE)) continue;
    const v = field === 'age' ? Number(value) : String(value).trim().slice(0, 80);
    if (field === 'age' && !(v >= 13 && v <= 100)) continue;
    if (!v) continue;
    const old = current[field];
    if (old && String(old.value) === String(v)) continue;
    if (old && confidence < OVERWRITE_CONFIDENCE) continue;
    next[field] = { value: v, confidence, updated_at: now.toISOString() };
    changed.push(field);
  }
  return { permanent: next, changed };
}

/** Yeni geçici notları (TTL ile) seçer: boş/çok uzun/mevcutla aynı olanları eler, üst sınırı korur. */
export function newTempNotes(extractedTemp, existingTexts, now = new Date()) {
  const seen = new Set(existingTexts.map((t) => t.toLocaleLowerCase('tr')));
  const room = Math.max(0, MAX_TEMP_NOTES - existingTexts.length);
  const out = [];
  for (const raw of extractedTemp) {
    const text = String(raw ?? '').trim().slice(0, 300);
    const key = text.toLocaleLowerCase('tr');
    if (!text || seen.has(key) || out.length >= Math.min(4, room)) continue;
    seen.add(key);
    out.push({ text, expires_at: new Date(now.getTime() + TEMP_TTL_MS).toISOString() });
  }
  return out;
}

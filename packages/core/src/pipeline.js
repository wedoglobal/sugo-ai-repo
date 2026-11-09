import { buildExtractMessages, mergePermanent, newTempNotes, parseExtract } from './memory.js';
import { buildReplyMessages, cleanReply, detectDisclosures, readPersona, repeatedDisclosures } from './persona.js';
import { applyReplacements } from './filter.js';
import { isGiftText, onlyGifts } from './gift.js';
import { pickableGreetings } from './greetings.js';
import { asksForCall, asksForPhoto, asksForVoice, createSpeechMedia, pickMedia, shouldUseCatalogVoice } from './media.js';
import { queueNudge } from './nudge.js';
import { removeRepetition } from './repetition.js';
import { ROUTINE_PREFIX, routineNow } from './routine.js';
import { isFollowNotice, isIncomingPhoto, isIncomingVoice } from './events.js';

const HISTORY_LIMIT = 20;

export class NotFoundError extends Error {}

function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export const pairId = (hostSugoId, peerSugoId) => `${hostSugoId}-${peerSugoId}`;

export async function getHost(db, sugoId) {
  const host = must(await db.from('hosts').select('*').eq('sugo_id', String(sugoId)).maybeSingle());
  if (!host) throw new NotFoundError(`host ${sugoId} bulunamadı`);
  return host;
}

/** Extension kendi sugo id'sini bildirir; host yoksa oluşturulur, varsa ad güncellenir. */
export async function syncHost(db, sugoId, name = '') {
  const existing = must(await db.from('hosts').select('*').eq('sugo_id', String(sugoId)).maybeSingle());
  if (existing) {
    if (name && name !== existing.name) {
      must(await db.from('hosts').update({ name, updated_at: new Date().toISOString() }).eq('id', existing.id));
    }
    return existing;
  }
  return must(await db.from('hosts').insert({ sugo_id: String(sugoId), name }).select().single());
}

async function ensurePair(db, host, peerSugoId, peerName = '') {
  const id = pairId(host.sugo_id, peerSugoId);
  const row = { id, host_id: host.id, peer_sugo_id: String(peerSugoId), last_activity_at: new Date().toISOString() };
  if (peerName) row.peer_name = peerName;
  must(await db.from('pairs').upsert(row, { onConflict: 'id' }));
  return id;
}

async function hash(s) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** Snapshot mesajlarına kararlı dedupe anahtarı verir (aynı metin+saat tekrarları için sıra numarası eklenir). */
export async function keyedSnapshot(messages) {
  const counts = new Map();
  const out = [];
  for (const m of messages) {
    const base = await hash(`${m.dir}|${m.ts ?? ''}|${m.text}`);
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    out.push({ ...m, key: `${base}#${n}` });
  }
  return out;
}

async function activeJob(db, pair) {
  return must(await db.from('jobs').select('*').eq('pair_id', pair).in('status', ['pending', 'processing']).maybeSingle());
}

async function cancelJob(db, job, reason) {
  must(await db.from('jobs').update({ status: 'failed', error: reason, updated_at: new Date().toISOString() }).eq('id', job.id));
}

/**
 * Extension'ın gönderdiği sohbet görüntüsünü kaydeder, gerekirse iş kuyruğa alıp cevabı üretir.
 * @param {{hostSugoId:string, peerSugoId:string, peerName?:string, voiceEnabled?:boolean, unansweredFrom?:number, messages:{dir:'in'|'out',text:string,ts?:string,diamonds?:number}[]}} input
 */
export async function ingest(db, deps, input) {
  const host = await getHost(db, input.hostSugoId);
  if (host.active === false) return { pairId: pairId(host.sugo_id, input.peerSugoId), job: null, paused: true };
  const pair = await ensurePair(db, host, input.peerSugoId, input.peerName);
  const state = must(await db.from('pairs').select('reply_disabled_reason').eq('id', pair).single());
  if (state.reply_disabled_reason) return { pairId: pair, job: null, ignored: state.reply_disabled_reason };
  must(await db.from('pairs').update({ delivery_retry_at: null }).eq('id', pair));
  if (typeof input.voiceEnabled === 'boolean') must(await db.from('pairs').update({ voice_enabled: input.voiceEnabled }).eq('id', pair));
  const snap = await keyedSnapshot(input.messages.filter((m) => (m.dir === 'in' || m.dir === 'out') && m.text?.trim()));

  const existing = must(await db.from('messages').select('id, dedupe_key, direction, text, sugo_ts, diamonds').eq('pair_id', pair));
  const known = new Map(existing.map((m) => [m.dedupe_key, m]));
  const unsyncedOut = existing.filter((m) => m.direction === 'out' && m.sugo_ts == null);

  const lastOut = snap.map((m) => m.dir).lastIndexOf('out');
  let newIn = 0;
  const answeredKeys = [];
  const unansweredKeys = [];
  for (const [i, m] of snap.entries()) {
    const forcedUnread = m.dir === 'in' && Number.isInteger(input.unansweredFrom) && input.unansweredFrom >= 0 && i >= input.unansweredFrom;
    const notice = m.dir === 'in' && isFollowNotice(m.text);
    const answered = notice || (!forcedUnread && (m.dir === 'out' || i < lastOut));
    if (forcedUnread && !notice) unansweredKeys.push(m.key);
    // Kayıtlı ama henüz cevaplanmamış mesajı DOM'daki sonraki bir out yüzünden kapatma.
    // Botun gönderim onayı yalnız covers_until içindeki mesajları completeJob ile kapatır.
    if (m.dir === 'in' && answered && (notice || !known.has(m.key))) answeredKeys.push(m.key);
    const diamonds = m.dir === 'out' && m.diamonds > 0 ? Math.floor(m.diamonds) : 0;
    const diamondFields = diamonds ? { diamonds, diamonds_at: new Date().toISOString() } : {};
    const seen = known.get(m.key);
    if (seen) {
      if (forcedUnread && !notice) newIn++;
      if (diamonds && seen.diamonds !== diamonds) must(await db.from('messages').update(seen.diamonds ? { diamonds } : diamondFields).eq('id', seen.id));
      continue;
    }
    if (m.dir === 'out') {
      const idx = unsyncedOut.findIndex((u) => u.text.trim() === m.text.trim());
      if (idx >= 0) {
        const [u] = unsyncedOut.splice(idx, 1);
        must(await db.from('messages').update({ dedupe_key: m.key, sugo_ts: m.ts ?? '', ...diamondFields }).eq('id', u.id));
        continue;
      }
    }
    must(await db.from('messages').insert({
      pair_id: pair, direction: m.dir, text: m.text.trim().slice(0, 4000), dedupe_key: m.key,
      sugo_ts: m.ts ?? '', handled: answered, ...diamondFields,
    }));
    if (m.dir === 'in' && !answered) newIn++;
  }
  if (answeredKeys.length) {
    must(await db.from('messages').update({ handled: true }).eq('pair_id', pair).eq('direction', 'in').in('dedupe_key', answeredKeys));
  }
  if (unansweredKeys.length) {
    must(await db.from('messages').update({ handled: false }).eq('pair_id', pair).eq('direction', 'in').in('dedupe_key', unansweredKeys));
  }

  const unread = must(await db.from('messages').select('id', { count: 'exact', head: false }).eq('pair_id', pair).eq('direction', 'in').eq('handled', false));
  const total = must(await db.from('messages').select('id').eq('pair_id', pair).limit(1));
  let job = await activeJob(db, pair);

  if (unread.length === 0 && job?.status === 'pending' && job.kind === 'reply') {
    await cancelJob(db, job, 'cevaplanacak mesaj kalmadı');
    job = null;
  }

  let needsGeneration = false;
  if (unread.length > 0) {
    if (!job) {
      job = must(await db.from('jobs').insert({ pair_id: pair, host_id: host.id, kind: 'reply' }).select().single());
      needsGeneration = true;
    } else if (job.status === 'pending' && (job.kind !== 'reply' || newIn > 0 || (!job.reply_text && Date.now() - Date.parse(job.updated_at || job.created_at) > 180000))) {
      // Gelen gerçek mesaj, henüz gönderilmemiş selam veya dürtmenin yerini alır.
      must(await db.from('jobs').update({ kind: 'reply', reply_text: null, media_id: null, send_text: true, error: null, updated_at: new Date().toISOString() }).eq('id', job.id));
      job = { ...job, kind: 'reply' };
      needsGeneration = true;
    }
  } else if (total.length === 0 && !job) {
    job = must(await db.from('jobs').insert({ pair_id: pair, host_id: host.id, kind: 'welcome' }).select().single());
    needsGeneration = true;
  } else if (total.length === 0 && job?.kind === 'welcome' && job.status === 'pending' && !job.reply_text
    && Date.now() - Date.parse(job.updated_at || job.created_at) > 180000) {
    must(await db.from('jobs').update({ error: null, updated_at: new Date().toISOString() }).eq('id', job.id));
    needsGeneration = true;
  }

  if (!job) return { pairId: pair, job: null };
  if (!needsGeneration) return { pairId: pair, job: { id: job.id, status: job.status, kind: job.kind } };
  const result = await generateSafely(db, deps, job.id);
  return { pairId: pair, job: { ...result.job, kind: job.kind } };
}

async function generateSafely(db, deps, jobId) {
  try {
    const reply = await generate(db, deps, jobId);
    return { job: { id: jobId, status: 'pending', reply } };
  } catch (e) {
    must(await db.from('jobs').update({ status: 'failed', error: String(e.message).slice(0, 500), updated_at: new Date().toISOString() }).eq('id', jobId));
    return { job: { id: jobId, status: 'failed', error: e.message } };
  }
}

const tokens = (s) => new Set(String(s).toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2));

/** Basit sözcük örtüşmesiyle ilgili knowledge girdilerini seçer. */
export function relevantKnowledge(entries, text, limit = 3) {
  const q = tokens(text);
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && e.active !== false && e.content && !String(e.title ?? '').startsWith(ROUTINE_PREFIX))
    .map((e) => ({ e, score: [...tokens(`${e.title ?? ''} ${e.content}`)].filter((t) => q.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => `${x.e.title ? `${x.e.title}: ` : ''}${String(x.e.content).slice(0, 400)}`);
}

async function loadContext(db, pair, now) {
  must(await db.from('temp_context').delete().eq('pair_id', pair.id).lt('expires_at', now.toISOString()));
  const temp = must(await db.from('temp_context').select('text').eq('pair_id', pair.id).gt('expires_at', now.toISOString()).order('id'));
  return temp.map((t) => t.text);
}

async function extractMemory(db, deps, pair, unreadTexts, now) {
  const tempTexts = await loadContext(db, pair, now);
  try {
    const raw = await deps.llm({
      model: deps.models.extract, temperature: 0, json: true, maxTokens: 500, thinkTokens: 200,
      messages: buildExtractMessages({ permanent: pair.permanent, peerTexts: unreadTexts, temp: tempTexts }),
    });
    const ex = parseExtract(raw);
    const { permanent, changed } = mergePermanent(pair.permanent, ex.permanent, now);
    if (changed.length) must(await db.from('pairs').update({ permanent }).eq('id', pair.id));
    const notes = newTempNotes(ex.temp, tempTexts, now);
    if (notes.length) must(await db.from('temp_context').insert(notes.map((n) => ({ ...n, pair_id: pair.id }))));
    return { permanent, changed, notes: notes.map((n) => n.text) };
  } catch {
    return { permanent: pair.permanent, changed: [], notes: [] };
  }
}

/**
 * Job için cevap üretir ve `jobs.reply_text`e yazar. Hafızayı da günceller.
 * `rejected`: sugo filtresi bu metni reddetti; aynı konuda filtreye takılmayacak sade bir cevap üretilir.
 */
export async function generate(db, deps, jobId, { rejected = '' } = {}) {
  const now = deps.now?.() ?? new Date();
  const job = must(await db.from('jobs').select('*').eq('id', jobId).single());
  const host = must(await db.from('hosts').select('*').eq('id', job.host_id).single());
  let pair = must(await db.from('pairs').select('*').eq('id', job.pair_id).single());
  if (pair.reply_disabled_reason) throw new Error(`yanıt dışı: ${pair.reply_disabled_reason}`);
  const persona = readPersona(host.persona);

  const unreadRows = must(await db.from('messages').select('id, text').eq('pair_id', pair.id).eq('direction', 'in').eq('handled', false).order('id'));
  const unread = unreadRows.map((m) => m.text);
  if (job.kind === 'reply' && unread.length === 0) throw new Error('cevaplanacak mesaj yok');

  // Hafıza çıkarma bağlam yüklenirken çalışır; cevap yalnız güncel hafızayla üretilir.
  const memoryTexts = unread.filter((text) => !isFollowNotice(text) && !isIncomingPhoto(text) && !isIncomingVoice(text));
  const memory = job.kind === 'reply' && !rejected && !onlyGifts(unread) && memoryTexts.length
    ? extractMemory(db, deps, pair, memoryTexts, now).catch(() => null)
    : null;

  let temp = await loadContext(db, pair, now);
  const history = must(await db.from('messages').select('direction, text').eq('pair_id', pair.id).eq('handled', true).order('id', { ascending: false }).limit(HISTORY_LIMIT)).reverse();
  let avoid = [];
  if (job.kind === 'welcome') {
    avoid = must(await db.from('messages').select('text').like('pair_id', `${host.sugo_id}-%`).eq('direction', 'out').order('id', { ascending: false }).limit(15)).map((m) => m.text);
  }
  const shared = must(await db.from('app_settings').select('value').eq('key', 'knowledge').maybeSingle());
  const knowledge = relevantKnowledge([...(Array.isArray(shared?.value) ? shared.value : []), ...(Array.isArray(host.knowledge) ? host.knowledge : [])], unread.join(' '));

  const rules = must(await db.from('app_settings').select('value').eq('key', 'replacements').maybeSingle())?.value;
  const personaRules = must(await db.from('app_settings').select('value').eq('key', 'persona_rules').maybeSingle())?.value;
  const routine = routineNow(host.knowledge, now, persona.timeZone);
  const mem = await memory;
  if (mem && (mem.changed.length || mem.notes.length)) {
    pair = { ...pair, permanent: mem.permanent };
    temp = await loadContext(db, pair, now);
  }

  let mediaId = null;
  let mediaRule = '';
  const canSpeak = !!(deps.speech && persona.voice);
  const gifted = unread.some(isGiftText);
  if (job.kind === 'reply' && onlyGifts(unread)) {
    // Hediyeye ortak hazır teşekkürlerden biri gider: sesli mesaj açıksa hostun sesiyle okunur, değilse (varsa) fotoğrafla yazıyla.
    const thanks = must(await db.from('app_settings').select('value').eq('key', 'gift_thanks').maybeSingle())?.value;
    const recent = must(await db.from('messages').select('text').like('pair_id', `${host.sugo_id}-%`).eq('direction', 'out').order('id', { ascending: false }).limit(15)).map((m) => m.text);
    const texts = pickableGreetings(thanks, recent);
    if (texts.length) {
      const random = deps.random ?? Math.random;
      const text = texts[Math.floor(random() * texts.length)];
      let voiceId = null;
      if (canSpeak && pair.voice_enabled) {
        try {
          voiceId = await createSpeechMedia(db, deps, { host, persona, text, label: String(jobId) });
        } catch {
          voiceId = null;
        }
      }
      const photo = voiceId ? null : await pickMedia(db, { hostId: host.id, pairId: pair.id, kind: 'image' });
      const coversUntil = unreadRows[unreadRows.length - 1].id;
      must(await db.from('jobs').update({ reply_text: text, media_id: voiceId ?? photo?.id ?? null, send_text: !voiceId, covers_until: coversUntil, error: null, updated_at: now.toISOString() }).eq('id', jobId));
      return text;
    }
  }
  if (gifted) mediaRule = 'Karşı taraf sana hediye gönderdi: kısaca ve samimi şekilde teşekkür et; hediyenin fiyatından ya da elmasından söz etme.';
  const photoPhrases = job.kind === 'reply' ? must(await db.from('app_settings').select('value').eq('key', 'photo_triggers').maybeSingle())?.value : [];
  const callRequested = job.kind === 'reply' && asksForCall(unread);
  const wanted = job.kind !== 'reply' ? null : callRequested ? 'audio' : asksForPhoto(unread, photoPhrases) ? 'image' : asksForVoice(unread) ? 'audio' : null;
  const photoReceived = unread.some(isIncomingPhoto);
  const voiceReceived = unread.some(isIncomingVoice);
  const useCatalogVoice = job.kind === 'reply' && !rejected && !gifted && !photoReceived && !voiceReceived && wanted !== 'image'
    && shouldUseCatalogVoice(unread, { voiceEnabled: pair.voice_enabled, random: deps.random, age: pair.permanent?.age?.value });
  if (wanted) {
    const media = wanted === 'audio' && !pair.voice_enabled ? null : await pickMedia(db, { hostId: host.id, pairId: pair.id, kind: wanted });
    mediaId = media?.id ?? null;
    const [what, note] = wanted === 'image' ? ['fotoğraf', 'al bakalım'] : ['ses kaydı', 'al dinle'];
    if (media) mediaRule = `Karşı taraf ${what} istedi ve ${what}nı hemen ardından ayrıca gönderiyorsun: tek mesajlık, çok kısa (en fazla 60 karakter), cilveli ya da tatlı bir not yaz (örn. "${note}"); soru sorma, ${what}nın içeriğini tarif etme.`;
    else if (wanted === 'audio' && canSpeak && pair.voice_enabled) mediaRule = 'Karşı taraf ses istedi; cevabını sesli mesaj olarak göndereceksin: en fazla 120 karakter, emoji ve yazıyla gülme (hahaha, jsjs) kullanma, konuşur gibi yaz.';
    else mediaRule = `Karşı taraf ${what} istedi ama gönderemezsin: göndereceğini söyleme, doğal şekilde konuyu geçiştir.`;
  }
  if (useCatalogVoice && !wanted) {
    const voice = await pickMedia(db, { hostId: host.id, pairId: pair.id, kind: 'audio' });
    mediaId = voice?.id ?? null;
    if (voice) mediaRule = 'Cevabına ek olarak hazır bir ses kaydı gönderiliyor. Yeni mesaja normal kısa cevap ver; ses kaydının içeriğini tarif etme veya ses göndereceğini vaat etme.';
  }
  if (callRequested) {
    mediaRule = pair.voice_enabled && (mediaId || canSpeak)
      ? 'Karşı taraf arama istiyor. Kısaca "bilgisayardan giriyorum, burada arama yok ama ses atarım" anlamında yaz. Ardından gerçekten sesli mesaj gönderilecek. Arama yapacağını veya aramayı açacağını söyleme.'
      : 'Karşı taraf arama istiyor. Bilgisayardan girdiğini ve burada arama olmadığını kısaca söyle; yazışarak devam etmeyi öner. Ses gönderemiyorsun: ses atacağını söyleme.';
  }
  if (photoReceived) mediaRule += ' Karşı taraf fotoğraf gönderdi: kısaca "çok yakışıklısın" gibi sıcak bir övgü ekle. Görselin içeriği analiz edilmedi; vücut, kıyafet veya ortam ayrıntısı uydurma.';
  if (voiceReceived) mediaRule += ' Karşı taraf sesli mesaj gönderdi, fakat sesin içeriği bilinmiyor ve dökümü yok. Yalnız önceki yazışmada kesin olarak bilinen bağlama dayanarak kısa karşılık verebiliyorsan devam et. Sesi duymuş veya ne dediğini biliyormuş gibi davranma; anlaşılır bir karşılık veremiyorsan "şu an dinleyemiyorum aşkım, yazsana" gibi yazmasını iste.';

  if (job.kind === 'welcome') {
    const greetings = must(await db.from('app_settings').select('value').eq('key', 'greetings').maybeSingle())?.value;
    const texts = pickableGreetings(greetings, avoid);
    if (texts.length) {
      const random = deps.random ?? Math.random;
      const text = texts[Math.floor(random() * texts.length)];
      must(await db.from('jobs').update({ reply_text: text, media_id: null, send_text: true, covers_until: null, error: null, updated_at: now.toISOString() }).eq('id', jobId));
      return text;
    }
  }

  const rejectedRule = rejected
    ? `Son mesajın sugo'nun filtresine takıldı ve gönderilemedi: "${String(rejected).slice(0, 300)}". Aynı konuya uygun, kısa ve sade bir geçiş cümlesi yaz; telefon, link, sosyal medya hesabı, para, adres, buluşma ayrıntısı ve küfür içermesin, önceki mesajı tekrarlama.`
    : '';
  const ask = async (retryRule) => cleanReply(removeRepetition(applyReplacements(await deps.llm({
    model: host.model || deps.models.chat, temperature: 0.9, maxTokens: 150, thinkTokens: 0,
    messages: buildReplyMessages({ kind: job.kind, persona, permanent: pair.permanent, disclosed: pair.disclosed, temp, history, unread, avoid, knowledge, now, extraRule: [mediaRule, rejectedRule, retryRule].filter(Boolean).join(' '), routine, rules: Array.isArray(personaRules) ? personaRules : [] }),
  }), rules), persona, history, unread));

  const produce = async () => {
    let r = await ask('');
    const repeated = r ? repeatedDisclosures(r, pair.disclosed, unread) : [];
    if (!r || repeated.length) {
      const retry = await ask(!r ? 'Önceki deneme geçersizdi: tek satır, düz metin, en fazla 300 karakter yaz.' : `Bu bilgileri tekrar etme: ${repeated.join(', ')}.`);
      if (retry && !repeatedDisclosures(retry, pair.disclosed, unread).length) r = retry;
      else if (!r) r = retry;
    }
    return r;
  };
  const callReply = callRequested && !rejected ? cleanReply(applyReplacements(
    pair.voice_enabled && (mediaId || canSpeak)
      ? 'bilgisayardan giriyorum, burada arama yok ama ses atarım'
      : 'bilgisayardan giriyorum, burada arama yok; buradan yazışalım', rules,
  )) : null;
  const photoOnly = photoReceived && unread.every((text) => isIncomingPhoto(text) || isFollowNotice(text));
  const compliments = pickableGreetings(['çok yakışıklısın ya 😊', 'iyi çıkmışsın, hoşuma gitti 😊', 'fotoğrafın çok hoş 😊', 'yakışıklıymışsın sen 😊'], history.filter((m) => m.direction === 'out').map((m) => m.text));
  const photoReply = photoOnly && !rejected ? cleanReply(applyReplacements(compliments[Math.floor((deps.random ?? Math.random)() * compliments.length)], rules)) : null;
  const voiceFallback = cleanReply(applyReplacements('şu an dinleyemiyorum aşkım, yazsana', rules)) || 'şu an dinleyemiyorum, yazar mısın';
  const hasTextContext = history.some((m) => m.text && !isFollowNotice(m.text) && !/^\[(?:gelen|gönderilen) (?:ses|fotoğraf):/u.test(m.text));
  const voiceOnly = voiceReceived && unread.every((text) => isIncomingVoice(text) || isFollowNotice(text));
  let reply = callReply || photoReply || (voiceOnly && !hasTextContext ? voiceFallback : voiceReceived ? (await produce().catch(() => null)) || voiceFallback : await produce());
  if (!reply) throw new Error('model kullanılabilir bir cevap üretemedi');

  let sendText = true;
  if (wanted === 'audio' && !mediaId && canSpeak && pair.voice_enabled) {
    try {
      mediaId = await createSpeechMedia(db, deps, { host, persona, text: reply, label: String(jobId) });
      sendText = callRequested;
    } catch {
      mediaId = null;
      if (callRequested) reply = 'bilgisayardan giriyorum, burada arama yok; buradan yazışalım';
    }
  }

  const coversUntil = unreadRows.length ? unreadRows[unreadRows.length - 1].id : null;
  must(await db.from('jobs').update({ reply_text: reply, media_id: mediaId, send_text: sendText, covers_until: coversUntil, error: null, updated_at: now.toISOString() }).eq('id', jobId));
  return reply;
}

/** Sugo filtresi gönderilen metni reddetti: aynı konuda filtreye takılmayacak yedek cevabı üretip job'a yazar. */
export async function rejectJob(db, deps, jobId, rejectedText = '') {
  const job = must(await db.from('jobs').select('id, status').eq('id', jobId).single());
  if (job.status === 'done' || job.status === 'failed') throw new Error('job zaten kapandı');
  return generate(db, deps, jobId, { rejected: rejectedText || ' ' });
}

/** Cevap gönderildi: out mesajını kaydeder, okunmamışları işlenmiş sayar, söylenen bilgileri işler. */
export async function completeJob(db, jobId) {
  const job = must(await db.from('jobs').select('*').eq('id', jobId).single());
  if (job.status === 'done') return job;
  if (!job.reply_text) throw new Error('job için cevap yok');
  const host = must(await db.from('hosts').select('persona').eq('id', job.host_id).single());
  const pair = must(await db.from('pairs').select('disclosed').eq('id', job.pair_id).single());
  must(await db.from('messages').upsert({ pair_id: job.pair_id, direction: 'out', text: job.reply_text, dedupe_key: `sent#${job.id}`, sugo_ts: null, handled: true }, { onConflict: 'pair_id,dedupe_key', ignoreDuplicates: true }));
  if (job.covers_until) {
    must(await db.from('messages').update({ handled: true }).eq('pair_id', job.pair_id).eq('direction', 'in').lte('id', job.covers_until));
  }
  const disclosed = { ...pair.disclosed, ...detectDisclosures(job.reply_text, readPersona(host.persona).facts) };
  if (job.media_id) {
    const media = must(await db.from('media').select('path, generated').eq('id', job.media_id).single());
    if (media.generated) {
      await db.storage.from('media').remove([media.path]);
      must(await db.from('media').delete().eq('id', job.media_id));
    } else {
      must(await db.from('media_sent').upsert({ pair_id: job.pair_id, media_id: job.media_id }, { onConflict: 'pair_id,media_id', ignoreDuplicates: true }));
    }
  }
  must(await db.from('pairs').update({ disclosed, last_activity_at: new Date().toISOString(), ...(job.kind === 'nudge' ? { nudged_at: new Date().toISOString() } : {}) }).eq('id', job.pair_id));
  return must(await db.from('jobs').update({ status: 'done', locked_until: null, updated_at: new Date().toISOString() }).eq('id', jobId).select().single());
}

export async function failJob(db, jobId, error = '') {
  const job = must(await db.from('jobs').select('pair_id, status').eq('id', jobId).single());
  if (job.status === 'done') return;
  must(await db.from('jobs').update({ status: 'failed', error: String(error).slice(0, 500), locked_until: null, updated_at: new Date().toISOString() }).eq('id', jobId).neq('status', 'done'));
  if (String(error).startsWith('sohbet listede yok:')) {
    must(await db.from('pairs').update({ delivery_retry_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq('id', job.pair_id));
  }
}

/** Extension için sıradaki hazır cevabı kilitleyerek verir. */
export async function nextJob(db, hostSugoId, deps, { replyOnly = false, visiblePeerIds = null } = {}) {
  const host = await getHost(db, hostSugoId);
  if (host.active === false) return null;
  const visiblePairIds = Array.isArray(visiblePeerIds) ? [...new Set(visiblePeerIds)].slice(0, 1000).map((id) => pairId(host.sugo_id, id)) : null;
  if (visiblePairIds?.length === 0) return null;
  if (deps && !replyOnly) await queueNudge(db, deps, host, undefined, { visiblePairIds }).catch(() => null);
  let recovered = false;
  for (;;) {
    const rows = must(await db.rpc(visiblePairIds ? 'claim_available_job' : replyOnly ? 'claim_next_reply_job' : 'claim_next_job',
      visiblePairIds ? { p_host: host.id, p_pair_ids: visiblePairIds, p_reply_only: replyOnly } : { p_host: host.id }));
    const job = rows?.[0];
    if (!job) {
      if (!replyOnly || !deps || recovered) return null;
      recovered = true;
      const repair = must(await db.rpc(visiblePairIds ? 'queue_available_reply' : 'queue_unanswered_reply',
        visiblePairIds ? { p_host: host.id, p_pair_ids: visiblePairIds } : { p_host: host.id }))?.[0];
      if (!repair) return null;
      const previous = must(await db.from('jobs').select('reply_text, media_id, send_text, covers_until')
        .eq('pair_id', repair.pair_id).eq('kind', 'reply').eq('status', 'failed').not('reply_text', 'is', null).order('id', { ascending: false }).limit(1))?.[0];
      const lastUnread = must(await db.from('messages').select('id').eq('pair_id', repair.pair_id)
        .eq('direction', 'in').eq('handled', false).order('id', { ascending: false }).limit(1))?.[0];
      if (previous && lastUnread && previous.covers_until >= lastUnread.id) {
        // Gönderim hatasında aynı cevap yeniden kullanılır; yeni mesaj varsa güncel cevap üretilir.
        must(await db.from('jobs').update({ ...previous, updated_at: new Date().toISOString() }).eq('id', repair.id));
      } else {
        const result = await generateSafely(db, deps, repair.id);
        if (result.job.status === 'failed') return null;
      }
      continue;
    }
    const pair = must(await db.from('pairs').select('peer_sugo_id, peer_name, voice_enabled, reply_disabled_reason').eq('id', job.pair_id).single());
    if (pair.reply_disabled_reason) {
      await failJob(db, job.id, `yanıt dışı: ${pair.reply_disabled_reason}`);
      continue;
    }
    const incoming = must(await db.from('messages').select('id, dedupe_key, handled').eq('pair_id', job.pair_id).eq('direction', 'in'));
    if (job.kind === 'reply' && !incoming.some((m) => !m.handled)) {
      await cancelJob(db, job, 'mesajlar zaten cevaplandı');
      continue;
    }
    if (job.kind !== 'reply' && incoming.some((m) => !m.handled)) {
      await cancelJob(db, job, 'yeni gelen mesaja cevap öncelikli');
      continue;
    }
    if (job.media_id) {
      const media = must(await db.from('media').select('content_type, generated').eq('id', job.media_id).single());
      if (media.content_type.startsWith('audio/')) {
        // Önceden kuyruğa alınmış sesli dürtmeler de gönderilmez.
        if (job.kind === 'nudge') {
          await failJob(db, job.id, 'sesli dürtme kapalı');
          continue;
        }
        // Tamamlama isteği kaybolsa bile aynı klip tekrar verilmesin: teslimden önce atomik tüket.
        const claimed = pair.voice_enabled && (media.generated || must(await db.from('media_sent')
          .upsert({ pair_id: job.pair_id, media_id: job.media_id }, { onConflict: 'pair_id,media_id', ignoreDuplicates: true }).select('media_id')).length > 0);
        if (!claimed) {
          job.media_id = null;
          job.send_text = true;
          if (/ses|dinle|arama/iu.test(job.reply_text)) job.reply_text = 'şimdilik buradan yazışalım';
          must(await db.from('jobs').update({ media_id: null, send_text: true, reply_text: job.reply_text }).eq('id', job.id));
        }
      }
    }
    // Dürtme/karşılamanın covers_until değeri boş olabilir; cevaplanmış geçmiş yine kapsanır.
    const coveredKeys = incoming.filter((m) => m.handled || (job.covers_until && m.id <= job.covers_until)).map((m) => m.dedupe_key);
    return { id: job.id, kind: job.kind, pairId: job.pair_id, peerSugoId: pair.peer_sugo_id, peerName: pair.peer_name, text: job.reply_text, mediaId: job.media_id, sendText: job.send_text, coveredKeys };
  }
}

/** Kadın/engelli sohbetler kalıcı dışlanır; takip ve aktivite olayları gerçek okunmamış mesajı kapatmaz. */
export async function ignorePair(db, { hostSugoId, peerSugoId, reason }) {
  if (!['female', 'blocked', 'follow', 'activity'].includes(reason)) throw new Error('geçersiz atlama nedeni');
  const host = await getHost(db, hostSugoId);
  const id = await ensurePair(db, host, peerSugoId);
  if (['female', 'blocked'].includes(reason)) {
    must(await db.from('pairs').update({ reply_disabled_reason: reason }).eq('id', id));
    must(await db.from('messages').update({ handled: true }).eq('pair_id', id).eq('direction', 'in').eq('handled', false));
  } else {
    const unread = must(await db.from('messages').select('id, text').eq('pair_id', id).eq('direction', 'in').eq('handled', false));
    const notices = unread.filter((m) => isFollowNotice(m.text)).map((m) => m.id);
    if (notices.length) must(await db.from('messages').update({ handled: true }).eq('pair_id', id).in('id', notices));
    if (unread.some((m) => !isFollowNotice(m.text))) return { pairId: id, ignored: null };
  }
  must(await db.from('jobs').update({ status: 'failed', error: `yanıt dışı: ${reason}`, locked_until: null, updated_at: new Date().toISOString() }).eq('pair_id', id).in('status', ['pending', 'processing']));
  return { pairId: id, ignored: reason };
}

/** Eklentinin job oluşmadan önceki okuma/iletişim hatalarını kuyrukta görünür yapar. */
export async function reportExtensionError(db, { hostSugoId, peerSugoId, error }) {
  const host = await getHost(db, hostSugoId);
  const pair = await ensurePair(db, host, peerSugoId);
  return must(await db.from('jobs').insert({
    pair_id: pair, host_id: host.id, kind: 'reply', status: 'failed',
    error: `eklenti: ${String(error).slice(0, 450)}`,
  }).select('id').single());
}

/** Başarısız job'ı yeniden üretir (dashboard "tekrar dene"). */
export async function retryJob(db, deps, jobId) {
  const job = must(await db.from('jobs').select('*').eq('id', jobId).single());
  if (job.kind === 'nudge') throw new Error('dürtme tekrar denenmez; kişi cevap verince yeniden oluşur');
  if (await activeJob(db, job.pair_id)) throw new Error('bu pair için zaten aktif bir job var');
  const fresh = must(await db.from('jobs').insert({ pair_id: job.pair_id, host_id: job.host_id, kind: job.kind }).select().single());
  return generateSafely(db, deps, fresh.id);
}

/**
 * Playground: sugo'ya hiçbir şey gitmeden bir gelen mesaj simüle edilir, cevap üretilir ve "gönderilmiş" sayılır.
 * @returns {{reply:string, memoryBefore:object, memoryAfter:object, temp:string[], pairId:string}}
 */
export async function playgroundTurn(db, deps, { hostSugoId, peerSugoId, peerName = '', text }) {
  const host = await getHost(db, hostSugoId);
  const pair = await ensurePair(db, host, peerSugoId, peerName);
  const before = must(await db.from('pairs').select('permanent, disclosed').eq('id', pair).single());
  const stale = await activeJob(db, pair);
  if (stale) await cancelJob(db, stale, 'playground');

  let kind = 'reply';
  if (text?.trim()) {
    must(await db.from('messages').insert({ pair_id: pair, direction: 'in', text: text.trim().slice(0, 4000), dedupe_key: `pg#${Date.now()}-${Math.random().toString(36).slice(2)}`, sugo_ts: '', handled: false }));
  } else {
    const any = must(await db.from('messages').select('id').eq('pair_id', pair).limit(1));
    if (any.length) throw new Error('mesaj boş olamaz');
    kind = 'welcome';
  }
  const job = must(await db.from('jobs').insert({ pair_id: pair, host_id: host.id, kind }).select().single());
  const res = await generateSafely(db, deps, job.id);
  if (res.job.status === 'failed') throw new Error(res.job.error);
  await completeJob(db, job.id);
  const after = must(await db.from('pairs').select('permanent, disclosed').eq('id', pair).single());
  const temp = await loadContext(db, { id: pair }, deps.now?.() ?? new Date());
  return { pairId: pair, reply: res.job.reply, memoryBefore: before, memoryAfter: after, temp };
}

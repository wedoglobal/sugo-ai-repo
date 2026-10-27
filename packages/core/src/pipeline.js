import { buildExtractMessages, mergePermanent, newTempNotes, parseExtract } from './memory.js';
import { buildReplyMessages, cleanReply, detectDisclosures, readPersona, repeatedDisclosures } from './persona.js';
import { applyReplacements } from './filter.js';
import { isGiftText, onlyGifts } from './gift.js';
import { pickableGreetings } from './greetings.js';
import { asksForPhoto, asksForVoice, createSpeechMedia, pickMedia } from './media.js';
import { queueNudge } from './nudge.js';
import { removeRepetition } from './repetition.js';
import { ROUTINE_PREFIX, routineNow } from './routine.js';

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
 * @param {{hostSugoId:string, peerSugoId:string, peerName?:string, voiceEnabled?:boolean, messages:{dir:'in'|'out',text:string,ts?:string}[]}} input
 */
export async function ingest(db, deps, input) {
  const host = await getHost(db, input.hostSugoId);
  const pair = await ensurePair(db, host, input.peerSugoId, input.peerName);
  if (typeof input.voiceEnabled === 'boolean') must(await db.from('pairs').update({ voice_enabled: input.voiceEnabled }).eq('id', pair));
  const snap = await keyedSnapshot(input.messages.filter((m) => (m.dir === 'in' || m.dir === 'out') && m.text?.trim()));

  const existing = must(await db.from('messages').select('id, dedupe_key, direction, text, sugo_ts').eq('pair_id', pair));
  const known = new Set(existing.map((m) => m.dedupe_key));
  const unsyncedOut = existing.filter((m) => m.direction === 'out' && m.sugo_ts == null);

  const lastOut = snap.map((m) => m.dir).lastIndexOf('out');
  let newIn = 0;
  const answeredKeys = [];
  for (const [i, m] of snap.entries()) {
    const answered = m.dir === 'out' || i < lastOut;
    if (m.dir === 'in' && answered) answeredKeys.push(m.key);
    if (known.has(m.key)) continue;
    if (m.dir === 'out') {
      const idx = unsyncedOut.findIndex((u) => u.text.trim() === m.text.trim());
      if (idx >= 0) {
        const [u] = unsyncedOut.splice(idx, 1);
        must(await db.from('messages').update({ dedupe_key: m.key, sugo_ts: m.ts ?? '' }).eq('id', u.id));
        continue;
      }
    }
    must(await db.from('messages').insert({
      pair_id: pair, direction: m.dir, text: m.text.trim().slice(0, 4000), dedupe_key: m.key,
      sugo_ts: m.ts ?? '', handled: answered,
    }));
    if (m.dir === 'in' && !answered) newIn++;
  }
  if (answeredKeys.length) {
    must(await db.from('messages').update({ handled: true }).eq('pair_id', pair).eq('direction', 'in').in('dedupe_key', answeredKeys));
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
    } else if (job.status === 'pending' && newIn > 0) {
      must(await db.from('jobs').update({ reply_text: null, error: null }).eq('id', job.id));
      needsGeneration = true;
    }
  } else if (total.length === 0 && !job) {
    job = must(await db.from('jobs').insert({ pair_id: pair, host_id: host.id, kind: 'welcome' }).select().single());
    needsGeneration = true;
  }

  if (!job) return { pairId: pair, job: null };
  if (!needsGeneration) return { pairId: pair, job: { id: job.id, status: job.status, kind: job.kind } };
  return { pairId: pair, ...(await generateSafely(db, deps, job.id)) };
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
      model: deps.models.extract, temperature: 0, json: true, maxTokens: 500,
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
  const persona = readPersona(host.persona);

  const unreadRows = must(await db.from('messages').select('id, text').eq('pair_id', pair.id).eq('direction', 'in').eq('handled', false).order('id'));
  const unread = unreadRows.map((m) => m.text);
  if (job.kind === 'reply' && unread.length === 0) throw new Error('cevaplanacak mesaj yok');

  if (job.kind === 'reply' && !rejected && !onlyGifts(unread)) {
    const mem = await extractMemory(db, deps, pair, unread, now);
    pair = { ...pair, permanent: mem.permanent };
  }

  const temp = await loadContext(db, pair, now);
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
  const wanted = job.kind !== 'reply' ? null : asksForPhoto(unread) ? 'image' : asksForVoice(unread) ? 'audio' : null;
  if (wanted) {
    const media = await pickMedia(db, { hostId: host.id, pairId: pair.id, kind: wanted });
    mediaId = media?.id ?? null;
    const [what, note] = wanted === 'image' ? ['fotoğraf', 'al bakalım'] : ['ses kaydı', 'al dinle'];
    if (media) mediaRule = `Karşı taraf ${what} istedi ve ${what}nı hemen ardından ayrıca gönderiyorsun: tek mesajlık, çok kısa (en fazla 60 karakter), cilveli ya da tatlı bir not yaz (örn. "${note}"); soru sorma, ${what}nın içeriğini tarif etme.`;
    else if (wanted === 'audio' && canSpeak) mediaRule = 'Karşı taraf ses istedi; cevabını sesli mesaj olarak göndereceksin: en fazla 120 karakter, emoji ve yazıyla gülme (hahaha, jsjs) kullanma, konuşur gibi yaz.';
    else mediaRule = `Karşı taraf ${what} istedi ama gönderemezsin: göndereceğini söyleme, doğal şekilde konuyu geçiştir.`;
  }

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
    model: host.model || deps.models.chat, temperature: 0.9, maxTokens: 400,
    messages: buildReplyMessages({ kind: job.kind, persona, permanent: pair.permanent, disclosed: pair.disclosed, temp, history, unread, avoid, knowledge, now, extraRule: [mediaRule, rejectedRule, retryRule].filter(Boolean).join(' '), routine, rules: Array.isArray(personaRules) ? personaRules : [] }),
  }), rules), persona, history, unread));

  let reply = await ask('');
  const repeated = reply ? repeatedDisclosures(reply, pair.disclosed, unread) : [];
  if (!reply || repeated.length) {
    const retry = await ask(!reply ? 'Önceki deneme geçersizdi: tek satır, düz metin, en fazla 300 karakter yaz.' : `Bu bilgileri tekrar etme: ${repeated.join(', ')}.`);
    if (retry && !repeatedDisclosures(retry, pair.disclosed, unread).length) reply = retry;
    else if (!reply) reply = retry;
  }
  if (!reply) throw new Error('model kullanılabilir bir cevap üretemedi');

  let sendText = true;
  if (wanted === 'audio' && !mediaId && canSpeak) {
    try {
      mediaId = await createSpeechMedia(db, deps, { host, persona, text: reply, label: String(jobId) });
      sendText = false;
    } catch {
      mediaId = null;
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
  must(await db.from('messages').insert({ pair_id: job.pair_id, direction: 'out', text: job.reply_text, dedupe_key: `sent#${job.id}`, sugo_ts: null, handled: true }));
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
  must(await db.from('jobs').update({ status: 'failed', error: String(error).slice(0, 500), locked_until: null, updated_at: new Date().toISOString() }).eq('id', jobId));
}

/** Extension için sıradaki hazır cevabı kilitleyerek verir. */
export async function nextJob(db, hostSugoId, deps) {
  const host = await getHost(db, hostSugoId);
  if (deps) await queueNudge(db, deps, host).catch(() => null);
  const rows = must(await db.rpc('claim_next_job', { p_host: host.id }));
  const job = rows?.[0];
  if (!job) return null;
  const pair = must(await db.from('pairs').select('peer_sugo_id, peer_name').eq('id', job.pair_id).single());
  return { id: job.id, kind: job.kind, pairId: job.pair_id, peerSugoId: pair.peer_sugo_id, peerName: pair.peer_name, text: job.reply_text, mediaId: job.media_id, sendText: job.send_text };
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

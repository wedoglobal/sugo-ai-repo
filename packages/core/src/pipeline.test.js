import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completeJob, ingest, nextJob, playgroundTurn, rejectJob, relevantKnowledge } from './pipeline.js';

function loadEnv() {
  try {
    return Object.fromEntries(readFileSync(new URL('../../../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  } catch { return {}; }
}
const env = { ...loadEnv(), ...process.env };
const HOST = String(900000000 + Math.floor(Math.random() * 99999999));

describe('relevantKnowledge', () => {
  it('örtüşen girdileri seçer, pasifleri atlar', () => {
    const out = relevantKnowledge([{ title: 'Kahve', content: 'kahve çok sever' }, { content: 'alakasız şey' }, { content: 'kahve', active: false }], 'kahve içelim mi');
    expect(out).toEqual(['Kahve: kahve çok sever']);
  });
});

// Yerel Supabase (docker) gerekir; yoksa atlanır.
describe.skipIf(!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)('pipeline (yerel supabase, sahte LLM)', () => {
  let db;
  const calls = [];
  const deps = {
    models: { chat: 'chat', extract: 'extract' },
    llm: async (req) => {
      calls.push(req);
      if (req.json) return JSON.stringify({ permanent: { name: { value: 'Ali', confidence: 0.95 }, residence: { value: 'Bursa', confidence: 0.9 } }, temp: ['yorgun'] });
      return 'selam, naber?';
    },
  };
  const peer = `t${Date.now()}`;

  beforeAll(async () => {
    db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await db.from('hosts').insert({ sugo_id: HOST, name: 'test' });
    if (error) throw new Error(error.message);
  });
  afterAll(async () => { await db.from('hosts').delete().eq('sugo_id', HOST); });

  it('boş sohbette welcome üretir, kuyruğa alır, extension tamamlar', async () => {
    const r = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: peer, peerName: 'Ali', messages: [] });
    expect(r.pairId).toBe(`${HOST}-${peer}`);
    expect(r.job.reply).toBe('selam, naber?');
    const job = await nextJob(db, HOST);
    expect(job).toMatchObject({ kind: 'welcome', peerSugoId: peer, text: 'selam, naber?' });
    await completeJob(db, job.id);
    expect(await nextJob(db, HOST)).toBeNull();
  });

  it('eşleşme sohbeti (boş snapshot, yalnız sistem mesajı) persona selamıyla açılır', async () => {
    const p = `m${Date.now()}`;
    const r = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: p, messages: [] });
    const job = await nextJob(db, HOST);
    expect(job).toMatchObject({ kind: 'welcome', peerSugoId: p });
    await completeJob(db, job.id);
    const { data: msgs } = await db.from('messages').select('direction').eq('pair_id', r.pairId);
    expect(msgs).toEqual([{ direction: 'out' }]);
  });

  it('okunmamış mesajda reply üretir ve kalıcı/geçici hafızayı günceller', async () => {
    const snap = [{ dir: 'out', text: 'selam, naber?', ts: '18:00' }, { dir: 'in', text: 'ben Ali bursadanım', ts: '18:01' }];
    const r = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: peer, messages: snap });
    expect(r.job.status).toBe('pending');
    const { data: pair } = await db.from('pairs').select('permanent').eq('id', r.pairId).single();
    expect(pair.permanent.name.value).toBe('Ali');
    const { data: temp } = await db.from('temp_context').select('text').eq('pair_id', r.pairId);
    expect(temp.map((t) => t.text)).toEqual(['yorgun']);
    // aynı snapshot tekrar gelince çift job/mesaj oluşmaz
    const again = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: peer, messages: snap });
    expect(again.job.id).toBe(r.job.id);
    const { data: msgs } = await db.from('messages').select('id').eq('pair_id', r.pairId);
    expect(msgs).toHaveLength(2); // gönderilen welcome snapshot'taki out ile eşleşti + in
  });

  it('filtreye takılan mesaj için konuya uygun yedek cevap üretir ve onu tamamlar', async () => {
    const p = `r${Date.now()}`;
    await ingest(db, deps, { hostSugoId: HOST, peerSugoId: p, messages: [{ dir: 'in', text: 'görüşelim mi', ts: '1' }] });
    const job = await nextJob(db, HOST);
    const before = calls.length;
    const text = await rejectJob(db, deps, job.id, 'numaramı vereyim 0555');
    expect(text).toBe('selam, naber?');
    const req = calls.slice(before).find((c) => !c.json);
    expect(req.messages[0].content).toContain('0555');
    expect(calls.slice(before).some((c) => c.json)).toBe(false);
    await completeJob(db, job.id);
  });

  it('playground sugo kuyruğuna job bırakmaz', async () => {
    const out = await playgroundTurn(db, deps, { hostSugoId: HOST, peerSugoId: `pg${Date.now()}`, text: 'selam' });
    expect(out.reply).toBe('selam, naber?');
    expect(out.memoryAfter.permanent.name.value).toBe('Ali');
    expect(await nextJob(db, HOST)).not.toMatchObject({ pairId: out.pairId });
  });

  it('fotoğraf istenince pair başına tekrarsız katalog fotoğrafı seçer, bitince seçmez', async () => {
    const { data: h } = await db.from('hosts').select('id').eq('sugo_id', HOST).single();
    await db.from('media').insert([1, 2].map((n) => ({ host_id: h.id, path: `${HOST}/${n}.jpg`, name: `${n}.jpg`, content_type: 'image/jpeg' })));
    const p = `ph${Date.now()}`;
    const seen = [];
    const messages = [{ dir: 'out', text: 'selam', ts: '1' }];
    for (let i = 0; i < 3; i++) {
      messages.push({ dir: 'in', text: `foto atar mısın ${i}`, ts: `${i + 2}` });
      const r = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: p, messages });
      const job = await nextJob(db, HOST);
      expect(job.id).toBe(r.job.id);
      seen.push(job.mediaId);
      await completeJob(db, job.id);
      messages.push({ dir: 'out', text: 'selam, naber?', ts: `${i + 2}x` });
    }
    expect(seen[0]).toBeTruthy();
    expect(seen[1]).toBeTruthy();
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[2]).toBeNull();
  });

  it('katalogda görsel olsa da eşleşme selamına görsel eklenmez', async () => {
    const r = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: `w${Date.now()}`, messages: [] });
    const job = await nextJob(db, HOST);
    expect(job).toMatchObject({ id: r.job.id, kind: 'welcome', mediaId: null, sendText: true });
    await completeJob(db, job.id);
  });

  it('hazır karşılama metinleri varsa selam onlardan biri olur, modele sorulmaz', async () => {
    await db.from('app_settings').upsert({ key: 'greetings', value: ['hazır selam'] });
    try {
      const before = calls.length;
      const r = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: `g${Date.now()}`, messages: [] });
      const job = await nextJob(db, HOST);
      expect(job).toMatchObject({ id: r.job.id, text: 'hazır selam', sendText: true, mediaId: null });
      expect(calls.length).toBe(before);
      await completeJob(db, job.id);
    } finally {
      await db.from('app_settings').delete().eq('key', 'greetings');
    }
  });

  it('hediyeye hazır teşekkür gider: sesli mesaj açıksa sesle, kapalıysa yazıyla', async () => {
    await db.from('app_settings').upsert({ key: 'gift_thanks', value: ['hediye için sağ ol'] });
    const spoken = [];
    const withSpeech = { ...deps, models: { ...deps.models, speech: 'tts' }, speech: async (req) => { spoken.push(req); return new Uint8Array([1, 2, 3, 4]); } };
    try {
      const { data: h } = await db.from('hosts').select('id').eq('sugo_id', HOST).single();
      await db.from('hosts').update({ persona: { voice: 'Kore' } }).eq('id', h.id);
      const gift = { dir: 'in', text: '[hediye] güzel bir hediye (20 elmas)', ts: '1' };
      const before = calls.length;
      const v = await ingest(db, withSpeech, { hostSugoId: HOST, peerSugoId: `gv${Date.now()}`, voiceEnabled: true, messages: [{ dir: 'out', text: 'selam', ts: '0' }, gift] });
      const vj = await nextJob(db, HOST);
      expect(vj).toMatchObject({ id: v.job.id, text: 'hediye için sağ ol', sendText: false });
      expect(spoken[spoken.length - 1]).toMatchObject({ input: 'hediye için sağ ol' });
      expect(vj.mediaId).toBeTruthy();
      expect(calls.length).toBe(before);
      await completeJob(db, vj.id);

      await ingest(db, withSpeech, { hostSugoId: HOST, peerSugoId: `gt${Date.now()}`, voiceEnabled: false, messages: [{ dir: 'out', text: 'selam', ts: '0' }, gift] });
      const tj = await nextJob(db, HOST);
      expect(tj).toMatchObject({ text: 'hediye için sağ ol', sendText: true });
      await completeJob(db, tj.id);
    } finally {
      await db.from('app_settings').delete().eq('key', 'gift_thanks');
    }
  });

  it('ses istenince katalogdan ses kaydı seçer', async () => {
    const { data: h } = await db.from('hosts').select('id').eq('sugo_id', HOST).single();
    await db.from('media').insert({ host_id: h.id, path: `${HOST}/v.mp3`, name: 'v.mp3', content_type: 'audio/mpeg' });
    const p = `vo${Date.now()}`;
    const r = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: p, messages: [{ dir: 'out', text: 'selam', ts: '1' }, { dir: 'in', text: 'sesini duyabilir miyim', ts: '2' }] });
    const job = await nextJob(db, HOST);
    expect(job.id).toBe(r.job.id);
    const { data: m } = await db.from('media').select('content_type').eq('id', job.mediaId).single();
    expect(m.content_type).toBe('audio/mpeg');
  });

  it('katalogda ses yoksa cevabı TTS ile sese çevirir, gönderilince geçici dosyayı siler', async () => {
    const { data: h } = await db.from('hosts').select('id').eq('sugo_id', HOST).single();
    await db.from('media').delete().eq('host_id', h.id).like('content_type', 'audio/%');
    await db.from('hosts').update({ persona: { voice: 'Kore', voiceStyle: 'rahat' } }).eq('id', h.id);
    const spoken = [];
    const withSpeech = { ...deps, models: { ...deps.models, speech: 'tts-model' }, speech: async (req) => { spoken.push(req); return new Uint8Array([1, 2, 3, 4]); } };
    const p = `tt${Date.now()}`;
    const r = await ingest(db, withSpeech, { hostSugoId: HOST, peerSugoId: p, messages: [{ dir: 'out', text: 'selam', ts: '1' }, { dir: 'in', text: 'ses at', ts: '2' }] });
    const job = await nextJob(db, HOST);
    expect(job).toMatchObject({ id: r.job.id, sendText: false });
    expect(spoken[0]).toMatchObject({ model: 'tts-model', voice: 'Kore', input: 'selam, naber?' });
    const { data: gen } = await db.from('media').select('generated').eq('id', job.mediaId).single();
    expect(gen.generated).toBe(true);
    await completeJob(db, job.id);
    const { data: gone } = await db.from('media').select('id').eq('id', job.mediaId);
    expect(gone).toHaveLength(0);
  });

  it('5 dakika cevapsız kalan, sesli mesajı açık kişiye önce sesli, sonra gönderilmemiş fotoğrafla dürtme kuyruğa alır', async () => {
    const { data: h } = await db.from('hosts').select('id').eq('sugo_id', HOST).single();
    await db.from('hosts').update({ persona: { voice: 'Kore', nudge: true, nudgeMinutes: 5, nudgeLines: ['off baksana'] } }).eq('id', h.id);
    const withSpeech = { ...deps, models: { ...deps.models, speech: 'tts' }, speech: async () => new Uint8Array([1, 2, 3, 4]) };
    const p = `nd${Date.now()}`;
    const r = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: p, voiceEnabled: true, messages: [{ dir: 'out', text: 'selam', ts: '1' }, { dir: 'in', text: 'merhaba', ts: '2' }] });
    await completeJob(db, r.job.id);
    expect(await nextJob(db, HOST, withSpeech)).toBeNull(); // henüz 5 dakika geçmedi
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    await db.from('messages').update({ created_at: old }).eq('pair_id', r.pairId);
    await db.from('pairs').update({ last_activity_at: old }).eq('id', r.pairId);
    const nudge = await nextJob(db, HOST, withSpeech);
    expect(nudge).toMatchObject({ kind: 'nudge', text: 'off baksana', sendText: false });
    expect(nudge.mediaId).toBeTruthy();
    await completeJob(db, nudge.id);
    await db.from('messages').update({ created_at: old }).eq('pair_id', r.pairId);
    await db.from('pairs').update({ last_activity_at: old }).eq('id', r.pairId);
    const photo = await nextJob(db, HOST, withSpeech);
    expect(photo).toMatchObject({ kind: 'nudge', sendText: false });
    expect(photo.mediaId).toBeTruthy();
    expect(photo.mediaId).not.toBe(nudge.mediaId);
    await completeJob(db, photo.id);
    await db.from('messages').update({ created_at: old }).eq('pair_id', r.pairId);
    await db.from('pairs').update({ last_activity_at: old }).eq('id', r.pairId);
    expect(await nextJob(db, HOST, withSpeech)).toBeNull(); // aynı sessizlik için en fazla ses + fotoğraf
  });

  it('sesli mesajı kapalı kişiye ses göndermez, yalnız fotoğrafla dürtür', async () => {
    const withSpeech = { ...deps, models: { ...deps.models, speech: 'tts' }, speech: async () => new Uint8Array([1, 2, 3, 4]) };
    const p = `nv${Date.now()}`;
    const r = await ingest(db, deps, { hostSugoId: HOST, peerSugoId: p, voiceEnabled: false, messages: [{ dir: 'out', text: 'selam', ts: '1' }, { dir: 'in', text: 'merhaba', ts: '2' }] });
    await completeJob(db, r.job.id);
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    await db.from('messages').update({ created_at: old }).eq('pair_id', r.pairId);
    await db.from('pairs').update({ last_activity_at: old }).eq('id', r.pairId);
    const nudge = await nextJob(db, HOST, withSpeech);
    expect(nudge).toMatchObject({ kind: 'nudge', sendText: false });
    const { data: media } = await db.from('media').select('content_type').eq('id', nudge.mediaId).single();
    expect(media.content_type).toBe('image/jpeg');
  });
});

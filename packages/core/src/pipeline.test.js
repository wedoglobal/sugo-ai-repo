import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { completeJob, ingest, nextJob, playgroundTurn, relevantKnowledge } from './pipeline.js';

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

  it('playground sugo kuyruğuna job bırakmaz', async () => {
    const out = await playgroundTurn(db, deps, { hostSugoId: HOST, peerSugoId: `pg${Date.now()}`, text: 'selam' });
    expect(out.reply).toBe('selam, naber?');
    expect(out.memoryAfter.permanent.name.value).toBe('Ali');
    expect(await nextJob(db, HOST)).not.toMatchObject({ pairId: out.pairId });
  });
});

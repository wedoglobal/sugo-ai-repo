import { describe, expect, it } from 'vitest';
import { nextJob } from './pipeline.js';
import { pickMedia } from './media.js';

function deliveryDb({ voiceEnabled = true, kind = 'reply', used = false } = {}) {
  const job = { id: 1, host_id: 'host', pair_id: '1-2', kind, media_id: 'clip', reply_text: 'selam', send_text: true };
  const consumed = new Set(used ? ['1-2:clip'] : []);
  const media = { id: 'clip', content_type: 'audio/mpeg', generated: false };
  const db = {
    async rpc() { return { data: job.status === 'failed' ? [] : [{ ...job }] }; },
    from(table) {
      let action = 'select';
      let values;
      let single = false;
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, value) { filters[key] = value; return query; },
        neq() { return query; },
        single() { single = true; return query; },
        maybeSingle() { single = true; return query; },
        upsert(value) { action = 'upsert'; values = value; return query; },
        update(value) { action = 'update'; values = value; return query; },
        then(resolve, reject) {
          let data;
          if (table === 'hosts') data = { id: 'host' };
          else if (table === 'pairs') data = { peer_sugo_id: '2', voice_enabled: voiceEnabled };
          else if (table === 'media') data = single ? media : [media];
          else if (table === 'messages') data = [{ id: 1, dedupe_key: 'incoming', handled: kind !== 'reply' }];
          else if (table === 'media_sent') {
            if (action === 'upsert') {
              const key = `${values.pair_id}:${values.media_id}`;
              data = consumed.has(key) ? [] : [{ media_id: values.media_id }];
              consumed.add(key);
            } else data = [...consumed].filter((key) => key.startsWith(`${filters.pair_id}:`)).map(() => ({ media_id: 'clip' }));
          } else if (table === 'jobs') {
            if (action === 'update') Object.assign(job, values);
            data = job;
          }
          else throw new Error(`beklenmeyen tablo: ${table}`);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { db, job, consumed };
}

describe('hazır ses tek seferlik teslim', () => {
  it('tamamlama çağrısı gelmese bile aynı klibi yeniden teslim etmez ve seçimden çıkarır', async () => {
    const { db, consumed } = deliveryDb();
    expect((await nextJob(db, '1')).mediaId).toBe('clip');
    expect(consumed.has('1-2:clip')).toBe(true);
    expect(await pickMedia(db, { hostId: 'host', pairId: '1-2', kind: 'audio' })).toBeNull();
    expect(await nextJob(db, '1')).toMatchObject({ mediaId: null, sendText: true, text: 'selam' });
  });
  it('önceden kullanılmış klibi engeller', async () => {
    const { db } = deliveryDb({ used: true });
    expect((await nextJob(db, '1')).mediaId).toBeNull();
  });
  it('ses kapandıysa kuyruğa alınmış kaydı göndermez veya tüketmez', async () => {
    const { db, consumed } = deliveryDb({ voiceEnabled: false });
    expect(await nextJob(db, '1')).toMatchObject({ mediaId: null, sendText: true });
    expect(consumed.size).toBe(0);
  });
  it('eski kuyruktaki sesli dürtmeyi iptal eder', async () => {
    const { db, job, consumed } = deliveryDb({ kind: 'nudge' });
    expect(await nextJob(db, '1')).toBeNull();
    expect(job.status).toBe('failed');
    expect(consumed.size).toBe(0);
  });
  it('aynı klip başka kişiye gönderilebilir', async () => {
    const { db, job } = deliveryDb({ used: true });
    job.pair_id = '1-3';
    expect((await nextJob(db, '1')).mediaId).toBe('clip');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { generate } from './pipeline.js';

// Yalnız üretim akışının kullandığı tabloları bellekte tutar; dış servise bağlanmaz.
function contextDb({ voiceEnabled = false, media = [], text = 'ben Veli, bugün yorgunum' } = {}) {
  const pair = { id: '1-2', permanent: {}, disclosed: {}, voice_enabled: voiceEnabled };
  const temp = [];
  const job = { id: 1, host_id: 'host', pair_id: pair.id, kind: 'reply' };
  const db = { from(table) {
    let operation = 'select';
    let values;
    const query = {
      select() { return query; },
      eq() { return query; },
      lt() { return query; },
      gt() { return query; },
      order() { return query; },
      limit() { return query; },
      single() { return query; },
      maybeSingle() { return query; },
      update(value) { operation = 'update'; values = value; return query; },
      insert(value) { operation = 'insert'; values = value; return query; },
      delete() { operation = 'delete'; return query; },
      then(resolve, reject) {
        let data;
        if (operation === 'update') {
          Object.assign(table === 'pairs' ? pair : job, values);
        } else if (operation === 'insert' && table === 'temp_context') {
          temp.push(...values);
        } else if (table === 'jobs') data = job;
        else if (table === 'hosts') data = { id: 'host', persona: {} };
        else if (table === 'pairs') data = pair;
        else if (table === 'temp_context') data = operation === 'delete' ? [] : temp;
        else if (table === 'messages') data = [{ id: 1, text }];
        else if (table === 'media') data = media;
        else if (table === 'media_sent') data = [];
        else if (table === 'app_settings') data = null;
        else throw new Error(`beklenmeyen tablo: ${table}`);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { db, job };
}

describe('cevap üretimi maliyet kontrolü', () => {
  it.each([
    [true, 'naber', 0.1, 'clip'],
    [true, 'naber', 0.5, null],
    [true, 'sexting yapalım mı', 0.5, 'clip'],
    [false, 'ses at', 0, null],
  ])('ses erişimi=%s, mesaj=%s için katalog seçimini uygular', async (voiceEnabled, text, roll, expected) => {
    const { db, job } = contextDb({ voiceEnabled, text, media: [{ id: 'clip', content_type: 'audio/mpeg' }] });
    const llm = vi.fn(async (req) => req.json ? '{}' : 'selam');
    await generate(db, { llm, random: () => roll, models: { chat: 'chat', extract: 'extract' } }, 1);
    expect(job.media_id).toBe(expected);
    expect(job.send_text).toBe(true);
    expect(llm).toHaveBeenCalledTimes(2);
  });

  it('katalog bitince normal cevapta TTS üretmez', async () => {
    const { db, job } = contextDb({ voiceEnabled: true });
    const speech = vi.fn();
    await generate(db, { llm: async (req) => req.json ? '{}' : 'selam', speech, random: () => 0, models: {} }, 1);
    expect(job.media_id).toBeNull();
    expect(speech).not.toHaveBeenCalled();
  });
  it.each(['permanent', 'temp', 'empty', 'error'])('%s hafıza sonucuyla yalnız bir sohbet çağrısı yapar', async (mode) => {
    const { db, job } = contextDb();
    const llm = vi.fn(async (request) => {
      if (request.json) {
        if (mode === 'error') throw new Error('hafıza servisi çalışmıyor');
        // Asenkron çıkarım bitmeden sohbet çağrısına geçilmemeli.
        await Promise.resolve();
        return JSON.stringify({
          permanent: mode === 'permanent' ? { name: { value: 'Veli', confidence: 0.95 } } : {},
          temp: mode === 'temp' ? ['bugün yorgun'] : [],
        });
      }
      if (mode === 'permanent') expect(request.messages[1].content).toContain('name: Veli');
      if (mode === 'temp') expect(request.messages[1].content).toContain('- bugün yorgun');
      return 'nasılsın';
    });
    expect(await generate(db, { llm, models: { chat: 'chat', extract: 'extract' } }, 1)).toBe('nasılsın');
    expect(llm).toHaveBeenCalledTimes(2);
    expect(llm.mock.calls[1][0]).toMatchObject({ model: 'chat', thinkTokens: 0, maxTokens: 150 });
    expect(job.reply_text).toBe('nasılsın');
  });

  it('geçersiz cevabı bir kez yeniden dener', async () => {
    const { db } = contextDb();
    let attempts = 0;
    const llm = vi.fn(async (request) => {
      if (request.json) return '{}';
      return attempts++ === 0 ? '```geçersiz```' : 'selam';
    });
    expect(await generate(db, { llm, models: { chat: 'chat', extract: 'extract' } }, 1)).toBe('selam');
    expect(attempts).toBe(2);
    expect(llm).toHaveBeenCalledTimes(3);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  accumulateRepairHistory, assignConversationRepair, detectRepairConditions, emptyRepairTotals,
  isRepairStop, observeAndQueueRepair, repairSnapshot, runRepairAnalysisBatch, summarizeRepairHistory,
} from './conversation-repair.js';
import { failJob, rejectJob, retryJob } from './pipeline.js';

const now = Date.parse('2026-11-25T12:00:00Z');
const date = (hours) => new Date(now + hours * 3600000).toISOString();
const messages = (...rows) => rows.map(([direction, text, fields], i) => ({
  id: i + 1, direction, text, created_at: date(-3), ...fields,
}));

describe('sohbet geçmişi', () => {
  it('tekrarlanan ve peş peşe sorulan sorularla açık kalan konuyu ayırır', () => {
    const history = messages(['in', 'Bugün yola çıkacağım'], ['out', 'Yolculuk ne kadar sürüyor?'], ['in', 'Vardığımda seni arayayım mı?']);
    expect(detectRepairConditions(history, 'Yolculuk ne kadar sürüyor?'))
      .toEqual(['repeated_question', 'question_chain', 'open_thread']);
    expect(detectRepairConditions(history, 'Anladım')).toEqual(['short_end', 'open_thread']);
  });

  it('geç senkronizasyonda sıra kanıtını kullanır, boş zaman etiketinden sessizlik çıkarmaz', () => {
    const totals = emptyRepairTotals();
    accumulateRepairHistory(totals, [
      { host_id: 'a', messages: messages(['in', 'otobüs gecikti'], ['out', 'anladım'], ['in', 'şimdi geldi'], ['out', 'tamam']) },
      { host_id: 'b', messages: messages(['in', 'otobüs gecikti'], ['out', 'anladım', { sugo_ts: '18:00' }]) },
      { host_id: 'a', messages: messages(['in', 'otobüs gecikti'],
        ['out', 'anladım', { sugo_ts: date(-27), created_at: date(-26) }],
        ['in', 'şimdi geldi', { sugo_ts: date(-2), created_at: date(-1) }]) },
    ], now);
    expect(summarizeRepairHistory(totals).rows.find((r) => r.condition === 'short_end'))
      .toMatchObject({ samples: 4, answered: 1, silent: 1, uncertain: 2, rate: 0.5, comparison: null });
  });

  it('aynı profil ve sohbet aşamasındaki doğrulanmış devamları temel alarak tarif çıkarır', () => {
    const totals = emptyRepairTotals();
    const pairs = Array.from({ length: 30 }, () => [
      { host_id: 'a', quiet_anchor: 2, quiet_through: date(-1),
        messages: messages(['in', 'otobüs gecikti'], ['out', 'anladım', { confirmed: true, created_at: date(-27) }]) },
      { host_id: 'a', messages: messages(['in', 'otobüs gecikti'], ['out', 'otobüs seni epey bekletmiş'], ['in', 'nihayet geldi']) },
    ]).flat();
    accumulateRepairHistory(totals, pairs, now);
    const report = summarizeRepairHistory(totals);
    expect(report.recipes).toEqual([expect.objectContaining({ condition: 'short_end' })]);
    expect(report.rows.find((r) => r.condition === 'short_end')).toMatchObject({ comparable: 30, comparison: 0, rate: 1, share: 1 });
    expect(JSON.stringify(report)).not.toContain('otobüs');
  });
});

describe('analiz ilerlemesi', () => {
  const run = { id: 2, started_at: date(0), cursor: '1-2', lease_until: date(1), scanned_pairs: 138, totals: emptyRepairTotals() };
  function setup(history, saved = { id: 2 }) {
    const write = { eq: vi.fn(() => write), select: () => write, maybeSingle: async () => ({ data: saved }) };
    const update = vi.fn(() => write);
    const rpc = vi.fn(async (name) => name === 'claim_conversation_repair_run' ? { data: [run] } : history);
    return { db: { rpc, from: () => ({ update }) }, update, write };
  }
  it('mevcut cursor ve sayaçtan devam eder, son partiyi rapora çevirir', async () => {
    const { db, update, write } = setup({ data: [{ pair_id: '1-3', host_id: 'a', messages: [] }] });
    expect(await runRepairAnalysisBatch(db)).toBe(true);
    expect(db.rpc).toHaveBeenLastCalledWith('conversation_repair_history_batch', expect.objectContaining({ p_cursor: '1-2', p_limit: 80 }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      cursor: '1-3', scanned_pairs: 139, lease_until: null, completed_at: expect.any(String), report: expect.any(Object),
    }));
    expect(write.eq).toHaveBeenCalledWith('lease_until', run.lease_until);
  });
  it('başarısız partide cursor ve sayaç korunur, yeniden deneme zamanı kaydedilir', async () => {
    const { db, update } = setup({ error: { message: 'sorgu zaman aşımı' } });
    await expect(runRepairAnalysisBatch(db)).rejects.toThrow('sorgu zaman aşımı');
    expect(update).toHaveBeenCalledExactlyOnceWith({ last_error_at: expect.any(String), lease_until: expect.any(String) });
  });
  it('kilidi kaybeden çalışanın sonucu kaydedilmiş sayılmaz', async () => {
    const { db } = setup({ data: [] }, null);
    expect(await runRepairAnalysisBatch(db)).toBe(false);
  });
});

describe('takip mesajı üretimi', () => {
  const host = { id: 'a', repair_enabled: true, persona: {} };
  const snap = [
    { dir: 'in', text: 'otobüs gecikti', key: 'before' },
    { dir: 'out', text: 'otobüs seni epey bekletmiş', key: 'anchor' },
  ];
  const observe = { data: { anchor: '7', observed_at: '2026-11-25T11:00:00Z' } };
  const setup = (text, observation = observe) => {
    const rpc = vi.fn(async (name) => name === 'observe_conversation_repair' ? observation : { data: [{ id: 3 }] });
    const settings = { select: () => settings, eq: () => settings, maybeSingle: async () => ({ data: null }) };
    return { db: { rpc, from: () => settings }, deps: { models: {}, llm: vi.fn(async () => text) } };
  };

  it('yeni bir bağ kurar ve kuyruğa gözlenen çıpayı verir', async () => {
    const { db, deps } = setup('otobüs geldi mi bu arada?');
    expect(await observeAndQueueRepair(db, deps, host, '1-2', snap)).toEqual({ id: 3 });
    expect(db.rpc).toHaveBeenLastCalledWith('queue_conversation_repair', {
      p_pair: '1-2', p_anchor: '7', p_text: 'otobüs geldi mi bu arada?', p_observed_at: observe.data.observed_at,
    });
  });

  it.each(['otobüs seni epey bekletmiş!', 'bugün kahve içelim mi?', 'otobüs için numara ver'])('tekrar, bağlamsız veya uygunsuz çıktıyı kuyruğa almaz (%s)', async (text) => {
    const { db, deps } = setup(text);
    expect(await observeAndQueueRepair(db, deps, host, '1-2', snap)).toBeNull();
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('vazgeçme, belirsiz görüntü ve pilot kapalı durumlarında modeli çağırmaz', async () => {
    const stopped = [...snap, { dir: 'in', text: 'artık bana mesaj atma', key: 'stop' }];
    const { db, deps } = setup('otobüs geldi mi?');
    expect(isRepairStop(stopped.at(-1).text)).toBe(true);
    expect(isRepairStop('geç yazma sebebim oydu')).toBe(false);
    expect(repairSnapshot(stopped).at(-1)).toMatchObject({ real: true, stop: true });
    expect(await observeAndQueueRepair(db, deps, host, '1-2', stopped)).toBeNull();
    expect(await observeAndQueueRepair(db, deps, { ...host, repair_enabled: false }, '1-2', snap)).toBeNull();
    db.rpc.mockResolvedValueOnce({ data: null });
    expect(await observeAndQueueRepair(db, deps, host, '1-2', snap)).toBeNull();
    expect(deps.llm).not.toHaveBeenCalled();
    expect(await assignConversationRepair(db, host, { id: 1, pair_id: '1-2' }, messages(['in', 'selam']), ['artık yazma'])).toBeNull();
  });
});

it('filtre reddinde iş kapanır ve eski istemci yedek metin alamaz', async () => {
  const job = { id: 1, kind: 'repair', status: 'processing', reply_text: 'otobüs geldi mi?' };
  const table = {
    select: () => table, eq: () => table, neq: () => table, single: async () => ({ data: job }),
    update: vi.fn((fields) => { Object.assign(job, fields); return table; }),
    then: (resolve) => Promise.resolve({ data: null }).then(resolve),
  };
  const db = { from: () => table };
  expect(await rejectJob(db, {}, job.id)).toBeNull();
  expect(job).toMatchObject({ status: 'failed', locked_until: null, error: expect.stringContaining('sugo filtresi mesajları reddetti') });
  await failJob(db, job.id, 'eski istemci yedek cevap bulamadı');
  expect(table.update).toHaveBeenCalledTimes(1);
  await expect(retryJob(db, {}, job.id)).rejects.toThrow('tekrar denenmez');
});

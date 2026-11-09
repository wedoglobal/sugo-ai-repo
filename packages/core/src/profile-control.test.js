import { describe, expect, it, vi } from 'vitest';
import { ingest, nextJob } from './pipeline.js';
const pausedDb = () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { id: 'host', sugo_id: '123', active: false }, error: null }) };
  return { from: vi.fn(() => chain), rpc: vi.fn() };
};
describe('durdurulmuş profil eski istemcileri de durdurur', () => {
  it('iş kilitlemez veya üretmez', async () => {
    const db = pausedDb();
    expect(await nextJob(db, '123', {})).toBe(null);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('eski ingest biçiminde job:null döner; mesaj veya pair yazmaz', async () => {
    const db = pausedDb();
    expect(await ingest(db, {}, { hostSugoId: '123', peerSugoId: '456', messages: [{ dir: 'in', text: 'selam' }] })).toEqual({ pairId: '123-456', job: null, paused: true });
    expect(db.from).toHaveBeenCalledTimes(1);
  });
});

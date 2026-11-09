import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: {}, deps: {}, nextJob: vi.fn(), ingest: vi.fn(), completeJob: vi.fn(), failJob: vi.fn() }));
vi.mock('$lib/server/deps.js', () => ({ db: () => mocks.db, deps: () => mocks.deps }));
vi.mock('@sugo/core', () => ({ ...mocks, NotFoundError: class extends Error {} }));
import { GET as nextGet, POST as nextPost } from '../routes/api/ext/jobs/next/+server.js';
import { POST as ingest } from '../routes/api/ext/ingest/+server.js';
import { POST as complete } from '../routes/api/ext/jobs/[id]/complete/+server.js';
import { POST as failJob } from '../routes/api/ext/jobs/[id]/fail/+server.js';
const request = (body) => new Request('https://example.test/api/ext/ingest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => vi.clearAllMocks());
describe('eski istemci API sözleşmeleri', () => {
  it('GET ile kuyruk alma biçimini ve cevabını korur', async () => {
    mocks.nextJob.mockResolvedValue({ id: 7, text: 'merhaba' });
    const response = await nextGet({ url: new URL('https://example.test/api/ext/jobs/next?host=123') });
    expect(await response.json()).toEqual({ job: { id: 7, text: 'merhaba' } });
    expect(mocks.nextJob).toHaveBeenCalledWith(mocks.db, '123', mocks.deps, { replyOnly: false });
  });
  it('eski POST hostSugoId alanını, görünür kişi listesi olmadan kabul eder', async () => {
    mocks.nextJob.mockResolvedValue(null);
    expect(await (await nextPost({ request: request({ hostSugoId: '123' }) })).json()).toEqual({ job: null });
    expect(mocks.nextJob).toHaveBeenCalledWith(mocks.db, '123', mocks.deps, { replyOnly: false, visiblePeerIds: null });
  });
  it('yeni isteğe bağlı alanlar olmadan mesaj almayı sürdürür', async () => {
    mocks.ingest.mockResolvedValue({ pairId: '123-456', job: null });
    const response = await ingest({ request: request({ hostSugoId: '123', peerSugoId: '456', messages: [{ dir: 'in', text: 'selam' }] }) });
    expect(await response.json()).toEqual({ pairId: '123-456', job: null });
    expect(mocks.ingest).toHaveBeenCalledWith(mocks.db, mocks.deps, { hostSugoId: '123', peerSugoId: '456', peerName: '', messages: [{ dir: 'in', text: 'selam', ts: '', diamonds: 0 }] });
  });
  it('tamamlama ve hata bildirim cevaplarını değiştirmez', async () => {
    mocks.completeJob.mockResolvedValue({ id: 7, status: 'done' });
    expect(await (await complete({ params: { id: '7' } })).json()).toEqual({ job: { id: 7, status: 'done' } });
    expect(await (await failJob({ params: { id: '7' }, request: request({ error: 'yeniden dene' }) })).json()).toEqual({ ok: true });
    expect(mocks.failJob).toHaveBeenCalledWith(mocks.db, 7, 'yeniden dene');
  });
});

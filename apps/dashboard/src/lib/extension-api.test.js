import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: {}, deps: {}, nextJob: vi.fn(), ingest: vi.fn(), completeJob: vi.fn(), failJob: vi.fn() }));
vi.mock('$lib/server/deps.js', () => ({ db: () => mocks.db, deps: () => mocks.deps, must: ({ data }) => data }));
vi.mock('@sugo/core', () => ({ ...mocks, NotFoundError: class extends Error {} }));
import { GET as nextGet, POST as nextPost } from '../routes/api/ext/jobs/next/+server.js';
import { POST as ingest } from '../routes/api/ext/ingest/+server.js';
import { POST as complete } from '../routes/api/ext/jobs/[id]/complete/+server.js';
import { POST as failJob } from '../routes/api/ext/jobs/[id]/fail/+server.js';
import { GET as control } from '../routes/api/ext/control/+server.js';
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
  it('eski Android doğrulama hatası bile aynı yanıtı yeniden kuyruğa açmaz', async () => {
    mocks.db.rpc = vi.fn().mockResolvedValue({ error: null });
    const error = 'mesaj gönderilemedi (giden mesaj sayısı artmadı)';
    expect(await (await failJob({ params: { id: '7' }, request: request({ error }) })).json()).toEqual({ ok: true });
    expect(mocks.db.rpc).toHaveBeenCalledExactlyOnceWith('stop_android_delivery', { p_job: '7', p_error: error });
    expect(mocks.failJob).not.toHaveBeenCalled();
  });
});

describe('konum gezintisi kontrolü', () => {
  it('eski istemciye aynı şekli döndürür ve yalnız konum isteyen Sugo istemcisi için zamanlayıcıyı sorgular', async () => {
    const host = {
      id: 'db-host', sugo_id: '123', name: 'host', active: true, updated_at: 'revision',
      network_profiles: [{ domain: 'sugo.live', gps: { enabled: true } }],
    };
    const table = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
      or: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: host }),
    };
    mocks.db.from = vi.fn().mockReturnValue(table);
    mocks.db.rpc = vi.fn().mockResolvedValue({ data: null });
    const get = async (extra) => (await control({ url: new URL(`https://example.test/api/ext/control?host=123${extra}`) })).json();
    expect(await get('')).toEqual({ command: null, host: { id: host.id, sugoId: '123', name: host.name, active: true, revision: host.updated_at, network: host.network_profiles } });
    expect(await get('&roam=other.test')).not.toHaveProperty('roam');
    expect(mocks.db.rpc).not.toHaveBeenCalled();
    expect(await get('&roam=sugo.live')).toHaveProperty('roam', null);
    expect(mocks.db.rpc).toHaveBeenCalledExactlyOnceWith('poll_location_roam', { p_host_id: host.id, p_domain: 'sugo.live' });
  });
});

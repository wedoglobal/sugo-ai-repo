import { describe, expect, it } from 'vitest';
import { syncHost } from './pipeline.js';

/** Yalnız hosts tablosunu taklit eden asgari sahte db. */
function fakeDb(rows) {
  const q = (filters = {}) => ({
    select: () => q(filters),
    eq: (k, v) => q({ ...filters, [k]: v }),
    neq: (k, v) => q({ ...filters, ne: [k, v] }),
    order: () => q(filters),
    limit: () => q(filters),
    update: () => q(filters),
    maybeSingle: async () => ({ data: rows.find((r) => r.sugo_id === filters.sugo_id) ?? null, error: null }),
    insert: (row) => ({ select: () => ({ single: async () => { const r = { id: 'new', ...row }; rows.push(r); return { data: r, error: null }; } }) }),
    then: (res) => res({ data: rows.filter((r) => !filters.ne || r[filters.ne[0]] !== filters.ne[1]), error: null }),
  });
  return { from: () => q() };
}

describe('syncHost', () => {
  it('yeni profil, persona dolu şablondan persona/bilgi/model kopyalar ve aktif başlar', async () => {
    const rows = [
      { id: 'a', sugo_id: '1', persona: {}, knowledge: [], model: null },
      { id: 'b', sugo_id: '2', persona: { length: 'short' }, knowledge: [{ title: 'x' }], model: 'm' },
    ];
    const host = await syncHost(fakeDb(rows), '3', 'Yeni');
    expect(host).toMatchObject({ sugo_id: '3', active: true, persona: { length: 'short' }, knowledge: [{ title: 'x' }], model: 'm', clonedFrom: 'b' });
  });
  it('şablon yoksa boş profil açar', async () => {
    const host = await syncHost(fakeDb([]), '3');
    expect(host.clonedFrom).toBeNull();
    expect(host.persona).toBeUndefined();
  });
  it('mevcut profili kopyalamadan döner', async () => {
    const rows = [{ id: 'a', sugo_id: '1', persona: {}, name: 'x' }];
    expect((await syncHost(fakeDb(rows), '1')).clonedFrom).toBeUndefined();
  });
});

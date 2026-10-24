import { fail } from '@sveltejs/kit';
import { playgroundTurn } from '@sugo/core';
import { db, deps, must } from '$lib/server/deps.js';

export const load = async () => ({
  hosts: must(await db().from('hosts').select('sugo_id, name').order('created_at')),
});

export const actions = {
  send: async ({ request }) => {
    const f = await request.formData();
    const hostSugoId = String(f.get('host'));
    const peer = String(f.get('peer') ?? '').trim().replace(/[^\w]/g, '') || 'test1';
    const text = String(f.get('text') ?? '');
    try {
      const result = await playgroundTurn(db(), deps(), { hostSugoId, peerSugoId: `pg${peer}`, peerName: `test ${peer}`, text });
      return { result, host: hostSugoId, peer, text };
    } catch (e) {
      return fail(500, { error: e.message, host: hostSugoId, peer, text });
    }
  },
};

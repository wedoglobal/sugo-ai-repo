import { retryJob } from '@sugo/core';
import { db, deps, must } from '$lib/server/deps.js';

export const load = async () => ({
  jobs: must(await db().from('jobs').select('id, pair_id, kind, status, reply_text, error, attempts, due_at').order('id', { ascending: false }).limit(100)),
});

export const actions = {
  retry: async ({ request }) => {
    const id = Number((await request.formData()).get('id'));
    await retryJob(db(), deps(), id);
  },
  cancel: async ({ request }) => {
    const id = Number((await request.formData()).get('id'));
    must(await db().from('jobs').update({ status: 'failed', error: 'elle iptal edildi', locked_until: null }).eq('id', id).in('status', ['pending', 'processing']));
  },
};

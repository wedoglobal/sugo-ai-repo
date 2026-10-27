import { formatLines, parseLines } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

export const load = async () => {
  const row = must(await db().from('app_settings').select('value').eq('key', 'gift_thanks').maybeSingle());
  return { thanksText: formatLines(row?.value) };
};

export const actions = {
  save: async ({ request }) => {
    const list = parseLines(String((await request.formData()).get('thanks') ?? ''));
    must(await db().from('app_settings').upsert({ key: 'gift_thanks', value: list, updated_at: new Date().toISOString() }));
    return { saved: list.length };
  },
};

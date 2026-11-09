import { formatLines, parseLines } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

export const load = async () => {
  const row = must(await db().from('app_settings').select('value').eq('key', 'photo_triggers').maybeSingle());
  return { phrasesText: formatLines(row?.value) };
};

export const actions = {
  save: async ({ request }) => {
    const list = parseLines(String((await request.formData()).get('phrases') ?? ''));
    must(await db().from('app_settings').upsert({ key: 'photo_triggers', value: list, updated_at: new Date().toISOString() }));
    return { saved: list.length };
  },
};

import { formatLines, parseLines } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

export const load = async () => {
  const row = must(await db().from('app_settings').select('value').eq('key', 'persona_rules').maybeSingle());
  return { rulesText: formatLines(row?.value) };
};

export const actions = {
  save: async ({ request }) => {
    const list = parseLines(String((await request.formData()).get('rules') ?? ''));
    must(await db().from('app_settings').upsert({ key: 'persona_rules', value: list, updated_at: new Date().toISOString() }));
    return { saved: list.length };
  },
};

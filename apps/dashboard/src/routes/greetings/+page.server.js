import { formatGreetings, parseGreetings } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

export const load = async () => {
  const row = must(await db().from('app_settings').select('value').eq('key', 'greetings').maybeSingle());
  return { greetingsText: formatGreetings(row?.value) };
};

export const actions = {
  save: async ({ request }) => {
    const list = parseGreetings(String((await request.formData()).get('greetings') ?? ''));
    must(await db().from('app_settings').upsert({ key: 'greetings', value: list, updated_at: new Date().toISOString() }));
    return { saved: list.length };
  },
};

import { applyReplacements, formatReplacements, parseReplacements } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

async function loadRules() {
  const row = must(await db().from('app_settings').select('value').eq('key', 'replacements').maybeSingle());
  return Array.isArray(row?.value) ? row.value : [];
}

export const load = async () => ({ rulesText: formatReplacements(await loadRules()) });

export const actions = {
  save: async ({ request }) => {
    const rulesText = String((await request.formData()).get('rules') ?? '');
    const rules = parseReplacements(rulesText);
    must(await db().from('app_settings').upsert({ key: 'replacements', value: rules, updated_at: new Date().toISOString() }));
    return { saved: rules.length };
  },
  test: async ({ request }) => {
    const f = await request.formData();
    const sample = String(f.get('sample') ?? '');
    const rulesText = String(f.get('rules') ?? '');
    return { sample, tried: applyReplacements(sample, parseReplacements(rulesText)) };
  },
};

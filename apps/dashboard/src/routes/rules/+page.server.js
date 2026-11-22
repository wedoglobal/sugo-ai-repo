import { fail } from '@sveltejs/kit';
import { formatLines, parseLines, suggestKeywords } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

const setting = async (key) => must(await db().from('app_settings').select('value').eq('key', key).maybeSingle())?.value;
const save = async (key, value) => must(await db().from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }));
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

export const load = async () => {
  const stored = await setting('context_rules');
  const recent = must(await db().from('temp_context').select('text').order('id', { ascending: false }).limit(300));
  const counts = Map.groupBy(recent, (r) => r.text.trim());
  return {
    rulesText: formatLines(await setting('persona_rules')),
    contextRules: (Array.isArray(stored) ? stored : []).map((r) => ({ when: clip(r.when, 200), keywords: clip(r.keywords, 300), rule: clip(r.rule, 4000), active: r.active !== false })),
    suggestions: [...counts].sort((a, b) => b[1].length - a[1].length).slice(0, 20).map(([text, rows]) => ({ text, count: rows.length, keywords: suggestKeywords(text) })),
  };
};

export const actions = {
  save: async ({ request }) => {
    const list = parseLines(String((await request.formData()).get('rules') ?? ''));
    await save('persona_rules', list);
    return { saved: list.length };
  },
  saveContext: async ({ request }) => {
    let raw;
    try { raw = JSON.parse(String((await request.formData()).get('contextRules') ?? '[]')); } catch { return fail(400, { contextError: 'Kurallar okunamadı' }); }
    const list = (Array.isArray(raw) ? raw : [])
      .map((r) => ({ when: clip(r?.when, 200), keywords: clip(r?.keywords, 300), rule: clip(r?.rule, 4000), active: r?.active !== false }))
      .filter((r) => r.when && r.rule)
      .slice(0, 100);
    await save('context_rules', list);
    return { savedContext: list.length };
  },
};

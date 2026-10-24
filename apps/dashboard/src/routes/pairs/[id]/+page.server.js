import { error, fail } from '@sveltejs/kit';
import { MEMORY_FIELDS } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

export const load = async ({ params }) => {
  const pair = must(await db().from('pairs').select('*, hosts(name, sugo_id)').eq('id', params.id).maybeSingle());
  if (!pair) error(404, 'pair yok');
  const messages = must(await db().from('messages').select('*').eq('pair_id', pair.id).order('id', { ascending: false }).limit(60)).reverse();
  const temp = must(await db().from('temp_context').select('*').eq('pair_id', pair.id).gt('expires_at', new Date().toISOString()).order('id'));
  return { pair, messages, temp, fields: MEMORY_FIELDS };
};

export const actions = {
  savePermanent: async ({ request, params }) => {
    const f = await request.formData();
    const pair = must(await db().from('pairs').select('permanent').eq('id', params.id).single());
    const permanent = {};
    for (const k of MEMORY_FIELDS) {
      const v = String(f.get(k) ?? '').trim();
      if (!v) continue;
      const old = pair.permanent[k];
      permanent[k] = old && String(old.value) === v ? old : { value: k === 'age' ? Number(v) || v : v, confidence: 1, updated_at: new Date().toISOString() };
    }
    const { error: err } = await db().from('pairs').update({ permanent }).eq('id', params.id);
    return err ? fail(400, { error: err.message }) : { saved: true };
  },
  deleteTemp: async ({ request, params }) => {
    const id = Number((await request.formData()).get('id'));
    must(await db().from('temp_context').delete().eq('id', id).eq('pair_id', params.id));
  },
};

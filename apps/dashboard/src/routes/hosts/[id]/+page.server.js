import { error, fail, redirect } from '@sveltejs/kit';
import { readPersona } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

const lines = (v) => String(v ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

export const load = async ({ params }) => {
  const host = must(await db().from('hosts').select('*').eq('id', params.id).maybeSingle());
  if (!host) error(404, 'host yok');
  const persona = readPersona(host.persona);
  return {
    host,
    persona,
    factsText: persona.facts.map((f) => `${f.shareable ? '' : '!'}${f.label} | ${f.value}`).join('\n'),
    knowledgeText: (host.knowledge ?? []).map((k) => `${k.title ?? ''} | ${k.content}`).join('\n'),
  };
};

export const actions = {
  save: async ({ request, params }) => {
    const f = await request.formData();
    const facts = lines(f.get('facts')).map((l) => {
      const hidden = l.startsWith('!');
      const [label, ...rest] = (hidden ? l.slice(1) : l).split('|');
      return { label: label.trim(), value: rest.join('|').trim(), shareable: !hidden };
    }).filter((x) => x.label && x.value);
    const knowledge = lines(f.get('knowledge')).map((l) => {
      const [title, ...rest] = l.split('|');
      return rest.length ? { title: title.trim(), content: rest.join('|').trim(), active: true } : { title: '', content: l, active: true };
    });
    const persona = readPersona({
      formality: f.get('formality'), length: f.get('length'), emoji: f.get('emoji'), typos: f.get('typos') === 'on',
      instructions: f.get('instructions'), examples: lines(f.get('examples')), facts,
    });
    const { error: err } = await db().from('hosts').update({
      name: String(f.get('name') ?? '').trim(), active: f.get('active') === 'on',
      model: String(f.get('model') ?? '').trim() || null, persona, knowledge, updated_at: new Date().toISOString(),
    }).eq('id', params.id);
    if (err) return fail(400, { error: err.message });
    return { saved: true };
  },
  remove: async ({ params }) => {
    must(await db().from('hosts').delete().eq('id', params.id));
    redirect(303, '/hosts');
  },
};

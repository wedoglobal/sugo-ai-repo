import { error, fail, redirect } from '@sveltejs/kit';
import { EXAMPLE_LIMIT, FACT_LIMIT, LEVEL_FIELDS, LEVEL_LABELS, LEVEL_RULES, SPEECH_VOICES, importPersona, readPersona } from '@sugo/core';
import { db, deps, must } from '$lib/server/deps.js';
import { BUCKET, MAX_BYTES } from '$lib/server/media.js';

const text = (v, n) => String(v ?? '').trim().slice(0, n);
const jsonList = (v) => {
  try {
    const x = JSON.parse(String(v ?? '[]'));
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
};
const KNOWLEDGE_LIMIT = 80;

export const load = async ({ params }) => {
  const host = must(await db().from('hosts').select('*').eq('id', params.id).maybeSingle());
  if (!host) error(404, 'host yok');
  const media = must(await db().from('media').select('id, name, content_type').eq('host_id', params.id).order('created_at'));
  const sent = media.length ? must(await db().from('media_sent').select('media_id').in('media_id', media.map((m) => m.id))) : [];
  const sentCount = Object.groupBy(sent, (s) => s.media_id);
  return {
    host,
    persona: readPersona(host.persona),
    knowledge: (Array.isArray(host.knowledge) ? host.knowledge : []).map((k) => ({ title: text(k.title, 100), content: text(k.content, 2000), active: k.active !== false })),
    voices: SPEECH_VOICES,
    defaultModel: deps().models.chat,
    level: { rules: LEVEL_RULES, fields: LEVEL_FIELDS, labels: LEVEL_LABELS },
    limits: { facts: FACT_LIMIT, examples: EXAMPLE_LIMIT, knowledge: KNOWLEDGE_LIMIT },
    media: media.map((m) => ({ ...m, sent: sentCount[m.id]?.length ?? 0 })),
  };
};

export const actions = {
  save: async ({ request, params }) => {
    const f = await request.formData();
    const current = must(await db().from('hosts').select('persona').eq('id', params.id).single());
    const knowledge = jsonList(f.get('knowledge'))
      .map((k) => ({ title: text(k?.title, 100), content: text(k?.content, 2000), active: k?.active !== false }))
      .filter((k) => k.content)
      .slice(0, KNOWLEDGE_LIMIT);
    const persona = readPersona({
      formality: f.get('formality'), seriousness: f.get('seriousness'), punctuation: f.get('punctuation'),
      typos: f.get('typos'), emoji: f.get('emoji'), laughter: f.get('laughter'),
      length: f.get('length'), capitals: f.get('capitals'), timeZone: f.get('timeZone'),
      instructions: f.get('instructions'), address: f.get('address'),
      emojis: String(f.get('emojis') ?? '').split(/[,\s]+/).filter(Boolean),
      laughs: String(f.get('laughs') ?? '').split(',').map((v) => v.trim()).filter(Boolean),
      laughCooldown: f.get('laughCooldown'), laughMax: f.get('laughMax'),
      voice: f.get('voice'), voiceStyle: f.get('voiceStyle'),
      nudge: f.get('nudge') === 'on', nudgeMinutes: f.get('nudgeMinutes'),
      nudgeLines: String(f.get('nudgeLines') ?? '').split('\n').map((l) => l.trim()).filter(Boolean),
      examples: String(f.get('examples') ?? '').split('\n').map((l) => l.trim()).filter(Boolean),
      facts: jsonList(f.get('facts')),
      extras: readPersona(current.persona).extras,
    });
    const { error: err } = await db().from('hosts').update({
      name: text(f.get('name'), 100), active: f.get('active') === 'on',
      model: text(f.get('model'), 200) || null, persona, knowledge, updated_at: new Date().toISOString(),
    }).eq('id', params.id);
    if (err) return fail(400, { error: err.message });
    return { saved: true };
  },
  import: async ({ request, params }) => {
    const file = (await request.formData()).get('file');
    if (!(file instanceof File) || !file.size) return fail(400, { importError: 'JSON dosyası seç' });
    let result;
    try {
      result = importPersona(JSON.parse(await file.text()));
    } catch (e) {
      return fail(400, { importError: e instanceof SyntaxError ? 'Dosya geçerli JSON değil' : e.message });
    }
    const current = must(await db().from('hosts').select('name, persona').eq('id', params.id).single());
    const { voice, voiceStyle } = readPersona(current.persona);
    const { error: err } = await db().from('hosts').update({
      name: current.name || result.name, persona: { ...result.persona, voice, voiceStyle }, knowledge: result.knowledge, updated_at: new Date().toISOString(),
    }).eq('id', params.id);
    if (err) return fail(400, { importError: err.message });
    return { imported: { name: result.name, knowledge: result.knowledge.length, facts: result.persona.facts.length, examples: result.persona.examples.length, skipped: result.skipped, warnings: result.warnings } };
  },
  upload: async ({ request, params }) => {
    const files = (await request.formData()).getAll('files').filter((f) => f instanceof File && f.size);
    if (!files.length) return fail(400, { mediaError: 'Dosya seç' });
    let added = 0;
    for (const file of files) {
      if (!/^(image|audio)\//.test(file.type)) return fail(400, { mediaError: `${file.name}: görsel veya ses değil` });
      if (file.size > MAX_BYTES) return fail(400, { mediaError: `${file.name}: 8 MB'den büyük` });
      const path = `${params.id}/${crypto.randomUUID()}.${file.type.split('/')[1].replace(/[^a-z0-9]/gi, '') || 'img'}`;
      const up = await db().storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type });
      if (up.error) return fail(400, { mediaError: up.error.message });
      must(await db().from('media').insert({ host_id: params.id, path, name: file.name, content_type: file.type }));
      added++;
    }
    return { mediaAdded: added };
  },
  deleteMedia: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    const row = must(await db().from('media').select('path').eq('id', id).maybeSingle());
    if (row) {
      await db().storage.from(BUCKET).remove([row.path]);
      must(await db().from('media').delete().eq('id', id));
    }
    return { mediaDeleted: true };
  },
  remove: async ({ params }) => {
    must(await db().from('hosts').delete().eq('id', params.id));
    redirect(303, '/hosts');
  },
};

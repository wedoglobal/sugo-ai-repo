import { fail, redirect } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
import { BUCKET } from '$lib/server/media.js';
import { earningsByHost, emptyEarnings } from '$lib/server/earnings.js';

export const load = async () => {
  const hosts = must(await db().from('hosts').select('id, sugo_id, name, active, updated_at').order('created_at'));
  const byHost = await earningsByHost();
  return { hosts: hosts.map((h) => ({ ...h, earn: byHost.get(h.id) ?? emptyEarnings })) };
};

/** Kaynak profilin medya dosyalarını depoda kopyalar; hata olursa kopyalananları silip hata metnini döner. */
async function copyMedia(fromId, toId) {
  const rows = must(await db().from('media').select('path, name, content_type, created_at').eq('host_id', fromId).order('created_at'));
  const copiedPaths = [];
  for (const row of rows) {
    const path = `${toId}/${crypto.randomUUID()}.${row.path.split('.').pop()}`;
    const { error } = await db().storage.from(BUCKET).copy(row.path, path);
    if (error) { await db().storage.from(BUCKET).remove(copiedPaths); return error.message; }
    copiedPaths.push(path);
    const { error: insertError } = await db().from('media').insert({ host_id: toId, path, name: row.name, content_type: row.content_type });
    if (insertError) { await db().storage.from(BUCKET).remove(copiedPaths); return insertError.message; }
  }
  return null;
}

export const actions = {
  create: async ({ request }) => {
    const f = await request.formData();
    const sugoId = String(f.get('sugo_id') ?? '').trim();
    if (!/^\d+$/.test(sugoId)) return fail(400, { error: 'Sugo id sayısal olmalı' });
    const name = String(f.get('name') ?? '').trim();
    // Referans profilin persona (ses dahil), bilgi, model ve medya dosyaları birebir kopyalanır; konum/proxy, sohbetler ve kuyruk kopyalanmaz.
    const cloneId = String(f.get('clone_from') ?? '').trim();
    let copy = {};
    if (cloneId) {
      const source = must(await db().from('hosts').select('name, persona, knowledge, model').eq('id', cloneId).maybeSingle());
      if (!source) return fail(400, { error: 'Referans profil bulunamadı' });
      copy = { persona: source.persona, knowledge: source.knowledge, model: source.model };
    }
    const { data, error } = await db().from('hosts').insert({ sugo_id: sugoId, name, ...copy }).select('id').single();
    if (error) return fail(400, { error: error.code === '23505' ? 'Bu sugo id zaten kayıtlı' : error.message });
    if (cloneId) {
      const copied = await copyMedia(cloneId, data.id);
      if (copied) {
        await db().from('hosts').delete().eq('id', data.id);
        return fail(400, { error: `Medya kopyalanamadı: ${copied}` });
      }
    }
    redirect(303, `/hosts/${data.id}`);
  },
};

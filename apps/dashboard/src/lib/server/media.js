import { error } from '@sveltejs/kit';
import { db, must } from './deps.js';

export const BUCKET = 'media';
export const MAX_BYTES = 8 * 1024 * 1024;

/** Katalogdaki bir fotoğrafın baytlarını yanıt olarak döner. */
export async function mediaResponse(id) {
  const row = must(await db().from('media').select('path, content_type').eq('id', id).maybeSingle());
  if (!row) error(404, 'medya yok');
  const { data, error: err } = await db().storage.from(BUCKET).download(row.path);
  if (err) error(500, err.message);
  return new Response(await data.arrayBuffer(), { headers: { 'content-type': row.content_type, 'cache-control': 'private, max-age=3600' } });
}

/** Kaynak profilin medya dosyalarını depoda kopyalar; hata olursa kopyalananları silip hata metnini döner. */
export async function copyMedia(fromId, toId) {
  const rows = must(await db().from('media').select('path, name, content_type, created_at').eq('host_id', fromId).order('created_at'));
  const copiedPaths = [];
  for (const row of rows) {
    const path = `${toId}/${crypto.randomUUID()}.${row.path.split('.').pop()}`;
    const { error: err } = await db().storage.from(BUCKET).copy(row.path, path);
    if (err) { await db().storage.from(BUCKET).remove(copiedPaths); return err.message; }
    copiedPaths.push(path);
    const { error: insertError } = await db().from('media').insert({ host_id: toId, path, name: row.name, content_type: row.content_type });
    if (insertError) { await db().storage.from(BUCKET).remove(copiedPaths); return insertError.message; }
  }
  return null;
}

/** Hedef profilin medyasını kaynağınkiyle değiştirir; kopyalama başarısız olursa hedefin eski medyası korunur. Hata metni ya da null döner. */
export async function replaceMedia(fromId, toId) {
  const old = must(await db().from('media').select('id, path').eq('host_id', toId));
  const copied = await copyMedia(fromId, toId);
  if (copied) {
    const keep = old.map((m) => m.id);
    const fresh = must(await db().from('media').select('id, path').eq('host_id', toId));
    const partial = fresh.filter((m) => !keep.includes(m.id));
    if (partial.length) {
      await db().storage.from(BUCKET).remove(partial.map((m) => m.path));
      await db().from('media').delete().in('id', partial.map((m) => m.id));
    }
    return copied;
  }
  if (old.length) {
    await db().storage.from(BUCKET).remove(old.map((m) => m.path));
    must(await db().from('media').delete().in('id', old.map((m) => m.id)));
  }
  return null;
}

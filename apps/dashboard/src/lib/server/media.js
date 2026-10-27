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

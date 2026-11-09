import { error } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
export async function load({ params }) {
  const host = must(await db().from('hosts').select('id, name, sugo_id, active, updated_at').eq('id', params.id).maybeSingle());
  if (!host) error(404, 'Host bulunamadı');
  return { host };
}

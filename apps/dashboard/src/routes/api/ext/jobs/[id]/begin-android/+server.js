import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';

export async function POST({ params }) {
  if (!/^\d{1,18}$/u.test(params.id)) return json({ error: 'geçersiz iş' }, { status: 400 });
  const reserved = must(await db().rpc('begin_android_delivery', { p_job: params.id }));
  return json({ reserved });
}

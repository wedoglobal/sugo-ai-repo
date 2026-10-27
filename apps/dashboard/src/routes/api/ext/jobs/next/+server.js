import { json } from '@sveltejs/kit';
import { NotFoundError, nextJob } from '@sugo/core';
import { db, deps } from '$lib/server/deps.js';

export async function GET({ url }) {
  const host = url.searchParams.get('host');
  if (!host) return json({ error: 'host gerekli' }, { status: 400 });
  try {
    return json({ job: await nextJob(db(), host, deps()) });
  } catch (e) {
    return json({ error: e.message }, { status: e instanceof NotFoundError ? 404 : 500 });
  }
}

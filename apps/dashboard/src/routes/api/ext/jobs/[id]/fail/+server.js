import { json } from '@sveltejs/kit';
import { failJob } from '@sugo/core';
import { db } from '$lib/server/deps.js';

export async function POST({ params, request }) {
  const b = await request.json().catch(() => ({}));
  await failJob(db(), Number(params.id), b?.error ?? 'extension hatası');
  return json({ ok: true });
}

import { json } from '@sveltejs/kit';
import { rejectJob } from '@sugo/core';
import { db, deps } from '$lib/server/deps.js';

export async function POST({ params, request }) {
  const b = await request.json().catch(() => ({}));
  try {
    return json({ text: await rejectJob(db(), deps(), Number(params.id), String(b?.text ?? '')) });
  } catch (e) {
    return json({ error: e.message }, { status: 500 });
  }
}

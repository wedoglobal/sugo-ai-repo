import { json } from '@sveltejs/kit';
import { syncHost } from '@sugo/core';
import { db } from '$lib/server/deps.js';

export async function POST({ params, request }) {
  if (!/^\d+$/.test(params.sugoId)) return json({ error: 'sugoId sayısal olmalı' }, { status: 400 });
  const b = await request.json().catch(() => ({}));
  const host = await syncHost(db(), params.sugoId, b?.name ? String(b.name) : '');
  return json({ host: { id: host.id, sugoId: host.sugo_id, name: host.name, active: host.active } });
}

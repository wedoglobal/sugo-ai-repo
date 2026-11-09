import { json } from '@sveltejs/kit';
import { NotFoundError, nextJob } from '@sugo/core';
import { db, deps } from '$lib/server/deps.js';

export async function GET({ url }) {
  const host = url.searchParams.get('host');
  if (!host) return json({ error: 'host gerekli' }, { status: 400 });
  try {
    return json({ job: await nextJob(db(), host, deps(), { replyOnly: url.searchParams.get('replyOnly') === '1' }) });
  } catch (e) {
    return json({ error: e.message }, { status: e instanceof NotFoundError ? 404 : 500 });
  }
}

export async function POST({ request }) {
  const body = await request.json().catch(() => null);
  const host = String(body?.host ?? body?.hostSugoId ?? '').trim();
  if (!host) return json({ error: 'host gerekli' }, { status: 400 });
  if (body.visiblePeerIds != null && !Array.isArray(body.visiblePeerIds)) {
    return json({ error: 'visiblePeerIds liste olmalı' }, { status: 400 });
  }
  // box-female gibi sistem kutuları kullanıcı değildir; tek kayıt tüm kuyruğu durdurmaz.
  const visiblePeerIds = Array.isArray(body.visiblePeerIds)
    ? [...new Set(body.visiblePeerIds.filter((id) => typeof id === 'string' || (typeof id === 'number' && Number.isSafeInteger(id)))
      .map((id) => String(id).trim()).filter((id) => /^\d{1,30}$/.test(id)))].slice(0, 1000)
    : null;
  try {
    return json({ job: await nextJob(db(), host, deps(), { replyOnly: body.replyOnly === true, visiblePeerIds }) });
  } catch (e) {
    return json({ error: e.message }, { status: e instanceof NotFoundError ? 404 : 500 });
  }
}

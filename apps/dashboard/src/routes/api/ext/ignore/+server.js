import { json } from '@sveltejs/kit';
import { ignorePair, NotFoundError } from '@sugo/core';
import { db } from '$lib/server/deps.js';

export async function POST({ request }) {
  const body = await request.json().catch(() => null);
  if (!body?.hostSugoId || !body?.peerSugoId || !['female', 'blocked', 'follow', 'activity'].includes(body.reason)) {
    return json({ error: 'hostSugoId, peerSugoId ve geçerli reason gerekli' }, { status: 400 });
  }
  try {
    return json(await ignorePair(db(), { hostSugoId: String(body.hostSugoId), peerSugoId: String(body.peerSugoId), reason: body.reason }));
  } catch (e) {
    return json({ error: e.message }, { status: e instanceof NotFoundError ? 404 : 500 });
  }
}

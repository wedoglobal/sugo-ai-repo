import { json } from '@sveltejs/kit';
import { NotFoundError, reportExtensionError } from '@sugo/core';
import { db } from '$lib/server/deps.js';

export async function POST({ request }) {
  const b = await request.json().catch(() => null);
  if (!b?.hostSugoId || !b?.peerSugoId || !b?.error) {
    return json({ error: 'hostSugoId, peerSugoId ve error gerekli' }, { status: 400 });
  }
  try {
    return json(await reportExtensionError(db(), {
      hostSugoId: String(b.hostSugoId), peerSugoId: String(b.peerSugoId), error: String(b.error),
    }));
  } catch (e) {
    return json({ error: e.message }, { status: e instanceof NotFoundError ? 404 : 500 });
  }
}

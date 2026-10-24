import { json } from '@sveltejs/kit';
import { NotFoundError, ingest } from '@sugo/core';
import { db, deps } from '$lib/server/deps.js';

export async function POST({ request }) {
  const b = await request.json().catch(() => null);
  if (!b?.hostSugoId || !b?.peerSugoId || !Array.isArray(b.messages)) {
    return json({ error: 'hostSugoId, peerSugoId ve messages gerekli' }, { status: 400 });
  }
  try {
    const messages = b.messages.map((m) => ({ dir: m.dir, text: String(m.text ?? ''), ts: m.ts == null ? '' : String(m.ts) }));
    return json(await ingest(db(), deps(), { hostSugoId: String(b.hostSugoId), peerSugoId: String(b.peerSugoId), peerName: b.peerName ? String(b.peerName) : '', messages }));
  } catch (e) {
    return json({ error: e.message }, { status: e instanceof NotFoundError ? 404 : 500 });
  }
}

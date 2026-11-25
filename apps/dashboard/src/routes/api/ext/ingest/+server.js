import { json } from '@sveltejs/kit';
import { NotFoundError, ingest } from '@sugo/core';
import { db, deps } from '$lib/server/deps.js';
import { webRepairClient } from '$lib/server/conversation-repair.js';

export async function POST({ request }) {
  const b = await request.json().catch(() => null);
  if (!b?.hostSugoId || !b?.peerSugoId || !Array.isArray(b.messages)) {
    return json({ error: 'hostSugoId, peerSugoId ve messages gerekli' }, { status: 400 });
  }
  try {
    const messages = b.messages.map((m) => ({ dir: m.dir, text: String(m.text ?? ''), ts: m.ts == null ? '' : String(m.ts), diamonds: Number.isFinite(m.diamonds) ? m.diamonds : 0 }));
    const dependencies = deps();
    const clientDeps = webRepairClient(request) ? { ...dependencies, repairClient: true } : dependencies;
    const match = typeof b.match === 'boolean' ? { match: b.match } : {};
    const matchEvent = b.match === true && typeof b.matchEventId === 'string' && /^[\w:-]{1,140}$/u.test(b.matchEventId)
      ? { matchEventId: b.matchEventId } : {};
    return json(await ingest(db(), clientDeps, { hostSugoId: String(b.hostSugoId), peerSugoId: String(b.peerSugoId), peerName: b.peerName ? String(b.peerName) : '', ...match, ...matchEvent, ...(typeof b.voiceEnabled === 'boolean' ? { voiceEnabled: b.voiceEnabled } : {}), ...(b.online === true ? { online: true } : {}), ...(b.emptyChat === true ? { emptyChat: true } : {}), ...(Number.isInteger(b.unansweredFrom) && b.unansweredFrom >= 0 && b.unansweredFrom < messages.length ? { unansweredFrom: b.unansweredFrom } : {}), messages }));
  } catch (e) {
    return json({ error: e.message }, { status: e instanceof NotFoundError ? 404 : 500 });
  }
}

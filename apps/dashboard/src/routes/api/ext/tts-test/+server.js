import { json } from '@sveltejs/kit';
import { createSpeechMedia, readPersona } from '@sugo/core';
import { db, deps, must } from '$lib/server/deps.js';

/** Extension'ın "ses testi" düğmesi: verilen metni hostun sesiyle okutup geçici bir ses medyası döner. */
export async function POST({ request }) {
  const b = await request.json().catch(() => null);
  const text = String(b?.text ?? '').trim();
  if (!b?.hostSugoId || !text || text.length > 300) return json({ error: 'hostSugoId ve en fazla 300 karakterlik text gerekli' }, { status: 400 });
  const host = must(await db().from('hosts').select('id, persona').eq('sugo_id', String(b.hostSugoId)).maybeSingle());
  if (!host) return json({ error: 'host yok' }, { status: 404 });
  const persona = readPersona(host.persona);
  if (!persona.voice) return json({ error: 'Hostta ses seçili değil (panel > Ses)' }, { status: 400 });
  try {
    return json({ mediaId: await createSpeechMedia(db(), deps(), { host, persona, text, label: 'test' }) });
  } catch (e) {
    return json({ error: e.message }, { status: 502 });
  }
}

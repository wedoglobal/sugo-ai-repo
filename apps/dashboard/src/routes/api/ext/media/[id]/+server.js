import { json } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';
import { BUCKET, mediaResponse } from '$lib/server/media.js';

export const GET = ({ params }) => mediaResponse(params.id);

/** Yalnız TTS ile üretilmiş geçici medya silinebilir; katalog dosyalarına dokunulmaz. */
export async function DELETE({ params }) {
  const row = must(await db().from('media').select('path, generated').eq('id', params.id).maybeSingle());
  if (!row) return json({ ok: true });
  if (!row.generated) return json({ error: 'katalog dosyası silinemez' }, { status: 403 });
  await db().storage.from(BUCKET).remove([row.path]);
  must(await db().from('media').delete().eq('id', params.id));
  return json({ ok: true });
}

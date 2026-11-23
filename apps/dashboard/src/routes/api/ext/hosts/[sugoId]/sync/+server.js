import { json } from '@sveltejs/kit';
import { syncHost } from '@sugo/core';
import { db } from '$lib/server/deps.js';
import { copyMedia } from '$lib/server/media.js';

export async function POST({ params, request }) {
  if (!/^\d+$/.test(params.sugoId)) return json({ error: 'sugoId sayısal olmalı' }, { status: 400 });
  const b = await request.json().catch(() => ({}));
  const host = await syncHost(db(), params.sugoId, b?.name ? String(b.name) : '');
  // Şablon profilin medya dosyaları da kopyalanır; olmazsa profil yine çalışır (yalnız medya işleri boş kalır).
  const mediaError = host.clonedFrom ? await copyMedia(host.clonedFrom, host.id) : null;
  return json({ cloned: !!host.clonedFrom, mediaError, host: { id: host.id, sugoId: host.sugo_id, name: host.name, active: host.active } });
}

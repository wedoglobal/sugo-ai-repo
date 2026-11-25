import { json } from '@sveltejs/kit';
import { failJob } from '@sugo/core';
import { db } from '$lib/server/deps.js';

export async function POST({ params, request }) {
  const b = await request.json().catch(() => ({}));
  const reason = String(b?.error ?? 'extension hatası');
  if (b?.stopRetry === true || ['mesaj gönderilemedi (giden mesaj sayısı artmadı)', 'android: medya gönderilemiyor'].includes(reason)) {
    const { error } = await db().rpc('stop_android_delivery', { p_job: params.id, p_error: reason });
    return error ? json({ error: error.message }, { status: 500 }) : json({ ok: true });
  }
  await failJob(db(), Number(params.id), reason);
  return json({ ok: true });
}

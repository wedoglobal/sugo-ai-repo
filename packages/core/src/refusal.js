function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/** Eklentinin, sugo'nun mesajları kırmızı ünlemle reddettiğini bildirdiği hata metni. */
export const REFUSED_ERROR = 'sugo filtresi mesajları reddetti';
/** Mesajlarımızı kabul etmeyen kişiye bu süre boyunca kendiliğinden (karşılama/dürtme) yazılmaz; kişi yazarsa cevap yine gider. */
export const REFUSAL_COOLDOWN_MS = 6 * 3600_000;

/** Pair'e son `REFUSAL_COOLDOWN_MS` içinde gönderim reddedildiyse true döner. */
export async function recentlyRefused(db, pair, now = new Date()) {
  const since = new Date(now.getTime() - REFUSAL_COOLDOWN_MS).toISOString();
  return must(await db.from('jobs').select('id').eq('pair_id', pair).eq('status', 'failed').like('error', `${REFUSED_ERROR}%`).gt('updated_at', since).limit(1)).length > 0;
}

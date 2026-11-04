import { db, must } from './deps.js';

const DAY_MS = 86_400_000;

/** Host başına kazanç özeti; tahmin = son 14 günün (veri daha kısaysa mevcut sürenin) günlük ortalaması × 1 / 7 / 30. */
export async function earningsByHost() {
  const rows = must(await db().rpc('diamond_totals'));
  const now = Date.now();
  const map = new Map();
  for (const r of rows) {
    const days = Math.min(14, Math.max(1, (now - new Date(r.first_at).getTime()) / DAY_MS));
    const perDay = Number(r.last14) / days;
    map.set(r.host_id, {
      today: Number(r.today), week: Number(r.week), month: Number(r.month),
      est: { day: Math.round(perDay), week: Math.round(perDay * 7), month: Math.round(perDay * 30) },
    });
  }
  return map;
}

export const emptyEarnings = { today: 0, week: 0, month: 0, est: { day: 0, week: 0, month: 0 } };

import { db, must } from '$lib/server/deps.js';
import { earningsByHost, emptyEarnings } from '$lib/server/earnings.js';

export const load = async () => {
  const hosts = must(await db().from('hosts').select('id, name, sugo_id').order('created_at'));
  const byHost = await earningsByHost();
  const rows = hosts.map((h) => ({ ...h, ...(byHost.get(h.id) ?? emptyEarnings) }));
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return { rows, total: { today: sum('today'), week: sum('week'), month: sum('month') } };
};

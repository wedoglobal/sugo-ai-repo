import { db, must } from '$lib/server/deps.js';

export const load = async () => {
  const pairs = must(await db().from('pairs').select('id, peer_sugo_id, peer_name, permanent, last_activity_at, hosts(name)').order('last_activity_at', { ascending: false }).limit(200));
  const unread = must(await db().from('messages').select('pair_id').eq('direction', 'in').eq('handled', false));
  const counts = {};
  for (const m of unread) counts[m.pair_id] = (counts[m.pair_id] ?? 0) + 1;
  return { pairs, counts };
};

import { isFollowNotice } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

const PAGE = 1000;
const MAX_ROWS = 40000;

/** Sohbetlerin mesajlarını sırayla okur (en yeni aktiviteler listelenen pair'ler için). */
async function allMessages(pairIds) {
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const page = must(await db().from('messages').select('pair_id, direction, text, diamonds, handled').in('pair_id', pairIds).order('id').range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

/** Her sohbet için: bizim ilk mesajımızdan sonra gelen gerçek cevap sayısı, mesaj sayıları, elmas ve son söz. */
function stats(messages) {
  const byPair = new Map();
  for (const m of messages) {
    const s = byPair.get(m.pair_id) ?? { out: 0, in: 0, replies: 0, diamonds: 0, unread: 0, last: '', spoke: false };
    if (m.direction === 'out') { s.out++; s.spoke = true; s.diamonds += m.diamonds ?? 0; }
    else {
      s.in++;
      if (s.spoke && !isFollowNotice(m.text)) s.replies++;
      if (!m.handled) s.unread++;
    }
    s.last = m.direction;
    byPair.set(m.pair_id, s);
  }
  return byPair;
}

export const load = async ({ url }) => {
  const q = url.searchParams;
  const filters = {
    host: q.get('host') ?? '', replied: q.getAll('replied').at(-1) !== '0', minReplies: Math.max(1, Number(q.get('min')) || 1),
    diamonds: q.get('diamonds') === '1', unread: q.get('unread') === '1', last: q.get('last') ?? '', search: (q.get('q') ?? '').trim().toLocaleLowerCase('tr'),
    sort: ['activity', 'replies', 'diamonds'].includes(q.get('sort')) ? q.get('sort') : 'activity',
  };
  const hosts = must(await db().from('hosts').select('id, name, sugo_id').order('created_at'));
  let query = db().from('pairs').select('id, peer_sugo_id, peer_name, permanent, last_activity_at, hosts(name)').not('peer_sugo_id', 'like', 'pg%').order('last_activity_at', { ascending: false }).limit(500);
  if (filters.host) query = query.eq('host_id', filters.host);
  const pairs = must(await query);
  const byPair = pairs.length ? stats(await allMessages(pairs.map((p) => p.id))) : new Map();
  const empty = { out: 0, in: 0, replies: 0, diamonds: 0, unread: 0, last: '' };
  let rows = pairs.map((p) => ({ ...p, stat: byPair.get(p.id) ?? empty }));
  rows = rows.filter(({ stat, ...p }) => {
    if (filters.replied && stat.replies < filters.minReplies) return false;
    if (filters.diamonds && stat.diamonds <= 0) return false;
    if (filters.unread && stat.unread <= 0) return false;
    if (filters.last === 'peer' && stat.last !== 'in') return false;
    if (filters.last === 'us' && stat.last !== 'out') return false;
    if (filters.search) {
      const hay = `${p.peer_sugo_id} ${p.peer_name ?? ''} ${p.permanent?.name?.value ?? ''}`.toLocaleLowerCase('tr');
      if (!hay.includes(filters.search)) return false;
    }
    return true;
  });
  if (filters.sort === 'replies') rows.sort((a, b) => b.stat.replies - a.stat.replies);
  if (filters.sort === 'diamonds') rows.sort((a, b) => b.stat.diamonds - a.stat.diamonds);
  return { rows: rows.slice(0, 200), total: rows.length, scanned: pairs.length, hosts, filters };
};

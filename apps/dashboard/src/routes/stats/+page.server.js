import { isFollowNotice, matchStats } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';

const PAGE = 1000;

export const load = async ({ url }) => {
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 14));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const hosts = must(await db().from('hosts').select('id, name, sugo_id, created_at').order('created_at'));
  const notices = [];
  for (let from = 0; from < 50000; from += PAGE) {
    const page = must(await db().from('messages').select('text, created_at, pairs!inner(host_id)').eq('direction', 'in').ilike('text', '%takip%').gte('created_at', since).order('id').range(from, from + PAGE - 1));
    notices.push(...page.filter((m) => isFollowNotice(m.text)).map((m) => ({ host_id: m.pairs.host_id, created_at: m.created_at })));
    if (page.length < PAGE) break;
  }
  const log = must(await db().from('app_settings').select('value').eq('key', 'ext_versions').maybeSingle())?.value ?? {};
  return { days, hosts, ...matchStats(notices.filter((n) => n.host_id), log, Date.now(), { version: '0.2.3', hosts: hosts.map((h) => ({ id: h.id, from: h.created_at > since ? h.created_at : since })) }) };
};

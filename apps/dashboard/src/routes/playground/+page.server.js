import { fail, redirect } from '@sveltejs/kit';
import { importPlaygroundPair, playgroundTurn } from '@sugo/core';
import { db, deps, must } from '$lib/server/deps.js';

const peerCode = (v) => String(v ?? '').trim().replace(/[^\w]/g, '') || 'test1';
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
/** Formdaki deneme kuralları (JSON); boş bağlam/kural atılır. */
function draftRules(f) {
  try {
    return (JSON.parse(String(f.get('drafts') ?? '[]')) ?? []).map((r) => ({ when: clip(r?.when, 200), keywords: clip(r?.keywords, 300), rule: clip(r?.rule, 4000), active: r?.active !== false })).filter((r) => r.when && r.rule).slice(0, 10);
  } catch { return []; }
}
const lines = (v) => String(v ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

/** Playground kişisinin o ana kadarki konuşması ve geçerli geçici bağlamı. */
async function conversation(host, peer) {
  const id = `${host}-pg${peer}`;
  const messages = must(await db().from('messages').select('direction, text').eq('pair_id', id).order('id'));
  const temp = must(await db().from('temp_context').select('text').eq('pair_id', id).gt('expires_at', new Date().toISOString()).order('id'));
  return { messages, temp: temp.map((t) => t.text) };
}

export const load = async ({ url }) => {
  // ?pair=<sohbet> ile gelinirse sohbet test kişisine kopyalanır ve temiz adrese yönlenilir (yenilemede tekrar kopyalanmasın).
  const importId = url.searchParams.get('pair');
  if (importId) {
    let target;
    try { target = await importPlaygroundPair(db(), importId); } catch { target = null; }
    if (target) redirect(303, `/playground?host=${encodeURIComponent(target.hostSugoId)}&peer=${encodeURIComponent(target.peer)}`);
  }
  const hosts = must(await db().from('hosts').select('id, sugo_id, name').order('created_at'));
  const rules = must(await db().from('app_settings').select('value').eq('key', 'context_rules').maybeSingle())?.value;
  const pairs = must(await db().from('pairs').select('id, peer_sugo_id, peer_name, last_activity_at, hosts(name, sugo_id)').not('peer_sugo_id', 'like', 'pg%').order('last_activity_at', { ascending: false }).limit(100));
  const host = url.searchParams.get('host') || hosts[0]?.sugo_id || '';
  const peer = peerCode(url.searchParams.get('peer'));
  return {
    hosts, host, peer, pairs,
    presetContext: url.searchParams.get('context') ?? '',
    contexts: (Array.isArray(rules) ? rules : []).map((r) => r.when).filter(Boolean),
    chat: host ? await conversation(host, peer) : { messages: [], temp: [] },
  };
};

export const actions = {
  send: async ({ request }) => {
    const f = await request.formData();
    const hostSugoId = String(f.get('host'));
    const peer = peerCode(f.get('peer'));
    const text = String(f.get('text') ?? '');
    const context = lines(f.get('context'));
    try {
      const result = await playgroundTurn(db(), deps(), { hostSugoId, peerSugoId: `pg${peer}`, peerName: `test ${peer}`, text, context, draftRules: draftRules(f) });
      return { result, host: hostSugoId, peer, chat: await conversation(hostSugoId, peer) };
    } catch (e) {
      return fail(500, { error: e.message, host: hostSugoId, peer, text, context: context.join('\n'), chat: await conversation(hostSugoId, peer).catch(() => null) });
    }
  },
  import: async ({ request }) => {
    const pairId = String((await request.formData()).get('pair') ?? '');
    try {
      const { hostSugoId, peer } = await importPlaygroundPair(db(), pairId);
      return { imported: true, host: hostSugoId, peer, chat: await conversation(hostSugoId, peer) };
    } catch (e) {
      return fail(400, { importError: e.message });
    }
  },
  // Son cevabı silip aynı gelen mesaja güncel persona ile yeniden cevap üretir (persona düzenleyip denemek için).
  retry: async ({ request }) => {
    const f = await request.formData();
    const hostSugoId = String(f.get('host'));
    const peer = peerCode(f.get('peer'));
    const pair = `${hostSugoId}-pg${peer}`;
    try {
      const rows = must(await db().from('messages').select('id, direction, text').eq('pair_id', pair).order('id'));
      const lastIn = rows.findLastIndex((m) => m.direction === 'in');
      if (lastIn < 0) throw new Error('Yeniden cevaplanacak gelen mesaj yok');
      must(await db().from('messages').delete().eq('pair_id', pair).gte('id', rows[lastIn].id));
      const result = await playgroundTurn(db(), deps(), { hostSugoId, peerSugoId: `pg${peer}`, peerName: `test ${peer}`, text: rows[lastIn].text, draftRules: draftRules(f) });
      return { result, host: hostSugoId, peer, chat: await conversation(hostSugoId, peer) };
    } catch (e) {
      return fail(500, { error: e.message, host: hostSugoId, peer, chat: await conversation(hostSugoId, peer).catch(() => null) });
    }
  },
  // Beğenilen deneme kuralını kayıtlı bağlam kurallarının sonuna ekler.
  saveRule: async ({ request }) => {
    const [rule] = draftRules(new Map([['drafts', String((await request.formData()).get('draft') ?? '[]')]]));
    if (!rule) return fail(400, { ruleError: 'Bağlam ve kural dolu olmalı' });
    const stored = must(await db().from('app_settings').select('value').eq('key', 'context_rules').maybeSingle())?.value;
    const list = [...(Array.isArray(stored) ? stored : []), rule];
    must(await db().from('app_settings').upsert({ key: 'context_rules', value: list, updated_at: new Date().toISOString() }));
    return { ruleSaved: rule.when };
  },
  reset: async ({ request }) => {
    const f = await request.formData();
    const host = String(f.get('host'));
    const peer = peerCode(f.get('peer'));
    must(await db().from('pairs').delete().eq('id', `${host}-pg${peer}`));
    return { reset: true, host, peer, chat: { messages: [], temp: [] } };
  },
};

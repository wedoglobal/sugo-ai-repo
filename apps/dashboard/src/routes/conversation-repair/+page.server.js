import { fail } from '@sveltejs/kit';
import { runRepairAnalysisBatch } from '@sugo/core';
import { db, must } from '$lib/server/deps.js';
import { continueRepairAnalysis } from '$lib/server/conversation-repair.js';

export async function load({ url, platform, depends }) {
  depends('sugo:conversation-repair');
  const connection = db();
  const requestedVersion = url.searchParams.get('version');
  const version = /^\d{1,18}$/u.test(requestedVersion ?? '') ? requestedVersion : null;
  const [run, report, hosts, results] = await Promise.all([
    connection.from('conversation_repair_runs').select('id, started_at, scanned_pairs, progress_at, last_error_at, totals->conditions->all->samples')
      .is('completed_at', null).order('id', { ascending: false }).limit(1).maybeSingle(),
    connection.from('conversation_repair_runs').select('id, started_at, completed_at, report')
      .not('completed_at', 'is', null).order('id', { ascending: false }).limit(10),
    connection.from('hosts').select('id, name, sugo_id, active, repair_enabled').order('name'),
    connection.rpc('conversation_repair_results', { p_version: version }),
  ]);
  const current = must(run);
  if (current) continueRepairAnalysis(platform, { running: true });
  return { run: current, reports: must(report), hosts: must(hosts), results: must(results), version };
}

export const actions = {
  analyze: async () => {
    try {
      const advanced = await runRepairAnalysisBatch(db(), { start: true });
      return { message: advanced ? 'Analiz ilerletildi.' : 'Analiz arka planda çalışıyor.' };
    } catch {
      return fail(500, { message: 'Analiz bu istekte ilerletilemedi.' });
    }
  },
  pilot: async ({ request }) => {
    const fields = await request.formData();
    const host = String(fields.get('host') ?? '');
    const enabled = fields.get('enabled');
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(host) || !['yes', 'no'].includes(enabled)) {
      return fail(400, { message: 'Geçerli profil ve pilot durumu gerekli.' });
    }
    const changed = await db().rpc('set_conversation_repair', { p_host: host, p_enabled: enabled === 'yes' });
    if (changed.error) return fail(500, { message: 'Pilot durumu değiştirilemedi.' });
    if (!changed.data) return fail(404, { message: 'Profil bulunamadı.' });
    return { message: enabled === 'yes' ? 'Pilot açıldı.' : 'Pilot kapatıldı.' };
  },
};

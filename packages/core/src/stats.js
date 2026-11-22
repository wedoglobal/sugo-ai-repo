const HOUR = 3600 * 1000;
const dayOf = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

/**
 * Sugo'nun gönderdiği eşleşme bildirimlerini gün ve eklenti sürümü bazında sayar.
 * Sürüm aralığı, profilin o sürümü ilk bildirdiği andan bir sonrakine (veya şimdiye) kadardır;
 * hız = eşleşme / profil-saat × 24, böylece farklı profil sayılarıyla çalışan sürümler karşılaştırılabilir.
 * @param {{host_id:string, created_at:string}[]} notices
 * @param {Record<string,{v:string,at:string}[]>} log  profil başına sürüm geçmişi
 * Sürüm kaydı başlamadan önceki süre (ve hiç kaydı olmayan profiller) `baseline.version` sayılır.
 * @param {number} now
 * @param {{version:string, hosts:{id:string,from:string}[]}} [baseline]
 */
export function matchStats(notices, log, now = Date.now(), baseline) {
  const days = new Map();
  for (const n of notices) {
    const day = dayOf(n.created_at);
    const row = days.get(day) ?? { day, total: 0, hosts: {} };
    row.total++;
    row.hosts[n.host_id] = (row.hosts[n.host_id] ?? 0) + 1;
    days.set(day, row);
  }
  const versions = new Map();
  const slot = (v) => versions.get(v) ?? versions.set(v, { version: v, matches: 0, hours: 0, since: null }).get(v);
  const logs = { ...log };
  for (const h of baseline?.hosts ?? []) {
    const first = logs[h.id]?.[0];
    if (!first || Date.parse(first.at) > Date.parse(h.from)) logs[h.id] = [{ v: baseline.version, at: h.from }, ...(logs[h.id] ?? [])];
  }
  for (const [host, list] of Object.entries(logs)) {
    const sorted = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    sorted.forEach((e, i) => {
      const from = Date.parse(e.at);
      const to = i + 1 < sorted.length ? Date.parse(sorted[i + 1].at) : now;
      const s = slot(e.v);
      s.hours += Math.max(0, to - from) / HOUR;
      if (!s.since || e.at < s.since) s.since = e.at;
      s.matches += notices.filter((n) => n.host_id === host && Date.parse(n.created_at) >= from && Date.parse(n.created_at) < to).length;
    });
  }
  const rows = [...versions.values()].map((s) => ({ ...s, perDay: s.hours >= 1 ? (s.matches / s.hours) * 24 : null }));
  rows.sort((a, b) => (b.since ?? '').localeCompare(a.since ?? ''));
  return { days: [...days.values()].sort((a, b) => b.day.localeCompare(a.day)), versions: rows };
}

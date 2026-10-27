export const ROUTINE_PREFIX = 'Rutin: ';
const DAYS = [['monday', 'Pazartesi'], ['tuesday', 'Salı'], ['wednesday', 'Çarşamba'], ['thursday', 'Perşembe'], ['friday', 'Cuma'], ['saturday', 'Cumartesi'], ['sunday', 'Pazar']];
const BLOCK = /^(\d\d:\d\d)-(\d\d:\d\d) (.+)$/;
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * `weekly_routine` (gün -> saatlik {start,end,place,activity}) verisini gün başına bir bilgi girdisine çevirir.
 * Ardışık aynı yer/aktivite birleşir; içerik tek satırdır: `HH:MM-HH:MM yer: aktivite; ...`.
 */
export function routineEntries(weekly) {
  return DAYS.flatMap(([key, label]) => {
    const slots = Array.isArray(weekly?.[key]) ? weekly[key] : [];
    const blocks = [];
    for (const s of slots) {
      const where = String(s.place ?? '').trim();
      const what = String(s.activity ?? '').replace(/;/g, ',').trim();
      const prev = blocks[blocks.length - 1];
      if (prev && prev.where === where && prev.what === what) prev.end = s.end;
      else blocks.push({ start: s.start, end: s.end, where, what });
    }
    if (!blocks.length) return [];
    return [{ title: `${ROUTINE_PREFIX}${label}`, content: blocks.map((b) => `${b.start}-${b.end} ${b.where}: ${b.what}`).join('; '), active: true }];
  });
}

/** Şu anki gün/saate denk gelen rutin bloğunu `yer: aktivite` olarak döner; yoksa boş string. */
export function routineNow(entries, now = new Date(), timeZone = 'Europe/Istanbul') {
  const day = now.toLocaleDateString('tr-TR', { weekday: 'long', timeZone }).toLocaleLowerCase('tr');
  const entry = (Array.isArray(entries) ? entries : []).find((e) => e?.active !== false && String(e?.title ?? '').toLocaleLowerCase('tr') === `${ROUTINE_PREFIX}${day}`.toLocaleLowerCase('tr'));
  if (!entry) return '';
  const hhmm = now.toLocaleTimeString('en-GB', { timeZone, hour12: false, hour: '2-digit', minute: '2-digit' });
  const m = minutes(hhmm === '24:00' ? '00:00' : hhmm);
  for (const part of String(entry.content).split('; ')) {
    const b = BLOCK.exec(part.trim());
    if (!b) continue;
    const end = minutes(b[2]) || 1440;
    if (minutes(b[1]) <= m && m < end) return b[3];
  }
  return '';
}

const SEPARATOR = /\s*(?:=>|->)\s*/;
const BOUNDARY = { before: '(?<![\\p{L}\\p{N}])', after: '(?![\\p{L}\\p{N}])' };
const lower = (s) => s.toLocaleLowerCase('tr');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Satır başına `kalıp => yerine` (veya `->`). Boş yerine silmek demektir; `#` ile başlayan satırlar yorumdur. */
export function parseReplacements(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).flatMap((l) => {
    const m = SEPARATOR.exec(l);
    if (!m) return [];
    const from = l.slice(0, m.index).trim();
    return from ? [{ from, to: l.slice(m.index + m[0].length).trim() }] : [];
  });
}

export function formatReplacements(rules) {
  return (Array.isArray(rules) ? rules : []).map((r) => `${r.from} => ${r.to}`).join('\n');
}

/**
 * Cevaptaki kalıpları deterministik olarak değiştirir: büyük/küçük harf duyarsız (Türkçe),
 * yalnız tam sözcük sınırlarında, kural sırasıyla.
 */
export function applyReplacements(text, rules) {
  let out = String(text ?? '');
  for (const r of Array.isArray(rules) ? rules : []) {
    if (!r?.from) continue;
    const re = new RegExp(`${BOUNDARY.before}${lower(r.from).split(/\s+/).map(escapeRe).join('\\s+')}${BOUNDARY.after}`, 'gu');
    const low = lower(out);
    if (low.length !== out.length) { out = out.replace(new RegExp(re.source, 'giu'), () => r.to ?? ''); continue; }
    let res = '';
    let last = 0;
    for (const m of low.matchAll(re)) {
      res += out.slice(last, m.index) + (r.to ?? '');
      last = m.index + m[0].length;
    }
    out = res + out.slice(last);
  }
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

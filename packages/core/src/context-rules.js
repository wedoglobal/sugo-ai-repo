const GENERIC = new Set(['karşı', 'taraf', 'kişi', 'bana', 'sana', 'şeyi', 'gibi']);
const stems = (text, skip = new Set()) => [...new Set(String(text ?? '').toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !skip.has(w)).map((w) => w.slice(0, 5)))];

/** Bağlam cümlesinden anahtar kelime önerisi: genel sözcükler atılır, kalanlar virgülle verilir. */
export const suggestKeywords = (when) => [...new Set(String(when ?? '').toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !GENERIC.has(w)))].join(', ');

/**
 * Geçici bağlam ve yeni mesajlarda eşleşen bağlam kurallarını seçer.
 * Anahtar kelime (virgülle ayrılmış, çok sözcüklüyse hepsi gerekir) varsa herhangi biri eşleşince kural dahil olur;
 * anahtar kelime boşsa bağlam cümlesindeki genel olmayan sözcüklerin hepsi gerekir. Sözcükler ilk 5 harfiyle karşılaştırılır (ekler önemsiz).
 * @param {{when:string,rule:string,keywords?:string,active?:boolean}[]} rules
 * @param {string[]} texts
 */
export function matchContextRules(rules, texts) {
  const haystack = new Set(stems((texts ?? []).join(' ')));
  return (Array.isArray(rules) ? rules : []).filter((r) => {
    if (!r || r.active === false || !String(r.rule ?? '').trim()) return false;
    const groups = String(r.keywords ?? '').split(',').map((k) => stems(k)).filter((g) => g.length);
    if (groups.length) return groups.some((g) => g.every((s) => haystack.has(s)));
    const own = stems(r.when, GENERIC);
    return own.length > 0 && own.every((s) => haystack.has(s));
  });
}

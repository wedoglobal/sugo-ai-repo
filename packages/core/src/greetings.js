import { formatLines, parseLines } from './lines.js';

/** Satır başına bir hazır karşılama mesajı; `#` ile başlayan satırlar yorumdur. */
export const parseGreetings = parseLines;

export const formatGreetings = formatLines;

/** Hostun yakın zamanda gönderdiklerini (`avoid`) dışarıda bırakır; hepsi kullanılmışsa tüm liste geçerli kalır. */
export function pickableGreetings(list, avoid = []) {
  const all = (Array.isArray(list) ? list : []).map((t) => String(t).trim()).filter(Boolean);
  const used = new Set(avoid.map((t) => String(t).trim()));
  const fresh = all.filter((t) => !used.has(t));
  return fresh.length ? fresh : all;
}

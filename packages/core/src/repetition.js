// Tekrar eden hitap, gülme ve cümle sonu süzlerini kodla ayıklar; prompt'a güvenilmez.
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PRONOUNS = new Set(['sen', 'siz', 'you', 'tu', 'vous', 'du']);
const lower = (s) => String(s ?? '').toLocaleLowerCase('tr');

function endingWords(line) {
  return lower(line).split(/\s+/u).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
}

/**
 * Hostun son üç satırından birini bitiren kapanış süzü ("ya", "işte", "falan") bu cevabın sonundan kesilir.
 * Kısa son sözcük süz sayılır; iki-üç sözcüklük sonda hepsi tekrar ediyorsa kesilir. Geriye iki sözcükten azı
 * kalacaksa ya da son sözcük uzun, sıradan bir sözcükse metin değişmez.
 * @param {string} text @param {string[]} said hostun kendi satırları, en yeni sonda
 */
export function removeRepeatedEnding(text, said) {
  const words = endingWords(text);
  if (words.length < 3 || !Array.isArray(said) || !said.length) return text;
  const recent = said.slice(-3).map(endingWords).filter((w) => w.length >= 2);
  let shared = 0;
  for (const line of recent) {
    let k = 0;
    while (k < 3 && k < words.length - 1 && k < line.length && words.at(-1 - k) === line.at(-1 - k)) k++;
    shared = Math.max(shared, k);
  }
  const cut = shared >= 2 || (shared === 1 && words.at(-1).length <= 6) ? shared : 0;
  if (!cut) return text;
  const keep = words.length - cut;
  const pattern = /\S+/gu;
  let match;
  let seen = 0;
  let end = -1;
  while ((match = pattern.exec(text))) {
    if (endingWords(match[0]).length) seen++;
    if (seen === keep) { end = match.index + match[0].length; break; }
  }
  if (end < 0) return text;
  const head = text.slice(0, end).replace(/[\s,;:—-]+$/u, '');
  const stop = text.slice(end).match(/[?!]/u)?.[0] ?? '';
  return (head + (/[.!?…]$/u.test(head) ? '' : stop)).trim();
}

/** @param {string} address virgülle ayrılmış hitap örnekleri */
export function addressTerms(address) {
  return [...new Set(String(address ?? '').split(/[,;\n|/]+/u).map((s) => s.trim().replace(/^["'“”]+|["'“”]+$/g, '')).filter((s) => s.length >= 2 && s.length <= 60 && /^[\p{L}\p{M} '’-]+$/u.test(s) && !PRONOUNS.has(lower(s))))].slice(0, 20).sort((a, b) => b.length - a.length);
}

/** @param {string[]} laughs */
export function laughTerms(laughs) {
  return [...new Set((Array.isArray(laughs) ? laughs : []).map((s) => String(s).trim()).filter((s) => s.length >= 2 && s.length <= 60))].sort((a, b) => b.length - a.length);
}

function expressionPattern(term, vocative) {
  if (!vocative && /^[a-z]+$/i.test(term)) {
    const low = term.toLowerCase();
    for (let size = 1; size <= Math.min(4, Math.floor(low.length / 2)); size++) {
      const unit = low.slice(0, size);
      if ([...low].every((c, i) => c === unit[i % size])) {
        const tail = unit.length > 1 ? `(?:${Array.from({ length: unit.length - 1 }, (_, i) => escape(unit.slice(0, i + 1))).reverse().join('|')})?` : '';
        return `(?:${escape(unit)}){2,}${tail}`;
      }
    }
  }
  return escape(term).replace(/[iıİI]/g, '[iıİI]').replace(/\s+/g, '\\s+');
}

/** Alıntı, kullanıcı adı ve bağlantıları koruyarak ifadeleri bulur. Hitapta yalnız seslenme konumundakiler sayılır. */
function occurrences(text, terms, vocative) {
  if (!terms.length) return [];
  const protectedRanges = [...text.matchAll(/https?:\/\/\S+|www\.\S+|@[\p{L}\p{N}_]+|"[^"\n]*"|“[^”\n]*”|`[^`\n]*`/gu)].map((m) => [m.index, m.index + m[0].length]);
  const pattern = terms.map((term) => expressionPattern(term, vocative)).join('|');
  const matcher = new RegExp(`(?<![\\p{L}\\p{N}_@/])(?:${pattern})(?![\\p{L}\\p{N}_])`, 'giu');
  return [...text.matchAll(matcher)].filter((m) => {
    if (protectedRanges.some(([start, end]) => m.index < end && m.index + m[0].length > start)) return false;
    if (!vocative) return true;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    if (/^\s+(?:adlı|isimli|named)(?![\p{L}\p{N}_])/iu.test(after)) return false;
    if (lower(m[0]) === 'canım' && /^\s+(?:sık|acı|iste|çek|yan)/iu.test(after)) return false;
    return !before.trim() || !after.trim() || /^\s*[,.;:!?…]/u.test(after) || /[,;:—]\s*$/u.test(before);
  }).map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

function removeRanges(text, remove) {
  const ranges = remove.map(({ start, end }) => {
    const before = text.slice(0, start);
    const after = text.slice(end);
    if (!before.trim()) end += after.match(/^[\s,.;:!?…—-]*/u)?.[0].length ?? 0;
    else if (/^[\s.!?…]*$/u.test(after)) start -= before.match(/[ \t]*[,;:—-]?[ \t]*$/u)?.[0].length ?? 0;
    else end += after.match(/^[ \t]*[,;:—-]?[ \t]*/u)?.[0].length ?? 0;
    return { start, end };
  }).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push(range);
  }
  for (const { start, end } of merged.reverse()) text = text.slice(0, start) + text.slice(end);
  return text.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;:!?…])/g, '$1').trim();
}

/**
 * Cevap başına en fazla bir ifade kalır; `cooldown` kendi cevabı boyunca, son `cooldown` cevapta kullanılmışsa hiçbiri kalmaz.
 * `maxIn20` > 0 ise son 20 cevapta bu kadar kullanım dolduysa da hiçbiri kalmaz.
 * @param {string} text @param {string[]} terms @param {string[]} said hostun kendi satırları, en yeni sonda
 */
function reduceRepetition(text, terms, said, vocative, { cooldown = 2, maxIn20 = 0 } = {}) {
  const matches = occurrences(text, terms, vocative);
  if (!matches.length) return text;
  const used = (line) => occurrences(line ?? '', terms, vocative).length > 0;
  const blocked = (cooldown > 0 && said.slice(-cooldown).some(used)) || (maxIn20 > 0 && said.slice(-20).filter(used).length >= maxIn20);
  const remove = blocked ? matches : matches.slice(1);
  return remove.length ? removeRanges(text, remove) : text;
}

export const removeRepeatedAddress = (text, address, said) => reduceRepetition(text, addressTerms(address), said, true);
export const removeRepeatedLaughter = (text, laughs, said, policy) => reduceRepetition(text, laughTerms(laughs), said, false, policy);

const COMMON = new Set(['şimdi', 'burada', 'orada', 'şurada', 'çünkü', 'gerçekten', 'belki', 'sadece', 'tamam', 'tamamen', 'zaten', 'artık', 'hâlâ', 'hala', 'bugün', 'yarın', 'bence', 'sonra', 'önce', 'yoksa', 'ama', 'fakat', 'hatta', 'bence', 'neden', 'nasıl', 'nerede', 'nereye', 'kadar', 'herkes', 'herşey', 'hiçbir', 'birazdan', 'biraz', 'bazen', 'galiba', 'sanırım', 'aslında', 'ayrıca', 'şöyle', 'böyle', 'öyle', 'yine', 'tekrar', 'beraber', 'birlikte', 'merhaba', 'günaydın', 'teşekkür', 'görüşürüz', 'konuşuruz', 'olabilir', 'olur', 'tabii', 'tabi']);
const WORD = /\p{L}+(?:['’]\p{L}+)?/gu;
const stem = (w) => lower(w).split(/['’]/u)[0].slice(0, 6);

function contentWords(text) {
  return [...String(text ?? '').matchAll(WORD)].filter((m) => {
    const base = lower(m[0]).split(/['’]/u)[0];
    return base.length >= 6 && !COMMON.has(base);
  });
}

/**
 * Hostun son `window` cevabında geçen (ekleriyle birlikte aynı kökten) ayırt edici bir sözcük bu cevapta yeniden geçiyorsa
 * her geçişi silinir ("atölye" gibi sözcükler ikide bir tekrarlanmasın). Karşı tarafın (`heard`) kullandığı sözcüklere,
 * alıntılara, bağlantılara dokunulmaz; geriye iki sözcükten azı kalacaksa metin değişmez.
 * @param {string} text @param {string[]} said hostun kendi satırları, en yeni sonda @param {string[]} heard karşı tarafın son mesajları
 */
export function removeRepeatedWords(text, said, heard = [], window = 3) {
  const recent = new Set(said.slice(-window).flatMap((line) => contentWords(line).map((m) => stem(m[0]))));
  if (!recent.size) return text;
  const theirs = new Set(heard.flatMap((line) => contentWords(line).map((m) => stem(m[0]))));
  const protectedRanges = [...text.matchAll(/https?:\/\/\S+|www\.\S+|@[\p{L}\p{N}_]+|"[^"\n]*"|“[^”\n]*”|`[^`\n]*`/gu)].map((m) => [m.index, m.index + m[0].length]);
  const remove = contentWords(text)
    .filter((m) => recent.has(stem(m[0])) && !theirs.has(stem(m[0])) && !protectedRanges.some(([a, b]) => m.index < b && m.index + m[0].length > a))
    .map((m) => ({ start: m.index, end: m.index + m[0].length }));
  if (!remove.length) return text;
  const out = removeRanges(text, remove);
  return (out.match(WORD) ?? []).length >= 2 ? out : text;
}

/**
 * Dört ayıklamayı sırayla uygular. `history` pair'in önceki mesajlarıdır (direction 'out' = hostun kendi cevabı).
 * @param {string} text @param {{address?:string, laughs?:string[], laughCooldown?:number, laughMax?:number}} persona
 * @param {{direction:string, text:string}[]} history
 * @param {string[]} heard cevaplanan yeni mesajlar; karşı tarafın kullandığı sözcükler tekrar sayılmaz
 */
export function removeRepetition(text, persona, history, heard = []) {
  const said = history.filter((m) => m.direction === 'out').map((m) => m.text);
  const withoutAddress = removeRepeatedAddress(text, persona.address, said);
  const withoutLaughs = removeRepeatedLaughter(withoutAddress, persona.laughs, said, { cooldown: persona.laughCooldown ?? 2, maxIn20: persona.laughMax ?? 0 });
  const peer = [...history.filter((m) => m.direction === 'in').slice(-3).map((m) => m.text), ...heard];
  return removeRepeatedEnding(removeRepeatedWords(withoutLaughs, said, peer), said);
}

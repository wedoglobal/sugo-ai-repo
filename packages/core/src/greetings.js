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

const morningGreetings = ['günaydın, nasılsın?', 'günaydın :)', 'selam, sabahın nasıl geçiyor?'];
const daytimeGreetings = ['selam, nasılsın?', 'merhaba, günün nasıl geçiyor?', 'selam, neler yapıyorsun?'];

export function onlineGreeting(now, timeZone, random, previous = '') {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now));
  const list = hour >= 6 && hour < 12 ? morningGreetings : daytimeGreetings;
  const choices = pickableGreetings(list, [previous]);
  return choices[Math.floor(random() * choices.length)];
}

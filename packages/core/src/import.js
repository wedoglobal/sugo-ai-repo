import { EXAMPLE_LIMIT, FACT_LIMIT, readPersona } from './persona.js';
import { routineEntries } from './routine.js';

const MAX_KNOWLEDGE_CHARS = 2000;

const lower = (v) => String(v ?? '').trim().toLocaleLowerCase('tr');
const firstPart = (v) => String(v ?? '').split('/')[0].trim();
const strings = (v) => (Array.isArray(v) ? v : []).filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());

const LEVELS = new Map([['yok / çok az', 0], ['yok', 0], ['çok az', 0], ['az', 1], ['orta', 2], ['yüksek', 3]]);
const level = (v, fallback) => LEVELS.get(lower(v)) ?? fallback;
const mapLength = (v) => ({ 'çok kısa': 'tiny', kısa: 'short', normal: 'normal' })[lower(v)] ?? 'short';

function pickEvenly(items, n) {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

function laughPolicy(policy) {
  if (!policy || typeof policy !== 'object') return {};
  return {
    ...(Number.isFinite(policy.cooldown_turns) ? { laughCooldown: policy.cooldown_turns } : {}),
    ...(Number.isFinite(policy.maximum_laughter_in_20_replies) ? { laughMax: policy.maximum_laughter_in_20_replies } : {}),
  };
}

/** Hostun rolüyle çelişen "yapay zeka kimliğini dürüstçe cevapla" cümlesi içe aktarılmaz; host rolde kalır. */
const HONEST_AI_SENTENCE = /\s*Answer AI identity questions honestly\.?/gi;

function styleInstruction(character, style) {
  if (style.explicit_style_instruction) return String(style.explicit_style_instruction).replace(HONEST_AI_SENTENCE, '').trim();
  return [
    character.temperament && `Mizaç: ${character.temperament}.`,
    style.flirtatious && 'Flörtöz olabilir, ama yalnız karşı taraf aynı ilgiyi gösterirse.',
  ].filter(Boolean).join(' ');
}

/** Düzenlenemeyen karakter kartı: kimlik, flört ve gülme politikası, kalite kontrolleri. */
function extrasFrom(raw) {
  const style = raw.conversation_style ?? {};
  const extras = {
    character: raw.character,
    flirtatious: style.flirtatious,
    flirtationProfile: style.flirtation_profile,
    laughterPolicy: style.laughter_policy,
    qualityChecks: raw.quality_checks,
  };
  return Object.fromEntries(Object.entries(extras).filter(([, v]) => v !== undefined));
}

/**
 * Persona JSON dosyasını (character / personal_information / conversation_style / example_messages / weekly_routine)
 * host alanlarına çevirir. İçeri aktarılamayan girdiler `skipped`, kırpılanlar `warnings` içinde döner.
 * @returns {{name:string, persona:object, knowledge:object[], skipped:string[], warnings:string[]}}
 */
export function importPersona(raw) {
  if (!raw || typeof raw !== 'object' || (!raw.character && !Array.isArray(raw.personal_information))) {
    throw new Error('Geçerli bir persona JSON dosyası değil');
  }
  const c = raw.character ?? {};
  const style = raw.conversation_style ?? {};
  const skipped = [];
  const warnings = [];

  const facts = [
    ['Ad', c.name],
    ['Yaş', c.age],
    ['Şehir', firstPart(c.current_city) || c.city],
    ['Memleket', firstPart(c.origin_city)],
    ['Meslek', c.occupation],
  ].filter(([, v]) => v !== undefined && v !== null && String(v).trim()).map(([label, v]) => ({ label, value: String(v), shareable: true }));
  if (facts.length > FACT_LIMIT) warnings.push(`Bilgilerden yalnız ilk ${FACT_LIMIT}'u alınır.`);

  const routine = routineEntries(raw.weekly_routine);
  const knowledge = [];
  for (const p of Array.isArray(raw.personal_information) ? raw.personal_information : []) {
    const content = String(p?.content ?? '').trim();
    if (!content) continue;
    if (routine.length && /^yaşam rutini/i.test(String(p.title ?? ''))) continue;
    if (content.length > MAX_KNOWLEDGE_CHARS) { skipped.push(`${p.title ?? '(başlıksız)'}: çok uzun`); continue; }
    knowledge.push({ title: String(p.title ?? '').trim(), content: content.replace(/\s*\n\s*/g, ' '), active: p.shareable !== false });
  }
  knowledge.push(...routine);

  const examples = [...new Set((Array.isArray(raw.example_messages) ? raw.example_messages : []).map((e) => String(e?.assistant ?? '').trim()).filter(Boolean))];
  if (examples.length > EXAMPLE_LIMIT) warnings.push(`Örnek mesajlardan ${examples.length} tanesinden ${EXAMPLE_LIMIT}'si seçildi.`);

  const emojis = strings(style.emoji_preferences);
  const instructions = styleInstruction(c, style);
  if (instructions.length > 4000) warnings.push('Üslup talimatı 4000 karaktere kısaltılır.');
  const emoji = level(style.emoji, 1);

  const persona = readPersona({
    formality: level(style.formality, 1),
    seriousness: level(style.seriousness, 1),
    punctuation: level(style.punctuation, 2),
    typos: level(style.spelling_imperfections, 0),
    emoji: emoji === 0 && emojis.length ? 1 : emoji,
    laughter: level(style.laughter, 1),
    length: mapLength(style.length),
    capitals: lower(style.capitalization) === 'küçük harf' ? 'lowercase' : 'normal',
    timeZone: c.timezone ?? raw.weekly_routine?.timezone,
    instructions,
    address: strings(style.address_examples).join(', '),
    emojis,
    laughs: strings(style.laughter_examples),
    ...laughPolicy(style.laughter_policy),
    examples: pickEvenly(examples, EXAMPLE_LIMIT),
    facts,
    extras: extrasFrom(raw),
  });
  return { name: String(c.name ?? '').trim(), persona, knowledge, skipped, warnings };
}

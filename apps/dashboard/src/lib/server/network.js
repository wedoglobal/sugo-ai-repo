import { validateProfile } from '../../../../extension/network-model.js';

/** Panelden gelen site profillerini eklentinin kullandığı kurallarla doğrular; domain tekrarsızdır. */
export function cleanProfiles(input) {
  if (!Array.isArray(input) || input.length > 50) throw new Error('Profil listesi geçersiz.');
  const byDomain = new Map();
  for (const item of input) { const p = validateProfile(item); byDomain.set(p.domain, p); }
  const endpoints = new Map();
  for (const p of byDomain.values()) if (p.proxy.enabled) {
    const key = `${p.proxy.ip}:${p.proxy.port}`;
    const auth = JSON.stringify([p.proxy.auth, p.proxy.username, p.proxy.password]);
    if (endpoints.has(key) && endpoints.get(key) !== auth) throw new Error('Aynı proxy adresi farklı kimlik bilgileriyle kullanılamaz.');
    endpoints.set(key, auth);
  }
  return [...byDomain.values()];
}

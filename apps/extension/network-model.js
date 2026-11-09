export const NETWORK_KEY = 'networkProfiles';
export function domainOf(value) {
  try { const u = new URL(value.includes('://') ? value : `https://${value}`); return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase().replace(/\.$/, '') : ''; } catch { return ''; }
}
export function validateProfile(input) {
  const domain = domainOf(String(input.domain ?? '').trim());
  if (!domain || domain.length > 253 || domain.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('Geçerli bir domain girin.');
  const gps = { enabled: !!input.gps?.enabled, latitude: Number(input.gps?.latitude ?? 41.0082), longitude: Number(input.gps?.longitude ?? 28.9784), accuracy: Number(input.gps?.accuracy ?? 20) };
  if (!Number.isFinite(gps.latitude) || Math.abs(gps.latitude) > 90 || !Number.isFinite(gps.longitude) || Math.abs(gps.longitude) > 180 || !Number.isFinite(gps.accuracy) || gps.accuracy < 0) throw new Error('Koordinat veya doğruluk geçersiz.');
  const p = input.proxy ?? {};
  const proxy = { enabled: !!p.enabled, protocol: p.protocol ?? 'http', ip: String(p.ip ?? '').trim(), port: Number(p.port ?? 8080), auth: !!p.auth, username: String(p.username ?? ''), password: String(p.password ?? '') };
  if (!['http', 'https', 'socks5'].includes(proxy.protocol)) throw new Error('Proxy protokolü geçersiz.');
  if (proxy.enabled) {
    const octets = proxy.ip.split('.');
    if (octets.length !== 4 || octets.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255 || String(Number(x)) !== x)) throw new Error('Geçerli bir IPv4 adresi girin.');
    if (!Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535) throw new Error('Port 1–65535 arasında olmalı.');
    if (proxy.auth && proxy.protocol === 'socks5') throw new Error('Chrome SOCKS5 kimlik doğrulamasını desteklemez. HTTP/HTTPS veya IP izin listesi kullanın.');
    if (proxy.auth && !proxy.username) throw new Error('Proxy kullanıcı adı gerekli.');
  }
  if (!proxy.auth) { proxy.username = ''; proxy.password = ''; }
  return { domain, gps, proxy };
}
export function pacScript(profiles) {
  const rules = profiles.filter((p) => p.proxy.enabled).map((p) => {
    const scheme = { http: 'PROXY', https: 'HTTPS', socks5: 'SOCKS5' }[p.proxy.protocol];
    return `if (host === ${JSON.stringify(p.domain)}) return ${JSON.stringify(`${scheme} ${p.proxy.ip}:${p.proxy.port}`)};`;
  });
  return `function FindProxyForURL(url, host) { host = host.toLowerCase().replace(/\\.$/, ''); ${rules.join('\n')} return "DIRECT"; }`;
}
export function activeProfiles(state) { return state.hosts?.[state.activeHost] ?? []; }

import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { PRODUCTION_URL } from './extension-build.js';
import { packages } from '../apps/dashboard/src/lib/server/generated/extension-packages.js';
const env = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
const request = (path, options = {}) => fetch(`${PRODUCTION_URL}${path}`, { ...options, redirect: 'manual', signal: AbortSignal.timeout(25000) });
function assert(ok, message) { if (!ok) throw new Error(message); }
const login = await request('/login?/login', { method: 'POST', headers: { origin: PRODUCTION_URL, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password: env.ADMIN_PASSWORD }) });
const cookie = login.headers.getSetCookie().find((x) => x.startsWith('sugo_admin='))?.split(';')[0];
assert(login.status === 303 && cookie, 'Canlı panel oturumu doğrulanamadı.');
const headers = { authorization: `Bearer ${env.EXTENSION_API_KEY}`, origin: 'https://sugo.live' };
const unauthorized = await request('/api/ext/jobs/next');
assert(unauthorized.status === 401, 'API yetkisiz erişimi reddetmedi.');
const legacy = await request('/api/ext/jobs/next', { headers });
assert(legacy.status === 400 && (await legacy.json()).error === 'host gerekli', 'Eski GET sözleşmesi değişmiş.');
assert(legacy.headers.get('access-control-allow-origin') === '*', 'Eski eklentilerin CORS sözleşmesi değişmiş.');
for (const path of ['/api/ext/ingest', '/api/ext/jobs/next']) {
  const response = await request(path, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' });
  assert(response.status === 400, `${path}: eski doğrulama davranışı bozulmuş.`);
}
const options = await request('/api/ext/ingest', { method: 'OPTIONS', headers: { origin: 'https://sugo.live', 'access-control-request-method': 'POST' } });
assert(options.status === 204, 'CORS preflight başarısız.');
const noProfile = await request('/api/ext/control', { headers });
assert(noProfile.status === 400, 'Profil kontrol API doğrulaması başarısız.');
const hosts = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/hosts?select=id,sugo_id&limit=1`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(20000) });
assert(hosts.ok, 'Kontrol doğrulaması için profil kimliği okunamadı.');
const sample = (await hosts.json())[0];
if (sample) {
  const control = await request(`/api/ext/control?host=${encodeURIComponent(sample.sugo_id)}`, { headers });
  const state = await control.json();
  assert(control.status === 200 && state.host?.id === sample.id && typeof state.host.active === 'boolean' && state.host.revision, 'Profil aktiflik ve revizyon API sözleşmesi başarısız.');
  const profilePage = await request(`/hosts/${sample.id}/network`, { headers: { cookie } });
  assert(profilePage.status === 200 && (await profilePage.text()).includes('Velora'), 'Haritalı profil kontrol sayfası açılamadı.');
}
console.log('Canlı eski istemci sözleşmeleri ve CORS doğrulandı; iş kuyruğu değiştirilmedi.');
for (const path of ['/', '/hosts', '/queue', '/pairs', '/rules', '/greetings', '/filters', '/gift-thanks', '/photo-triggers', '/playground']) {
  const response = await request(path, { headers: { cookie } });
  assert(response.status === 200, `${path}: panel HTTP ${response.status}`);
  assert((await response.text()).includes('Velora'), `${path}: yeni panel görünümü doğrulanamadı.`);
}
for (const filename of ['velora-ai-extension.zip', 'velora-connect.zip', 'sugo-host-extension.zip']) {
  const path = `/downloads/${filename}`;
  const denied = await request(path);
  assert([303, 401, 403].includes(denied.status), 'Eklenti paketi oturumsuz indirilebiliyor; anahtar güvenliği için yayın geri alınmalı.');
  const download = await request(path, { headers: { cookie } });
  assert(download.status === 200, `Korumalı paket indirilemiyor: ${filename}`);
  assert(download.headers.get('cache-control')?.includes('no-store'), 'Paket önbellek koruması eksik.');
  const hash = createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex');
  assert(hash === packages[filename].sha256, `Paket SHA-256 eşleşmiyor: ${filename}`);
}
console.log('Velora AI paneli, özel ZIP indirmeleri ve paket SHA-256 değerleri doğrulandı.');

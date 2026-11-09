import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { PRODUCTION_URL } from './extension-build.js';
const env = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
const request = async (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(20000), redirect: 'manual' });
const config = JSON.parse(readFileSync(new URL('../apps/dashboard/wrangler.jsonc', import.meta.url), 'utf8'));
if (!env.EXTENSION_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) throw new Error('Yayın kontrolü için .env değerleri eksik.');
if (env.SUPABASE_URL.replace(/\/$/, '') !== config.vars.SUPABASE_URL.replace(/\/$/, '')) throw new Error('.env ve Worker farklı Supabase projelerine bağlı; yayın durduruldu.');
const api = await request(`${PRODUCTION_URL}/api/ext/jobs/next`, { headers: { authorization: `Bearer ${env.EXTENSION_API_KEY}` } });
const body = await api.json().catch(() => ({}));
if (api.status !== 400 || body.error !== 'host gerekli') throw new Error('Mevcut canlı API ile .env anahtarı eşleşmedi veya eski API sözleşmesi doğrulanamadı; eski istemciler için yayın durduruldu.');
console.log('Canlı API anahtarı ve eski GET sözleşmesi doğrulandı; anahtar değiştirilmeyecek.');
const schemaResponse = await request(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/`, { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, accept: 'application/openapi+json' } });
if (!schemaResponse.ok) throw new Error('Canlı veritabanı şeması okunamadı; yayın durduruldu.');
const schema = await schemaResponse.json();
const requiredColumns = { pairs: ['voice_enabled', 'reply_disabled_reason', 'delivery_retry_at'], messages: ['diamonds', 'diamonds_at', 'handled'], jobs: ['covers_until', 'reply_text', 'locked_until'] };
const missing = [];
for (const [table, columns] of Object.entries(requiredColumns)) for (const column of columns) {
  if (!schema.definitions?.[table]?.properties?.[column]) missing.push(`${table}.${column}`);
}
for (const rpc of ['claim_next_job', 'claim_next_reply_job', 'claim_available_job', 'queue_unanswered_reply', 'queue_available_reply']) if (!schema.paths?.[`/rpc/${rpc}`]) missing.push(`rpc:${rpc}`);
if (missing.length) throw new Error(`Canlı veritabanında gerekli şema eksik: ${missing.join(', ')}. Migration uygulanmadan yayın yapılamaz.`);
console.log('Canlı veritabanında yeni backend ile eski istemcilerin gerektirdiği kolon ve RPC adları mevcut.');

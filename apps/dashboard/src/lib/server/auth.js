import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

const MAX_AGE_S = 60 * 60 * 24 * 7;
export const COOKIE = 'sugo_admin';

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const sign = (payload) => createHmac('sha256', env.SESSION_SECRET ?? '').update(payload).digest('hex');

export function checkPassword(password) {
  return !!env.ADMIN_PASSWORD && safeEqual(password ?? '', env.ADMIN_PASSWORD);
}

export function makeSession() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_S);
  return `${exp}.${sign(exp)}`;
}

export function validSession(token) {
  if (!token || !env.SESSION_SECRET) return false;
  const [exp, sig] = token.split('.');
  return !!sig && Number(exp) > Date.now() / 1000 && safeEqual(sig, sign(exp));
}

export const sessionMaxAge = MAX_AGE_S;

export function validExtensionKey(header) {
  const m = /^Bearer (.+)$/.exec(header ?? '');
  return !!m && !!env.EXTENSION_API_KEY && safeEqual(m[1], env.EXTENSION_API_KEY);
}

import { json, redirect } from '@sveltejs/kit';
import { COOKIE, validExtensionKey, validSession } from '$lib/server/auth.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400'
};

export async function handle({ event, resolve }) {
  const { pathname } = event.url;
  if (pathname.startsWith('/api/ext/')) {
    if (event.request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (!validExtensionKey(event.request.headers.get('authorization'))) {
      return json({ error: 'unauthorized' }, { status: 401, headers: CORS });
    }
    const res = await resolve(event);
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  }
  if (pathname !== '/login' && !validSession(event.cookies.get(COOKIE))) {
    redirect(303, '/login');
  }
  return resolve(event);
}

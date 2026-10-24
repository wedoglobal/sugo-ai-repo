import { json, redirect } from '@sveltejs/kit';
import { COOKIE, validExtensionKey, validSession } from '$lib/server/auth.js';

export async function handle({ event, resolve }) {
  const { pathname } = event.url;
  if (pathname.startsWith('/api/ext/')) {
    if (!validExtensionKey(event.request.headers.get('authorization'))) {
      return json({ error: 'unauthorized' }, { status: 401 });
    }
    return resolve(event);
  }
  if (pathname !== '/login' && !validSession(event.cookies.get(COOKIE))) {
    redirect(303, '/login');
  }
  return resolve(event);
}

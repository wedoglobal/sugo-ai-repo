import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { COOKIE, checkPassword, makeSession, sessionMaxAge } from '$lib/server/auth.js';

export const actions = {
  login: async ({ request, cookies }) => {
    const password = (await request.formData()).get('password');
    if (!checkPassword(password)) return fail(401, { error: 'Şifre yanlış' });
    cookies.set(COOKIE, makeSession(), { path: '/', httpOnly: true, secure: !dev, sameSite: 'lax', maxAge: sessionMaxAge });
    redirect(303, '/hosts');
  },
  logout: async ({ cookies }) => {
    cookies.delete(COOKIE, { path: '/' });
    redirect(303, '/login');
  },
};

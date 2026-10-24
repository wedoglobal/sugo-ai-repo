import { COOKIE, validSession } from '$lib/server/auth.js';

export const load = ({ cookies }) => ({ authed: validSession(cookies.get(COOKIE)) });

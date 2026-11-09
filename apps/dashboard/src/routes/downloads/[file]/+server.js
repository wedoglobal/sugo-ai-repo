import { error } from '@sveltejs/kit';
import { packages } from '$lib/server/generated/extension-packages.js';
import { COOKIE, validSession } from '$lib/server/auth.js';

export function GET({ params, cookies }) {
  if (!validSession(cookies.get(COOKIE))) error(401, 'Panel oturumu gerekli');
  const pack = Object.hasOwn(packages, params.file) ? packages[params.file] : null;
  if (!pack) error(404, 'Paket bulunamadı');
  return new Response(Buffer.from(pack.base64, 'base64'), { headers: {
    'content-type': 'application/zip',
    'content-disposition': `attachment; filename="${pack.filename}"`,
    'cache-control': 'private, no-store, max-age=0',
    'x-content-type-options': 'nosniff',
    'x-extension-version': pack.version,
    'x-extension-sha256': pack.sha256,
  } });
}

import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { extensionSettings, protectedScript } from './extension-build.js';
const rootUrl = new URL('../', import.meta.url);
const root = fileURLToPath(rootUrl);
const settings = extensionSettings(rootUrl);
const outputDir = join(root, 'apps/dashboard/.extension-build');
const generatedDir = join(root, 'apps/dashboard/src/lib/server/generated');
const packages = {};
mkdirSync(outputDir, { recursive: true, mode: 0o700 });
for (const [folder, filename] of [['extension', 'velora-ai-extension.zip']]) {
  const source = join(root, 'apps', folder);
  const output = join(outputDir, filename);
  const temporary = mkdtempSync(join(tmpdir(), 'velora-extension-'));
  try {
    const manifest = JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8'));
    const entries = new Set([manifest.background.service_worker, ...manifest.content_scripts.flatMap((s) => s.js)]);
    const html = readFileSync(join(source, manifest.action.default_popup), 'utf8');
    for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) entries.add(match[1]);
    const assets = new Set([...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action.default_icon ?? {})]);
    for (const match of html.matchAll(/<(?:link|img)\b[^>]*\b(?:href|src)=["']([^"']+)["']/g)) {
      if (!/^(?:https?:|data:)/.test(match[1])) assets.add(match[1]);
    }
    for (const asset of assets) {
      if (asset.startsWith('/') || asset.split('/').includes('..')) throw new Error('Geçersiz paket asset yolu.');
      mkdirSync(dirname(join(temporary, asset)), { recursive: true });
      writeFileSync(join(temporary, asset), readFileSync(join(source, asset)), { mode: 0o600 });
    }
    for (const entry of entries) writeFileSync(join(temporary, entry), await protectedScript(join(source, entry), settings), { mode: 0o600 });
    writeFileSync(join(temporary, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    writeFileSync(join(temporary, manifest.action.default_popup), html.replace(/<!--[^]*?-->/g, ''), { mode: 0o600 });
    rmSync(output, { force: true });
    const unpacked = join(root, 'build/extension');
    rmSync(unpacked, { recursive: true, force: true });
    mkdirSync(dirname(unpacked), { recursive: true });
    cpSync(temporary, unpacked, { recursive: true });
    execFileSync('zip', ['-q', '-r', output, '.'], { cwd: temporary });
    const bytes = readFileSync(output);
    packages[filename] = { name: manifest.name, version: manifest.version, filename, sha256: createHash('sha256').update(bytes).digest('hex'), base64: bytes.toString('base64') };
    console.log(`${manifest.name} ${manifest.version}: korumalı paket hazır (${bytes.length} bayt). Chrome için açılmış klasör: build/extension`);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
// Eski indirme adresi de oturum kontrollü sunucu rotasından hizmet verir.
packages['sugo-host-extension.zip'] = packages['velora-ai-extension.zip'];
packages['velora-connect.zip'] = packages['velora-ai-extension.zip'];
rmSync(join(outputDir, 'velora-connect.zip'), { force: true });
mkdirSync(generatedDir, { recursive: true, mode: 0o700 });
writeFileSync(join(generatedDir, 'extension-packages.js'), `export const packages = ${JSON.stringify(packages)};\n`, { mode: 0o600 });
// Anahtar içeren paketler herkese açık statik asset dizinine konulmaz.
rmSync(join(root, 'apps/dashboard/static/downloads'), { recursive: true, force: true });

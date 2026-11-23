import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export const PRODUCTION_URL = 'https://studio.elseweb.lol';
export function extensionSettings(root) {
  const env = parseEnv(readFileSync(new URL('.env', root), 'utf8'));
  const apiKey = env.EXTENSION_API_KEY?.trim();
  if (!apiKey || /^change-me/i.test(apiKey)) throw new Error('.env içinde geçerli EXTENSION_API_KEY gerekli.');
  return { apiKey, baseUrl: PRODUCTION_URL };
}

export async function protectedScript(entryPoint, settings) {
  const result = await build({
    entryPoints: [entryPoint], bundle: true, write: false, format: 'iife', platform: 'browser',
    target: 'chrome108', minify: true, sourcemap: false, legalComments: 'none', logLevel: 'silent',
    define: { __VELORA_EXTENSION_API_KEY__: JSON.stringify(settings.apiKey), __VELORA_API_URL__: JSON.stringify(settings.baseUrl) },
  });
  return JavaScriptObfuscator.obfuscate(result.outputFiles[0].text, {
    target: 'browser-no-eval', compact: true, identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false, renameProperties: false, transformObjectKeys: false,
    controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.2,
    deadCodeInjection: false, debugProtection: false, disableConsoleOutput: false, selfDefending: false,
    stringArray: true, stringArrayEncoding: ['base64'], stringArrayThreshold: 0.9,
    stringArrayCallsTransform: true, stringArrayWrappersCount: 2,
    splitStrings: true, splitStringsChunkLength: 6, simplify: true, sourceMap: false,
  }).getObfuscatedCode();
}

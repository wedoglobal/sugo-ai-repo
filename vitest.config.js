import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { alias: { '$lib': fileURLToPath(new URL('./apps/dashboard/src/lib', import.meta.url)), '@sugo/core': fileURLToPath(new URL('./packages/core/src/index.js', import.meta.url)) } }, test: { include: ['packages/*/src/**/*.test.js', 'apps/extension/*.test.js', 'apps/android/*.test.js', 'apps/dashboard/src/lib/*.test.js', 'scripts/*.test.js'] } });

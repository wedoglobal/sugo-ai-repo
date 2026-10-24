import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: { runes: true },
  kit: { adapter: adapter(), env: { dir: '../..' } },
};

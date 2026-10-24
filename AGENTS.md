# Sugo Host

- pnpm workspace; JS + JSDoc, TypeScript yok.
- `packages/core`: framework'süz persona/hafıza/kuyruk mantığı. Supabase ve LLM `deps` olarak enjekte edilir, testlerde mock'lanır.
- `apps/dashboard`: SvelteKit (Svelte 5 runes). Admin + `/api/ext/*`. Servis anahtarı yalnızca sunucuda.
- `apps/extension`: sugo.live otomasyonu (henüz boş).
- Pair id: `<host_sugo_id>-<peer_sugo_id>`. Kalıcı hafıza: isim, yaş, yaşadığı yer, memleket, meslek. Geri kalan her şey TTL'li geçici bağlam.
- Yorumlar son davranışı anlatır, değişiklik geçmişini değil.

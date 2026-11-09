# Sugo Host

sugo.live için persona (host) yönetimi, hafıza motoru ve kuyruk API'si. Chrome extension henüz boş.

```bash
pnpm install
cp .env.example .env          # SUPABASE_SERVICE_ROLE_KEY: `supabase status -o env`; OPENROUTER_API_KEY'i doldur
pnpm db:start                 # docker'da Supabase (API 55321, DB 55322)
pnpm dev                      # dashboard http://localhost:5190 (şifre: ADMIN_PASSWORD)
pnpm test                     # core testleri (pipeline testi yerel Supabase'i kullanır; sonra `pnpm db:reset`)
```

Extension sözleşmesi: `apps/extension/README.md`.

## Cloud Supabase + deploy
```bash
supabase login
pnpm db:link --project-ref <ref>   # DB şifresi sorulur
pnpm db:push                       # migration'lar cloud'a uygulanır (seed.sql cloud'a gitmez)
```
## Cloudflare Workers
`apps/dashboard/wrangler.jsonc` içindeki `SUPABASE_URL`'i `https://<ref>.supabase.co` yap, sonra:
```bash
cd apps/dashboard
pnpm wrangler login
for k in SUPABASE_SERVICE_ROLE_KEY ADMIN_PASSWORD SESSION_SECRET EXTENSION_API_KEY OPENROUTER_API_KEY; do pnpm wrangler secret put $k; done
pnpm deploy                        # build + wrangler deploy
```
Yerel Workers önizlemesi: `apps/dashboard/.dev.vars` (gitignore'da) + `pnpm preview`. Opsiyonel model değişkenleri (`SUGO_MODEL_*`) `wrangler.jsonc` `vars` altına eklenir.
İlk host'u dashboard'dan veya extension'ın `POST /api/ext/hosts/<id>/sync` çağrısıyla oluştur.

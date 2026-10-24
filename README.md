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

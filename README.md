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
Deploy ortamına şu env'ler verilir: `SUPABASE_URL` (https://<ref>.supabase.co), `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET` (uzun rastgele), `EXTENSION_API_KEY`, `ORIGIN` (public URL, https), `OPENROUTER_API_KEY`.
İlk host'u dashboard'dan veya extension'ın `POST /api/ext/hosts/<id>/sync` çağrısıyla oluştur.
`Dockerfile` ile imaj alınır (`docker build -t sugo-host .`, port 3000); HTTPS arkasında çalıştır (cookie `secure`).

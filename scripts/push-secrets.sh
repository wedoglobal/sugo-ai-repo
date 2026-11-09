#!/usr/bin/env bash
# Kök .env'deki gizli değerleri Cloudflare Worker secret'ı olarak yükler (stdin ile, diske yazmadan).
# SUPABASE_URL ve SUGO_MODEL_* secret değil; apps/dashboard/wrangler.jsonc "vars" altında durur.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo ".env yok" >&2; exit 1; }

node --input-type=module -e '
import { readFileSync } from "node:fs";
const KEYS = ["SUPABASE_SERVICE_ROLE_KEY", "ADMIN_PASSWORD", "SESSION_SECRET", "EXTENSION_API_KEY", "OPENROUTER_API_KEY"];
const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n")
  .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^(["\x27])(.*)\1$/, "$2")]));
const missing = KEYS.filter((k) => !env[k]);
if (missing.length) { console.error("Eksik/boş: " + missing.join(", ")); process.exit(1); }
for (const k of ["ADMIN_PASSWORD", "SESSION_SECRET", "EXTENSION_API_KEY"]) {
  if (/^change-me/.test(env[k])) { console.error(k + " hala varsayılan değerde (change-me...); canlıya almadan önce değiştir"); process.exit(1); }
}
if (/127\.0\.0\.1|localhost/.test(env.SUPABASE_URL ?? "")) console.error("Uyarı: .env SUPABASE_URL yerel; wrangler.jsonc vars içindeki cloud URL kullanılır.");
console.log(JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, env[k]]))));
' | (cd apps/dashboard && pnpm wrangler secret bulk)

# Sugo Chrome extension (boş)

https://sugo.live üzerinde otomasyonu yürütecek; henüz yazılmadı. Dashboard tarafı hazır (`/api/ext/*`, Bearer `EXTENSION_API_KEY`).

## DOM seçicileri (/messages)
- Sohbet satırı: `[data-message-conversation-id]` (değer = karşı tarafın sugo id'si)
- Okunmamış rozeti: `.conv-item-unread`; satırı `button[data-testid=message-single-chat-item]`
- Karşı tarafın adı: `.common-display-name-text`
- Benim id: "Me" butonu → profil kartı → `/profile/<id>` (bir kez veya manuel; `POST /api/ext/hosts/<id>/sync`)
- Sohbet penceresi: `[data-testid=message-detail-dialog-surface]`
- Mesajlar: `[data-testid=private-text-message][data-state=sent|received]`, metin `[data-testid=private-text-bubble]`
- Giriş: `.message-input-text[contenteditable]`, gönder: `button[aria-label="Send message"]`
- Boş sohbet: `[data-testid=message-user-card]` var, mesaj yok → `welcome`

## Akış
1. /messages listesini sürekli izle, `.conv-item-unread` olan satıra tıkla.
2. Pencereyi parse et → `POST /api/ext/ingest`.
3. `GET /api/ext/jobs/next?host=<id>` → `reply_text`i yaz, gönder.
4. `POST /api/ext/jobs/:id/complete` (hata: `/fail`).

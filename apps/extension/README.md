# Sugo Chrome extension

https://sugo.live üzerindeki sohbetleri dashboard API’sine bağlar (`/api/ext/*`, Bearer `EXTENSION_API_KEY`).

## Yükleme ve güncelleme
Chrome’da `chrome://extensions` sayfasında geliştirici modunu açıp bu klasörü paketlenmemiş uzantı olarak yükle. Güncellemede mevcut uzantının yeniden yükle düğmesine bas, ardından sugo.live sekmesini yenile. ZIP paketi kullanıyorsan önce içeriğini bir klasöre çıkart.

API adresi ve anahtar build sırasında hazır gelir. Panel → AI profilleri → Bu Chrome’a bağla ile profilini seç. Başlat/durdur, ses ve karakter ayarlarını panelden yönet; popup yalnız durum ve panel kısayolu gösterir. Güncellemede aynı eklenti klasörünü kullanarak mevcut depoyu koru.

## DOM seçicileri (/messages)
- Sohbet satırı: `[data-message-conversation-id]` (değer = karşı tarafın sugo id'si)
- Okunmamış rozeti: `.conv-item-unread`; satırı `button[data-testid=message-single-chat-item]`
- Karşı tarafın adı: `.common-display-name-text`
- Benim id: "Me" butonu → profil kartı → `/profile/<id>` (bir kez veya manuel; `POST /api/ext/hosts/<id>/sync`)
- Sohbet penceresi: `[data-testid=message-detail-dialog-surface]`
- Mesajlar: `[data-testid=private-text-message][data-state=sent|received]`, metin `[data-testid=private-text-bubble]`
- Alıntılı cevaplar: `[data-testid=private-quote-message][data-state=sent|received]`, yeni metin `[data-testid=private-quote-body]`; alıntı önizlemesi yeni mesajın metnine eklenmez.
- Fotoğraf: `[data-testid=private-image-message]`, kaynak `[data-testid=private-image-content]` öğesinin `src` değeri. Gelen fotoğraf kısa övgüyle yanıtlanır.
- Ses: `[data-testid=private-voice-message]`, kimlik `data-voice-asset-source`. Ses dökümü yoktur; önceki yazılı bağlama göre karşılık verilir veya yazması istenir.
- Giriş: `.message-input-text[contenteditable]`, gönder: `button[aria-label="Send message"]`
- Boş sohbet: `[data-testid=message-user-card]` var, mesaj yok → `welcome`

## Akış
1. Önce hazır normal cevapları gönder, ardından normal okunmamış sohbetleri en eskiden başlayarak işle. Normal mesaj işi kalmadığında eşleşmelere geç. Tamamlanmamış sohbetler rozetleri kaybolsa da yeniden ele alınır.
2. Pencereyi parse et → `POST /api/ext/ingest`.
3. Cevap hazırsa sohbetten çıkmadan `POST /api/ext/jobs/next` ile host, replyOnly ve DOM'da bulunan visiblePeerIds listesini iletip uygun işi kilitle → aynı kişiye aitse açık pencerede yaz, gönder. Listede bulunmayan sohbetler bu istemciye verilmez.
4. `POST /api/ext/jobs/:id/complete` (hata: `/fail`).
5. İş oluşmadan önceki okuma ve API hataları `POST /api/ext/errors` üzerinden kuyrukta failed olarak kaydedilir; sunucuya ulaşılamazsa tarayıcı konsoluna yazılır.
6. Tamamlanmamış sohbetler host/kişi bazında Chrome depolamasında tutulur. Cevap yazılırken gelen yeni mesajlar ayrıca senkronize edilir; yenileme veya bağlantı kopması takibi sıfırlamaz. Sunucu da işlenmemiş mesajı olup aktif işi olmayan sohbetleri yeniden kuyruğa alır.
7. Kadın rozeti veya alıcının reddettiğini belirten sistem mesajı varsa sohbet okunup yanıt dışı bırakılır; `/api/ext/ignore` ile sunucuda da kapatılır. Yalnız takip bildirimi yanıtlanmaz; yanında gerçek metin, fotoğraf veya ses varsa o mesaj işlenir. Çevrim içi bildirimleri eşleşme değildir ve en son okunur.
8. Eşleşme onarımı okunmamış rozetinden bağımsız olarak `conv-preview-match-prefix` işaretini tarar. Hazır normal işler önceliklidir; başarısız bir sohbetin bekleme süresi diğer eşleşmeleri durdurmaz. Listede bulunamadığı bildirilen sohbetler eski istemciler için 10 dakika ertelenir; sohbet tekrar DOM'a geldiğinde veya ingest edildiğinde yeniden ele alınır.
9. Sürekli normal trafik olduğunda dört cevaptan sonra, dakikada en fazla bir bekleyen eşleşme onarılır; normal sohbetlerin sürekli yenilenmesi eşleşmeleri süresiz bekletmez.
10. `box-female` gibi sayısal olmayan sistem kutuları kullanıcı listesine ve kuyruk isteğine dahil edilmez. Backend de sistem kutularını ayıklar; tek geçersiz kimlik diğer sohbetleri durdurmaz.


## Birleşik Velora AI eklentisi (0.2.0)

Otomasyon, GPS ve proxy aynı eklenti içindedir. Eski kurulmuş sürümler mevcut backend API’si ve anahtarıyla çalışmaya devam eder; zorunlu güncelleme veya ayar sıfırlama yoktur. `baseUrl`, `apiKey`, `hostSugoId`, `enabled` anahtarları ve `/api/ext/*` mesaj sözleşmeleri korunur. GPS/proxy varsayılan kapalıdır ve otomasyon anahtarından bağımsızdır.

0.2.0’a geçişte aynı eklenti klasörünü güncelleyin ve Chrome’da yeniden yükleyip debugger/proxy/web isteği izinlerini onaylayın. Yeni klasöre kurulum farklı Chrome kimliği/deposu oluşturabilir. Ayrı Connect eklentisi kullanılmışsa birleşik sürümü kullanırken onu kapatın; farklı eklenti depolarındaki profiller kendiliğinden taşınmaz. Mağaza veya otomatik güncelleme yoktur.

Panel → AI profilleri → Konum ve bağlantı üzerinden tam domain eşleşmeli site profillerini yönetebilirsiniz. Aynı anda tek AI profilinin site listesi etkindir; proxy kuralları aynı hedef domain’e yapılan tüm normal sekme isteklerini etkiler. Alt domain, CDN/API adresleri ayrı profil ister. GPS `chrome.debugger`/CDP ile sekmeye uygulanır; site konum izni ayrıca gereklidir. DevTools veya kullanıcı bağlantıyı keserse panelden yeniden kaydedin. Gizli mod desteklenmez.

HTTP/HTTPS kullanıcı adı, şifre (boş şifre dahil), şifresiz ve IP izin listeli proxy desteklenir. Chrome şifreli SOCKS5 desteklemez. PAC proxy kuralında DIRECT yedeği yoktur ve `mandatory: true` kullanılır; kuralsız domain’ler DIRECT’tir. Proxy kalmayınca bu eklenti kendi proxy ayarını bırakır. Başka proxy yöneticileri ve kurum politikaları engel olabilir. Bu bir cihaz VPN’i veya WebRTC/UDP koruması değildir; Chrome yerel hedefleri bypass edebilir.

Site profilleri ve proxy şifreleri yalnız yerel Chrome deposunda şifrelenmeden tutulur, sunucuya gönderilmez. Harita OpenStreetMap karolarıyla internet kullanır; görünür bölge karo sunucusuna görünür. Koordinat girişi harita yüklenmeden çalışır.

## Korumalı build

`pnpm extension:package` kök `.env` içindeki `EXTENSION_API_KEY` değerini okur. Build’in API adresi canlı Worker adresidir. Varsayılanlar yalnız boş/yeni ayarlarda kullanılır; kayıtlı `baseUrl`, `apiKey`, `hostSugoId`, `enabled` değerleri korunur. Anahtar eksikse paketleme durur. Kaynak dosyalara gerçek anahtar yazılmaz.

Üretilen **Velora AI** paketinde bundle, minify, isim karıştırma ve string kodlama uygulanır; kaynak haritaları, testler ve README dağıtılmaz. MV3 için eval gerektirmeyen çıktı üretilir. Bu işlem tersine mühendisliği zorlaştırır; istemciye gömülen API anahtarını gizli tutamaz.

ZIP’ler `apps/dashboard/.extension-build` altında, sunucu modülü ise `src/lib/server/generated` altında üretilir; ikisi de git dışında tutulur. Paketler statik asset olarak yayınlanmaz. `/downloads/velora-ai-extension.zip` ve eski indirme adresi yalnız yönetici panel oturumuyla, `private, no-store` başlıklarıyla sunulur.

Yayın: `pnpm --filter @sugo/dashboard run deploy`. Ön kontrol mevcut canlı anahtarı ve Supabase kolon/RPC adlarını salt okunur doğrular; eşleşmezse yayın durur. Mevcut Worker secret’ları değiştirilmez. Yayından sonra `node scripts/check-release.js` paneli, eski istemci doğrulama/CORS davranışını ve oturum kontrollü ZIP’lerin SHA-256 değerlerini kontrol eder.


## Panel kontrolü ve eşitleme

Yeni sürüm, `config` okumasında `/api/ext/control?host=<profil-id>` üzerinden panelin güncel başlat/durdur kararını alır; kısa önbellek (1 saniye) aynı anda gelen okumaları birleştirir. Panel değişiklikten sonra önbelleği beklemeden yeniden okutur. Çevrimdışı/bozuk yanıt otomasyonu durdurur; arayüz bunu eşitlendi diye göstermez. Metin gönderme düğmesine basmadan ve medyayı göndermeden önce durum tekrar okunur. Başlamış bir ses kaydı veya zaten gönderilmiş mesaj geri alınamaz.

Panelde “Eşitlendi” yalnız eklenti doğru host kimliği, aktiflik ve `hosts.updated_at` revizyonunu onayladığında görünür. “Bu Chrome’a bağla” bu tarayıcının profilini seçer. Başlat/durdur bu seçimi değiştirmez; durdurmak backend’de yeni iş verilmesini ve üretimi de keser. Eski istemciler aynı API alanlarıyla çalışır; duraklatılmış profil için `job:null` döner. Yeni endpoint’i kullanmak için bir defalık 0.2.0 kurulumu gerekir; sonraki profil ayarları client build değişikliği istemez.

GPS/proxy verileri önceki yerel prensibi korur: panel, aynı Chrome’daki eklentiye doğrudan mesaj gönderir. İşlem kimliğiyle onay, uygulama zamanı ve hata döner; onay gelmeden başarılı eşitleme sayılmaz. Etkin olmayan profil yalnız kaydedilir. Farklı cihazdan bu yerel GPS/proxy deposuna erişim yoktur; otomasyon başlat/durdur sunucu üzerinden kontrol edilir.

`contentSettings` izni, yalnız panelde GPS etkinleştirilmiş tam domain’lerin konum iznini uygular. GPS kapatılınca bu eklentinin konum kuralları temizlenir; kullanıcının önceki Chrome izinleri geçerli olur. Kurum politikası engeli veya debugger hatası uygulama hatası olarak gösterilir. Chrome’un eklenti kurulum izinleri kullanıcı tarafından bir kez onaylanır.

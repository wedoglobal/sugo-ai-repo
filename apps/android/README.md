# Sugo Android (AutoJS6)

`com.voicemaker.android` (2.53.0) için erişilebilirlik tabanlı otomasyon. Sunucu sözleşmesi Chrome eklentisiyle aynıdır (`/api/ext/*`, Bearer anahtar); görsel ve ses yoktur, yalnız metin.

## APK oluşturma ve konum

1. AutoJs6’da telefondaki güncel proje klasörünü APK Builder Template ile paketle. `main.js`, `lib/location.js` dahil `lib/` ve yerel `config.json` pakette bulunmalı. Açık bir Builder formu varsa kapatıp güncel proje klasöründen yeniden aç. APK, yapılandırmayı kendi proje dizininden okur ve çalışma günlüğünü uygulamanın özel dizinine yazar. AutoJs6 içinden çalıştırıldığında `/sdcard/sugo-dev` yolları da kullanılabilir.
2. APK’yı aşağıdaki komutla imzala. Komut, Builder eski ayarı taşımışsa APK içindeki paylaşılan depolama gereksinimini kapatır ve manifest’e test konumu izni ile Sugo paket sorgusunu ekler. Güncelleme kurulumları için mevcut APK’yı imzalayan anahtarı kullan. `apksigner` parolaları terminalden ister. Otomatik derleme için `SUGO_APK_STORE_PASSWORD` ve `SUGO_APK_KEY_PASSWORD` ortam değişkenleri kullanılabilir.

   ```sh
   python3 scripts/sign-android-apk.py builder.apk sugo-android.apk \
     --build-tools "$ANDROID_HOME/build-tools/36.0.0" \
     --keystore release.p12 --alias release
   ```

   APK, Sugo (`com.voicemaker.android`) ön planda değilse onu kendisi açar (Android 13+ için başlatma niyetiyle, öncesinde paket sorgusu manifest’e eklenir) ve ön plana gelmesini doğrular; açılamazsa günlüğe `Sugo uygulaması açılamadı` yazar.
3. APK’yı aç, Android ayarlarında bu APK’nın erişilebilirlik hizmetini etkinleştir ve Sugo uygulamasında oturum aç. Android 13 veya üzerinde **Kısıtlanmış ayar** uyarısı çıkarsa APK’nın **Uygulama bilgisi → ⋮ → Kısıtlanmış ayarlara izin ver** seçeneğini onayla ve erişilebilirlik ekranına geri dön. Panelden konum kullanmak için geliştirici seçeneklerinde aynı APK’yı **Sahte konum uygulaması** olarak seç.
4. Panelde Sugo profilinin **Konum ve bağlantı** sayfasında `sugo.live` için GPS’i kaydet. Android çalışırken konumu alır. **Gerçek konumu kullan** seçeneğini kaydetmek veya site profilini silmek test konumunu kaldırır. İzin ve uygulama durumunu Android günlüğündeki `[sugo-android] GPS` satırlarından kontrol et.

## Kurallar
- Kodlar AutoJS6 (Rhino) içindir: `var`/`function`, CommonJS; `?.`, `??`, spread, `async` yok. Saf modüller (`lib/tree|screens|parse|nav`) AutoJS global'larına dokunmaz, Node'da vitest ile test edilir.
- Yalnız erişilebilirlik düğüm ağacı kullanılır: ekran görüntüsü, OCR, panoya bağımlılık, root, sabit piksel yok. Android 10 (API 29) ve üzeri hedeflenir; AutoJS6 minSdk 24.
- Her gezinme ve geri dönüşten sonra ekranın gerçekten değiştiği doğrulanır (`lib/nav.js`). Beklenen ekran gelmezse işlem başarısız sayılır.
- Sohbet/profil işi bitince ekrandaki geri düğmesiyle (`id_back` / `backBtn`) listeye dönülür. **Listedeyken geri tuşuna asla basılmaz**: uygulamadan çıkma onayı açılır.

## Ekranlar ve seçiciler (tek yer: `lib/screens.js`)
| Ekran | Tanıma | Notlar |
|---|---|---|
| Liste (Mesajlar) | `id_conv_tab_all` görünür | Alt sekme `id_main_bottomtab_conv`. Satır `ll_chat_item`: `id_user_name_tv`, `id_latest_msg_tv`, `id_online_time_tv`, `id_unread_tcv` (rozet), `id_online_indicator`. Eşleşme önizlemesi `[Eşleşme]…` ile başlar. |
| Sohbet | `id_msg_list_view` | Başlık `id_chatting_title_username_tv`, giriş `id_input_edit_text`, gönder `id_chat_send_btn`, geri `id_back`. Mesaj metni `id_chat_msg_text`; yön, satırdaki `id_user_avatar_iv` sağdaysa giden. Sistem ipucu `id_chatting_sys_tips_tv`. |
| Profil | `id_profile_tab_userinfo` | Sayısal sugo id `uidView` (kaydırmadan ekran dışında, ağaçtan okunur). Selam düğmesi `pickBtn` ("Merhaba de"). Geri `backBtn`. |
| Sohbet ayarları | `ll_set_chat_bg` | Sohbet başlığındaki avatar buraya gider, profile değil. |

## Cinsiyet
Rozet bir ikon, metni/açıklaması yok. Profil sayfasında rozet kökü (`id_gender_age_root`) kadında `selected=true`, erkekte `false`; `parse.gender` bunu okur, kadın ve erkek profiliyle doğrulandı. **Sohbet kartındaki rozet kadında da `selected=false` kalır, güvenilmez**; cinsiyet bu yüzden yalnız profilden (peer id okunurken, `nav.readPeerId`) alınır.

## Peer sugo id
Chrome'da id satırın özniteliğidir; Android'de yok. Liste satırının avatarına dokunmak doğrudan profile gider, `uidView` id'yi verir, `backBtn` listeye döner (`nav.readPeerId`).

## Tuzaklar
- `ll_chat_item` sorgusu ekran dışındaki ViewPager sayfalarının (Çevrimiçi sekmesi) kopyalarını da döndürür; görünürlük sınırlarla süzülür (`tree.isVisible`).
- Kısmen görünen satıra dokunmak yanlış yere gidebilir; `fullyVisible` kontrol edilir.

## Henüz bilinmeyenler (keşif sürüyor)
- Gelen mesaj balonunun yapısı (yalnız giden örnek var), görsel/ses/hediye balonları, gönderim hatası göstergesi (`chatting_state_iv`), "reddedildi/engellendi" sistem metni.
- "Merhaba de" ve Yakınlarda akışı (selam gönderme).
- Android 10 gerçek doğrulaması: elde yalnız Android 13 cihaz var.

## Fixture'lar
`fixtures/*.txt` gerçek `AutoJS6` dump'larıdır (girinti = derinlik, `Sınıf|id|metin|açıklama|l,t,r,b[|c][|s]`, s = seçili). Profil sayısal id'si anonimleştirilmiştir.

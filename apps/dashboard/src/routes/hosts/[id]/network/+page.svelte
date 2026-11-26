<script>
  import { onMount } from 'svelte';
  import ProfileControl from '$lib/ProfileControl.svelte';
  import LocationMap from '$lib/LocationMap.svelte';
  let { data } = $props();
  const fresh = () => ({ domain: '', gps: { enabled: false, latitude: 41.0082, longitude: 28.9784, accuracy: 20 }, proxy: { enabled: false, protocol: 'http', ip: '', port: 8080, auth: false, username: '', password: '' } });
  let draft = $state(fresh());
  let originalDomain = $state('');
  let state = $state(null);
  let busy = $state(false);
  let message = $state('');
  let error = $state('');
  let showPassword = $state(false);
  const active = $derived(!!state);
  const timeFormat = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Istanbul' });
  const roamLabels = {
    gps_off: 'GPS kapalı', paused: 'Profil durduruldu', offline: 'İstemci bekleniyor',
    waiting: '10 dakikalık boşta kalma süresi bekleniyor', awaiting_poll: 'Sıradaki istemci kontrolü bekleniyor',
    moving: 'Otomatik hedef hazır', no_land: 'Bu adım için karada hedef bulunamadı',
  };
  const coordinates = ({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : '—';
  /** Bağlı istemciler kaydedilen profilleri kontrol yanıtından okur. */
  async function api(options) {
    const response = await fetch(`/hosts/${data.host.id}/network-profiles`, { cache: 'no-store', ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'İşlem başarısız.');
    return body;
  }
  function seen(body) { return !!body.lastSeenAt && Date.parse(body.now) - Date.parse(body.lastSeenAt) < 90000; }
  function adopt(body) { state = { profiles: body.profiles, roaming: body.roaming ?? [], activeHost: data.host.id, connected: seen(body), lastSeenAt: body.lastSeenAt }; }
  async function run(action, extra = {}) {
    busy = true; error = ''; message = '';
    try {
      if (action === 'read') adopt(await api());
      else {
        let list = (state?.profiles ?? []).filter((p) => p.domain !== extra.originalDomain && p.domain !== extra.domain);
        if (action === 'save') list = [...list, extra.profile];
        const saved = await api({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profiles: list }) });
        state = { ...state, profiles: saved.profiles, roaming: [] };
        message = 'Ayar kaydedildi.';
      }
    } catch (e) { error = e.message; }
    finally { busy = false; }
  }
  function edit(p) { draft = structuredClone($state.snapshot(p)); originalDomain = p.domain; showPassword = false; message = ''; }
  function reset() { draft = fresh(); originalDomain = ''; showPassword = false; }
  onMount(() => {
    run('read');
    const timer = setInterval(async () => {
      if (busy || !state) return;
      try { adopt(await api()); } catch { /* Sonraki turda yeniden denenir. */ }
    }, 4000);
    return () => clearInterval(timer);
  });
</script>
<svelte:head><title>Konum ve bağlantı · {data.host.name || 'AI profili'} · Velora AI</title></svelte:head>
<div class="network-page">
  <a class="back" href="/hosts/{data.host.id}">← {data.host.name || 'AI profili'} / Profil ayarları</a>
  <header><div><div class="eyebrow">CONNECTION STUDIO</div><h1>Konum ve bağlantı<span>.</span></h1><p>Bir site seç, konumunu belirle, bağlantını yönet.</p></div><span class:connected={state?.connected} class="connection"><i></i>{state?.connected ? 'İstemci bağlı' : 'İstemci bekleniyor'}</span></header>
  <div class="card"><ProfileControl host={data.host} /></div>
  <details class="setup-guide" open={!state}><summary class="setup-summary"><span>✧ Velora AI kurulumu</span><span>{state ? 'Bağlantı hazır · Rehberi aç' : '3 kolay adım'}</span></summary><div class="setup-intro"><span class="guide-kicker">İLK KEZ Mİ KULLANIYORSUN?</span><h2>Üç adımda hazır.</h2><p>Otomasyon, GPS ve proxy tek Velora AI eklentisinde. GPS ve proxy kullanmak için 0.2.0 veya üstüne geç; eski sürümler otomasyona devam eder.</p></div><div class="setup-steps"><div><span class="step-number">01</span><strong>Velora AI’ı ekle</strong><p>ZIP’i çıkart ve Chrome’da paketlenmemiş eklenti olarak yükle.</p><a href="/downloads/velora-ai-extension.zip" download>Velora AI’ı indir ↗</a></div><div><span class="step-number">02</span><strong>Siteyi hazırla</strong><p>Domain’i gir. Haritadan konumunu seç veya proxy bilgilerini ekle.</p><button type="button" class="guide-button" disabled={busy} onclick={() => run('read')}>Eklenti bağlantısını kontrol et ↻</button></div><div><span class="step-number">03</span><strong>Kaydet ve etkinleştir</strong><p>Siteyi kaydet; bu profilin bağlantı ayarlarını üstteki düğmeden etkinleştir.</p><span class="step-note">GPS ve proxy ayrı ayrı çalışır.</span></div></div></details>
  {#if state}<p class="hint" role="status">{state.connected ? `İstemci bağlı · son okuma ${new Date(state.lastSeenAt).toLocaleTimeString('tr-TR')}` : 'Bu profile bağlı istemciden son 90 saniyede kontrol isteği alınmadı.'}</p>{/if}
  {#if error}<div class="notice error" role="alert">{error} <button class="secondary" disabled={busy} onclick={() => run('read')}>Yeniden bağlan</button></div>{/if}
  {#if message}<div class="notice success" role="status">{message}</div>{/if}
  {#if state?.roaming?.length}
    <section class="card roam-status" aria-label="Otomatik konum durumu">
      <h2>Otomatik konum durumu</h2>
      {#each state.roaming as item (item.domain)}
        <div class="roam-site">
          <strong>{item.domain}</strong>
          <span class:target-ready={item.target}>{roamLabels[item.state]}</span>
          <dl>
            <div><dt>Kayıtlı merkez</dt><dd>{coordinates(item.center)}</dd></div>
            {#if item.target}
              <div><dt>Son kontroldeki otomatik hedef</dt><dd>{coordinates(item.target)}</dd></div>
              <div><dt>Hedefin başlangıcı</dt><dd>{timeFormat.format(item.target.stepAt)}</dd></div>
            {/if}
            {#if item.firstAt}<div><dt>İlk hedef için en erken</dt><dd>{timeFormat.format(item.firstAt)}</dd></div>{/if}
            {#if item.seenAt}<div><dt>Son kayıtlı konum kontrolü</dt><dd>{timeFormat.format(new Date(item.seenAt))}</dd></div>{/if}
          </dl>
        </div>
      {/each}
      <p class="hint">Hedef, son kayıtlı sunucu kontrolüne göre gösterilir. Cihazda uygulandığını doğrulamak için istemci günlüğüne bak.</p>
    </section>
  {/if}
  <div class="mode-explainer"><div><span class="mode-symbol gps">◎</span><div><strong>GPS = siteye gösterilen konum</strong><p>IP adresini değiştirmez. Haritadan istediğin noktayı seç.</p></div></div><div><span class="mode-symbol proxy">⇄</span><div><strong>Proxy = bağlantının çıkış adresi</strong><p>GPS’i değiştirmez. Aynı domain’in tüm sekmelerinde çalışır.</p></div></div></div>
  <div class="workspace">
    <aside>
      <div class="aside-heading"><strong>Site profilleri</strong><span>{state?.profiles.length ?? 0}</span></div>
      <button class="add" onclick={reset}>+ Yeni site profili</button>
      {#each state?.profiles ?? [] as profile (profile.domain)}
        <button class="profile" class:selected={originalDomain === profile.domain} onclick={() => edit(profile)}><strong>{profile.domain}</strong><small><span class:on={profile.gps.enabled}>● GPS</span><span class:on={profile.proxy.enabled}>● Proxy</span></small></button>
      {:else}<p class="empty">Henüz site eklenmedi.<br />İlk profilinizi sağdan oluşturun.</p>{/each}
      <div class="privacy"><strong>↳ Sunucuda saklanır</strong><p>Profiller ve proxy şifreleri panel veritabanında tutulur ve bağlı istemcilere iletilir.</p></div>
    </aside>
    <form onsubmit={(e) => { e.preventDefault(); run('save', { profile: $state.snapshot(draft), originalDomain }).then(() => { if (!error) originalDomain = new URL(draft.domain.includes('://') ? draft.domain : `https://${draft.domain}`).hostname.toLowerCase().replace(/\.$/, ''); }); }}>
      <section class="editor-top"><div class="eyebrow">{originalDomain ? 'PROFİLİ DÜZENLE' : 'YENİ PROFİL'}</div><label for="domain">Web sitesi</label><input id="domain" class="domain" bind:value={draft.domain} required placeholder="ör. example.com" /><p class="hint">Tam domain eşleşir. www ve diğer alt domain’ler için ayrı profil ekleyin.</p></section>
      <section><div class="section-heading"><div class="icon">◎</div><div><h2>GPS konumu</h2><p>Siteye gösterilen koordinatları seçin.</p></div><label class="toggle"><input type="checkbox" aria-label="GPS konumu etkin" bind:checked={draft.gps.enabled} /><span></span><b>{draft.gps.enabled ? 'Açık' : 'Kapalı'}</b></label></div>
        <div class="location-presets"><span>Hızlı seçim</span>{#each [['İstanbul',41.0082,28.9784],['Londra',51.5074,-0.1278],['New York',40.7128,-74.006]] as [city,lat,lon]}<button type="button" onclick={() => { draft.gps.latitude = lat; draft.gps.longitude = lon; }}>{city}</button>{/each}<button type="button" class="real-location" onclick={() => draft.gps.enabled = false}>Gerçek konumu kullan</button></div>
        <LocationMap bind:latitude={draft.gps.latitude} bind:longitude={draft.gps.longitude} />
        <div class="coordinates"><label>Enlem<input type="number" min="-90" max="90" step="any" required bind:value={draft.gps.latitude} /></label><label>Boylam<input type="number" min="-180" max="180" step="any" required bind:value={draft.gps.longitude} /></label><label>Doğruluk (m)<input type="number" min="0" step="any" required bind:value={draft.gps.accuracy} /></label></div>
        <p class="hint">Haritaya tıklayarak seçin, sürükleyerek gezinin. Harita için internet gerekir (OpenStreetMap). GPS açıkken bu sitenin konum iznini eklenti uygular. Kapatılıp kaydedildiğinde gerçek konuma ve önceki Chrome izin davranışına dönülür.</p>
        <p class="hint">Android, bu profilin <strong>sugo.live</strong> GPS ayarını kullanır. APK’yı Android geliştirici seçeneklerinde Sahte konum uygulaması olarak seçin. Ayarın cihazda uygulandığını Android günlüğünden kontrol edin.</p>
      </section>
      <section><div class="section-heading"><div class="icon">⇄</div><div><h2>IPv4 proxy</h2><p>Bu domain’in ağ bağlantısını yönlendirin.</p></div><label class="toggle"><input type="checkbox" aria-label="IPv4 proxy etkin" bind:checked={draft.proxy.enabled} /><span></span><b>{draft.proxy.enabled ? 'Açık' : 'Kapalı'}</b></label></div>
        <fieldset disabled={!draft.proxy.enabled}><div class="proxy-fields"><label>Protokol<select bind:value={draft.proxy.protocol}><option value="http">HTTP</option><option value="https">HTTPS (TLS)</option><option value="socks5">SOCKS5</option></select></label><label>IPv4 adresi<input placeholder="203.0.113.10" bind:value={draft.proxy.ip} required={draft.proxy.enabled} /></label><label>Port<input type="number" min="1" max="65535" bind:value={draft.proxy.port} required={draft.proxy.enabled} /></label></div>
        <label class="auth"><input type="checkbox" bind:checked={draft.proxy.auth} /> Proxy şifre istiyor</label><p class="hint">Şifre istemeyen veya IP adresine izin veren proxy’lerde bu seçeneği kapalı bırakın. Şifre boş olabilir; kullanıcı adı gerekiyorsa seçeneği açın.</p>
        {#if draft.proxy.auth}<div class="credentials"><label>Kullanıcı adı<input autocomplete="off" bind:value={draft.proxy.username} required={draft.proxy.enabled} /></label><label>Şifre<div class="password"><input type={showPassword ? 'text' : 'password'} autocomplete="new-password" bind:value={draft.proxy.password} /><button type="button" class="secondary" aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'} onclick={() => showPassword = !showPassword}>{showPassword ? 'Gizle' : 'Göster'}</button></div></label></div>{/if}
        </fieldset>
        {#if draft.proxy.protocol === 'socks5'}<p class="notice">Chrome, SOCKS5 şifre doğrulamasını desteklemez. Şifresiz / IP izin listeli SOCKS5 ya da şifreli HTTP/HTTPS kullanın.</p>{/if}
        <div class="protection"><strong>◈ Fail-closed yönlendirme</strong><p>Proxy kuralında DIRECT yedeği yoktur. Proxy hatasında bağlantı başarısız olur. Diğer domain’lere bu eklenti proxy atamaz.</p></div>
      </section>
      <footer><span>Kaydettiğiniz değişiklikler bağlı Chrome'a birkaç saniyede ulaşır.</span><div>{#if originalDomain}<button type="button" class="delete" disabled={busy || !state} onclick={async () => { await run('delete', { domain: originalDomain }); if (!error) reset(); }}>Profili sil</button>{/if}<button disabled={busy || !state}>{busy ? 'İşleniyor…' : 'Profili kaydet'}</button></div></footer>
    </form>
  </div>
  <div class="footnotes"><button type="button" class="secondary" disabled={busy} onclick={() => run('read')}>Bağlantı durumunu yenile</button><p><strong>GPS ve IP bağımsızdır.</strong> GPS IP’yi, proxy GPS’i değiştirmez. PAC kuralları hedef domain bazında tüm sekmelerde geçerlidir; farklı CDN/API domain’leri ayrı profil ister.</p><p>Chrome’da aynı anda tek AI profilinin bağlantı ayarları etkin olabilir. Eklentiyi kapatmak, başka bir proxy yöneticisi veya kurum politikası korumayı geçersiz kılabilir. Bu özellik tüm cihaz trafiğini kapsayan bir VPN değildir.</p><p><a class="download" href="/downloads/velora-ai-extension.zip" download>↓ Velora AI’ı indir · v0.2.1</a></p><details open={!state}><summary>Eklenti kurulumu ve bağlantı bilgileri</summary><ol><li>Yukarıdaki ZIP’i indirip bir klasöre çıkartın. Bu klasörü Chrome → Uzantılar → Geliştirici modu → Paketlenmemiş öğe yükle ile yükleyin.</li><li>Mevcut kurulumunuzu güncellerken aynı eklenti klasörünü kullanın; kayıtlı ayarlar korunur. Yeni GPS/proxy ve site ayarı izinlerini Chrome’da bir kez onaylayın. Yeni klasöre kurulum farklı eklenti kimliği oluşturabilir.</li><li>Daha önce ayrı Connect eklentisini kurduysanız birleşik sürümü kullanırken onu devre dışı bırakın. Yerel geliştirme paneli ve mevcut canlı panel adresi desteklenir. Bağlantı kurulunca durum üstte görünür.</li><li>Chrome debugger bilgi çubuğu GPS açıkken normaldir. DevTools veya kullanıcı bağlantıyı keserse panelden yeniden kaydedin.</li></ol></details>{#if state?.runtime?.proxyError}<p class="error">Son proxy hatası: {state.runtime.proxyError}</p>{/if}{#each Object.entries(state?.runtime ?? {}).filter(([k, v]) => k.startsWith('gps:') && v) as [key, value]}<p class="error">Sekme {key.slice(4)}: {value}</p>{/each}</div>
</div>
<style>
  .roam-status { margin: 18px 0; padding: 18px 22px; }
  .roam-status h2 { margin: 0 0 14px; font-size: 17px; }
  .roam-site + .roam-site { margin-top: 14px; padding-top: 14px; border-top: 1px solid #e7dff0; }
  .roam-site > span { display: inline-block; margin-left: 10px; color: #625c74; font-size: 13px; }
  .roam-site > .target-ready { color: #166b47; }
  .roam-site dl { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 10px 0; }
  .roam-site dt { color: #625c74; font-size: 12px; }
  .roam-site dd { margin: 3px 0 0; font-variant-numeric: tabular-nums; font-size: 14px; }
  .network-page{--ink:#202c43;--soft:#8791a5;color:var(--ink);padding:8px 0 36px}.back{font-size:12px;color:var(--soft);text-decoration:none}header{display:flex;align-items:center;justify-content:space-between;margin:32px 0 26px;gap:16px}.eyebrow{font-size:10px;letter-spacing:2px;font-weight:700;color:#8b79af}h1{font-size:34px;letter-spacing:-1.4px;margin:9px 0}h1 span{color:#8c5ce7}header p,.section-heading p{color:var(--soft);font-size:13px;margin:4px 0}.connection{font-size:11px;background:#eeeaf4;padding:9px 12px;border-radius:24px;white-space:nowrap}.connection i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#aaa;margin-right:6px}.connected i{background:#34a77d}.activation{border:1px solid #ddd5ed;border-radius:13px;background:linear-gradient(110deg,#f2edf9,#fff);padding:19px 22px;display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:22px}.activation strong{font-size:14px}.activation p{font-size:12px;color:var(--soft);margin:6px 0 0}.workspace{display:grid;grid-template-columns:185px minmax(0,1fr);border:1px solid #e7e3ed;border-radius:18px;overflow:hidden;background:white;box-shadow:0 12px 48px #38225306}aside{background:#f8f7fb;border-right:1px solid #e7e3ed;padding:22px 15px}.aside-heading{display:flex;justify-content:space-between;font-size:12px;margin-bottom:20px}.aside-heading span{color:#9a90aa}.add{background:white;border:1px dashed #d6cce8;color:#7654ab;width:100%;font-size:12px;margin-bottom:16px}.profile{display:block;width:100%;text-align:left;background:transparent;color:var(--ink);border:1px solid transparent;margin-bottom:7px;padding:12px 10px}.profile strong{font-size:12px;overflow-wrap:anywhere}.profile.selected{background:white;border-color:#dbd1ee;box-shadow:0 4px 10px #00000004}.profile small{display:flex;gap:12px;margin-top:8px;font-size:10px;color:#aaa1b6}.profile .on{color:#8660c0}.empty{font-size:12px;line-height:1.8;color:#a19aaa}.privacy{margin-top:36px;font-size:11px;color:#847b92;line-height:1.7}.privacy strong{color:#6a5c7e}.privacy p{margin-top:5px}section{padding:25px;border-bottom:1px solid #eeeaf3}.editor-top label{margin-top:16px}.domain{font-size:18px;font-weight:600;padding:12px}.hint{font-size:11px;line-height:1.7;color:#948b9f;margin:10px 0 0}.section-heading{display:flex;gap:12px;align-items:center;margin-bottom:20px}.icon{background:#f3eefb;color:#916ac9;border-radius:12px;padding:9px 12px;font-size:23px}h2{font-size:15px;margin:0}.toggle{margin:0 0 0 auto;display:flex;align-items:center;gap:7px;cursor:pointer}.toggle input{position:absolute;opacity:0;width:1px}.toggle span{width:32px;height:19px;border-radius:12px;background:#dcd7e5;position:relative}.toggle span:after{content:'';position:absolute;background:white;border-radius:50%;width:13px;height:13px;top:3px;left:3px;transition:transform .15s}.toggle input:checked+span{background:#8b5cc8}.toggle input:checked+span:after{transform:translateX(13px)}.toggle input:focus-visible+span{outline:2px solid #5f3599;outline-offset:3px}.toggle b{font-size:10px;font-weight:500;min-width:30px}.coordinates{display:grid;grid-template-columns:1fr 1fr .8fr;gap:12px}.network-page label{font-size:11px;color:#82778e}input,select{font-size:13px;padding:10px;border-color:#e3dfea;border-radius:9px}input:focus,select:focus{outline:2px solid #cdb6ed;outline-offset:1px}fieldset{border:0;padding:0;margin:0;min-width:0}fieldset:disabled{opacity:.45}.proxy-fields{display:grid;grid-template-columns:1fr 1.4fr .7fr;gap:12px}.auth{display:flex;align-items:center;gap:8px;margin-top:18px}.credentials{display:grid;grid-template-columns:1fr 1fr;gap:12px}.password{display:flex;gap:4px}.password input{min-width:0}.password button{padding:7px;font-size:10px}.protection{background:#f6f9f7;border:1px solid #e1eee7;padding:13px;border-radius:10px;margin-top:18px;color:#57806b}.protection strong{font-size:11px}.protection p{font-size:11px;line-height:1.6;margin:6px 0 0}footer{padding:20px 25px;display:flex;align-items:center;gap:12px;justify-content:space-between}footer span{font-size:10px;color:#978ba4;max-width:180px}footer>div{display:flex;gap:8px}button{font-size:12px;border-radius:8px;background:#7950b5;padding:10px 14px}button:disabled{opacity:.45;cursor:wait}.secondary{background:white;color:#746184;border:1px solid #ded6e8}.delete{background:#fff;color:#b76479}.notice{padding:14px;border-radius:10px;background:#f6f0e8;font-size:12px;line-height:1.6;margin:12px 0}.error{color:#ac3d53;background:#fff0f1}.success{background:#eef7f1;color:#3a8059}.footnotes{margin:20px 0 0;font-size:11px;line-height:1.8;color:#91869f}.footnotes strong{color:#746581}summary{cursor:pointer;color:#77589b}@media(max-width:760px){header{align-items:flex-start}h1{font-size:26px}.workspace{grid-template-columns:1fr}aside{border-right:0;border-bottom:1px solid #e7e3ed}.privacy{margin-top:16px}.activation{align-items:flex-start;flex-direction:column}.coordinates,.proxy-fields{grid-template-columns:1fr 1fr}.credentials{grid-template-columns:1fr}section{padding:18px}footer{flex-wrap:wrap}.connection{font-size:9px}}

  .setup-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;font-size:11px;color:#7b7892;font-weight:550;cursor:pointer}.setup-summary>span:last-child{font-size:9px;font-weight:400;color:#9a9fb0}.setup-summary::-webkit-details-marker{display:none}.setup-guide{border:1px solid #e1e7ed;border-radius:16px;background:#fff;margin-bottom:22px;overflow:hidden}.setup-intro{padding:20px 23px 17px;background:linear-gradient(110deg,#edf5f0,#f8f8fc);border-bottom:1px solid #e5ece7}.guide-kicker{font-size:8px;letter-spacing:1.5px;color:#7d9a8d;font-weight:650}.setup-intro h2{font-size:18px;margin:8px 0 6px;letter-spacing:-.5px}.setup-intro p{font-size:11px;color:#89968e;margin:0;line-height:1.7}.setup-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:22px 23px}.step-number{display:block;color:#b4a6cd;font-size:10px;letter-spacing:1px;margin-bottom:10px}.setup-steps strong{font-size:12px}.setup-steps p{font-size:10px;color:#9399aa;line-height:1.8;margin:8px 0 10px}.setup-steps a,.guide-button{font-size:10px;color:#7c679e;text-decoration:none;font-weight:550}.guide-button{background:none;padding:0;border:0}.step-note{font-size:9px;color:#96a4a0}.mode-explainer{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:0 0 22px}.mode-explainer>div{display:flex;align-items:center;gap:12px;padding:15px 17px;border:1px solid #e4e7ee;border-radius:12px;background:#fafbfd}.mode-symbol{height:33px;min-width:33px;display:grid;place-items:center;border-radius:10px;font-size:20px}.mode-symbol.gps{background:#ede8f7;color:#9c84c1}.mode-symbol.proxy{background:#e8f1ed;color:#81a290}.mode-explainer strong{font-size:10px;font-weight:600}.mode-explainer p{font-size:9px;color:#9198a9;line-height:1.7;margin:4px 0 0}.location-presets{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.location-presets>span{font-size:9px;color:#a19aae;margin-right:5px}.location-presets button{font-size:9px;padding:6px 8px;background:#f6f5fa;color:#8c7c9e;border:1px solid #ebe6f2}.location-presets .real-location{margin-left:auto;color:#88a18e;background:#f4f8f5;border-color:#e0ebe3}.download{font-weight:600;color:#788d83}aside{min-width:0}.profile{overflow-wrap:anywhere}footer{background:#fcfcfe}.editor-top .domain{background:#fdfdff}.connection{border:1px solid #e4dfed}.connected{background:#edf6f0;color:#6d9780;border-color:#deece2}@media(max-width:950px){.setup-steps{gap:15px}.workspace{grid-template-columns:1fr}aside{border-right:0;border-bottom:1px solid #e7e3ed}.privacy{margin-top:18px}.mode-explainer{grid-template-columns:1fr}.mode-explainer>div{padding:12px 16px}}@media(max-width:600px){.setup-steps{grid-template-columns:1fr;gap:18px}.setup-steps>div{padding-left:32px;position:relative}.step-number{position:absolute;left:0;top:1px}.setup-intro{padding:18px}.setup-steps{padding:18px}.setup-steps p{margin:6px 0}.network-page header{flex-wrap:wrap}.location-presets .real-location{margin-left:0}}
</style>

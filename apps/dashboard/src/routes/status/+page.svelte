<script>
  import { invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { onMount } from 'svelte';
  let { data } = $props();
  let now = $state(Date.now());
  onMount(() => {
    const tick = setInterval(() => { now = Date.now(); }, 1000);
    const poll = setInterval(invalidateAll, 8000);
    return () => { clearInterval(tick); clearInterval(poll); };
  });
  const ago = (t) => {
    if (!t) return '—';
    const s = Math.max(0, Math.round((now - t) / 1000));
    return s < 60 ? `${s} sn önce` : s < 3600 ? `${Math.round(s / 60)} dk önce` : `${Math.round(s / 3600)} sa önce`;
  };
  const left = (t) => {
    const s = Math.max(0, Math.round((t - now) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const online = (h) => h.live && now - h.live.at < 90000;
  const resting = (h) => online(h) && h.live.state === 'dinleniyor' && h.live.until > now;
</script>

<h1>Canlı durum</h1>
<p class="muted">Her profilin eklentisi 30 saniyede bir durumunu bildirir. Sayfa kendini yeniler.</p>

<table>
  <thead><tr><th>Profil</th><th>Durum</th><th>Ayrıntı</th><th>Son mesaj gönderimi</th><th>Son hareket</th><th>Sürüm</th><th></th></tr></thead>
  <tbody>
    {#each data.hosts as h (h.id)}
      <tr>
        <td><strong>{h.name}</strong><div class="muted">{h.sugo_id}{#if !h.active} · durduruldu{/if}</div></td>
        <td>
          {#if !online(h)}<span class="err">bağlı değil</span><div class="muted">{h.live ? `son haber ${ago(h.live.at)}` : 'hiç bağlanmadı'}</div>
          {:else if resting(h)}<strong>dinleniyor</strong><div class="muted">kalan {left(h.live.until)}</div>
          {:else}<strong>{h.live.state}</strong><div class="muted">{ago(h.live.since)}'den beri</div>{/if}
        </td>
        <td>{h.live?.detail ?? ''}</td>
        <td>{ago(h.live?.lastSentAt)}{#if h.live?.lastSentAt && now - h.live.lastSentAt > 600000}<div class="err">10 dk'yı aştı</div>{/if}</td>
        <td>{ago(h.live?.lastActivityAt)}</td>
        <td>{h.live?.version ?? '—'}</td>
        <td>
          {#if resting(h)}
            <form method="POST" action="?/wake" use:enhance={() => async ({ update }) => { await update(); await invalidateAll(); }}>
              <input type="hidden" name="sugo_id" value={h.sugo_id} /><button>Dinlenmeyi bitir, başlat</button>
            </form>
          {/if}
        </td>
      </tr>
    {:else}
      <tr><td colspan="7" class="muted">Profil yok.</td></tr>
    {/each}
  </tbody>
</table>
<p class="muted">Eklenti boştayken yalnız Mesajlar sayfasında bekler; sayfa yenilemez, Ana sayfa/Yakınlarda gezintisi ve hi göndermez. Dinlenme düğmeyle başlatılır: eklenti boş bir sekme açıp sugo.live sekmesini kapatır, 5–15 dakika rastgele dinlenir, sonra sekmeyi yeniden açıp akışı başlatır (en geç 1 dakika içinde uygulanır).</p>

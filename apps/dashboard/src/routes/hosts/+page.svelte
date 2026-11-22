<script>
  import ProfileControl from '$lib/ProfileControl.svelte';
  let { data, form } = $props();
  const fmt = (n) => n.toLocaleString('tr-TR');
</script>

<div class="page-heading"><div><div class="eyebrow-label">AI PROFILE STUDIO</div><h1>AI profilleri</h1><p>Her karakterin kendine özgü bir sesi, hafızası ve bağlantı ayarı var.</p></div><a class="primary-link" href="#new-profile">+ Yeni profil</a></div>
<div class="table-wrap"><table>
  <thead><tr><th>Ad</th><th>Profil ID</th><th>Profil kontrolü</th><th>Tahmini 💎 gün</th><th>hafta</th><th>ay</th><th></th></tr></thead>
  <tbody>
    {#each data.hosts as h (h.id)}
      <tr><td>{h.name || '—'}</td><td>{h.sugo_id}</td><td><ProfileControl host={h} compact /></td><td>{fmt(h.earn.est.day)}</td><td>{fmt(h.earn.est.week)}</td><td>{fmt(h.earn.est.month)}</td><td><a href="/hosts/{h.id}">Profili düzenle ↗</a> <a class="network-shortcut" href="/hosts/{h.id}/network">Konum ve bağlantı</a></td></tr>
    {:else}
      <tr><td colspan="7" class="muted">Henüz AI profili yok. Aşağıdan ilk profilini oluştur.</td></tr>
    {/each}
  </tbody>
</table></div>
<p class="muted">Tahmin: son 14 günün (veri daha kısaysa mevcut sürenin) günlük ortalaması × 1 / 7 / 30.</p>

<form method="POST" action="?/create" class="card" id="new-profile">
  <strong>Yeni AI profili oluştur</strong><p class="muted">Profil kimliğini ve görünen adını ekle. Karakterini sonraki adımda tasarlayabilirsin.</p>
  <div class="row">
    <div><label for="sid">Platform profil ID (/profile/&lt;id&gt;)</label><input id="sid" name="sugo_id" required /></div>
    <div><label for="nm">Ad</label><input id="nm" name="name" /></div>
    <div><label for="cl">Referans al (isteğe bağlı)</label>
      <select id="cl" name="clone_from"><option value="">— Boş profil —</option>{#each data.hosts as h (h.id)}<option value={h.id}>{h.name || h.sugo_id} ({h.sugo_id})</option>{/each}</select>
    </div>
  </div>
  <p class="muted">Referans seçersen karakter ve ses ayarları, bilgi, model ve tüm medya dosyaları birebir kopyalanır; konum/proxy kopyalanmaz. Sonra düzenleyebilirsin.</p>
  {#if form?.error}<p class="err">{form.error}</p>{/if}
  <p><button>Profili oluştur →</button></p>
</form>

<style>.network-shortcut{display:block;font-size:10px;margin-top:8px;color:#8b94a6;font-weight:400}td:last-child{white-space:nowrap}</style>

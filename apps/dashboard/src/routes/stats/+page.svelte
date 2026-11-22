<script>
  let { data } = $props();
  const name = (id) => data.hosts.find((h) => h.id === id)?.name ?? id.slice(0, 6);
  const fmt = (n) => (n == null ? '—' : n.toFixed(1));
  const date = (iso) => (iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
</script>

<h1>Eşleşme istatistikleri</h1>
<p class="muted">Sugo'nun bize gönderdiği eşleşme bildirimleri ("seni takip ettim"). Sürüm hızı, profilin o sürümü bildirdiği andan itibaren profil-saat başına hesaplanır; kıyas için "24 saatte, profil başına" sütununa bak. Sürüm bildirmeyen eski kayıtlar 0.2.3 sayılır.</p>

<form method="GET" class="row">
  <label>Son <select name="days" onchange={(e) => e.currentTarget.form.submit()}>{#each [3, 7, 14, 30, 90] as d}<option value={d} selected={d === data.days}>{d} gün</option>{/each}</select></label>
</form>

<h2>Eklenti sürümüne göre</h2>
<table>
  <thead><tr><th>Sürüm</th><th>İlk görülme</th><th>Profil-saat</th><th>Eşleşme</th><th>24 saatte, profil başına</th></tr></thead>
  <tbody>
    {#each data.versions as v (v.version)}
      <tr><td>{v.version}</td><td>{date(v.since)}</td><td>{fmt(v.hours)}</td><td>{v.matches}</td><td><strong>{fmt(v.perDay)}</strong></td></tr>
    {:else}
      <tr><td colspan="5" class="muted">Veri yok.</td></tr>
    {/each}
  </tbody>
</table>

<h2>Günlük eşleşme</h2>
<table>
  <thead><tr><th>Gün</th><th>Toplam</th>{#each data.hosts as h}<th>{h.name}</th>{/each}</tr></thead>
  <tbody>
    {#each data.days as d (d.day)}
      <tr><td>{d.day}</td><td><strong>{d.total}</strong></td>{#each data.hosts as h}<td>{d.hosts[h.id] ?? 0}</td>{/each}</tr>
    {:else}
      <tr><td colspan={2 + data.hosts.length} class="muted">Bu aralıkta eşleşme bildirimi yok.</td></tr>
    {/each}
  </tbody>
</table>

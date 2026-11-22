<script>
  let { data } = $props();
  const f = $derived(data.filters);
</script>

<h1>Sohbetler</h1>
<form method="GET" class="card filters">
  <div class="row">
    <div><label for="q">Ara (ad / id)</label><input id="q" name="q" value={f.search} /></div>
    <div><label for="host">Host</label>
      <select id="host" name="host" value={f.host}><option value="">Tümü</option>{#each data.hosts as h (h.id)}<option value={h.id}>{h.name || h.sugo_id}</option>{/each}</select></div>
    <div><label for="last">Son söz</label>
      <select id="last" name="last" value={f.last}><option value="">Fark etmez</option><option value="peer">Karşı tarafta (cevap bekliyor)</option><option value="us">Bizde (cevap bekliyoruz)</option></select></div>
    <div><label for="sort">Sırala</label>
      <select id="sort" name="sort" value={f.sort}><option value="activity">Son aktivite</option><option value="replies">En çok cevap</option><option value="diamonds">En çok elmas</option></select></div>
  </div>
  <div class="checks">
    <input type="hidden" name="replied" value="0" />
    <label class="inline"><input type="checkbox" name="replied" value="1" checked={f.replied} /> Yalnız cevap aldıklarım</label>
    <label class="inline">en az <input class="small" type="number" min="1" name="min" value={f.minReplies} /> cevap</label>
    <label class="inline"><input type="checkbox" name="diamonds" value="1" checked={f.diamonds} /> Elmas getirenler</label>
    <label class="inline"><input type="checkbox" name="unread" value="1" checked={f.unread} /> Okunmamış var</label>
    <button>Filtrele</button> <a href="/pairs">Sıfırla</a>
  </div>
  <p class="muted">"Cevap" = bizim ilk mesajımızdan sonra karşı tarafın yazdığı gerçek mesaj (takip bildirimleri sayılmaz). En son aktif {data.scanned} sohbet taranır; {data.total} eşleşti{data.total > data.rows.length ? `, ilk ${data.rows.length} gösteriliyor` : ''}.</p>
</form>

<table>
  <thead><tr><th>Sohbet</th><th>Host</th><th>Karşı taraf</th><th>Cevap</th><th>Mesaj (gelen/giden)</th><th>💎</th><th>Okunmamış</th><th>Son söz</th><th>Son aktivite</th><th></th></tr></thead>
  <tbody>
    {#each data.rows as p (p.id)}
      <tr>
        <td><a href="/pairs/{p.id}">{p.id}</a></td><td>{p.hosts?.name}</td>
        <td>{p.permanent?.name?.value ?? p.peer_name ?? ''}</td>
        <td>{p.stat.replies}</td><td>{p.stat.in}/{p.stat.out}</td><td>{p.stat.diamonds}</td>
        <td>{p.stat.unread}</td><td>{p.stat.last === 'in' ? 'Karşı taraf' : p.stat.last === 'out' ? 'Biz' : '—'}</td>
        <td>{new Date(p.last_activity_at).toLocaleString('tr-TR')}</td>
        <td><a href="/playground?pair={encodeURIComponent(p.id)}">Playground'da dene ↗</a></td>
      </tr>
    {:else}
      <tr><td colspan="10" class="muted">Bu filtrelerle sohbet yok.</td></tr>
    {/each}
  </tbody>
</table>

<style>
  .checks{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:12px}
  .inline{display:flex;align-items:center;gap:6px;margin:0}
  .small{width:64px;padding:6px 8px}
</style>

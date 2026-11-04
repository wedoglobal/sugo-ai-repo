<script>
  let { data } = $props();
  const fmt = (n) => n.toLocaleString('tr-TR');
</script>

<h1>Elmas kazancı</h1>
<div class="row">
  {#each [['Bugün', data.total.today], ['Bu hafta', data.total.week], ['Bu ay', data.total.month]] as [label, n] (label)}
    <div class="card"><div class="muted">{label}</div><strong style="font-size: 28px">💎 {fmt(n)}</strong></div>
  {/each}
</div>

<table>
  <thead><tr><th>Host</th><th>Bugün</th><th>Hafta</th><th>Ay</th></tr></thead>
  <tbody>
    {#each data.rows as r (r.id)}
      <tr><td><a href="/hosts/{r.id}">{r.name || r.sugo_id}</a></td><td>{fmt(r.today)}</td><td>{fmt(r.week)}</td><td>{fmt(r.month)}</td></tr>
    {:else}
      <tr><td colspan="4" class="muted">Henüz host yok.</td></tr>
    {/each}
  </tbody>
</table>
<p class="muted">Hafta pazartesiden, gün/ay İstanbul saatine göre. Kazanç, extension'ın sohbetlerde gördüğü mesaj rozetlerinden (xN) toplanır.</p>

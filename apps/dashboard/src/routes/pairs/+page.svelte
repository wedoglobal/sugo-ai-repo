<script>
  let { data } = $props();
</script>

<h1>Pair'ler</h1>
<table>
  <thead><tr><th>Pair</th><th>Host</th><th>Karşı taraf</th><th>Okunmamış</th><th>Son aktivite</th></tr></thead>
  <tbody>
    {#each data.pairs as p (p.id)}
      <tr>
        <td><a href="/pairs/{p.id}">{p.id}</a></td><td>{p.hosts?.name}</td>
        <td>{p.permanent?.name?.value ?? p.peer_name ?? ''}</td>
        <td>{data.counts[p.id] ?? 0}</td><td>{new Date(p.last_activity_at).toLocaleString('tr-TR')}</td>
      </tr>
    {:else}
      <tr><td colspan="5" class="muted">Pair yok.</td></tr>
    {/each}
  </tbody>
</table>

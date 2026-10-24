<script>
  let { data, form } = $props();
</script>

<h1>Hostlar</h1>
<table>
  <thead><tr><th>Ad</th><th>Sugo id</th><th>Durum</th><th></th></tr></thead>
  <tbody>
    {#each data.hosts as h (h.id)}
      <tr><td>{h.name || '—'}</td><td>{h.sugo_id}</td><td>{h.active ? 'aktif' : 'pasif'}</td><td><a href="/hosts/{h.id}">düzenle</a></td></tr>
    {:else}
      <tr><td colspan="4" class="muted">Henüz host yok.</td></tr>
    {/each}
  </tbody>
</table>

<form method="POST" action="?/create" class="card">
  <strong>Yeni host</strong>
  <div class="row">
    <div><label for="sid">Sugo profil id (/profile/&lt;id&gt;)</label><input id="sid" name="sugo_id" required /></div>
    <div><label for="nm">Ad</label><input id="nm" name="name" /></div>
  </div>
  {#if form?.error}<p class="err">{form.error}</p>{/if}
  <p><button>Oluştur</button></p>
</form>

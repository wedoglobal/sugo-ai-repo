<script>
  let { data, form } = $props();
  const labels = { name: 'İsim', age: 'Yaş', residence: 'Yaşadığı yer', hometown: 'Memleket', job: 'Meslek' };
</script>

<h1>{data.pair.id} <span class="muted">({data.pair.hosts?.name} ↔ {data.pair.peer_name})</span></h1>

<form method="POST" action="?/savePermanent" class="card">
  <strong>Kalıcı hafıza</strong>
  <div class="row">
    {#each data.fields as k (k)}
      <div><label for={k}>{labels[k]}</label><input id={k} name={k} value={data.pair.permanent[k]?.value ?? ''} /></div>
    {/each}
  </div>
  {#if form?.saved}<p class="ok">Kaydedildi</p>{/if}{#if form?.error}<p class="err">{form.error}</p>{/if}
  <p><button>Kaydet</button></p>
  <p class="muted">Host'un bu kişiye söyledikleri: {JSON.stringify(data.pair.disclosed)}</p>
</form>

<div class="card">
  <strong>Geçici bağlam (48 saat)</strong>
  {#each data.temp as t (t.id)}
    <form method="POST" action="?/deleteTemp" style="display:flex;gap:8px;align-items:center">
      <input type="hidden" name="id" value={t.id} />
      <span style="flex:1">{t.text} <span class="muted">— {new Date(t.expires_at).toLocaleString('tr-TR')}'e kadar</span></span>
      <button class="ghost">sil</button>
    </form>
  {:else}<p class="muted">Yok</p>{/each}
</div>

<div class="card">
  <strong>Mesajlar</strong>
  {#each data.messages as m (m.id)}
    <div class="bubble" class:out={m.direction === 'out'} class:unread={m.direction === 'in' && !m.handled}>{m.text}</div>
  {/each}
</div>

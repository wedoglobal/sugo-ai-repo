<script>
  import HostEditor from '$lib/HostEditor.svelte';

  let { data, form } = $props();
  const h = $derived(data.host);
</script>

<h1>{h.name || 'Host'} <span class="muted">/profile/{h.sugo_id}</span></h1>
<form method="POST" action="?/import" enctype="multipart/form-data" class="card"
  onsubmit={(e) => { if (!confirm('Mevcut persona, bilgiler ve bilgi bankası dosyadakiyle değiştirilsin mi?')) e.preventDefault(); }}>
  <label for="file">Persona JSON içe aktar (persona, bilgiler, örnekler ve bilgi bankasını doldurur)</label>
  <input id="file" type="file" name="file" accept=".json,application/json" />
  {#if form?.importError}<p class="err">{form.importError}</p>{/if}
  {#if form?.imported}
    <p class="ok">İçe aktarıldı: {form.imported.facts} bilgi, {form.imported.knowledge} bilgi bankası girdisi, {form.imported.examples} örnek.
      Ses ve model ayarları korundu.
      {#if form.imported.skipped.length}Atlananlar: {form.imported.skipped.join('; ')}.{/if}
      {#if form.imported.warnings.length}{form.imported.warnings.join(' ')}{/if}</p>
  {/if}
  <p><button>İçe aktar</button></p>
</form>
{#key h.updated_at}
  <HostEditor {data} {form} />
{/key}
<div class="card">
  <strong>Medya kataloğu (fotoğraf ve ses)</strong>
  <p class="muted">Biri fotoğraf ya da ses isteyince buradan, o kişiye daha önce gönderilmemiş rastgele bir dosya gider. Hepsi gittiyse gönderilmez. Ses dosyası mp3, m4a, wav veya ogg olabilir; gönderirken süresi kadar kayıt yapılır.</p>
  <form method="POST" action="?/upload" enctype="multipart/form-data">
    <input type="file" name="files" accept="image/*,audio/*" multiple />
    {#if form?.mediaError}<p class="err">{form.mediaError}</p>{/if}
    {#if form?.mediaAdded}<p class="ok">{form.mediaAdded} dosya yüklendi</p>{/if}
    <p><button>Yükle</button></p>
  </form>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">
    {#each data.media as m (m.id)}
      <form method="POST" action="?/deleteMedia" style="text-align:center">
        <input type="hidden" name="id" value={m.id} />
        {#if m.content_type.startsWith('audio/')}
          <audio controls src="/media/{m.id}" style="width:100%"></audio>
          <div class="muted">{m.name}</div>
        {:else}
          <img src="/media/{m.id}" alt={m.name} style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px" />
        {/if}
        <div class="muted">{m.sent} kişiye gitti</div>
        <button class="ghost" onclick={(e) => { if (!confirm('Dosya silinsin mi?')) e.preventDefault(); }}>Sil</button>
      </form>
    {/each}
  </div>
</div>
<form method="POST" action="?/remove" onsubmit={(e) => { if (!confirm('Host ve tüm pair\'leri silinsin mi?')) e.preventDefault(); }}>
  <button class="ghost">Hostu sil</button>
</form>

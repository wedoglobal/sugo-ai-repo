<script>
  let { data, form } = $props();
  const h = $derived(data.host);
  const p = $derived(data.persona);
</script>

<h1>{h.name || 'Host'} <span class="muted">/profile/{h.sugo_id}</span></h1>
<form method="POST" action="?/save" class="card">
  <div class="row">
    <div><label for="name">Ad</label><input id="name" name="name" value={h.name} /></div>
    <div><label for="model">Model (boşsa varsayılan)</label><input id="model" name="model" value={h.model ?? ''} /></div>
  </div>
  <label><input type="checkbox" name="active" checked={h.active} /> Aktif</label>
  <div class="row">
    <div><label for="formality">Dil</label>
      <select id="formality" name="formality" value={p.formality}>
        <option value="formal">resmi</option><option value="casual">samimi</option><option value="very_casual">çok rahat</option>
      </select></div>
    <div><label for="length">Uzunluk</label>
      <select id="length" name="length" value={p.length}>
        <option value="tiny">çok kısa</option><option value="short">kısa</option><option value="normal">normal</option>
      </select></div>
  </div>
  <div class="row">
    <div><label for="emoji">Emoji</label>
      <select id="emoji" name="emoji" value={p.emoji}>
        <option value="none">yok</option><option value="rare">nadir</option><option value="often">sık</option>
      </select></div>
    <div><label><input type="checkbox" name="typos" checked={p.typos} /> Ara sıra yazım hatası</label></div>
  </div>
  <label for="facts">Bilgiler (satır başına <code>Etiket | değer</code>; başına <code>!</code> koyarsan paylaşılmaz). Etiketler: Ad, Yaş, Şehir, Memleket, Meslek</label>
  <textarea id="facts" name="facts">{data.factsText}</textarea>
  <label for="instructions">Karakter talimatı</label>
  <textarea id="instructions" name="instructions">{p.instructions}</textarea>
  <label for="examples">Örnek mesajlar (satır başına bir tane)</label>
  <textarea id="examples" name="examples">{p.examples.join('\n')}</textarea>
  <label for="knowledge">Bilgi bankası (satır başına <code>Başlık | içerik</code>)</label>
  <textarea id="knowledge" name="knowledge">{data.knowledgeText}</textarea>
  {#if form?.error}<p class="err">{form.error}</p>{/if}
  {#if form?.saved}<p class="ok">Kaydedildi</p>{/if}
  <p><button>Kaydet</button></p>
</form>
<form method="POST" action="?/remove" onsubmit={(e) => { if (!confirm('Host ve tüm pair\'leri silinsin mi?')) e.preventDefault(); }}>
  <button class="ghost">Hostu sil</button>
</form>

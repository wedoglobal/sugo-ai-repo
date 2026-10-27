<script>
  let { data, form } = $props();
  let text = $state(data.thanksText);
</script>

<h1>Hediye teşekkürleri</h1>
<p class="muted">Tüm hostlarda ortaktır. Biri hediye gönderince bu metinlerden biri rastgele seçilir; sohbette sesli mesaj açıksa (yakınlık seviyesi yeterliyse) hostun kendi sesiyle okunur ve yalnız ses gider. Sesli mesaj kapalıysa metin olarak gider, katalogda gönderilmemiş fotoğraf varsa arkasından fotoğraf da gider. Liste boşsa persona kendisi teşekkür yazar. Satır başına bir mesaj, <code>#</code> ile başlayan satır yorumdur. Sesli okunacağı için emoji ve yazıyla gülme kullanma.</p>
<form method="POST" action="?/save" class="card">
  <label for="thanks">Teşekkürler</label>
  <textarea id="thanks" name="thanks" bind:value={text} placeholder="çok teşekkür ederim, çok tatlısın"></textarea>
  {#if form?.saved !== undefined}<p class="ok">{form.saved} mesaj kaydedildi</p>{/if}
  <p><button>Kaydet</button></p>
</form>

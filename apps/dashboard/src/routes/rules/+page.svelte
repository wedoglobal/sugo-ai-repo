<script>
  let { data, form } = $props();
  let text = $state(data.rulesText);
</script>

<h1>Genel persona kuralları</h1>
<p class="muted">Tüm hostların her cevabında geçerlidir; hostun kendi karakter talimatından bağımsızdır. Satır başına bir kural, <code>#</code> ile başlayan satır yorumdur. Kurallar modele bağlam olarak verilir, "birkaç mesaj sonra" gibi zamanlamalar önceki konuşmaya bakılarak uygulanır.</p>
<form method="POST" action="?/save" class="card">
  <label for="rules">Kurallar</label>
  <textarea id="rules" name="rules" bind:value={text} placeholder="Biri güzel/yakışıklı derse önce teşekkür et; birkaç mesaj sonra sen de onu öv (çok iyisin, maşallah sana, çok yakışıklısın gibi)."></textarea>
  {#if form?.saved !== undefined}<p class="ok">{form.saved} kural kaydedildi</p>{/if}
  <p><button>Kaydet</button></p>
</form>

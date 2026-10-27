<script>
  let { data, form } = $props();
  let rules = $state(data.rulesText);
</script>

<h1>Cevap filtresi</h1>
<p class="muted">Model cevabı yazdıktan sonra, gönderilmeden önce deterministik olarak uygulanır. Satır başına <code>kalıp =&gt; yerine</code> (veya <code>-&gt;</code>); yerine boşsa kalıp silinir. Büyük/küçük harf fark etmez, yalnız tam sözcükler eşleşir, kurallar yukarıdan aşağı uygulanır. <code>#</code> ile başlayan satır yorumdur.</p>
<form method="POST" action="?/save" class="card">
  <label for="rules">Kurallar</label>
  <textarea id="rules" name="rules" bind:value={rules} placeholder="sen naber => naber"></textarea>
  {#if form?.saved !== undefined}<p class="ok">{form.saved} kural kaydedildi</p>{/if}
  <p>
    <button>Kaydet</button>
    <button class="ghost" formaction="?/test" type="submit">Örnekle dene</button>
  </p>
  <label for="sample">Örnek cevap</label>
  <input id="sample" name="sample" value={form?.sample ?? ''} placeholder="Sen naber, ne yapıyosun" />
  {#if form?.tried !== undefined}<p>→ <strong>{form.tried}</strong></p>{/if}
</form>

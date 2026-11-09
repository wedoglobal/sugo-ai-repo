<script>
  let { data, form } = $props();
  let text = $state(data.phrasesText);
</script>

<h1>Üstü kapalı fotoğraf istekleri</h1>
<p class="muted">Tüm hostlarda ortaktır. "foto at" gibi açık istekler zaten algılanır; burası "seni görmek istiyorum" gibi fotoğraftan söz etmeyen istekler içindir. Gelen mesajda bu ifadelerden biri geçerse (sözcükler ardışık olmalı) fotoğraf istenmiş sayılır ve katalogdan gönderilmemiş bir fotoğraf ile cevap verilir. Büyük/küçük harf, Türkçe karakter ve harf uzatması (görrrsene) önemsizdir. Satır başına bir ifade, <code>#</code> ile başlayan satır yorumdur.</p>
<form method="POST" action="?/save" class="card">
  <label for="phrases">İfadeler</label>
  <textarea id="phrases" name="phrases" bind:value={text} placeholder="seni görmek istiyorum&#10;nasıl gözüküyorsun"></textarea>
  {#if form?.saved !== undefined}<p class="ok">{form.saved} ifade kaydedildi</p>{/if}
  <p><button>Kaydet</button></p>
</form>

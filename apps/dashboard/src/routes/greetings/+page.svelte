<script>
  let { data, form } = $props();
  let text = $state(data.greetingsText);
</script>

<h1>Karşılama mesajları</h1>
<p class="muted">Tüm hostlarda ortaktır. Yeni eşleşmeye ilk mesaj olarak bu metinlerden biri rastgele gider; liste boşsa persona kendisi yazar. Satır başına bir mesaj, <code>#</code> ile başlayan satır yorumdur. Bir host'un son gönderdiği metin tekrar seçilmez.</p>
<form method="POST" action="?/save" class="card">
  <label for="greetings">Mesajlar</label>
  <textarea id="greetings" name="greetings" bind:value={text} placeholder="selam, nasılsın?"></textarea>
  {#if form?.saved !== undefined}<p class="ok">{form.saved} mesaj kaydedildi</p>{/if}
  <p><button>Kaydet</button></p>
</form>

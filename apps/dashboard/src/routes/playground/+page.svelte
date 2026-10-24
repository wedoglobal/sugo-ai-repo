<script>
  let { data, form } = $props();
</script>

<h1>Playground</h1>
<p class="muted">Sugo'ya hiçbir şey gönderilmez. Aynı pipeline çalışır; kişi (<code>pg&lt;kod&gt;</code>) için hafıza birikir. Boş mesaj = karşılama mesajı.</p>
<form method="POST" action="?/send" class="card">
  <div class="row">
    <div><label for="host">Host</label>
      <select id="host" name="host" value={form?.host ?? data.hosts[0]?.sugo_id}>
        {#each data.hosts as h (h.sugo_id)}<option value={h.sugo_id}>{h.name || h.sugo_id}</option>{/each}
      </select></div>
    <div><label for="peer">Kişi kodu</label><input id="peer" name="peer" value={form?.peer ?? 'test1'} /></div>
  </div>
  <label for="text">Gelen mesaj</label>
  <textarea id="text" name="text">{form?.text ?? ''}</textarea>
  <p><button>Gönder</button></p>
</form>

{#if form?.error}<p class="err">{form.error}</p>{/if}
{#if form?.result}
  <div class="card">
    <strong>Cevap</strong>
    <div class="bubble out">{form.result.reply}</div>
    <p class="muted">Pair: <a href="/pairs/{form.result.pairId}">{form.result.pairId}</a></p>
    <strong>Kalıcı hafıza</strong>
    <pre>{JSON.stringify(form.result.memoryAfter.permanent, null, 2)}</pre>
    <strong>Geçici bağlam</strong>
    <pre>{JSON.stringify(form.result.temp, null, 2)}</pre>
    <strong>Host'un söyledikleri</strong>
    <pre>{JSON.stringify(form.result.memoryAfter.disclosed, null, 2)}</pre>
  </div>
{/if}

<script>
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  const chat = $derived(form?.chat ?? data.chat);
  const host = $derived(form?.host ?? data.host);
  const peer = $derived(form?.peer ?? data.peer);
  const hostId = $derived(data.hosts.find((h) => h.sugo_id === host)?.id);
  let text = $state('');
  let drafts = $state([]);
  const draftsJson = $derived(JSON.stringify(drafts));
  const sourcePair = $derived(/^i\d+$/.test(peer) ? `${host}-${peer.slice(1)}` : '');
  const keywordsOf = (when) => [...new Set(when.toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !['karşı', 'taraf', 'kişi', 'bana', 'sana', 'şeyi', 'gibi'].includes(w)))].join(', ');
  let context = $state(data.presetContext);
</script>

<h1>Playground</h1>
<p class="muted">Platforma mesaj gönderilmez. Aynı pipeline çalışır; kişi (<code>pg&lt;kod&gt;</code>) için hafıza birikir ve konuşma sürer. Boş mesaj = karşılama mesajı (yalnız boş sohbette). Geçici bağlam eklersen o kişiye 48 saatlik not olarak yazılır; bağlam kurallarını böyle denersin.</p>

<form method="POST" action="?/import" class="card" use:enhance>
  <label for="pair">Gerçek bir sohbeti devam ettir</label>
  <div class="row">
    <select id="pair" name="pair">
      <option value="">— sohbet seç —</option>
      {#each data.pairs as p (p.id)}<option value={p.id}>{p.hosts?.name || p.hosts?.sugo_id} ↔ {p.peer_name || p.peer_sugo_id} ({p.peer_sugo_id})</option>{/each}
    </select>
    <div><button>Playground'a aktar</button></div>
  </div>
  <p class="muted">Gerçek sohbetin mesajları, hafızası ve geçerli bağlamı bir test kişisine kopyalanır; gerçek sohbet ve platform etkilenmez. Aynı sohbeti tekrar aktarırsan kopya baştan kurulur.</p>
  {#if form?.importError}<p class="err">{form.importError}</p>{/if}
</form>

{#if chat.messages.length}
  <div class="card">
    {#each chat.messages as m, i (i)}<div class="bubble" class:out={m.direction === 'out'}>{m.text}</div>{/each}
  </div>
{/if}

<form method="POST" action="?/send" class="card" use:enhance={() => async ({ update }) => { await update({ reset: false }); text = ''; }}>
  <div class="row">
    <div><label for="host">Host</label>
      <select id="host" name="host" value={host}>
        {#each data.hosts as h (h.sugo_id)}<option value={h.sugo_id}>{h.name || h.sugo_id}</option>{/each}
      </select></div>
    <div><label for="peer">Kişi kodu</label><input id="peer" name="peer" value={peer} /></div>
  </div>
  <input type="hidden" name="drafts" value={draftsJson} />
  <label for="context">Geçici bağlam (satır başına bir not, isteğe bağlı)</label>
  <textarea id="context" name="context" bind:value={context} placeholder="Karşı taraf nedenini soruyor."></textarea>
  {#if data.contexts.length}
    <p class="muted">Kurallarından ekle: {#each data.contexts as c (c)}<button type="button" class="link" onclick={() => (context = context ? `${context}\n${c}` : c)}>{c}</button>{' · '}{/each}</p>
  {/if}
  {#if chat.temp.length}<p class="muted">Şu an geçerli bağlam: {chat.temp.join(' | ')}</p>{/if}
  <label for="text">Gelen mesaj</label>
  <textarea id="text" name="text" bind:value={text}></textarea>
  <p><button>Gönder</button></p>
</form>
<div class="actions">
  <form method="POST" action="?/retry" use:enhance><input type="hidden" name="drafts" value={draftsJson} /><input type="hidden" name="host" value={host} /><input type="hidden" name="peer" value={peer} /><button class="ghost" disabled={!chat.messages.length}>Son cevabı yeniden üret</button></form>
  <form method="POST" action="?/reset" use:enhance><input type="hidden" name="host" value={host} /><input type="hidden" name="peer" value={peer} /><button class="ghost">Sohbeti sıfırla</button></form>
  {#if sourcePair}<form method="POST" action="?/import" use:enhance><input type="hidden" name="pair" value={sourcePair} /><button class="ghost">Sohbeti baştan başlat</button></form>{/if}
  {#if hostId}<a href="/hosts/{hostId}" target="_blank" rel="noopener">Personayı düzenle ↗</a>{/if}
</div>
<style>.big{min-height:140px}.inline{display:flex;align-items:center;gap:6px;margin:0}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}</style>

<div class="card">
  <strong>Deneme bağlam kuralları</strong>
  <p class="muted">Burada yazdığın kurallar yalnız bu sayfadaki gönderimlerde kayıtlı kurallara eklenir; kaydetmezsen kaybolur. Beğenirsen "Kaydet" ile gerçek kurallara eklenir. Sohbeti baştan başlatıp aynı mesajı yeniden deneyerek etkiyi karşılaştırabilirsin.</p>
  <p><button type="button" class="ghost" onclick={() => drafts.push({ when: context.split('\n').filter(Boolean).at(-1) ?? '', keywords: '', rule: '', active: true })}>+ Deneme kuralı</button></p>
  {#each drafts as d, i (i)}
    <div class="card">
      <div class="row">
        <div><label for="dw{i}">Bağlam</label><input id="dw{i}" bind:value={d.when} onblur={() => { if (!d.keywords) d.keywords = keywordsOf(d.when); }} placeholder="Karşı taraf nedenini soruyor" /></div>
        <div><label for="dk{i}">Anahtar kelimeler</label><input id="dk{i}" bind:value={d.keywords} placeholder="neden, niye" /></div>
      </div>
      <label for="dr{i}">Ne yapılacak</label>
      <textarea id="dr{i}" class="big" bind:value={d.rule}></textarea>
      <p class="actions">
        <label class="inline"><input type="checkbox" bind:checked={d.active} /> Aktif</label>
        <button type="button" class="link" onclick={() => drafts.splice(i, 1)}>Sil</button>
      </p>
      <form method="POST" action="?/saveRule" use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
        <input type="hidden" name="draft" value={JSON.stringify([d])} />
        <button class="ghost" disabled={!d.when.trim() || !d.rule.trim()}>Gerçek kurallara kaydet</button>
      </form>
    </div>
  {/each}
  {#if form?.ruleSaved}<p class="ok">"{form.ruleSaved}" kuralı kaydedildi (Genel persona kuralları sayfasında görünür).</p>{/if}
  {#if form?.ruleError}<p class="err">{form.ruleError}</p>{/if}
</div>
{#if form?.error}<p class="err">{form.error}</p>{/if}
{#if form?.result}
  <div class="card">
    <p class="muted">Devreye giren bağlam kuralları: {#if form.result.matched?.length}{form.result.matched.map((m) => m.when + (m.draft ? ' (deneme)' : '')).join(' · ')}{:else}yok{/if}</p>
    <p class="muted">Pair: <a href="/pairs/{form.result.pairId}">{form.result.pairId}</a></p>
    <strong>Kalıcı hafıza</strong>
    <pre>{JSON.stringify(form.result.memoryAfter.permanent, null, 2)}</pre>
    <strong>Geçici bağlam</strong>
    <pre>{JSON.stringify(form.result.temp, null, 2)}</pre>
    <strong>Host'un söyledikleri</strong>
    <pre>{JSON.stringify(form.result.memoryAfter.disclosed, null, 2)}</pre>
  </div>
{/if}

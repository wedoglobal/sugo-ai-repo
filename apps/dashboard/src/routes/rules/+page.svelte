<script>
  import { enhance } from '$app/forms';
  let { data, form } = $props();
  let text = $state(data.rulesText);
  let items = $state(data.contextRules.map((r) => ({ ...r })));
  const json = $derived(JSON.stringify(items));
  const keywordsOf = (when) => [...new Set(when.toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !['karşı', 'taraf', 'kişi', 'bana', 'sana', 'şeyi', 'gibi'].includes(w)))].join(', ');
  const add = (when = '', keywords = '') => { items.unshift({ when, keywords: keywords || keywordsOf(when), rule: '', active: true }); };
</script>

<h1>Genel persona kuralları</h1>
<p class="muted">Tüm hostların her cevabında geçerlidir; hostun kendi karakter talimatından bağımsızdır. Satır başına bir kural, <code>#</code> ile başlayan satır yorumdur. Kurallar modele bağlam olarak verilir, "birkaç mesaj sonra" gibi zamanlamalar önceki konuşmaya bakılarak uygulanır.</p>
<form method="POST" action="?/save" class="card">
  <label for="rules">Kurallar</label>
  <textarea id="rules" name="rules" bind:value={text} placeholder="Biri güzel/yakışıklı derse önce teşekkür et; birkaç mesaj sonra sen de onu öv (çok iyisin, maşallah sana, çok yakışıklısın gibi)."></textarea>
  {#if form?.saved !== undefined}<p class="ok">{form.saved} kural kaydedildi</p>{/if}
  <p><button>Kaydet</button></p>
</form>

<h2>Bağlama göre kurallar</h2>
<p class="muted">Yalnız o kişinin geçici bağlamında (veya yeni mesajında) anahtar kelimeler geçiyorsa o cevaba eklenir; böylece kurallar uzun ve ayrıntılı olabilir, her cevabı şişirmez. Anahtar kelimeler virgülle ayrılır, ilk beş harfiyle karşılaştırılır (ekler önemli değil). Birden çok sözcüklü anahtarda hepsi gerekir. Boş bırakırsan bağlam cümlesinin genel olmayan sözcüklerinin hepsi aranır.</p>

{#if data.suggestions.length}
  <div class="card">
    <strong>Son geçici bağlamlar</strong>
    <p class="muted">Tıklayınca o bağlam için yeni kural açılır.</p>
    <div class="chips">
      {#each data.suggestions as s (s.text)}
        <button type="button" class="ghost chip" onclick={() => add(s.text, s.keywords)}>{s.text} <span class="muted">×{s.count}</span></button>
      {/each}
    </div>
  </div>
{/if}

<form method="POST" action="?/saveContext" use:enhance>
  <input type="hidden" name="contextRules" value={json} />
  <p><button type="button" class="ghost" onclick={() => add()}>+ Yeni bağlam kuralı</button></p>
  {#each items as item, i (i)}
    <div class="card rule" class:off={!item.active}>
      <div class="rule-head">
        <label class="inline"><input type="checkbox" bind:checked={item.active} /> Aktif</label>
        <span>{#if item.when}<a href="/playground?context={encodeURIComponent(item.when)}">Playground'da dene ↗</a> · {/if}<button type="button" class="link" onclick={() => items.splice(i, 1)}>Sil</button></span>
      </div>
      <div class="row">
        <div><label for="w{i}">Bağlam (kendine not / anahtar kelime kaynağı)</label><input id="w{i}" bind:value={item.when} placeholder="Karşı taraf nedenini soruyor" /></div>
        <div><label for="k{i}">Anahtar kelimeler</label><input id="k{i}" bind:value={item.keywords} placeholder="neden, niye" /></div>
      </div>
      <label for="r{i}">Ne yapılacak</label>
      <textarea id="r{i}" class="big" bind:value={item.rule} placeholder="Ayrıntılı yönergeyi buraya yaz."></textarea>
    </div>
  {:else}
    <p class="muted">Henüz bağlam kuralı yok.</p>
  {/each}
  {#if form?.contextError}<p class="err">{form.contextError}</p>{/if}
  {#if form?.savedContext !== undefined}<p class="ok">{form.savedContext} bağlam kuralı kaydedildi</p>{/if}
  <p><button>Bağlam kurallarını kaydet</button></p>
</form>

<style>
  .chips{display:flex;flex-wrap:wrap;gap:8px}
  .chip{font-weight:500;font-size:12px;padding:7px 11px}
  .rule.off{opacity:.55}
  .rule-head{display:flex;justify-content:space-between;align-items:center}
  .inline{display:flex;align-items:center;gap:6px;margin:0}
  .big{min-height:160px}
</style>

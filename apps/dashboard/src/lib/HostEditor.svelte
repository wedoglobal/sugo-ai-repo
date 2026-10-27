<script>
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  const h = data.host;
  const p = data.persona;
  const REMEMBERED = ['ad', 'isim', 'yaş', 'yas', 'şehir', 'sehir', 'memleket', 'meslek', 'iş', 'is'];
  const VOICE_PRESETS = [['Telefonda arkadaş', 'telefonda arkadaşına konuşur gibi, rahat ve yavaş'], ['Canlı mahalle arkadaşı', 'canlı, düzensiz ritimli, mahalle arkadaşı gibi']];

  let facts = $state(p.facts.map((f) => ({ ...f })));
  let knowledge = $state(data.knowledge.map((k) => ({ ...k })));
  let levels = $state(Object.fromEntries(data.level.fields.map(([key]) => [key, p[key]])));
  let instructions = $state(p.instructions);
  let examples = $state(p.examples.join('\n'));
  let voice = $state(p.voice);
  let voiceStyle = $state(p.voiceStyle);
  let testText = $state('selam, nasılsın? bugün ne yaptın?');
  let testState = $state('');
  let testAudio;
  let dirty = $state(false);
  let saving = $state(false);

  const isRoutine = (k) => k.title.startsWith('Rutin: ');
  const exampleCount = $derived(examples.split('\n').filter((l) => l.trim()).length);
  const remembered = (label) => REMEMBERED.includes(label.trim().toLocaleLowerCase('tr'));
  const touch = () => (dirty = true);

  async function playSample() {
    testState = 'Ses üretiliyor…';
    try {
      const res = await fetch(`/hosts/${h.id}/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice, voiceStyle, text: testText }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`);
      testAudio?.pause();
      if (testAudio) URL.revokeObjectURL(testAudio.src);
      testAudio = new Audio(URL.createObjectURL(await res.blob()));
      testAudio.onended = () => (testState = '');
      await testAudio.play();
      testState = 'Çalıyor…';
    } catch (e) {
      testState = `Hata: ${e.message}`;
    }
  }

  function addFact() { facts.push({ label: '', value: '', shareable: true }); touch(); }
  function removeFact(i) { facts.splice(i, 1); touch(); }
  function addKnowledge() { knowledge.push({ title: '', content: '', active: true }); touch(); }
  function removeKnowledge(k) { knowledge.splice(knowledge.indexOf(k), 1); touch(); }
  function submit() {
    saving = true;
    return async ({ update }) => {
      await update({ reset: false });
      saving = false;
    };
  }
</script>

<svelte:window onbeforeunload={(e) => { if (dirty) e.preventDefault(); }} />

<form method="POST" action="?/save" use:enhance={submit} oninput={touch} onchange={touch}>
  <input type="hidden" name="facts" value={JSON.stringify(facts)} />
  <input type="hidden" name="knowledge" value={JSON.stringify(knowledge)} />

  <fieldset class="card">
    <legend>Genel</legend>
    <div class="row">
      <div><label for="name">Ad</label><input id="name" name="name" value={h.name} maxlength="100" /></div>
      <div><label for="model">Konuşma modeli</label><input id="model" name="model" value={h.model ?? ''} maxlength="200" placeholder={`Varsayılan: ${data.defaultModel}`} autocomplete="off" spellcheck="false" />
        <span class="muted">OpenRouter provider/model kimliği. Boşsa varsayılan kullanılır.</span></div>
    </div>
    <div class="row">
      <div><label for="timeZone">Saat dilimi</label><input id="timeZone" name="timeZone" value={p.timeZone} placeholder="Europe/Istanbul" maxlength="100" autocomplete="off" spellcheck="false" />
        <span class="muted">Haftalık rutin ve "şu an" bu saat dilimine göre okunur.</span></div>
      <div><label><input type="checkbox" name="active" checked={h.active} /> Aktif</label></div>
    </div>
  </fieldset>

  <fieldset class="card">
    <legend>Kişisel bilgiler <span class="muted">{facts.length}/{data.limits.facts}</span></legend>
    <p class="muted">Etiketi Ad, Yaş, Şehir, Memleket veya Meslek olan bilgiler "söylendi mi" takibine bağlanır; aynı bilgi kişiye tekrar söylenmez. Paylaşılabilir olmayanlar modele gönderilmez.</p>
    <datalist id="fact-labels"><option value="Ad"></option><option value="Yaş"></option><option value="Şehir"></option><option value="Memleket"></option><option value="Meslek"></option></datalist>
    {#each facts as fact, i (fact)}
      <div class="item">
        <div class="item-head">
          <input list="fact-labels" aria-label="Bilgi türü" placeholder="Meslek, geçmiş, ilgi…" bind:value={fact.label} maxlength="60" />
          {#if remembered(fact.label)}<span class="badge">takip edilir</span>{/if}
          <label class="inline"><input type="checkbox" bind:checked={fact.shareable} /> Paylaşılabilir</label>
          <button type="button" class="ghost" onclick={() => removeFact(i)}>Kaldır</button>
        </div>
        <textarea aria-label="Bilgi" rows="2" maxlength="300" bind:value={fact.value}></textarea>
        <span class="muted counter">{fact.value.length}/300</span>
      </div>
    {/each}
    <p><button type="button" class="ghost" onclick={addFact} disabled={facts.length >= data.limits.facts}>Bilgi ekle</button></p>
  </fieldset>

  <fieldset class="card">
    <legend>Konuşma biçimi</legend>
    <div class="grid">
      {#each data.level.fields as [key, label]}
        <div>
          <label for={key}>{label}</label>
          <select id={key} name={key} bind:value={levels[key]}>
            {#each data.level.labels as name, n}<option value={n}>{name}</option>{/each}
          </select>
          <span class="muted">{data.level.rules[key][levels[key]]}</span>
        </div>
      {/each}
      <div><label for="length">Uzunluk</label>
        <select id="length" name="length" value={p.length}><option value="tiny">Çok kısa</option><option value="short">Kısa</option><option value="normal">Normal</option></select></div>
      <div><label for="capitals">Büyük harf</label>
        <select id="capitals" name="capitals" value={p.capitals}><option value="normal">Normal</option><option value="lowercase">Hep küçük harf</option></select></div>
    </div>
    <div class="row">
      <div><label for="address">Hitap örnekleri (virgülle)</label><input id="address" name="address" value={p.address} placeholder="ya, bak" maxlength="300" />
        <span class="muted">Yalnız örnek. Bir cevapta en fazla bir kez geçer, son cevaplarda kullanıldıysa hiç bırakılmaz.</span></div>
      <div><label for="emojis">Tercih edilen emojiler (boşlukla)</label><input id="emojis" name="emojis" value={p.emojis.join(' ')} placeholder="🙃 🥹" />
        <span class="muted">Emoji düzeyi "Yok" değilse bunlardan seçilir.</span></div>
    </div>
    <div class="row">
      <div><label for="laughs">Gülme örnekleri (virgülle)</label><input id="laughs" name="laughs" value={p.laughs.join(', ')} placeholder="ahah, hahaha" />
        <span class="muted">Cevap başına en fazla bir tane; aşağıdaki sınırlara kodla uyar.</span></div>
      <div class="row">
        <div><label for="laughCooldown">Gülmeler arası en az cevap</label><input id="laughCooldown" name="laughCooldown" type="number" min="0" max="20" value={p.laughCooldown} /></div>
        <div><label for="laughMax">Son 20 cevapta en fazla (0 = sınırsız)</label><input id="laughMax" name="laughMax" type="number" min="0" max="20" value={p.laughMax} /></div>
      </div>
    </div>
    <label for="instructions">Net üslup talimatı <span class="muted">{instructions.length}/4000</span></label>
    <textarea id="instructions" name="instructions" rows="5" maxlength="4000" bind:value={instructions} placeholder="Kısa cümleler kurar, resmî hitap kullanmaz…"></textarea>
    <label for="examples">Örnek mesajlar (satır başına bir tane) <span class="muted">{exampleCount}/{data.limits.examples}</span></label>
    <textarea id="examples" name="examples" rows="5" bind:value={examples}></textarea>
    {#if exampleCount > data.limits.examples}<p class="err">Yalnız ilk {data.limits.examples} örnek kaydedilir.</p>{/if}
  </fieldset>

  <fieldset class="card">
    <legend>Ses</legend>
    <p class="muted">Biri ses isteyince önce kataloğundaki gönderilmemiş bir ses dosyası gider; kalmadıysa cevap bu sesle okunur. Ses seçilmediyse ses gönderilmez.</p>
    <div class="row">
      <div><label for="voice">Ses</label>
        <select id="voice" name="voice" bind:value={voice}><option value="">Kapalı</option>{#each data.voices as v}<option value={v}>{v}</option>{/each}</select></div>
      <div><label for="voiceStyle">Ses karakteri</label><input id="voiceStyle" name="voiceStyle" bind:value={voiceStyle} maxlength="200" disabled={!voice} placeholder="telefonda arkadaşına konuşur gibi, rahat ve yavaş" /></div>
    </div>
    <div class="row">
      <div><label for="testText">Dinleme metni</label><input id="testText" bind:value={testText} maxlength="300" disabled={!voice} /></div>
      <div class="test"><button type="button" class="ghost" disabled={!voice || !testText.trim() || testState === 'Ses üretiliyor…'} onclick={playSample}>Sesi dinle</button>
        <span class="muted">{testState}</span></div>
    </div>
    <div class="item">
      <label class="inline"><input type="checkbox" name="nudge" checked={p.nudge} disabled={!voice} /> Cevapsız kalınca sesli dürt</label>
      <p class="muted">Son mesajımıza <input class="mini" name="nudgeMinutes" type="number" min="1" max="60" value={p.nudgeMinutes} disabled={!voice} /> dakika cevap gelmezse, sesli mesajı açık (yakınlık seviyesi yeterli) ve bize en az bir kez yazmış kişiye kısa bir cümle sesli gider. Bir sessizlik için en fazla bir kez; kişi yazınca yeniden mümkün olur.</p>
      <label for="nudgeLines">Dürtme cümleleri (satır başına bir tane; boşsa varsayılanlar)</label>
      <textarea id="nudgeLines" name="nudgeLines" rows="4" maxlength="1000" disabled={!voice} placeholder={'niye bakmıyorsun\nbeni sevmedin mi\noff baksana'}>{p.nudgeLines.join('\n')}</textarea>
    </div>
    <p>{#each VOICE_PRESETS as [label, text]}<button type="button" class="ghost" disabled={!voice} onclick={() => { voiceStyle = text; touch(); }}>{label}</button> {/each}</p>
  </fieldset>

  <fieldset class="card">
    <legend>Bilgi bankası <span class="muted">{knowledge.length}/{data.limits.knowledge}</span></legend>
    <p class="muted">Karşı tarafın mesajıyla sözcük örtüşen girdiler cevaba eklenir. Pasif girdiler hiç kullanılmaz.</p>
    {#each knowledge as k (k)}
      {#if !isRoutine(k)}
        <div class="item" class:off={!k.active}>
          <div class="item-head">
            <input aria-label="Başlık" placeholder="Başlık" bind:value={k.title} maxlength="100" />
            <label class="inline"><input type="checkbox" bind:checked={k.active} /> Aktif</label>
            <button type="button" class="ghost" onclick={() => removeKnowledge(k)}>Kaldır</button>
          </div>
          <textarea aria-label="İçerik" rows="3" maxlength="2000" bind:value={k.content}></textarea>
          <span class="muted counter">{k.content.length}/2000</span>
        </div>
      {/if}
    {/each}
    <p><button type="button" class="ghost" onclick={addKnowledge} disabled={knowledge.length >= data.limits.knowledge}>Girdi ekle</button></p>

    {#if knowledge.some(isRoutine)}
      <details class="routine">
        <summary>Haftalık rutin ({knowledge.filter(isRoutine).length} gün)</summary>
        <p class="muted">Cevap üretilirken yalnız şu anki gün ve saate denk gelen blok modele verilir. Biçim: <code>08:00-09:00 yer: aktivite; …</code> (blokları <code>; </code> ayırır).</p>
        {#each knowledge as k (k)}
          {#if isRoutine(k)}
            <div class="item" class:off={!k.active}>
              <div class="item-head"><strong>{k.title.replace('Rutin: ', '')}</strong>
                <label class="inline"><input type="checkbox" bind:checked={k.active} /> Aktif</label></div>
              <textarea aria-label="{k.title} içeriği" rows="3" maxlength="2000" bind:value={k.content}></textarea>
            </div>
          {/if}
        {/each}
      </details>
    {/if}
  </fieldset>

  {#if p.extras && Object.keys(p.extras).length}
    <fieldset class="card">
      <legend>İçe aktarılan karakter kartı</legend>
      <p class="muted">Kimlik, flört ve gülme politikası, kalite kontrolleri. Kaydederken korunur; yeni dosya içe aktarınca değişir. Gülme sınırları yukarıdaki alanlara yansıtıldı.</p>
      <textarea readonly rows="8" value={JSON.stringify(p.extras, null, 1)}></textarea>
    </fieldset>
  {/if}

  <div class="savebar">
    <span class:dirty>{#if saving}Kaydediliyor…{:else if form?.error}<span class="err">{form.error}</span>{:else if dirty}Kaydedilmemiş değişiklikler var{:else if form?.saved}<span class="ok">Kaydedildi</span>{:else}Değişiklik yok{/if}</span>
    <button disabled={saving || !dirty}>Kaydet</button>
  </div>
</form>

<style>
  fieldset { min-width: 0; }
  legend { font-weight: 600; font-size: 14px; padding: 0 6px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 8px; }
  .item { border: 1px solid var(--line); border-radius: 8px; padding: 10px; margin: 8px 0; background: #fcfcfd; }
  .item.off { opacity: 0.55; }
  .item-head { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
  .item-head input:not([type=checkbox]) { flex: 1; }
  .item-head button { margin-left: auto; }
  label.inline { display: flex; align-items: center; gap: 4px; margin: 0; white-space: nowrap; }
  .badge { font-size: 11px; background: #ede9fe; color: var(--accent); padding: 2px 6px; border-radius: 10px; white-space: nowrap; }
  .mini { width: 64px; display: inline-block; }
  .test { display: flex; align-items: end; gap: 10px; }
  .counter { display: block; text-align: right; }
  .routine { margin-top: 12px; }
  .routine summary { cursor: pointer; font-size: 14px; }
  .savebar { position: sticky; bottom: 0; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; margin: 16px 0; background: #fff; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05); }
  .savebar .dirty { color: #b45309; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

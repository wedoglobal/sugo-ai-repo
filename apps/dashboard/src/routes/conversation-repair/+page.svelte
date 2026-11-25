<script>
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';
  let { data, form } = $props();
  const arms = ['Normal akış', 'Yanıt iyileştirme', 'Takip mesajı', 'İki hamle birlikte'];
  const continuationLabels = { acknowledgment: 'kısa onay', comment: 'ilgili yorum', question: 'konuya bağlı soru' };
  const fmt = (v) => v == null ? '—' : new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 }).format(v);
  const rate = (positive, negative) => {
    const total = Number(positive) + Number(negative);
    return fmt(total ? Number(positive) / total : null);
  };
  const date = (v) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(v));
  const count = (n) => new Intl.NumberFormat('tr-TR').format(n);
  const latest = $derived(data.reports[0]);
  const insufficient = $derived(data.results.some((r) => Number(r.early_yes) + Number(r.early_no) < 30 || Number(r.late_yes) + Number(r.late_no) < 30));
  onMount(() => {
    const timer = setInterval(() => {
      if (data.run && document.visibilityState === 'visible') void invalidate('sugo:conversation-repair');
    }, 7000);
    return () => clearInterval(timer);
  });
</script>

<h1>Sohbet Akışı</h1>
{#if form?.message}<p role="status">{form.message}</p>{/if}

<h2>Geçmişte sohbetin tıkandığı yerler</h2>
<form method="POST" action="?/analyze" class="row">
  <button>{data.run ? 'Analizi ilerlet' : 'Son 30 günü analiz et'}</button>
</form>
{#if data.run}
  <p class="muted">{date(data.run.started_at)} tarihinde başlayan analiz sürüyor.
    {count(data.run.scanned_pairs)} sohbet tarandı, {count(data.run.samples ?? 0)} yanıt incelendi.
    {#if data.run.progress_at}Son ilerleme {date(data.run.progress_at)}.{/if}
    {#if data.run.last_error_at}Son parti tamamlanamadı. Sistem yeniden deneyecek.{/if}
  </p>
{/if}

{#if latest}
  <p class="muted">Sürüm {latest.id} · {date(latest.completed_at)} · {latest.report.all.samples} yanıt, {latest.report.all.uncertain} belirsiz gözlem.</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Örüntü</th><th>Örnek</th><th>Cevapsız</th><th>Belirsiz</th><th>Cevapsızlık oranı</th><th>Benzer sohbetlerde oran</th><th>Toplam cevapsızlık payı</th></tr></thead>
    <tbody>
      {#each latest.report.rows as row (row.condition)}
        <tr><th scope="row">{row.label}</th><td>{row.samples}</td><td>{row.silent}</td><td>{row.uncertain}</td><td>{fmt(row.rate)}</td><td>{fmt(row.comparison)}</td><td>{fmt(row.share)}</td></tr>
      {/each}
    </tbody>
  </table></div>
  <p class="muted">Belirsiz gözlemler oran hesabının dışında kalır. Bir yanıt birden fazla örüntüye uyabilir. Kıyas için aynı profil ve sohbet aşaması kullanılır.</p>
  {#if latest.report.recipes.length}
    <h3>Normal yanıtta denenen hamleler</h3>
    <ul>{#each latest.report.recipes as recipe (recipe.condition)}<li><strong>{recipe.label}</strong> · {recipe.instruction}</li>{/each}</ul>
  {:else}
    <p>Şu an normal yanıtı değiştirecek bir örüntü için yeterli doğrulanmış karşılaştırma yok. Pilot yeni gözlemleri toplamaya devam eder.</p>
  {/if}
{:else}
  <p class="muted">İlk analiz tamamlandığında sonuçlar burada görünecek.</p>
{/if}

<h2>Pilot profilleri</h2>
<div class="table-wrap"><table>
  <thead><tr><th>Profil</th><th>Durum</th><th>İşlem</th></tr></thead>
  <tbody>
    {#each data.hosts as host (host.id)}
      <tr>
        <th scope="row">{host.name || host.sugo_id}</th>
        <td>{host.repair_enabled ? 'Pilot açık' : 'Pilot kapalı'}{host.active ? '' : ' · Profil durduruldu'}</td>
        <td><form method="POST" action="?/pilot"><input type="hidden" name="host" value={host.id} /><input type="hidden" name="enabled" value={host.repair_enabled ? 'no' : 'yes'} /><button disabled={!host.repair_enabled && !latest}>{host.repair_enabled ? 'Pilotu kapat' : 'Pilotu aç'}</button></form></td>
      </tr>
    {:else}<tr><td colspan="3">Profil yok.</td></tr>{/each}
  </tbody>
</table></div>

<h2>Sugo görüşmesi için pilot özeti</h2>
<p>Dört kola dengeli atama yapılır. Normal yanıtı ilk 30 dakikada, takip hamlesini ise 30. dakikadan sonraki 24 saatte gözlenen yanıtlarla değerlendiriyoruz.</p>
<form method="GET" class="row">
  <label>Analiz sürümü <select name="version" onchange={(event) => event.currentTarget.form.requestSubmit()}><option value="">Tüm sürümler</option>{#each data.reports as run (run.id)}<option value={run.id} selected={String(run.id) === data.version}>{run.id}</option>{/each}</select></label>
</form>
{#if insufficient}<p class="muted">Pilot sonucu belirsiz. Karşılaştırma için her kolda ve her ölçümde en az 30 doğrulanmış gözlem gerekiyor.</p>{/if}
<div class="table-wrap"><table>
  <thead>
    <tr><th>Kol</th><th>Atanan / teslim</th><th>İlk 30 dk cevap / sessiz / belirsiz</th><th>Sonraki 24 saatte cevap / sessiz / belirsiz</th><th>Karşılıklı devam</th><th>Takip kuyruğu / teslim</th><th>Filtre reddi</th><th>Hata</th><th>Vazgeçme</th></tr>
  </thead>
  <tbody>
    {#each data.results as result (result.arm)}
      <tr>
        <th scope="row">{arms[result.arm]}</th><td>{result.assigned} / {result.sent}</td>
        <td>{result.early_yes} / {result.early_no} / {Number(result.sent) - Number(result.early_yes) - Number(result.early_no)} <small>({rate(result.early_yes, result.early_no)})</small></td>
        <td>{result.late_yes} / {result.late_no} / {result.late_unknown} <small>({rate(result.late_yes, result.late_no)})</small></td>
        <td>{result.continued}</td><td>{result.repair_queued} / {result.repair_sent}</td><td>{result.rejected}</td><td>{result.failed}</td><td>{result.stopped}</td>
      </tr>
    {/each}
  </tbody>
</table></div>
<p class="muted">Geç pencereye, ilk 30 dakikada sessizliği gözlenebilen sohbetler girer. İstemci sohbeti tekrar açmazsa sessizlik doğrulanamaz.</p>

{#if latest?.report.recipes.some((recipe) => recipe.continuationType)}
  <h3>Geçmişten anonim akış örnekleri</h3>
  <ul>
    {#each latest.report.recipes as recipe (recipe.condition)}
      {#if recipe.continuationType}<li>{recipe.label} görülen akışla aynı aşamadaki devam eden sohbetlerde {continuationLabels[recipe.continuationType]} öne çıktı.</li>{/if}
    {/each}
  </ul>
{/if}

<h3>Örnek metinler</h3>
<p class="muted">Gösterim için oluşturulmuş örnekler.</p>
<ul>
  <li>Kullanıcı otobüsün geciktiğini söylüyor. Kısa bir “anladım” yerine “o saatte beklemek daha da yorucu olmuştur” konuşmadaki ayrıntıya karşılık verir.</li>
  <li>Kullanıcı yola çıktığını söyledikten sonra sohbet sessiz kalıyor. “Bu arada yol nasıl geçti, vardın mı?” daha önce açılan konuya döner.</li>
</ul>

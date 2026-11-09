<script>
  import { onMount } from 'svelte';
  import { extensionRequest } from './extension-bridge.js';
  let { host, compact = false } = $props();
  let override = $state(null);
  let receipt = $state(null);
  let busy = $state(false);
  let message = $state('Eklenti kontrol ediliyor…');
  let failed = $state(false);
  let checking = 0;
  let epoch = 0;
  const active = $derived(override?.active ?? host.active);
  const revision = $derived(override?.revision ?? host.updated_at);
  const bound = $derived(receipt?.hostId === host.id);
  const synced = $derived(bound && receipt?.synced && receipt.active === active && receipt.revision === revision);
  async function check(force = false) {
    if (checking && !force) return;
    checking++;
    const token = epoch;
    try {
      const next = await extensionRequest({ control: true, action: force ? 'refresh' : 'read' });
      if (token !== epoch) return;
      receipt = next;
      if (bound && receipt.synced && receipt.revision > revision) override = { active: receipt.active, revision: receipt.revision };
      if (!receipt.synced) message = receipt.error || 'Eşitleme bekleniyor.';
      else if (!bound) message = 'Bu Chrome’a bağlı değil.';
      else if (!synced) message = 'Güncel ayarın onayı bekleniyor.';
      else message = `Eşitlendi · ${new Date(receipt.checkedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch (e) { if (token === epoch) { receipt = null; message = e.message; } }
    finally { checking--; }
  }
  async function bind() {
    busy = true; failed = false; epoch++;
    try {
      receipt = await extensionRequest({ control: true, action: 'bind', hostSugoId: host.sugo_id }, 8000);
      await check(true);
    } catch (e) { failed = true; message = e.message; }
    finally { busy = false; }
  }
  async function change() {
    busy = true; failed = false; epoch++;
    const target = !active;
    try {
      const response = await fetch(`/hosts/${host.id}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: target }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Profil durumu kaydedilemedi.');
      override = result.host;
      message = 'Panelde kaydedildi · Eklenti onayı bekleniyor.';
      receipt = null;
      await check(true);
    } catch (e) { failed = true; message = e.message; }
    finally { busy = false; }
  }
  onMount(() => {
    check();
    const timer = setInterval(() => { if (!busy) check(); }, 4000);
    return () => clearInterval(timer);
  });
</script>
<div class="profile-control" class:compact>
  <div class="actions"><button class:stop={active} disabled={busy} onclick={change}>{busy ? 'İşleniyor…' : active ? 'Ⅱ Durdur' : '▷ Başlat'}</button>{#if !bound}<button class="bind" disabled={busy} onclick={bind}>Bu Chrome’a bağla</button>{:else}<button class="bind" disabled={busy} onclick={() => check(true)}>Eşitle ↻</button>{/if}</div>
  <p class:good={synced} class:failed role="status"><span>{synced ? '●' : '○'}</span> {synced ? `Eşitlendi · ${new Date(receipt.checkedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : message}</p>
  {#if !compact}<small>Başlat/durdur otomasyonu kontrol eder; GPS ve proxy ayarları bağımsızdır. Durdurma yeni işleri keser; gönderimi başlamış bir mesaj geri alınamaz.</small>{/if}
</div>
<style>
.profile-control{min-width:190px;max-width:360px}.actions{display:flex;gap:7px;flex-wrap:wrap}.actions button{font-size:11px;padding:9px 13px;white-space:nowrap;background:#dcefe4;color:#46745b;border:1px solid #c9e2d3}.actions button.stop{background:#f6edf0;border-color:#ead8e0;color:#a46b80}.actions button.bind{background:#fff;color:#887797;border-color:#e4dfea;font-size:10px}.profile-control p{font-size:10px;color:#a397b0;line-height:1.6;margin:8px 0 0;white-space:normal;max-width:330px}.profile-control p.good{color:#5b9475}.profile-control p.failed{color:#b85a71}.profile-control small{display:block;font-size:9px;color:#9c95a6;line-height:1.7;margin-top:7px}.compact .actions button{padding:7px 10px;font-size:10px}.compact p{font-size:9px}.compact{max-width:260px}
</style>

const $ = (id) => document.getElementById(id);
let hostId;
async function refresh() {
  try {
    const c = await chrome.runtime.sendMessage({ type: 'config' });
    if (!c) throw new Error('Eklentiyi yeniden yükleyin.');
    $('baseUrl').value = c.baseUrl;
    $('hostSugoId').value = c.hostSugoId || 'Panelden profil bağlayın';
    $('enabled').checked = !!c.enabled;
    hostId = c.control?.hostId;
    $('status').textContent = c.control?.synced
      ? `${c.enabled ? 'Çalışıyor' : 'Durduruldu'} · Panel ile eşitlendi`
      : c.control?.error || 'Panel bağlantısı bekleniyor.';
  } catch (e) { $('status').textContent = e.message; }
}
$('save').onclick = async () => {
  const c = await chrome.storage.local.get(['baseUrl']);
  const base = c.baseUrl || (typeof __VELORA_API_URL__ === 'string' ? __VELORA_API_URL__ : 'https://sugo-host.b-erdincozer.workers.dev');
  await chrome.tabs.create({ url: `${base.replace(/\/$/, '')}/hosts${hostId ? `/${encodeURIComponent(hostId)}` : ''}` });
};
refresh();
setInterval(refresh, 2000);

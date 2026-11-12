const $ = (id) => document.getElementById(id);
let hostId;
async function refresh() {
  try {
    const c = await chrome.runtime.sendMessage({ type: 'config' });
    if (!c) throw new Error('Eklentiyi yeniden yükleyin.');
    $('baseUrl').value = c.baseUrl;
    if (document.activeElement !== $('hostSugoId') && !$('hostSugoId').dataset?.dirty) $('hostSugoId').value = c.hostSugoId || '';
    $('enabled').checked = !!c.enabled;
    hostId = c.control?.hostId;
    $('status').textContent = c.control?.synced
      ? `${c.enabled ? 'Çalışıyor' : 'Durduruldu'} · Panel ile eşitlendi`
      : c.control?.error || 'Panel bağlantısı bekleniyor.';
  } catch (e) { $('status').textContent = e.message; }
}
$('hostSugoId').oninput = () => { $('hostSugoId').dataset.dirty = '1'; };
$('bind').onclick = async () => {
  const id = $('hostSugoId').value.trim();
  if (!/^\d{1,30}$/.test(id)) { $('status').textContent = 'Sugo profil ID (yalnız rakamlar) girin; panel adresindeki uzun kodu değil.'; return; }
  $('bind').disabled = true;
  $('status').textContent = 'Bağlanıyor…';
  try {
    const r = await chrome.runtime.sendMessage({ type: 'sugo-control', action: 'bind', hostSugoId: id });
    if (!r?.ok) throw new Error(r?.error || 'Bağlanamadı.');
    delete $('hostSugoId').dataset.dirty;
  } catch (e) { $('status').textContent = e.message; }
  $('bind').disabled = false;
  refresh();
};
$('save').onclick = async () => {
  const c = await chrome.storage.local.get(['baseUrl']);
  const base = c.baseUrl || (typeof __VELORA_API_URL__ === 'string' ? __VELORA_API_URL__ : 'https://sugo-host.b-erdincozer.workers.dev');
  await chrome.tabs.create({ url: `${base.replace(/\/$/, '')}/hosts${hostId ? `/${encodeURIComponent(hostId)}` : ''}` });
};
refresh();
setInterval(refresh, 2000);

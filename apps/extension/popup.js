const keys = ['baseUrl', 'apiKey', 'hostSugoId', 'enabled'];
const $ = (id) => document.getElementById(id);

chrome.storage.local.get(keys).then((c) => {
  $('baseUrl').value = c.baseUrl ?? 'http://localhost:5190';
  $('apiKey').value = c.apiKey ?? '';
  $('hostSugoId').value = c.hostSugoId ?? '';
  $('enabled').checked = !!c.enabled;
});

$('save').onclick = async () => {
  await chrome.storage.local.set({
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    hostSugoId: $('hostSugoId').value.trim(),
    enabled: $('enabled').checked,
  });
  $('status').textContent = 'kaydedildi';
};

$('testVoice').onclick = async () => {
  const status = $('voiceStatus');
  const text = $('voiceText').value.trim();
  if (!text) { status.textContent = 'Metin boş'; return; }
  $('testVoice').disabled = true;
  status.textContent = 'Ses üretiliyor ve gönderiliyor…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'test-voice', text });
    status.textContent = res?.ok ? 'Gönderildi' : `Hata: ${res?.error ?? 'bilinmeyen'}`;
  } catch {
    status.textContent = 'Hata: sugo.live sekmesi açık ve yenilenmiş olmalı';
  } finally {
    $('testVoice').disabled = false;
  }
};

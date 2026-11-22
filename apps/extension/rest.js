// Dinlenme: eşleşme gelmeyince sugo.live sekmesi kapatılır, boş sekme tarayıcıyı açık tutar,
// 5–15 dakika sonra (veya panelden "başlat" denince) sekme yeniden açılıp akış başlar.
const SITE = 'https://sugo.live/messages';
const WAKE_ALARM = 'velora-rest-wake';
const POLL_ALARM = 'velora-rest-poll';
const REST_KEY = 'veloraRest';
const discoveryKey = (host) => `sugo-discovery-since:${host}`;

async function endpoint(path, init = {}) {
  const c = await globalThis.veloraControl.localConfig();
  if (!c.apiKey || !c.hostSugoId) return null;
  const res = await fetch(c.baseUrl.replace(/\/$/, '') + path.replace('{host}', encodeURIComponent(c.hostSugoId)), {
    ...init, signal: AbortSignal.timeout(8000), cache: 'no-store',
    headers: { authorization: `Bearer ${c.apiKey}`, 'content-type': 'application/json' },
  });
  return res.ok ? res.json().catch(() => ({})) : null;
}

/** Aktifken her zaman tek sekme kalır: yeni sekme sugo.live'a geçince eski sugo.live sekmeleri kapatılır. */
async function keepOnlyTab(keepId) {
  const tabs = await chrome.tabs.query({ url: ['*://sugo.live/*', '*://www.sugo.live/*'] });
  await Promise.all(tabs.filter((t) => t.id !== keepId).map((t) => chrome.tabs.remove(t.id).catch(() => {})));
}

async function report(rest, state, detail) {
  const c = await globalThis.veloraControl.localConfig();
  await endpoint('/api/ext/state', { method: 'POST', body: JSON.stringify({
    hostSugoId: c.hostSugoId, state, detail, since: rest?.startedAt, until: rest?.until,
    lastActivityAt: rest?.lastActivityAt, lastSentAt: rest?.lastSentAt, version: chrome.runtime.getManifest().version,
  }) }).catch(() => {});
}

export async function startRest({ minutes, hostSugoId, lastActivityAt, lastSentAt }, tabId) {
  const startedAt = Date.now();
  const rest = { startedAt, until: startedAt + minutes * 60000, hostSugoId, lastActivityAt, lastSentAt };
  // Önce boş sekme açılır ki tarayıcı penceresi hiç kapanmasın, sonra sugo.live sekmesi kapatılır.
  const blank = await chrome.tabs.create({ url: 'about:blank', active: true });
  rest.blankTabId = blank.id;
  await chrome.storage.local.set({ [REST_KEY]: rest });
  chrome.alarms.create(WAKE_ALARM, { when: rest.until });
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  if (tabId != null) await chrome.tabs.remove(tabId).catch(() => {});
  await keepOnlyTab(blank.id);
  await report(rest, 'dinleniyor', `${minutes.toFixed(1)} dk dinlenme`);
  return rest;
}

export async function wake(reason) {
  const rest = (await chrome.storage.local.get(REST_KEY))[REST_KEY];
  await chrome.alarms.clear(WAKE_ALARM);
  await chrome.alarms.clear(POLL_ALARM);
  await chrome.storage.local.remove(REST_KEY);
  if (!rest) return false;
  await chrome.storage.local.remove(discoveryKey(rest.hostSugoId));
  const blank = rest.blankTabId == null ? null : await chrome.tabs.get(rest.blankTabId).catch(() => null);
  const tab = blank ? await chrome.tabs.update(blank.id, { url: SITE, active: true }) : await chrome.tabs.create({ url: SITE, active: true });
  await keepOnlyTab(tab.id);
  await report({ startedAt: Date.now(), lastSentAt: rest.lastSentAt }, 'başlatılıyor', `dinlenme bitti (${reason})`);
  return true;
}

async function poll() {
  const rest = (await chrome.storage.local.get(REST_KEY))[REST_KEY];
  if (!rest) return chrome.alarms.clear(POLL_ALARM);
  if (Date.now() >= rest.until) return wake('süre doldu');
  const data = await endpoint('/api/ext/control?host={host}&cmd=1').catch(() => null);
  if (data?.command?.wakeAt > rest.startedAt) return wake('panelden başlatıldı');
  await report(rest, 'dinleniyor', 'bekliyor');
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WAKE_ALARM) wake('süre doldu');
  else if (alarm.name === POLL_ALARM) poll();
});

// Tarayıcı yeniden açıldığında veya servis çalışanı uyandığında bekleyen dinlenmeyi sürdürür.
async function resume() {
  const rest = (await chrome.storage.local.get(REST_KEY))[REST_KEY];
  if (!rest) return;
  if (Date.now() >= rest.until) return wake('süre doldu');
  chrome.alarms.create(WAKE_ALARM, { when: rest.until });
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
}
chrome.runtime.onStartup.addListener(resume);
chrome.runtime.onInstalled.addListener(resume);

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type !== 'rest-start' || sender.id !== chrome.runtime.id) return false;
  const minutes = Number(msg.minutes);
  if (!(minutes >= 1 && minutes <= 60)) { reply({ ok: false, error: 'Geçersiz dinlenme süresi' }); return false; }
  startRest({ minutes, hostSugoId: String(msg.hostSugoId ?? ''), lastActivityAt: msg.lastActivityAt, lastSentAt: msg.lastSentAt }, sender.tab?.id)
    .then(() => reply({ ok: true })).catch((e) => reply({ ok: false, error: e.message }));
  return true;
});

import { NETWORK_KEY, activeProfiles, domainOf, pacScript, validateProfile } from './network-model.js';
const empty = () => ({ activeHost: '', hosts: {} });
const read = async () => (await chrome.storage.local.get(NETWORK_KEY))[NETWORK_KEY] ?? empty();
const own = new Set();
const suppressed = new Set();
const tabDomains = new Map();
const appliedRoam = new Map();
const roamKey = (domain) => `gpsRoam:${domain}`;
const sameCenter = (gps, center) => gps.enabled && gps.latitude === center.latitude && gps.longitude === center.longitude;
let queue = Promise.resolve();
const serial = (fn) => { const task = queue.then(fn); queue = task.catch(() => {}); return task; };
async function statusError(key, message) {
  await chrome.storage.session.set({ [key]: message });
}
async function gpsTab(tab, state, move) {
  if (!tab.id) return;
  const target = { tabId: tab.id };
  const p = activeProfiles(state).find((p) => p.domain === domainOf(tab.url ?? '') && p.gps.enabled);
  if (!p) {
    appliedRoam.delete(tab.id);
    suppressed.delete(tab.id);
    tabDomains.delete(tab.id);
    if (own.delete(tab.id)) {
      try { await chrome.debugger.sendCommand(target, 'Emulation.clearGeolocationOverride'); await chrome.debugger.detach(target); } catch { /* Sekme kapanmış olabilir. */ }
      own.delete(tab.id);
    }
    return;
  }
  if (suppressed.has(tab.id)) return `${p.domain}: GPS bağlantısı kesildi; panelden yeniden uygulayın.`;
  const key = roamKey(p.domain);
  const saved = (await chrome.storage.session.get(key))[key];
  const hold = saved?.host === state.activeHost && sameCenter(p.gps, saved.center) ? saved : null;
  if (move && (!sameCenter(p.gps, move.center) || (hold && hold.stepAt > move.stepAt))) return 'Konum hedefi güncel değil.';
  const point = move ?? hold;
  if (move && appliedRoam.get(tab.id) === hold?.stepAt && hold?.stepAt === move.stepAt) return;
  try {
    if (!own.has(tab.id)) { await chrome.debugger.attach(target, '1.3'); own.add(tab.id); }
    tabDomains.set(tab.id, p.domain);
    const { latitude, longitude } = point ?? p.gps;
    await chrome.debugger.sendCommand(target, 'Emulation.setGeolocationOverride', { latitude, longitude, accuracy: p.gps.accuracy });
    if (move && hold?.stepAt !== move.stepAt) await chrome.storage.session.set({ [key]: { ...move, host: state.activeHost } });
    if (point) appliedRoam.set(tab.id, point.stepAt);
    else appliedRoam.delete(tab.id);
    await statusError(`gps:${tab.id}`, '');
  } catch (e) { await statusError(`gps:${tab.id}`, e.message); return `${p.domain}: Sekme ${tab.id}: ${e.message}`; }
}
async function locationPermissions(profiles, blocked = []) {
  const domains = profiles.filter((p) => p.gps.enabled).map((p) => p.domain).sort();
  const previous = (await chrome.storage.local.get('gpsPermissionDomains')).gpsPermissionDomains ?? [];
  if (!domains.length && !previous.length) return;
  // Yarım kalan bir işlemde sonraki uyanışın temizleyebilmesi için hedef önce kaydedilir.
  await chrome.storage.local.set({ gpsPermissionDomains: domains });
  await chrome.contentSettings.location.clear({ scope: 'regular' });
  for (const domain of domains) {
    for (const scheme of ['http', 'https']) {
      const pattern = `${scheme}://${domain}/*`;
      await chrome.contentSettings.location.set({ primaryPattern: pattern, secondaryPattern: pattern, setting: blocked.includes(domain) ? 'block' : 'allow', scope: 'regular' });
    }
    const setting = await chrome.contentSettings.location.get({ primaryUrl: `https://${domain}/` });
    if (!blocked.includes(domain) && setting.setting !== 'allow') throw new Error(`${domain}: Chrome konum izni kurum politikası veya başka bir kural tarafından engelleniyor.`);
  }
}
async function apply(state) {
  const profiles = activeProfiles(state);
  const current = await chrome.proxy.settings.get({ incognito: false });
  if (profiles.some((p) => p.proxy.enabled)) {
    if (!['controllable_by_this_extension', 'controlled_by_this_extension'].includes(current.levelOfControl)) throw new Error('Proxy ayarını başka bir eklenti veya kurum politikası yönetiyor.');
    await chrome.proxy.settings.set({ value: { mode: 'pac_script', pacScript: { data: pacScript(profiles), mandatory: true } }, scope: 'regular' });
  } else if (current.levelOfControl === 'controlled_by_this_extension') await chrome.proxy.settings.clear({ scope: 'regular' });
  const domains = profiles.filter((p) => p.gps.enabled).map((p) => p.domain);
  await locationPermissions(profiles, domains);
  const errors = (await Promise.all((await chrome.tabs.query({})).map((tab) => gpsTab(tab, state)))).filter(Boolean);
  await locationPermissions(profiles, domains.filter((domain) => errors.some((e) => e.startsWith(`${domain}:`))));
  return errors;
}

export function applyRoam(tabId, domain, host, move, expiresAt) {
  return serial(async () => {
    const { hostSugoId } = await chrome.storage.local.get('hostSugoId');
    if (String(hostSugoId) !== String(host.sugoId)) return false;
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    const state = await read();
    const profile = activeProfiles(state).find((p) => p.domain === domain);
    if (Date.now() > expiresAt || state.activeHost !== host.id || url.hostname !== domain ||
        !url.pathname.startsWith('/messages') || !profile || !sameCenter(profile.gps, move.center)) return false;
    return !(await gpsTab(tab, state, move));
  });
}
async function snapshot(host) {
  const state = await read();
  const proxy = await chrome.proxy.settings.get({ incognito: false });
  const runtime = await chrome.storage.session.get(null);
  return { host, activeHost: state.activeHost, profiles: state.hosts[host] ?? [], proxyControl: proxy.levelOfControl, runtime, sync: runtime.networkReceipt ?? null };
}
export async function networkMessage(msg) {
  return serial(async () => {
    if (msg.action === 'read') return snapshot(msg.host);
    if (typeof msg.host !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(msg.host)) throw new Error('Host geçersiz.');
    const state = await read();
    const previous = structuredClone(state);
    if (msg.action === 'save') {
      const p = validateProfile(msg.profile);
      const list = state.hosts[msg.host] ?? [];
      state.hosts[msg.host] = [...list.filter((x) => x.domain !== p.domain && x.domain !== msg.originalDomain), p];
    } else if (msg.action === 'delete') state.hosts[msg.host] = (state.hosts[msg.host] ?? []).filter((p) => p.domain !== msg.domain);
    else if (msg.action === 'replace') {
      // Panelin sunucuda tuttuğu profiller bu Chrome'a bağlı profil için tek kaynaktır.
      state.hosts[msg.host] = (Array.isArray(msg.profiles) ? msg.profiles : []).map(validateProfile);
      state.activeHost = msg.host;
    } else if (msg.action === 'activate') state.activeHost = msg.host;
    else if (msg.action === 'deactivate' && state.activeHost === msg.host) state.activeHost = '';
    else throw new Error('İşlem geçersiz.');
    const endpoints = new Map();
    for (const p of activeProfiles(state).filter((p) => p.proxy.enabled)) {
      const key = `${p.proxy.ip}:${p.proxy.port}`;
      const auth = JSON.stringify([p.proxy.auth, p.proxy.username, p.proxy.password]);
      if (endpoints.has(key) && endpoints.get(key) !== auth) throw new Error('Aynı proxy adresi farklı kimlik bilgileriyle kullanılamaz.');
      endpoints.set(key, auth);
    }
    // Kimlik doğrulama olayları PAC uygulanırken yeni yerel ayarları okuyabilir.
    await chrome.storage.local.set({ [NETWORK_KEY]: state });
    let errors = [];
    let applied = false;
    try {
      if (state.activeHost !== previous.activeHost || state.activeHost === msg.host) {
        suppressed.clear(); await chrome.storage.session.set({ gpsSuppressed: [] }); errors = await apply(state); applied = true;
      }
    }
    catch (e) { await chrome.storage.local.set({ [NETWORK_KEY]: previous }); await apply(previous).catch(() => {}); throw e; }
    for (const p of activeProfiles(previous)) {
      const current = activeProfiles(state).find((x) => x.domain === p.domain);
      if (state.activeHost !== previous.activeHost || !current || !sameCenter(current.gps, p.gps)) {
        await chrome.storage.session.remove(roamKey(p.domain));
      }
    }
    await chrome.storage.session.set({ networkReceipt: { host: msg.host, revision: crypto.randomUUID(), status: errors.length ? 'error' : applied ? 'applied' : 'saved', errors, checkedAt: new Date().toISOString() } });
    return snapshot(msg.host);
  });
}
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (change.url || change.status === 'loading') serial(async () => gpsTab(tab, await read())).catch(() => {});
});
chrome.tabs.onRemoved.addListener((id) => { own.delete(id); tabDomains.delete(id); appliedRoam.delete(id); suppressed.delete(id); chrome.storage.session.remove(`gps:${id}`); });
chrome.debugger.onDetach.addListener(({ tabId }, reason) => {
  if (own.delete(tabId)) {
    appliedRoam.delete(tabId);
    const domain = tabDomains.get(tabId);
    if (domain) for (const scheme of ['http', 'https']) {
      const pattern = `${scheme}://${domain}/*`;
      chrome.contentSettings.location.set({ primaryPattern: pattern, secondaryPattern: pattern, setting: 'block', scope: 'regular' }).catch(() => {});
    }
    suppressed.add(tabId); chrome.storage.session.set({ gpsSuppressed: [...suppressed] }); statusError(`gps:${tabId}`, `GPS bağlantısı kesildi (${reason}). Panelden yeniden uygulayın.`); }
});
const attempts = new Set();
chrome.webRequest.onAuthRequired.addListener((details, callback) => {
  if (!details.isProxy) { callback({}); return; }
  read().then((state) => {
    const p = activeProfiles(state).find((p) => p.proxy.enabled && p.domain === domainOf(details.url) && p.proxy.ip === details.challenger.host && p.proxy.port === details.challenger.port);
    if (!p) { callback({}); return; }
    if (!p.proxy.auth || attempts.has(details.requestId)) { callback({ cancel: true }); return; }
    attempts.add(details.requestId);
    callback({ authCredentials: { username: p.proxy.username, password: p.proxy.password } });
  }).catch(() => callback({ cancel: true }));
}, { urls: ['<all_urls>'] }, ['asyncBlocking']);
for (const event of [chrome.webRequest.onCompleted, chrome.webRequest.onErrorOccurred]) event.addListener((d) => attempts.delete(d.requestId), { urls: ['<all_urls>'] });
chrome.proxy.onProxyError.addListener((e) => statusError('proxyError', `${e.error}: ${e.details ?? ''}`));
// Servis çalışanı yeniden başlarken mevcut debugger bağlantıları sahiplenilir.
serial(async () => {
  const session = await chrome.storage.session.get('gpsSuppressed');
  for (const id of session.gpsSuppressed ?? []) suppressed.add(id);
  for (const target of await chrome.debugger.getTargets()) if (target.attached && target.tabId) {
    try { await chrome.debugger.sendCommand({ tabId: target.tabId }, 'Emulation.canEmulate'); own.add(target.tabId); } catch { /* Başka debugger bağlantısı. */ }
  }
  await apply(await read());
}).catch((e) => statusError('proxyError', e.message));

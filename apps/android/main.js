// AutoJS6 girişi. Yapılandırma: bu dosyanın yanındaki config.json (veya /sdcard/sugo-dev/config.json):
// { "baseUrl": "https://...", "apiKey": "...", "hostSugoId": "123", "dryRun": false, "allowPeers": ["peer sugo id"] (isteğe bağlı: yalnız bu kişilerle çalış) }
"auto";
var VERSION = 'android-0.1.0';
var api = require('./lib/api');
var loopLib = require('./lib/loop');
var outreachLib = require('./lib/outreach');
var peersLib = require('./lib/peers');
var uiLib = require('./lib/ui');

function readConfig() {
  var paths = [files.path('./config.json'), '/sdcard/sugo-dev/config.json'];
  for (var i = 0; i < paths.length; i++) if (files.exists(paths[i])) return JSON.parse(files.read(paths[i]));
  throw new Error('config.json bulunamadı');
}

var http_ = {
  request: function (method, url, headers, body, timeoutMs) {
    var res = method === 'GET'
      ? http.get(url, { headers: headers })
      : http.postJson(url, body || {}, { headers: headers });
    var text = String(res.body.string());
    var data = null;
    try { data = JSON.parse(text); } catch (e) { data = { error: text.slice(0, 200) }; }
    return { status: res.statusCode, data: data };
  }
};

var LOG = '/sdcard/sugo-dev/android/run.log';
function logLine(m) {
  var line = new Date().toISOString() + ' ' + m;
  console.log('[sugo-android] ' + m);
  try { files.append(LOG, line + '\n'); } catch (e) { /* günlük yazılamıyor */ }
}

var cfg = readConfig();
var st = storages.create('sugo-host');
var store = { get: function (k) { return st.get(k) || null; }, set: function (k, v) { st.put(k, v); } };
var ui = uiLib.createUi();
auto.waitFor();
device.keepScreenOn();
// Hesap kimliği config'te yoksa uygulamadan (Ben → kendi profili) okunur ve saklanır; profil sunucuda yoksa
// mevcut bir personadan kopyalanarak otomatik açılır ve hemen çalışmaya başlar.
var nav = require('./lib/nav');
var hostId = cfg.hostSugoId || null;
var hostName = '';
if (!hostId) {
  for (var tries = 0; tries < 5 && !hostId; tries++) {
    if (!ui.inApp()) { ui.launch(); sleep(3000); }
    var me = nav.readSelf(ui);
    logLine('hesap okuma: id=' + me.id + ' ad=' + me.name + (me.error ? ' hata=' + me.error : ''));
    if (me.id) { hostId = me.id; hostName = me.name; store.set('hostSugoId', hostId); }
    else sleep(2000);
  }
  if (!hostId) hostId = store.get('hostSugoId');
  if (!hostId) throw new Error('kendi sugo id okunamadı');
}
var apiClient = api.createApi({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, hostSugoId: hostId, version: VERSION, http: http_, now: function () { return Date.now(); } });
var loop = loopLib.createLoop({
  ui: ui, api: apiClient, peers: peersLib.createPeers(store, function () { return Date.now(); }),
  now: function () { return Date.now(); }, dryRun: !!cfg.dryRun, allowPeers: cfg.allowPeers || null,
  outreach: outreachLib.createOutreach({
    ui: ui, api: apiClient, store: store, now: function () { return Date.now(); }, hour: function () { return new Date().getHours(); },
    hiEnabled: cfg.hiEnabled !== false, hiBase: cfg.hiBase, hiPeak: cfg.hiPeak, dryRun: !!cfg.dryRun,
    log: function (m) { logLine(m); }
  }),
  log: function (m) { logLine(m); }
});

try {
  var synced = apiClient.syncHost(hostId, hostName);
  logLine('profil eşitlendi: ' + synced.host.sugoId + ' ' + synced.host.name + (synced.cloned ? ' (persona kopyalandı)' : '') + (synced.mediaError ? ' medya hatası=' + synced.mediaError : ''));
} catch (e) { logLine('profil eşitlenemedi: ' + e.message); }
logLine('başladı ' + VERSION + (cfg.dryRun ? ' (DRY_RUN)' : ''));
for (;;) {
  var worked = false;
  try {
    if (!ui.inApp()) { ui.launch(); sleep(3000); }
    worked = loop.tick();
  } catch (e) {
    logLine('HATA ' + e);
    sleep(3000);
  }
  if (!worked) sleep(300 + Math.floor(Math.random() * 400));
}

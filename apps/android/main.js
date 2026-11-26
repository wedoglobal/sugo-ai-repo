// AutoJS6 girişi. Yapılandırma: bu dosyanın yanındaki config.json (veya /sdcard/sugo-dev/config.json):
// { "baseUrl": "https://...", "apiKey": "...", "hostSugoId": "123", "dryRun": false, "allowPeers": ["peer sugo id"] (isteğe bağlı: yalnız bu kişilerle çalış) }
var VERSION = 'android-0.1.4';
var api = require('./lib/api');
var loopLib = require('./lib/loop');
var outreachLib = require('./lib/outreach');
var peersLib = require('./lib/peers');
var uiLib = require('./lib/ui');
var locationLib = require('./lib/location');
var standalone = String(context.getPackageName()) !== 'org.autojs.autojs6';

function readConfig() {
  var paths = [files.path('./config.json')];
  if (!standalone) paths.push('/sdcard/sugo-dev/config.json');
  for (var i = 0; i < paths.length; i++) if (files.exists(paths[i])) return JSON.parse(files.read(paths[i]));
  throw new Error('config.json bulunamadı');
}

var http_ = {
  request: function (method, url, headers, body, timeoutMs) {
    var options = { headers: headers, timeout: timeoutMs };
    if (method === 'GET') {
      options.maxRetries = 0;
      options.client = { callTimeout: [timeoutMs, 'MILLISECONDS'] };
    }
    var res = method === 'GET' ? http.get(url, options) : http.postJson(url, body || {}, options);
    var text = String(res.body.string());
    var data = null;
    try { data = JSON.parse(text); } catch (e) { data = { error: text.slice(0, 200) }; }
    return { status: res.statusCode, data: data };
  }
};

var LOG = standalone
  ? files.join(String(context.getFilesDir().getAbsolutePath()), 'run.log')
  : '/sdcard/sugo-dev/android/run.log';
function logLine(m) {
  var line = new Date().toISOString() + ' ' + m;
  console.log('[sugo-android] ' + m);
  try { files.append(LOG, line + '\n'); } catch (e) { /* günlük yazılamıyor */ }
}

logLine('başlatılıyor ' + VERSION);
var cfg = readConfig();
var st = storages.create('sugo-host');
var store = { get: function (k) { return st.get(k) || null; }, set: function (k, v) { st.put(k, v); } };
var ui = uiLib.createUi();
logLine('erişilebilirlik hizmeti bekleniyor');
auto.waitFor();
logLine('erişilebilirlik hizmeti hazır');
device.keepScreenOn();
// Hesap kimliği config'te yoksa uygulamadan (Ben → kendi profili) okunur ve saklanır; profil sunucuda yoksa
// mevcut bir personadan kopyalanarak otomatik açılır ve hemen çalışmaya başlar.
var nav = require('./lib/nav');
var hostId = cfg.hostSugoId || null;
var hostName = '';
if (!hostId) {
  for (var tries = 0; tries < 5 && !hostId; tries++) {
    if (!nav.openSugo(ui, 8000)) { logLine('Sugo uygulaması açılamadı; ön plandaki paket=' + ui.foreground()); sleep(2000); continue; }
    sleep(800);
    var me = nav.readSelf(ui);
    logLine('hesap okuma: id=' + me.id + ' ad=' + me.name + (me.error ? ' hata=' + me.error : ''));
    if (me.id) { hostId = me.id; hostName = me.name; store.set('hostSugoId', hostId); }
    else sleep(2000);
  }
  if (!hostId) hostId = store.get('hostSugoId');
  if (!hostId) throw new Error('kendi sugo id okunamadı');
}
var apiOptions = { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, hostSugoId: hostId, version: VERSION, http: http_, now: function () { return Date.now(); } };
var apiClient = api.createApi(apiOptions);
var loop = loopLib.createLoop({
  ui: ui, api: apiClient, hostId: hostId, store: store, peers: peersLib.createPeers(store, function () { return Date.now(); }),
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

// Konum, mesaj işlerinin ağ ve ekran beklemeleri sırasında da yenilenir.
var location = locationLib.createLocation({
  provider: locationLib.createAndroidProvider(),
  now: function () { return Number(android.os.SystemClock.elapsedRealtime()); },
  log: logLine
});
var locationApi = api.createApi(apiOptions);
var locationLock = threads.lock();
var stopping = false;
events.on('exit', function () {
  locationLock.lock();
  try {
    stopping = true;
    location.close();
  } finally { locationLock.unlock(); }
});
threads.start(function () {
  while (!isStopped()) {
    var control = locationApi.control(true);
    locationLock.lock();
    try {
      if (stopping) return;
      location.update(control);
    } finally { locationLock.unlock(); }
    sleep(5000);
  }
});
threads.start(function () {
  while (!isStopped()) {
    locationLock.lock();
    try {
      if (stopping) return;
      location.tick();
    } finally { locationLock.unlock(); }
    sleep(500);
  }
});

logLine('başladı ' + VERSION + (cfg.dryRun ? ' (DRY_RUN)' : ''));
for (;;) {
  var worked = false;
  try {
    if (!nav.openSugo(ui, 8000)) { logLine('Sugo uygulaması açılamadı; ön plandaki paket=' + ui.foreground()); sleep(3000); continue; }
    worked = loop.tick();
  } catch (e) {
    logLine('HATA ' + e);
    sleep(3000);
  }
  if (!worked) sleep(300 + Math.floor(Math.random() * 400));
}

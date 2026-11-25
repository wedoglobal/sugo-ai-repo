// Dashboard /api/ext/* istemcisi (Chrome eklentisiyle aynı sözleşme).
// http bağdaştırıcısı: http.request(method, url, headers, bodyObjectOrNull, timeoutMs) -> { status, data }
// Ağ hatasında fırlatır; HTTP hatasında { ok:false } döndürür.

function createApi(opts) {
  var base = String(opts.baseUrl).replace(/\/$/, '');
  var headers = { authorization: 'Bearer ' + opts.apiKey };
  var host = String(opts.hostSugoId || '');
  var http = opts.http;
  var now = opts.now;
  var controlCache = null;

  function call(method, path, body, timeoutMs) {
    var res = http.request(method, base + path, headers, body || null, timeoutMs || 20000);
    var ok = res.status >= 200 && res.status < 300;
    return { ok: ok, status: res.status, data: res.data, error: ok ? null : (res.data && res.data.error) || ('HTTP ' + res.status) };
  }
  function must(res, what) {
    if (!res.ok) throw new Error(what + ': ' + res.error);
    return res.data;
  }

  return {
    /** Panelden başlat/durdur kararı; 1 sn önbellek. Hata/çevrimdışı ⇒ aktif değil. */
    control: function (fresh) {
      if (!fresh && controlCache && now() - controlCache.at < 1000) return controlCache.value;
      var value;
      try {
        var r = call('GET', '/api/ext/control?host=' + encodeURIComponent(host) + '&v=' + encodeURIComponent(opts.version || ''), null, 5000);
        var h = r.ok && r.data ? r.data.host : null;
        value = h && String(h.sugoId) === host && typeof h.active === 'boolean'
          ? { synced: true, active: h.active, revision: h.revision, name: h.name, network: h.network }
          : { synced: false, active: false, missing: r.status === 404, error: r.error || 'geçersiz profil durumu' };
      } catch (e) { value = { synced: false, active: false, error: String(e && e.message || e) }; }
      controlCache = { at: now(), value: value };
      return value;
    },
    state: function (body) { try { call('POST', '/api/ext/state', Object.assign({ hostSugoId: host, version: opts.version }, body), 5000); } catch (e) { /* panel durumu kritik değil */ } },
    ingest: function (body) { return must(call('POST', '/api/ext/ingest', Object.assign({ hostSugoId: host }, body), 180000), 'ingest'); },
    nextJob: function (o) { return must(call('POST', '/api/ext/jobs/next', { host: host, replyOnly: !!o.replyOnly, android: true, visiblePeerIds: o.visiblePeerIds || [] }), 'jobs/next').job || null; },
    beginDelivery: function (id) { return must(call('POST', '/api/ext/jobs/' + id + '/begin-android'), 'begin-android').reserved === true; },
    complete: function (id) { return must(call('POST', '/api/ext/jobs/' + id + '/complete'), 'complete'); },
    fail: function (id, error, stopRetry) { return must(call('POST', '/api/ext/jobs/' + id + '/fail', { error: String(error), stopRetry: stopRetry === true }), 'fail'); },
    rejected: function (id, text) { return must(call('POST', '/api/ext/jobs/' + id + '/rejected', { text: text }), 'rejected'); },
    /** Profili sunucuda oluşturur (yoksa mevcut bir personadan kopyalanır) veya adını günceller; `hostSugoId` yerine `sugoId` verilebilir. */
    syncHost: function (sugoId, name) { return must(call('POST', '/api/ext/hosts/' + encodeURIComponent(String(sugoId)) + '/sync', { name: name || '' }), 'sync'); },
    ignore: function (peerSugoId, reason) { return must(call('POST', '/api/ext/ignore', { hostSugoId: host, peerSugoId: String(peerSugoId), reason: reason }), 'ignore'); },
    reportError: function (peerSugoId, error) { try { call('POST', '/api/ext/errors', { hostSugoId: host, peerSugoId: String(peerSugoId), error: String(error) }, 8000); } catch (e) { /* sunucuya ulaşılamıyor */ } }
  };
}

module.exports = { createApi: createApi };

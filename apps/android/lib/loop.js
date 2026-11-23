// Ana döngü: apps/extension/content.js tick() portu. Öncelik: hazır cevaplar → okunmamış → hazır iş → eşleşme → boşta.
// Bağımlılıklar enjekte edilir (d): ui, api, peers, now, sleep, log, dryRun.
var S = require('./screens');
var P = require('./parse');
var nav = require('./nav');
var PE = require('./peers');
var ID = S.ID;

var HANDLED_RETRY_MS = 60 * 1000;
var MATCH_RETRY_MS = 30 * 60 * 1000;
var RETRY_AFTER_ERROR_MS = 15 * 1000;

function createLoop(d) {
  var ui = d.ui; var api = d.api; var peers = d.peers; var log = d.log;
  var handled = {};   // satır imzası -> zaman
  var greeted = {};   // peerId -> zaman
  var retryAt = {};   // ad -> bu zamandan önce açma
  var skipped = {};   // peerId -> true (kadın/engelli)
  var scan = { active: false, atBottom: false, lastFullAt: -1e12 };

  function snap() { return ui.snapshot(); }
  function listRows() {
    var s = snap();
    return { snap: s, rows: P.chatRows(s.root, s.size).filter(function (r) { return r.fullyVisible; }) };
  }
  function cachedId(row, dup) {
    var p = peers.lookup(row.name, !!dup[PE.normName(row.name)]);
    return p ? p.id : null;
  }
  function recent(map, key, ms) { return map[key] && d.now() - map[key] < ms; }

  /** Liste dışında kalındıysa (sohbet/profil) güvenli şekilde listeye döner; liste/bilinmeyen ekranda geri tuşuna basılmaz. */
  function recover() {
    var cur = nav.screenOf(ui);
    if (cur.name === 'list') return true;
    if (cur.name === 'unknown') {
      if (nav.gotoKnown(ui)) return recover();
      var ids = []; var sn = snap(); require('./tree').walk(sn.root, function (n) { if (n.id && ids.length < 25 && ids.indexOf(n.id) < 0) ids.push(n.id); });
      log('bilinmeyen ekran, Mesajlar sekmesi yok; bekleniyor; ids=' + ids.join(','));
      return false;
    }
    return !!nav.backTo(ui, 'list', 4000);
  }

  function findRow(name, preview) {
    var rows = listRows().rows;
    for (var i = 0; i < rows.length; i++) if (rows[i].name === name && rows[i].preview === preview) return rows[i];
    return null;
  }

  function pageSig(rows) { return rows.map(function (r) { return r.name; }).join('|'); }
  function swipeList(down) {
    var s = snap(); var w = s.size.width; var h = s.size.height;
    if (down) ui.swipe(w / 2, h * 0.72, w / 2, h * 0.34, 450); else ui.swipe(w / 2, h * 0.34, w / 2, h * 0.76, 300);
    ui.sleep(450);
  }
  /** Listeyi en başa getirir (görünür satırlar değişmeyene kadar). */
  function scrollToTop() {
    var prev = pageSig(listRows().rows);
    for (var i = 0; i < 12; i++) {
      swipeList(false);
      var cur = pageSig(listRows().rows);
      if (cur === prev) return;
      prev = cur;
    }
  }

  var lastBeat = { at: -1e12, state: '' };
  /** Panel durumu: değişimde en çok 5 sn'de bir, aksi halde 30 sn'de bir gönderilir (her çağrı ağ bekletir). */
  function setState(state, detail) {
    var gap = d.now() - lastBeat.at;
    if (gap < 5000 || (lastBeat.state === state && gap < 30000)) return;
    lastBeat = { at: d.now(), state: state };
    api.state({ state: state, detail: detail || '', lastActivityAt: d.now() });
  }

  /** Metni yazıp gönderir; giden mesaj sayısının arttığı doğrulanmadan başarılı sayılmaz. */
  function typeAndSend(text) {
    if (!api.control(true).active) throw new Error('Profil panelden durduruldu.');
    var s0 = snap();
    var input = require('./tree').visibleById(s0.root, ID.chatInput, s0.size.width);
    if (!input) throw new Error('mesaj kutusu bulunamadı');
    var before = P.chatMessages(s0.root, s0.size).filter(function (m) { return m.dir === 'out'; }).length;
    // Girişe dokun, klavyenin açılmasını (odak veya giriş kutusunun yukarı kayması) bekle, sonra yaz.
    ui.click(input);
    var kbEnd = d.now() + 3000;
    var focusedInput = null;
    for (;;) {
      var sk = snap();
      focusedInput = require('./tree').visibleById(sk.root, ID.chatInput, sk.size.width);
      if (focusedInput && (focusedInput.focused || focusedInput.t < input.t)) break;
      if (d.now() >= kbEnd) throw new Error('klavye açılmadı');
      ui.sleep(150);
    }
    ui.sleep(150);
    ui.setText(focusedInput, text);
    ui.sleep(150);
    var s1 = snap();
    var btn = require('./tree').visibleById(s1.root, ID.chatSend, s1.size.width);
    if (!btn) throw new Error('gönder düğmesi bulunamadı');
    if (!api.control(true).active) throw new Error('Profil panelden durduruldu.');
    ui.click(btn);
    var end = d.now() + 5000;
    for (;;) {
      var s2 = snap();
      var n = P.chatMessages(s2.root, s2.size).filter(function (m) { return m.dir === 'out'; }).length;
      if (n > before) return true;
      if (d.now() >= end) throw new Error('mesaj gönderilemedi (giden mesaj sayısı artmadı)');
      ui.sleep(120);
    }
  }

  /** Açık sohbette işi gönderir ve sunucuya bildirir. */
  function sendJob(job) {
    if (job.sendText === false) { api.fail(job.id, 'android: medya gönderilemiyor'); return false; }
    try { typeAndSend(job.text); }
    catch (e) { api.fail(job.id, e.message); throw e; }
    api.complete(job.id);
    log('gönderildi ' + job.peerSugoId + ': ' + job.text);
    d.lastSentAt = d.now();
    return true;
  }

  /** Sohbeti açık okur, sunucuya iletir, hazır iş varsa gönderir; sonunda listeye doğrulayarak döner. */
  function handleRow(row, dup) {
    var name = row.name;
    var info = peers.lookup(name, !!dup[PE.normName(name)]);
    if (!info) {
      setState('profil okuyor', name);
      info = nav.readPeerId(ui, row);
      log('profil ' + name + ': id=' + info.id + ' cinsiyet=' + info.gender + (info.error ? ' hata=' + info.error : ''));
      if (info.error && !info.id) { api.reportError('0', 'profil okunamadı: ' + name + ' (' + info.error + ')'); retryAt[name] = d.now() + RETRY_AFTER_ERROR_MS; recover(); return true; }
      peers.remember(name, info, !!dup[PE.normName(name)]);
      if (info.error) { recover(); return true; }
      row = findRow(name, row.preview) || row;
    }
    if (d.allowPeers && d.allowPeers.length && d.allowPeers.indexOf(String(info.id)) < 0) { log('allowPeers dışında: ' + info.id); handled[PE.normName(row.name)] = d.now(); return true; }
    if (skipped[info.id]) {
      log('atlandı (kadın/ignore): ' + info.id); handled[PE.normName(row.name)] = d.now(); return false; }
    if (info.gender === 'female') {
      if (!d.dryRun) api.ignore(info.id, 'female');
      skipped[info.id] = true; log('kadın profili atlandı: ' + info.id);
      return true;
    }
    setState('sohbet okuyor', info.id);
    var opened = nav.openChat(ui, row);
    if (!opened) { retryAt[name] = d.now() + RETRY_AFTER_ERROR_MS; api.reportError(info.id, 'sohbet açılmadı'); recover(); return true; }
    try {
      var messages = P.chatMessages(opened.root, opened.size);
      var emptyChat = messages.length === 0;
      if (d.dryRun) { log('DRY_RUN ' + info.id + ' ' + name + ' mesaj=' + messages.length + (row.isMatch ? ' eşleşme' : '')); }
      else {
        var body = { peerSugoId: info.id, peerName: name, voiceEnabled: false, messages: messages };
        if (row.online) body.online = true;
        if (emptyChat) body.emptyChat = true;
        var res = api.ingest(body);
        var last = messages.length ? messages[messages.length - 1] : null;
        if (res && !res.job && last && last.dir === 'in') {
          var out = messages.map(function (m) { return m.dir; }).lastIndexOf('out');
          res = api.ingest(Object.assign({}, body, { unansweredFrom: out + 1 }));
        }
        log('ingest ' + info.id + ' mesaj=' + messages.length + ' iş=' + (res && res.job ? res.job.kind + '/' + res.job.status : 'yok'));
        if (res && res.job && res.job.status === 'failed') throw new Error(res.job.error || 'cevap üretimi başarısız');
        if (res && res.job && res.job.status === 'pending') {
          var job = api.nextJob({ replyOnly: res.job.kind !== 'welcome' && messages.length > 0, visiblePeerIds: [info.id] });
          if (job) sendJob(job);
        }
        if (emptyChat) greeted[info.id] = d.now();
      }
      handled[PE.normName(row.name)] = d.now();
    } catch (e) {
      log('sohbet hatası ' + info.id + ': ' + e.message);
      api.reportError(info.id, e.message);
      retryAt[name] = d.now() + RETRY_AFTER_ERROR_MS;
    }
    return !!(recover() || true);
  }

  /** Sunucudan gelen işi (peerSugoId'ye göre) listede bulup açık sohbette gönderir. */
  function runJob(job, rows, dup) {
    log('iş alındı ' + job.peerSugoId + ' ' + job.kind);
    var row = null;
    for (var i = 0; i < rows.length; i++) if (cachedId(rows[i], dup) === String(job.peerSugoId)) { row = rows[i]; break; }
    if (!row) { api.fail(job.id, 'sohbet listede yok: ' + job.peerSugoId); return true; }
    var opened = nav.openChat(ui, row);
    if (!opened) { api.fail(job.id, 'sohbet açılmadı'); recover(); return true; }
    try { sendJob(job); handled[PE.normName(row.name)] = d.now(); }
    catch (e) { log('iş hatası: ' + e.message); }
    recover();
    return true;
  }

  function normalRow(rows) {
    var pick = null;
    for (var i = rows.length - 1; i >= 0; i--) {   // en alttaki = en eski
      var r = rows[i];
      if (r.isMatch || r.unread <= 0) continue;
      if (retryAt[r.name] && d.now() < retryAt[r.name]) continue;
      if (recent(handled, PE.normName(r.name), HANDLED_RETRY_MS)) continue;
      pick = r; break;
    }
    return pick;
  }
  function matchRow(rows) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.isMatch) continue;
      if (retryAt[r.name] && d.now() < retryAt[r.name]) continue;
      if (recent(handled, PE.normName(r.name), r.unread > 0 ? 5 * 60 * 1000 : MATCH_RETRY_MS)) continue;
      return r;
    }
    return null;
  }

  /** true: iş yapıldı (beklemeden devam et). */
  function tick() {
    var ctl = api.control();
    if (!ctl.active) { setState('durduruldu', ctl.error || 'panelden durduruldu'); return false; }
    if (!recover()) return false;
    var lr = listRows();
    var rows = lr.rows;
    var dup = PE.duplicateNames(rows);
    var visibleIds = [];
    for (var i = 0; i < rows.length; i++) { var id = cachedId(rows[i], dup); if (id) visibleIds.push(id); }

    if (!d.dryRun) {
      var reply = api.nextJob({ replyOnly: true, visiblePeerIds: visibleIds });
      if (reply) return runJob(reply, rows, dup);
    }
    var normal = normalRow(rows);
    if (normal) return handleRow(normal, dup);
    if (!d.dryRun) {
      var any = api.nextJob({ replyOnly: false, visiblePeerIds: visibleIds });
      if (any) return runJob(any, rows, dup);
    }
    var match = matchRow(rows);
    if (match) return handleRow(match, dup);
    // Aşağıdaki okunmamışlar için listeyi sayfa sayfa tara; sona gelince başa dön, tam taramalar arası 60 sn.
    if (!scan.atBottom && (scan.active || d.now() - scan.lastFullAt > 60000)) {
      scan.active = true;
      var before = pageSig(rows);
      swipeList(true);
      if (pageSig(listRows().rows) === before) scan.atBottom = true;
      return true;
    }
    if (scan.active) {
      scrollToTop();
      scan.active = false; scan.atBottom = false; scan.lastFullAt = d.now();
    }
    // Boşta: saat sınırı içinde Yakınlarda'dan selam (hi) gönder.
    if (d.outreach && !d.dryRun && d.outreach.step()) { setState('hi', 'yakınlarda selam'); return true; }
    setState('boşta', 'yeni mesaj/eşleşme bekleniyor');
    return false;
  }

  return { tick: tick, state: { handled: handled, skipped: skipped, greeted: greeted, retryAt: retryAt } };
}

module.exports = { createLoop: createLoop };

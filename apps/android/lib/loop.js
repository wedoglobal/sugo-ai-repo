// Ana döngü: apps/extension/content.js tick() portu. Öncelik: hazır cevaplar → okunmamış → hazır iş → eşleşme → boşta.
// Bağımlılıklar enjekte edilir (d): ui, api, peers, now, sleep, log, dryRun.
var S = require('./screens');
var P = require('./parse');
var nav = require('./nav');
var PE = require('./peers');
var tree = require('./tree');
var ID = S.ID;

var HANDLED_RETRY_MS = 60 * 1000;
var MATCH_RETRY_MS = 30 * 60 * 1000;
var RETRY_AFTER_ERROR_MS = 15 * 1000;
var UNREAD_TAB_CHECK_MS = 15 * 1000;

function createLoop(d) {
  var ui = d.ui; var api = d.api; var peers = d.peers; var log = d.log;
  var handled = {};   // satır imzası -> zaman
  var greeted = {};   // peerId -> zaman
  var retryAt = {};   // ad -> bu zamandan önce açma
  var skipped = {};   // peerId -> true (kadın/engelli)
  var deliveryKey = 'android-delivery:' + (d.hostId || '');
  var deliveries = d.store.get(deliveryKey) || {};
  var deliveryRetryAt = {};
  var unreadSince = {};   // ad -> okunmamış rozetin ilk görüldüğü an (cevap gecikmesi günlüğü için)
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

  /** Okunmamış rozet ilk göründüğünde zamanı tutar; rozet kalkınca siler. */
  function trackUnread(rows) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.unread > 0) { if (!unreadSince[r.name]) unreadSince[r.name] = d.now(); }
      else delete unreadSince[r.name];
    }
  }
  function waitedSec(name) { return unreadSince[name] ? Math.round((d.now() - unreadSince[name]) / 1000) : 0; }

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

  function saveDelivery(peer, receipt) {
    var next = Object.assign({}, deliveries);
    if (receipt) next[peer] = receipt;
    else delete next[peer];
    d.store.set(deliveryKey, next);
    deliveries = next;
  }

  /** Tıklama sonucu sunucuya ulaşana kadar aynı kişiye yeni iş alınmaz. */
  function reportDelivery(peer) {
    var receipt = deliveries[peer];
    if (!receipt || d.now() < (deliveryRetryAt[peer] || 0)) return;
    try {
      if (receipt.sent) api.complete(receipt.id);
      else api.fail(receipt.id, receipt.error, receipt.stop);
      saveDelivery(peer, null);
      delete deliveryRetryAt[peer];
    } catch (error) {
      deliveryRetryAt[peer] = d.now() + RETRY_AFTER_ERROR_MS;
      log('gönderim sonucu tekrar bildirilecek: ' + error.message);
    }
  }

  function chatRowsFor(s, name) {
    if (P.chatTitle(s.root, s.size) !== name) throw new Error('android: hedef sohbet doğrulanamadı');
    return P.chatMessageRows(s.root, s.size);
  }

  function assertUnanswered(job, rows) {
    if (job.kind !== 'reply') return;
    var last = rows[rows.length - 1];
    if (!last || last.dir !== 'out' || last.text !== String(job.text).trim()) return;
    if (last.status === 'failed') throw new Error('sugo filtresi mesajları reddetti: Android ünlem işareti');
    if (last.status === 'pending') throw new Error('android: önceki gönderimin sonucu belirsiz');
    throw new Error('android: yanıt zaten sohbette görünüyor');
  }

  function matchingOut(rows, text) {
    return rows.filter(function (m) { return m.dir === 'out' && m.text === text; });
  }

  /** Yalnız hedef metnin yeni balonu ve durum simgesi üzerinden gönderimi doğrular. */
  function typeAndSend(job, name, peer) {
    if (!api.control(true).active) throw new Error('Profil panelden durduruldu.');
    var text = String(job.text || '').trim();
    if (!text) throw new Error('android: boş gönderim metni');
    var s0 = snap();
    assertUnanswered(job, chatRowsFor(s0, name));
    var input = tree.visibleById(s0.root, ID.chatInput, s0.size.width);
    if (!input) throw new Error('android: mesaj kutusu bulunamadı');
    ui.click(input);
    var kbEnd = d.now() + 3000;
    var focusedInput;
    for (;;) {
      var sk = snap();
      focusedInput = tree.visibleById(sk.root, ID.chatInput, sk.size.width);
      if (focusedInput && (focusedInput.focused || focusedInput.t < input.t)) break;
      if (d.now() >= kbEnd) throw new Error('android: klavye açılmadı');
      ui.sleep(150);
    }
    ui.sleep(150);
    ui.setText(focusedInput, text);
    ui.sleep(150);
    var s1 = snap();
    if (!tree.visibleById(s1.root, ID.chatSend, s1.size.width)) throw new Error('android: gönder düğmesi bulunamadı');
    if (!api.control(true).active) throw new Error('Profil panelden durduruldu.');
    saveDelivery(peer, { id: job.id, error: 'android: teslim belirsiz', stop: true });
    if (!api.beginDelivery(job.id)) { saveDelivery(peer, null); return false; }

    var ready = snap();
    var before = chatRowsFor(ready, name);
    assertUnanswered(job, before);
    var button = tree.visibleById(ready.root, ID.chatSend, ready.size.width);
    if (!button) throw new Error('android: gönder düğmesi bulunamadı');
    var countBefore = matchingOut(before, text).length;
    var tail = before[before.length - 1];
    ui.click(button);
    var end = d.now() + 6000;
    var visibleSince = null;
    for (;;) {
      var after = chatRowsFor(snap(), name);
      var matches = matchingOut(after, text);
      var candidate = matches[matches.length - 1];
      var previous = candidate && after[after.indexOf(candidate) - 1];
      var appended = candidate && (matches.length > countBefore || (previous && tail
        && previous.dir === tail.dir && previous.text === tail.text && (tail.dir !== 'out' || tail.text !== text)));
      if (appended && candidate.status === 'failed') throw new Error('sugo filtresi mesajları reddetti: Android ünlem işareti');
      if (appended && candidate.status === 'visible') {
        if (visibleSince === null) visibleSince = d.now();
        if (d.now() - visibleSince >= 1200) return true;
      } else visibleSince = null;
      if (d.now() >= end) throw new Error('android: tıklama sonrası teslim doğrulanamadı');
      ui.sleep(120);
    }
  }

  function stopDelivery(job, error, stop) {
    var peer = String(job.peerSugoId);
    saveDelivery(peer, { id: job.id, error: error, stop: stop });
    reportDelivery(peer);
  }

  /** Gönderim ve sunucu onayı birbirinden bağımsız tamamlanır. */
  function sendJob(job, name) {
    var peer = String(job.peerSugoId);
    if (deliveries[peer]) return false;
    if (job.sendText === false) { stopDelivery(job, 'android: medya gönderilemiyor', true); return false; }
    try {
      if (!typeAndSend(job, name, peer)) return false;
    } catch (error) {
      stopDelivery(job, error.message, !!deliveries[peer] || error.message !== 'Profil panelden durduruldu.');
      throw error;
    }
    saveDelivery(peer, { id: job.id, sent: true });
    d.lastSentAt = d.now();
    reportDelivery(peer);
    log('gönderildi ' + peer + ' okunmamış_bekleme=' + waitedSec(name) + 'sn');
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
        var body = { peerSugoId: info.id, peerName: name, voiceEnabled: false, messages: messages, match: row.isMatch };
        if (row.online && !row.isMatch) body.online = true;
        if (emptyChat) body.emptyChat = true;
        var ingestAt = d.now();
        var res = api.ingest(body);
        log('ingest ' + info.id + ' mesaj=' + messages.length + ' iş=' + (res && res.job ? res.job.kind + '/' + res.job.status : 'yok')
          + ' süre=' + Math.round((d.now() - ingestAt) / 1000) + 'sn okunmamış_bekleme=' + waitedSec(name) + 'sn');
        if (res && res.job && res.job.status === 'failed') throw new Error(res.job.error || 'cevap üretimi başarısız');
        if (res && res.job && res.job.status === 'pending') {
          var job = api.nextJob({ replyOnly: res.job.kind !== 'welcome' && messages.length > 0, visiblePeerIds: [info.id] });
          if (job) sendJob(job, name);
        }
        if (emptyChat) greeted[info.id] = d.now();
      }
      handled[PE.normName(row.name)] = d.now();
    } catch (e) {
      log('sohbet hatası ' + info.id + ': ' + e.message);
      retryAt[name] = d.now() + RETRY_AFTER_ERROR_MS;
    }
    return !!(recover() || true);
  }

  /** Sunucudan gelen işi (peerSugoId'ye göre) listede bulup açık sohbette gönderir. */
  function runJob(job, rows, dup) {
    log('iş alındı ' + job.peerSugoId + ' ' + job.kind);
    var row = null;
    for (var i = 0; i < rows.length; i++) if (cachedId(rows[i], dup) === String(job.peerSugoId)) { row = rows[i]; break; }
    if (!row) { stopDelivery(job, 'sohbet listede yok: ' + job.peerSugoId, false); return true; }
    var opened = nav.openChat(ui, row);
    if (!opened) { stopDelivery(job, 'android: hedef sohbet açılamadı', true); recover(); return true; }
    try { sendJob(job, row.name); handled[PE.normName(row.name)] = d.now(); }
    catch (e) { log('iş hatası: ' + e.message); }
    recover();
    return true;
  }

  function normalRow(rows, dup) {
    var pick = null;
    for (var i = rows.length - 1; i >= 0; i--) {   // en alttaki = en eski
      var r = rows[i];
      if (r.isMatch || r.unread <= 0 || deliveries[cachedId(r, dup)]) continue;
      if (retryAt[r.name] && d.now() < retryAt[r.name]) continue;
      if (recent(handled, PE.normName(r.name), HANDLED_RETRY_MS)) continue;
      pick = r; break;
    }
    return pick;
  }
  function matchRow(rows, dup) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.isMatch || deliveries[cachedId(r, dup)]) continue;
      if (retryAt[r.name] && d.now() < retryAt[r.name]) continue;
      if (recent(handled, PE.normName(r.name), r.unread > 0 ? 5 * 60 * 1000 : MATCH_RETRY_MS)) continue;
      return r;
    }
    return null;
  }

  /** true: iş yapıldı (beklemeden devam et). */
  function tick() {
    if (!d.dryRun) {
      Object.keys(deliveries).forEach(reportDelivery);
    }
    var ctl = api.control();
    if (!ctl.active) { setState('durduruldu', ctl.error || 'panelden durduruldu'); return false; }
    if (!recover()) return false;
    var lr = listRows();
    var rows = lr.rows;
    var dup = PE.duplicateNames(rows);
    trackUnread(rows);
    var visibleIds = [];
    for (var i = 0; i < rows.length; i++) { var id = cachedId(rows[i], dup); if (id && !deliveries[id]) visibleIds.push(id); }

    if (!d.dryRun) {
      var reply = api.nextJob({ replyOnly: true, visiblePeerIds: visibleIds });
      if (reply) return runJob(reply, rows, dup);
    }
    var normal = normalRow(rows, dup);
    if (normal) return handleRow(normal, dup);
    if (!d.dryRun) {
      var any = api.nextJob({ replyOnly: false, visiblePeerIds: visibleIds });
      if (any) return runJob(any, rows, dup);
    }
    var match = matchRow(rows, dup);
    if (match) return handleRow(match, dup);
    // Okunmamış sekmesi varsa ekran dışındaki okunmamışlar oradan bulunur (sayfa taraması yerine); iş bitince Hepsi'ne dönülür.
    var unreadTab = tree.visibleById(lr.snap.root, ID.listTabUnread, lr.snap.size.width);
    if (unreadTab) {
      if (unreadTab.selected) {
        nav.selectListTab(ui, ID.listTabAll);
        scan.lastFullAt = d.now();
        return true;
      }
      var badge = tree.findById(lr.snap.root, ID.tabMessagesBadge);
      var hasUnread = !badge || String(badge.text || '').trim() !== '';
      if (hasUnread && d.now() - scan.lastFullAt > UNREAD_TAB_CHECK_MS) {
        scan.lastFullAt = d.now();
        if (nav.selectListTab(ui, ID.listTabUnread)) { log('okunmamış sekmesi taranıyor'); return true; }
      }
    }
    // Aşağıdaki okunmamışlar için listeyi sayfa sayfa tara; sona gelince başa dön, tam taramalar arası 60 sn.
    if (!unreadTab && !scan.atBottom && (scan.active || d.now() - scan.lastFullAt > 60000)) {
      scan.active = true;
      var before = pageSig(rows);
      swipeList(true);
      if (pageSig(listRows().rows) === before) scan.atBottom = true;
      return true;
    }
    if (!unreadTab && scan.active) {
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

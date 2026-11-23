// Boşta selam (hi) gönderimi: Ana sayfa → Yakınlarda listesindeki kartların Hi düğmesine doğrudan basar.
// Hız sınırı: gün içinde saatte HI_BASE, akşam 19:00-22:00 arası saatte HI_PEAK (kayan 60 dk penceresi) ve gönderimler arası rastgele aralık.
var tree = require('./tree');
var S = require('./screens');
var nav = require('./nav');
var PE = require('./peers');
var ID = S.ID;

var HOUR_MS = 3600 * 1000;
var SEEN_TTL_MS = 12 * HOUR_MS;
var FAIL_BACKOFF_MS = 5 * 60 * 1000;
var MAX_PAGES = 6;

function createOutreach(d) {
  var ui = d.ui; var api = d.api; var store = d.store; var log = d.log;
  var base = d.hiBase == null ? 3 : d.hiBase;
  var peak = d.hiPeak == null ? 8 : d.hiPeak;
  var peakFrom = d.peakFrom == null ? 19 : d.peakFrom;
  var peakTo = d.peakTo == null ? 22 : d.peakTo;
  var rnd = d.random || Math.random;
  var seen = {};       // normalize ad -> zaman (bu oturumda bakılıp atlananlar)
  var nextAt = 0;

  function sentLog() {
    var all = store.get('hi:log') || [];
    var cut = d.now() - HOUR_MS;
    return all.filter(function (t) { return t > cut; });
  }
  function doneMap() { return store.get('hi:done') || {}; }
  function capNow() {
    var h = d.hour();
    return h >= peakFrom && h < peakTo ? peak : base;
  }
  /** Şu an yeni hi atılabilir mi? (saatlik tavan + gönderimler arası aralık) */
  function allowed() {
    if (d.now() < nextAt) return false;
    return sentLog().length < capNow();
  }
  function record(key) {
    var l = sentLog(); l.push(d.now()); store.set('hi:log', l);
    var m = doneMap(); m[key] = d.now();
    var keys = Object.keys(m);
    if (keys.length > 3000) { keys.sort(function (a, b) { return m[a] - m[b]; }).slice(0, keys.length - 3000).forEach(function (k) { delete m[k]; }); }
    store.set('hi:done', m);
    // Kalan pencere payına göre rastgele aralık: ortalama saatlik tavana yayılır.
    var gap = HOUR_MS / capNow();
    nextAt = d.now() + gap * (0.6 + 0.8 * rnd());
  }

  function visibleCards(snap) {
    var tabTop = (tree.visibleById(snap.root, ID.tabMessages, snap.size.width) || { t: snap.size.height }).t;
    return tree.findAll(snap.root, function (n) { return n.id === ID.nearbyCard && tree.isVisible(n, snap.size.width) && n.t >= 230 && n.b <= tabTop; });
  }

  /** Ana sayfa → Yakınlarda; kart listesi görünene dek bekler. */
  function openNearby() {
    var cur = nav.screenOf(ui);
    var snap = cur.snap;
    if (!visibleCards(snap).length || !tree.visibleById(snap.root, ID.homeNearbyTab, snap.size.width)) {
      var home = tree.visibleById(snap.root, ID.tabHome, snap.size.width);
      if (!home) return null;
      ui.click(home);
    }
    var end = ui.now() + 25000, clickedTab = false;
    while (ui.now() < end) {
      snap = ui.snapshot();
      var tab = tree.visibleById(snap.root, ID.homeNearbyTab, snap.size.width);
      if (tab && !clickedTab) { ui.click(tab); clickedTab = true; ui.sleep(600); continue; }
      if (clickedTab && visibleCards(snap).length) return snap;
      ui.sleep(250);
    }
    return null;
  }

  function leaveToList() {
    // Profilden çık, Yakınlarda'dan Mesajlar listesine geç.
    var cur = nav.screenOf(ui);
    if (cur.name === 'profile') nav.backTo(ui, 'unknown', 3000);
    nav.gotoList(ui) || nav.gotoKnown(ui);
  }

  /** Kartın Hi düğmesi; selam atılmış kartta düğme "seçili" (sohbet simgesi) olur. */
  function hiButton(card) {
    var btn = tree.descendant(card, ID.nearbyHi);
    return btn && btn.clickable ? btn : null;
  }
  function cardByName(snap, key) {
    var cards = visibleCards(snap);
    for (var i = 0; i < cards.length; i++) {
      var n = tree.descendant(cards[i], ID.nearbyName);
      if (n && PE.normName(String(n.text || '')) === key) return cards[i];
    }
    return null;
  }

  /** Kartın Hi düğmesine doğrudan basar; düğme "seçili"ye dönünce gönderildi sayılır. */
  function pressHi(key, btn) {
    if (!api.control(true).active) return 'durduruldu';
    ui.click(btn);
    var end = ui.now() + 12000;
    while (ui.now() < end) {
      ui.sleep(300);
      var s = ui.snapshot();
      if (S.detect(s.root, s.size.width) === 'profile' || S.detect(s.root, s.size.width) === 'chat') return 'ok';
      var card = cardByName(s, key);
      var b = card ? tree.descendant(card, ID.nearbyHi) : null;
      if (b && b.selected) return 'ok';
    }
    return 'doğrulanamadı';
  }

  /** Yakınlarda'daki henüz selam atılmamış ilk karta Hi atar. true: ekranlarda iş yapıldı. */
  function step() {
    if (d.hiEnabled === false || !allowed()) return false;
    var snap = openNearby();
    if (!snap) { log('hi: Yakınlarda açılmadı'); nextAt = d.now() + FAIL_BACKOFF_MS; leaveToList(); return true; }
    var done = doneMap();
    for (var page = 0; page < MAX_PAGES; page++) {
      var cards = visibleCards(snap);
      for (var i = 0; i < cards.length; i++) {
        var nameNode = tree.descendant(cards[i], ID.nearbyName);
        var name = nameNode ? String(nameNode.text || '') : '';
        var key = PE.normName(name);
        var btn = hiButton(cards[i]);
        if (!key || !btn || btn.selected || done[key] || (seen[key] && d.now() - seen[key] < SEEN_TTL_MS)) continue;
        seen[key] = d.now();
        if (d.dryRun) { log('DRY_RUN hi ' + name); continue; }
        var res = pressHi(key, btn);
        if (res === 'ok') { record(key); log('hi gönderildi ' + name); }
        else { log('hi: ' + res + ' ' + name); nextAt = d.now() + FAIL_BACKOFF_MS; }
        // Hi sonrası sohbet/profil açılırsa Yakınlarda'dan çıkıp listeye dönülür.
        var after = nav.screenOf(ui);
        if (after.name === 'chat' || after.name === 'profile') nav.backTo(ui, 'unknown', 3000);
        leaveToList();
        return true;
      }
      // Bu sayfada uygun kart yok: aşağı kaydır, değişmediyse bitir.
      var sig = function (sn) { return visibleCards(sn).map(function (c) { return c.t; }).join(','); };
      var before = sig(snap);
      ui.swipe(snap.size.width / 2, snap.size.height * 0.72, snap.size.width / 2, snap.size.height * 0.28, 450);
      ui.sleep(700);
      snap = ui.snapshot();
      if (sig(snap) === before) break;
    }
    nextAt = d.now() + 10 * 60 * 1000;
    leaveToList();
    return true;
  }

  return { step: step, allowed: allowed, capNow: capNow, _seen: seen };
}

module.exports = { createOutreach: createOutreach };

// Ekran doğrulamalı gezinme. Her geçişten sonra hedef ekranın gerçekten açıldığı beklenir;
// beklenen ekran gelmezse işlem başarısız sayılır, kör tıklama/geri yapılmaz.
//
// `ui` bağdaştırıcısı (AutoJS6'da lib/ui.js, testte sahte):
//   ui.snapshot() -> { root, size }   anlık erişilebilirlik ağacı
//   ui.click(node)                    düğümün merkezine dokun
//   ui.back()                         sistem geri tuşu
//   ui.sleep(ms), ui.now()
var tree = require('./tree');
var S = require('./screens');
var P = require('./parse');
var ID = S.ID;

var POLL_MS = 60;
/** Yavaş bağlantıda ekran/profil verisi geç gelir; sayfa açılışı ve veri yüklenmesi için üst sınır. */
var SLOW_MS = 25000;

/** Uygulamanın açılış/ödül pencereleri (ör. günlük check-in) kapatma düğmesiyle (`close`) geçilir. */
function dismissPopup(ui, snap) {
  var close = tree.visibleById(snap.root, S.ID.popupClose, snap.size.width);
  if (!close) return snap;
  ui.click(close);
  ui.sleep(250);
  return ui.snapshot();
}

function screenOf(ui) {
  var snap = dismissPopup(ui, ui.snapshot());
  return { name: S.detect(snap.root, snap.size.width), snap: snap };
}

/** Hedef ekran gelene kadar bekler; gelirse anlık görüntüyü, gelmezse null döndürür. */
function waitForScreen(ui, want, timeoutMs) {
  var end = ui.now() + timeoutMs;
  var wants = Array.isArray(want) ? want : [want];
  for (;;) {
    var cur = screenOf(ui);
    if (wants.indexOf(cur.name) >= 0) return cur.snap;
    if (ui.now() >= end) return null;
    ui.sleep(POLL_MS);
  }
}

/**
 * Geri dönüş: yalnız sohbet/profil/ayar ekranındayken yapılır. Listede geri tuşu uygulamadan çıkma
 * onayı açar, bu yüzden listedeyken asla basılmaz. Önce ekrandaki geri düğmesi, olmazsa sistem geri tuşu denenir.
 */
function backTo(ui, target, timeoutMs) {
  var limit = timeoutMs || 4000;
  var clicked = false;
  for (var attempt = 0; attempt < 4; attempt++) {
    var cur = screenOf(ui);
    if (cur.name === target) return cur.snap;
    if (cur.name === 'unknown' || cur.name === 'list') return null;
    if (cur.name === 'chat') {
      // Klavye açıksa ilk geri yalnız klavyeyi kapatır; önce onu kapat, sonra sohbetten çık.
      var input = tree.visibleById(cur.snap.root, ID.chatInput, cur.snap.size.width);
      if (input && input.focused) { ui.back(); ui.sleep(300); continue; }
    }
    var btn = tree.visibleById(cur.snap.root, cur.name === 'profile' ? ID.profileBack : ID.chatBack, cur.snap.size.width);
    if (btn && !clicked) { clicked = true; ui.click(btn); } else ui.back();
    var snap = waitForScreen(ui, [target], limit);
    if (snap) return snap;
  }
  return null;
}

/** Listeden satırı açar; sohbet ekranı gelmezse null. */
function sameName(a, b) {
  var x = String(a || '').replace(/\s+/g, ' ').replace(/[….]+$/, '').trim();
  var y = String(b || '').replace(/\s+/g, ' ').replace(/[….]+$/, '').trim();
  if (!x || !y) return true;
  return x === y || x.indexOf(y) === 0 || y.indexOf(x) === 0;
}

/** Satırı açar; ekran sohbet olmalı VE başlık satırın adıyla eşleşmeli, yoksa geri dönüp null döner. */
function openChat(ui, row) {
  ui.click(row.node);
  var snap = waitForScreen(ui, 'chat', SLOW_MS);
  if (!snap) { gotoKnown(ui); return null; }
  if (!sameName(P.chatTitle(snap.root, snap.size), row.name)) { backTo(ui, 'list', 4000); return null; }
  return snap;
}

/** Profil iskeleti hemen gelir, sugo id ve cinsiyet rozeti ağdan sonra dolar: ikisi de gelene (veya süre bitene) dek bekler. */
function profileData(ui, snap) {
  var id = P.profileId(snap.root);
  var gender = P.gender(snap.root, snap.size);
  var loadEnd = ui.now() + SLOW_MS;
  while ((!id || !gender) && ui.now() < loadEnd) {
    ui.sleep(250);
    snap = ui.snapshot();
    if (S.detect(snap.root, snap.size.width) !== 'profile') break;
    id = id || P.profileId(snap.root);
    gender = gender || P.gender(snap.root, snap.size);
  }
  return { id: id, gender: gender, snap: snap };
}

/** Satırın avatarına dokunup profil sayfasından sugo id ve cinsiyeti okur, sonra listeye döner. Dönüş doğrulanamazsa hata. */
function readPeerId(ui, row) {
  var avatar = tree.findById(row.node, ID.itemAvatar);
  if (!avatar) return { id: null, gender: null, error: 'avatar bulunamadı' };
  ui.click(avatar);
  var snap = waitForScreen(ui, 'profile', SLOW_MS);
  if (!snap) return { id: null, gender: null, error: 'profil açılmadı' };
  var data = profileData(ui, snap);
  var id = data.id; var gender = data.gender;
  var back = backTo(ui, 'list', 4000);
  if (!back) return { id: id, gender: gender, error: 'listeye dönülemedi' };
  if (id && !gender) return { id: null, gender: null, error: 'cinsiyet rozeti yüklenmedi' };
  return { id: id, gender: gender, error: id ? null : 'profilde sugo id yok' };
}

/** Bilinmeyen ekrandan (Bildirimler, Anlar, ...) bilinen bir ekrana çıkar: alt sekme varsa Mesajlar'a geç, yoksa geri tuşu. */
function gotoKnown(ui) {
  for (var i = 0; i < 4; i++) {
    var cur = screenOf(ui);
    if (cur.name !== 'unknown') return cur.snap;
    var tab = tree.visibleById(cur.snap.root, ID.tabMessages, cur.snap.size.width);
    if (tab) { ui.click(tab); var s = waitForScreen(ui, 'list', 3000); if (s) return s; }
    else { ui.back(); var k = waitForScreen(ui, ['list', 'chat', 'profile', 'chat-settings'], 2500); if (k) return k; }
  }
  return null;
}

/** Sugo ön planda değilse başlatır ve ön plana gelene kadar bekler; gelmezse false döner. */
function openSugo(ui, timeout) {
  if (ui.inApp()) return true;
  try { if (ui.launch() === false) return false; } catch (e) { return false; }
  var end = ui.now() + timeout;
  while (!ui.inApp() && ui.now() < end) ui.sleep(250);
  return ui.inApp();
}

/** "Ben" sekmesinden kendi takma adını ve sugo id'sini okur (kendi profili açılır, sonra Mesajlar'a dönülür). */
function readSelf(ui) {
  var cur = screenOf(ui);
  if (cur.name === 'chat' || cur.name === 'profile') cur = { snap: backTo(ui, 'list', 4000) };
  var snap = cur.snap || ui.snapshot();
  var tab = tree.visibleById(snap.root, ID.tabMe, snap.size.width);
  if (!tab) { var k = gotoKnown(ui); snap = k || ui.snapshot(); tab = tree.visibleById(snap.root, ID.tabMe, snap.size.width); }
  if (!tab) return { id: null, name: '', error: 'Ben sekmesi yok' };
  ui.click(tab);
  var end = ui.now() + 6000, info = null;
  while (ui.now() < end) {
    snap = ui.snapshot();
    info = tree.visibleById(snap.root, ID.meInfo, snap.size.width);
    if (info) break;
    ui.sleep(150);
  }
  if (!info) return { id: null, name: '', error: 'Ben ekranı açılmadı' };
  var nameNode = tree.descendant(info, ID.meName);
  var name = nameNode ? String(nameNode.text || '') : '';
  ui.click(info);
  var prof = waitForScreen(ui, 'profile', SLOW_MS);
  if (!prof) { gotoKnown(ui); return { id: null, name: name, error: 'kendi profili açılmadı' }; }
  var id = P.profileId(prof.root);
  var back = tree.visibleById(prof.root, ID.profileBack, prof.size.width);
  if (back) ui.click(back); else ui.back();
  ui.sleep(400);
  if (!gotoList(ui)) gotoKnown(ui);
  return { id: id, name: name, error: id ? null : 'profilde sugo id yok' };
}

/** Ana ekranlardan (Ana sayfa, Ben, ...) alt sekmeyle Mesajlar listesine geçer; geçiş doğrulanır. */
function gotoList(ui) {
  var cur = screenOf(ui);
  if (cur.name === 'list') return cur.snap;
  var tab = tree.visibleById(cur.snap.root, ID.tabMessages, cur.snap.size.width);
  if (!tab) return null;
  ui.click(tab);
  return waitForScreen(ui, 'list', 4000);
}

/** Liste sekmesini (Hepsi/Okunmamış) seçer; sekme düğümü `selected` olana kadar bekler. Sekme yoksa/seçilmezse false. */
function selectListTab(ui, id) {
  var snap = ui.snapshot();
  var tab = tree.visibleById(snap.root, id, snap.size.width);
  if (!tab) return false;
  if (tab.selected) return true;
  ui.click(tab);
  var end = ui.now() + 3000;
  while (ui.now() < end) {
    ui.sleep(120);
    var s = ui.snapshot();
    var t = tree.visibleById(s.root, id, s.size.width);
    if (t && t.selected) return true;
  }
  return false;
}

module.exports = { selectListTab: selectListTab, openSugo: openSugo, profileData: profileData, readSelf: readSelf, gotoKnown: gotoKnown, sameName: sameName, gotoList: gotoList, waitForScreen: waitForScreen, backTo: backTo, openChat: openChat, readPeerId: readPeerId, screenOf: screenOf };

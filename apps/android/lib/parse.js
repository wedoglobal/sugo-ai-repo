var tree = require('./tree');
var S = require('./screens');
var ID = S.ID;

function textOf(node, id) {
  var n = node ? tree.findById(node, id) : null;
  return n ? String(n.text || '').trim() : '';
}

/** Görünür sohbet satırları (Hepsi sekmesi). Ekran dışı "Çevrimiçi" sayfasının kopyaları ve kısmen görünen satırlar elenir. */
function chatRows(root, size) {
  var recycler = null;
  tree.walk(root, function (n) {
    if (!recycler && n.id === 'id_recycler_view' && tree.isVisible(n, size.width) && n.children.some(function (c) { return tree.findById(c, ID.chatItem); })) recycler = n;
  });
  var top = recycler ? recycler.t : 0;
  var bottom = recycler ? recycler.b : size.height;
  var rows = [];
  tree.walk(root, function (n) {
    if (n.id !== ID.chatItem || !tree.isVisible(n, size.width) || n.l !== 0) return;
    var badge = tree.findById(n, ID.itemUnreadBadge);
    var online = tree.findById(n, ID.itemOnline);
    var preview = textOf(n, ID.itemPreview);
    rows.push({
      node: n,
      name: textOf(n, ID.itemName),
      preview: preview,
      time: textOf(n, ID.itemTime),
      unread: badge && badge.r > badge.l ? (parseInt(badge.text, 10) || 1) : 0,
      online: !!(online && online.r > online.l),
      isMatch: S.MATCH_PREVIEW.test(preview),
      fullyVisible: n.t >= top && n.b <= bottom
    });
  });
  return rows;
}

/** Aynı satır aynı imzayı taşır; zaman ve önizleme değişince değişir (eklentideki rowSignature karşılığı). */
function rowSignature(row) {
  return [row.name, row.preview, row.time, row.unread].join('|');
}

/** Sohbet: gelen/giden metinler sırayla. Yön, mesaj satırındaki avatarın ekranın hangi yarısında olduğundan bulunur (giden = sağ). */
function chatMessageRows(root, size) {
  var texts = tree.findAll(root, function (n) { return n.id === ID.msgText && tree.isVisible(n, size.width); });
  var messages = [];
  for (var i = 0; i < texts.length; i++) {
    var row = texts[i];
    var avatar = null;
    while (row.parent && !(avatar = tree.findById(row, ID.itemAvatar))) row = row.parent;
    var dir = avatar ? (tree.centerX(avatar) > size.width / 2 ? 'out' : 'in') : (tree.centerX(texts[i]) > size.width / 2 ? 'out' : 'in');
    var text = String(texts[i].text || '').trim();
    var state = dir === 'out' && avatar ? tree.visibleById(row, ID.msgState, size.width) : null;
    var failed = state && (state.clickable || /başarısız|gönderilemedi|yeniden gönder|failed|resend|^!$/i.test(String(state.desc || state.text || '')));
    if (text) messages.push({ dir: dir, text: text, status: failed ? 'failed' : state ? 'pending' : 'visible', top: texts[i].t });
  }
  messages.sort(function (a, b) { return a.top - b.top; });
  return messages;
}

function chatMessages(root, size) {
  return chatMessageRows(root, size).filter(function (m) { return m.status === 'visible'; })
    .map(function (m) { return { dir: m.dir, text: m.text, ts: '', diamonds: 0 }; });
}

/** Sistem ipuçları ("harika bir eşleşme" vb.) ayrı okunur; mesaj sayılmaz. */
function systemTips(root) {
  return tree.findAll(root, function (n) { return n.id === ID.sysTip; }).map(function (n) { return String(n.text || '').trim(); });
}

function chatTitle(root, size) {
  var n = tree.visibleById(root, ID.chatTitle, size.width);
  return n ? String(n.text || '').trim() : '';
}

/** Profil sayfasındaki sayısal sugo id; yoksa null. */
function profileId(root) {
  var n = tree.findById(root, ID.profileUid);
  var v = n ? String(n.text || '').trim() : '';
  return /^\d{1,30}$/.test(v) ? v : null;
}

/**
 * Karşı tarafın cinsiyeti yalnız profil sayfasında okunur: rozet ikon olduğundan metni yoktur, kadında
 * `id_gender_age_root` `selected=true` olur. Sohbet kartındaki rozet kadında da `selected=false` kalır, kullanılmaz.
 * Dönüş: 'female' | 'male' | null (profil rozeti görünmüyorsa).
 */
function gender(root, size) {
  var badge = tree.visibleById(root, ID.genderBadgeProfile, size.width);
  if (!badge) return null;
  return badge.selected ? 'female' : 'male';
}

module.exports = { gender: gender, chatRows: chatRows, rowSignature: rowSignature, chatMessages: chatMessages, chatMessageRows: chatMessageRows, systemTips: systemTips, chatTitle: chatTitle, profileId: profileId };

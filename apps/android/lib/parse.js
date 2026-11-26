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

/** Giden balonun altındaki elmas rozeti ("x60"); rozet yoksa 0. */
function diamondsOf(row) {
  var n = tree.findById(row, ID.msgDiamond);
  var m = n ? /x\s*(\d+)/i.exec(String(n.text || '')) : null;
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Sohbet: gelen/giden metinler sırayla. Yön, mesaj satırındaki avatarın ekranın hangi yarısında olduğundan bulunur (giden = sağ).
 * Giden balonun yanındaki durum simgesi (`chatting_state_iv`) teslim edilmiş mesajda da (yeşil ✓) kalır; hata ünlemiyle ağaçta
 * ayrılamaz. Elmas rozeti olan ya da altında karşı tarafın mesajı bulunan balon teslim edilmiş sayılır, simge yalnız
 * konuşmanın son giden balonunda (sonrasında cevap yok) başarısız/belirsiz anlamına gelir.
 */
function chatMessageRows(root, size) {
  var isMsgText = function (n) { return n.id === ID.msgText; };
  var texts = tree.findAll(root, function (n) { return isMsgText(n) && tree.isVisible(n, size.width); });
  var messages = [];
  for (var i = 0; i < texts.length; i++) {
    // Satır = yalnız bu metni içeren en geniş ata; avatarsız (gruplanmış/kısmen görünen) balon komşu satırların avatarını almaz.
    var row = texts[i];
    while (row.parent && tree.findAll(row.parent, isMsgText).length === 1) row = row.parent;
    var avatar = tree.findById(row, ID.itemAvatar);
    var dir = avatar ? (tree.centerX(avatar) > size.width / 2 ? 'out' : 'in') : (tree.centerX(texts[i]) > size.width / 2 ? 'out' : 'in');
    var text = String(texts[i].text || '').trim();
    var state = dir === 'out' && avatar ? tree.visibleById(row, ID.msgState, size.width) : null;
    var failed = state && (state.clickable || /başarısız|gönderilemedi|yeniden gönder|failed|resend|^!$/i.test(String(state.desc || state.text || '')));
    var diamonds = dir === 'out' ? diamondsOf(row) : 0;
    if (text) messages.push({ dir: dir, text: text, status: failed ? 'failed' : state ? 'pending' : 'visible', diamonds: diamonds, top: texts[i].t });
  }
  messages.sort(function (a, b) { return a.top - b.top; });
  var inLater = false;
  for (var j = messages.length - 1; j >= 0; j--) {
    var m = messages[j];
    if (m.dir === 'in') inLater = true;
    else if (m.status !== 'visible' && (m.diamonds > 0 || inLater)) m.status = 'visible';
  }
  return messages;
}

function chatMessages(root, size) {
  return chatMessageRows(root, size).filter(function (m) { return m.status === 'visible'; })
    .map(function (m) { return { dir: m.dir, text: m.text, ts: '', diamonds: m.diamonds || 0 }; });
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

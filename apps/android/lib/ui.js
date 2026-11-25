// AutoJS6 bağdaştırıcısı: erişilebilirlik ağacını tree.js düğümlerine çevirir; dokunma/yazma/geri.
// Yalnız erişilebilirlik API'leri kullanılır (ekran görüntüsü/MediaProjection/root/pano yok).
var tree = require('./tree');

var PKG = 'com.voicemaker.android';

function convert(uo, parent, depth) {
  if (!uo || depth > 40) return null;
  var b = uo.bounds();
  // Yatayda ekran dışındaki dallar (ViewPager'ın diğer sayfaları) atlanır; dikey taşma korunur (profildeki uidView ekran altında kalır).
  if (depth > 0 && (b.right <= b.left || b.left >= device.width || b.right <= 0)) return null;
  var rid = String(uo.id() || '').replace(/^.*:id\//, '');
  var n = tree.makeNode(String(uo.className() || '').split('.').pop(), rid, String(uo.text() || ''), String(uo.desc() || ''), b.left, b.top, b.right, b.bottom, uo.clickable(), uo.selected());
  n.focused = !!uo.focused();
  n.ref = uo;
  n.parent = parent;
  var kids = uo.children();
  for (var i = 0; i < kids.length; i++) {
    var c = convert(kids[i], n, depth + 1);
    if (c) n.children.push(c);
  }
  return n;
}

function createUi() {
  return {
    snapshot: function () {
      var root = auto.rootInActiveWindow;
      return { root: root ? convert(root, null, 0) : tree.makeNode('Root', '', '', '', 0, 0, 0, 0, false), size: { width: device.width, height: device.height } };
    },
    /** Düğümün merkezine dokunur (tıklanabilirlik bayrağına bağımlı değil). */
    click: function (node) {
      var x = Math.round(tree.centerX(node)); var y = Math.round(tree.centerY(node));
      if (x <= 0 || y <= 0 || x >= device.width || y >= device.height) throw new Error('düğüm ekran dışında, dokunulmadı: ' + node.id);
      click(x, y);
    },
    setText: function (node, text) {
      var ok = node.ref.setText(text);
      if (!ok) { node.ref.focus(); node.ref.setText(text); }
    },
    back: function () { back(); },
    swipe: function (x1, y1, x2, y2, ms) { swipe(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), ms); },
    sleep: function (ms) { sleep(ms); },
    now: function () { return Date.now(); },
    /** Önce etkin pencerenin paketine bakılır (anlık ve güvenilir); olmazsa currentPackage() kullanılır. */
    foreground: function () {
      var root = auto.rootInActiveWindow;
      var pkg = root ? String(root.packageName() || '') : '';
      return pkg || String(currentPackage() || '');
    },
    inApp: function () { return this.foreground() === PKG; },
    launch: function () {
      if (android.os.Build.VERSION.SDK_INT >= 33) {
        // Android 13+ can launch the package even when a raw Builder APK cannot query it.
        var sender = context.getPackageManager().getLaunchIntentSenderForPackage(PKG);
        sender.sendIntent(context, 0, null, null, null);
        return true;
      }
      return !!app.launchPackage(PKG);
    }
  };
}

module.exports = { createUi: createUi, PKG: PKG };

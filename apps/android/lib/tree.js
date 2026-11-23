// Erişilebilirlik ağacı modeli. AutoJS6 (Rhino) için ES5 sözdizimi: var/function, `?.`, `??`, spread ve async yok.
// Düğüm: { cls, id, text, desc, l, t, r, b, clickable, children, parent }

function makeNode(cls, id, text, desc, l, t, r, b, clickable, selected) {
  return { cls: cls, id: id, text: text, desc: desc, l: l, t: t, r: r, b: b, clickable: !!clickable, selected: !!selected, focused: false, children: [], parent: null };
}

var BOUNDS = /^-?\d+,-?\d+,-?\d+,-?\d+$/;

/** Fixture formatı: girinti = derinlik, satır `Sınıf|id|metin|açıklama|l,t,r,b[|c][|s]` (c = tıklanabilir, s = seçili). Metin `|` içerebilir. */
function parseDump(source) {
  var root = makeNode('Root', '', '', '', 0, 0, 0, 0, false);
  var stack = [{ depth: -1, node: root }];
  var lines = String(source).split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.trim()) continue;
    var depth = line.length - line.replace(/^ +/, '').length;
    var parts = line.trim().split('|');
    var clickable = false;
    var selected = false;
    while (parts.length > 5 && (parts[parts.length - 1] === 'c' || parts[parts.length - 1] === 's')) {
      if (parts.pop() === 'c') clickable = true; else selected = true;
    }
    var bounds = parts.pop();
    if (!BOUNDS.test(bounds)) continue;
    var b = bounds.split(',').map(Number);
    var desc = parts.pop();
    var cls = parts.shift();
    var id = parts.shift();
    var node = makeNode(cls, String(id).replace(/^.*:id\//, ''), parts.join('|'), desc, b[0], b[1], b[2], b[3], clickable, selected);
    while (stack[stack.length - 1].depth >= depth) stack.pop();
    var parent = stack[stack.length - 1].node;
    node.parent = parent;
    parent.children.push(node);
    stack.push({ depth: depth, node: node });
  }
  if (root.children.length === 1) { root.children[0].parent = null; return root.children[0]; }
  return root;
}

function walk(node, fn) {
  if (!node) return;
  fn(node);
  for (var i = 0; i < node.children.length; i++) walk(node.children[i], fn);
}

function findAll(node, pred) {
  var out = [];
  walk(node, function (n) { if (pred(n)) out.push(n); });
  return out;
}

function findById(node, id) {
  var found = null;
  walk(node, function (n) { if (!found && n.id === id) found = n; });
  return found;
}

/** Ekranda gerçekten görünen mi? ViewPager'ın ekran dışı sayfaları negatif/taşan sınırlarla ağaçta kalır. */
function isVisible(n, width) {
  return n.r > n.l && n.b > n.t && n.l < width && n.r > 0;
}

function visibleById(node, id, width) {
  var list = findAll(node, function (n) { return n.id === id && isVisible(n, width); });
  return list.length ? list[0] : null;
}

function descendant(node, id) {
  return findById(node, id);
}

function centerX(n) { return (n.l + n.r) / 2; }
function centerY(n) { return (n.t + n.b) / 2; }

module.exports = { makeNode: makeNode, parseDump: parseDump, walk: walk, findAll: findAll, findById: findById, isVisible: isVisible, visibleById: visibleById, descendant: descendant, centerX: centerX, centerY: centerY };

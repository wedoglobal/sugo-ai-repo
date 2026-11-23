// Karşı taraf kimliği: profile bir defa gidilir, {id, gender} ad anahtarıyla saklanır.
// Aynı ad listede birden fazla satırda geçiyorsa kimlik karışabileceğinden önbellek kullanılmaz ve kaydedilmez.
var TTL_MS = 12 * 3600 * 1000;

function normName(name) { return String(name || '').replace(/\s+/g, ' ').trim(); }

/** store: { get(key) -> değer|null, set(key, değer) } (AutoJS'ta storages, testte Map). */
function createPeers(store, now) {
  function key(name) { return 'peer:' + normName(name); }
  return {
    lookup: function (name, ambiguous) {
      if (ambiguous || !normName(name)) return null;
      var hit = store.get(key(name));
      if (!hit || !hit.id || now() - hit.at > TTL_MS) return null;
      return { id: hit.id, gender: hit.gender };
    },
    remember: function (name, info, ambiguous) {
      if (ambiguous || !normName(name) || !info || !info.id) return;
      store.set(key(name), { id: info.id, gender: info.gender || null, at: now() });
    }
  };
}

/** Görünür satırlarda tekrar eden adlar. */
function duplicateNames(rows) {
  var seen = {}; var dup = {};
  for (var i = 0; i < rows.length; i++) {
    var n = normName(rows[i].name);
    if (seen[n]) dup[n] = true;
    seen[n] = true;
  }
  return dup;
}

module.exports = { createPeers: createPeers, duplicateNames: duplicateNames, normName: normName };

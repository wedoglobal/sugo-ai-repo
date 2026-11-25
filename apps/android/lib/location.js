var MAX_AGE_MS = 60000;
var REFRESH_MS = 2000;
var RETRY_MS = 10000;

function gpsFor(profiles) {
  if (!Array.isArray(profiles)) return null;
  for (var i = 0; i < profiles.length; i++) {
    var profile = profiles[i];
    if (!profile || profile.domain !== 'sugo.live') continue;
    var gps = profile.gps;
    if (!gps || gps.enabled !== true || !valid(gps.latitude, -90, 90) ||
        !valid(gps.longitude, -180, 180) || !valid(gps.accuracy, 0, 3.402823466e38)) return null;
    return gps;
  }
  return null;
}

function valid(value, min, max) {
  return typeof value === 'number' && isFinite(value) && value >= min && value <= max;
}

function createLocation(opts) {
  var desired = null;
  var applied = null;
  var lastSync = -Infinity;
  var nextAttempt = 0;
  var needsRemoval = false;
  var lastError = '';

  function update(control) {
    if (control.synced || control.missing) {
      var gps = gpsFor(control.network);
      if (!samePosition(gps, desired)) nextAttempt = 0;
      desired = gps;
      lastSync = opts.now();
    }
  }

  function samePosition(a, b) {
    return a && b ? a.latitude === b.latitude && a.longitude === b.longitude && a.accuracy === b.accuracy : a === b;
  }

  function report(error) {
    var message = String(error);
    if (message !== lastError) opts.log('GPS hatası: ' + message);
    lastError = message;
    nextAttempt = opts.now() + RETRY_MS;
  }

  function clear() {
    if (!needsRemoval) return;
    try {
      opts.provider.clear();
      needsRemoval = false;
      if (applied) opts.log('GPS: gerçek konuma dönüldü');
      applied = null;
      lastError = '';
    } catch (error) { report(error); }
  }

  function tick() {
    var now = opts.now();
    if (now >= lastSync + MAX_AGE_MS && desired) {
      desired = null;
      nextAttempt = 0;
    }
    if (now < nextAttempt) return;
    if (!desired) { clear(); return; }
    try {
      needsRemoval = true;
      opts.provider.set(desired);
      if (!samePosition(applied, desired) || lastError) opts.log('GPS: test konumu uygulandı');
      applied = desired;
      lastError = '';
      nextAttempt = now + REFRESH_MS;
    } catch (error) { report(error); }
  }

  return { update: update, tick: tick, close: clear };
}

function createAndroidProvider() {
  var manager = context.getSystemService('location');
  var appOps = context.getSystemService('appops');
  var name = android.location.LocationManager.GPS_PROVIDER;
  var registered = false;
  return {
    set: function (gps) {
      if (Number(appOps.checkOpNoThrow('android:mock_location', android.os.Process.myUid(), context.getPackageName())) !== 0) {
        throw new Error('Android geliştirici seçeneklerinden bu uygulamayı Sahte konum uygulaması olarak seçin');
      }
      if (!registered) {
        manager.addTestProvider(name, false, true, false, false, true, true, true, 3, 1);
        registered = true;
      }
      manager.setTestProviderEnabled(name, true);
      var location = new android.location.Location(name);
      location.setLatitude(gps.latitude);
      location.setLongitude(gps.longitude);
      location.setAccuracy(gps.accuracy);
      location.setTime(java.lang.System.currentTimeMillis());
      location.setElapsedRealtimeNanos(android.os.SystemClock.elapsedRealtimeNanos());
      manager.setTestProviderLocation(name, location);
    },
    clear: function () {
      if (!registered) return;
      manager.removeTestProvider(name);
      registered = false;
    }
  };
}

module.exports = { createLocation: createLocation, createAndroidProvider: createAndroidProvider };

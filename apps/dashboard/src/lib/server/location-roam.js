const IDLE_MS = 10 * 60_000;
const STEP_MS = 2 * 60_000;
const EARTH_KM = 6371;
const radians = Math.PI / 180;
export const roamDomains = new Set(['sugo.live', 'www.sugo.live']);

/** Reconstructs the scheduled target at the latest persisted client poll without starting a session. */
export async function roamStatus(host, profile, connection, now) {
  const { latitude, longitude } = profile.gps;
  const center = { latitude, longitude };
  const seenAt = connection?.seen_at ?? null;
  const status = { domain: profile.domain, center, seenAt };
  if (!profile.gps.enabled) return { ...status, state: 'gps_off' };
  if (!host.active) return { ...status, state: 'paused' };
  const seen = Date.parse(seenAt);
  if (!Number.isFinite(seen) || now - seen >= 4 * 60_000) return { ...status, state: 'offline' };
  const idleSince = Math.max(Date.parse(connection.connected_at), Date.parse(host.last_incoming_at) || 0);
  const firstAt = idleSince + IDLE_MS;
  if (now < firstAt) return { ...status, state: 'waiting', firstAt };
  if (seen < firstAt) return { ...status, state: 'awaiting_poll' };
  const target = await roamTarget(host.id, profile.domain, { ...center, at: seenAt, idleSince: new Date(idleSince).toISOString() });
  return target ? { ...status, state: 'moving', target } : { ...status, state: 'no_land' };
}

/** Natural Earth land cells exclude lakes and leave a margin along water boundaries. */
export function isRoamLand(latitude, longitude) {
  const { resolution, rows } = land;
  const row = rows[Math.floor((latitude + 90) * resolution)];
  if (!row) return false;
  const col = Math.floor((longitude + 180) * resolution);
  const bounds = atob(row);
  for (let i = 0; i < bounds.length; i += 4) {
    const lo = bounds.charCodeAt(i) + 256 * bounds.charCodeAt(i + 1);
    if (col < lo) return false;
    if (col < bounds.charCodeAt(i + 2) + 256 * bounds.charCodeAt(i + 3)) return true;
  }
  return false;
}

/** Uses the saved center for every step and gives repeated polls the same target. */
export async function roamTarget(hostId, domain, state) {
  const { latitude, longitude } = state ?? {};
  const at = Date.parse(state?.at);
  const first = Date.parse(state?.idleSince) + IDLE_MS;
  if (!Number.isFinite(at) || !Number.isFinite(first) || at < first ||
      !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;

  const stepAt = first + Math.floor((at - first) / STEP_MS) * STEP_MS;
  const center = { latitude, longitude };
  const seed = new TextEncoder().encode(JSON.stringify([hostId, domain, center, first, stepAt]));
  const bits = new DataView(await crypto.subtle.digest('SHA-256', seed));
  let sample = bits.getUint32(0) || 1;
  function draw() {
    sample ^= sample << 13;
    sample ^= sample >>> 17;
    sample ^= sample << 5;
    return (sample >>> 0) / 2 ** 32;
  }
  const lat = latitude * radians;
  for (let attempt = 0; attempt < 96; attempt++) {
    const bearing = draw() * 2 * Math.PI;
    const arc = Math.sqrt(draw()) * 50 / EARTH_KM;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(bearing));
    const deltaLon = Math.atan2(Math.sin(bearing) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(nextLat));
    const candidate = { latitude: nextLat / radians, longitude: (longitude + deltaLon / radians + 540) % 360 - 180 };
    if (isRoamLand(candidate.latitude, candidate.longitude)) return { center, stepAt, ...candidate };
  }
  return null;
}
import land from './roam-land.json';


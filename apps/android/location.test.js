import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createApi } = require('./lib/api.js');
const { createLocation } = require('./lib/location.js');
const istanbul = { enabled: true, latitude: 41.0082, longitude: 28.9784, accuracy: 20 };
const london = { ...istanbul, latitude: 51.5074, longitude: -0.1278 };

function profile(gps) {
  return { domain: 'sugo.live', gps };
}

function fixture() {
  let now = 1000;
  const provider = { set: vi.fn(), clear: vi.fn() };
  const log = vi.fn();
  const location = createLocation({ provider, log, now: () => now });
  return {
    provider, log, location,
    update(network) { location.update({ synced: true, network }); location.tick(); },
    advance(ms) { now += ms; location.tick(); }
  };
}

describe('Android GPS', () => {
  it('takes only sugo.live, refreshes the fix, and applies a changed point immediately', () => {
    const { provider, update, advance, location } = fixture();
    update([{ domain: 'other.live', gps: london }, profile(istanbul)]);
    expect(provider.set).toHaveBeenLastCalledWith(istanbul);
    advance(2000);
    expect(provider.set).toHaveBeenCalledTimes(2);
    update([profile(london)]);
    expect(provider.set).toHaveBeenLastCalledWith(london);
    location.close();
    expect(provider.clear).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['disabled', [profile({ ...istanbul, enabled: false })]],
    ['deleted rule', []],
    ['invalid latitude', [profile({ ...istanbul, latitude: 91 })]],
    ['invalid longitude', [profile({ ...istanbul, longitude: '-180' })]],
    ['invalid accuracy', [profile({ ...istanbul, accuracy: Infinity })]]
  ])('returns to real location for %s', (_, profiles) => {
    const { provider, update } = fixture();
    update([profile(istanbul)]);
    update(profiles);
    expect(provider.clear).toHaveBeenCalledTimes(1);
  });

  it('expires a network failure after 60 seconds and clears a missing host at once', () => {
    const { provider, update, advance, location } = fixture();
    update([profile(istanbul)]);
    location.update({ synced: false });
    advance(59999);
    expect(provider.clear).not.toHaveBeenCalled();
    advance(1);
    expect(provider.clear).toHaveBeenCalledTimes(1);
    update([profile(london)]);
    location.update({ synced: false, missing: true });
    location.tick();
    expect(provider.clear).toHaveBeenCalledTimes(2);
  });

  it('logs a missing permission once and recovers on retry', () => {
    const { provider, log, update, advance } = fixture();
    provider.set.mockImplementationOnce(() => { throw new Error('Yetki gerekli'); });
    update([profile(istanbul)]);
    expect(log).toHaveBeenCalledWith('GPS hatası: Error: Yetki gerekli');
    advance(9999);
    expect(provider.set).toHaveBeenCalledTimes(1);
    advance(1);
    expect(provider.set).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith('GPS: test konumu uygulandı');
  });

  it('passes network profiles through control and distinguishes missing host from network error', () => {
    const network = [profile(istanbul)];
    const request = vi.fn()
      .mockReturnValueOnce({ status: 200, data: { host: { sugoId: '42', active: false, network } } })
      .mockReturnValueOnce({ status: 404, data: { error: 'profil yok' } })
      .mockImplementationOnce(() => { throw new Error('ağ hatası'); });
    const api = createApi({ baseUrl: 'https://example.com', apiKey: 'test', hostSugoId: '42', http: { request }, now: () => 0 });
    expect(api.control(true)).toMatchObject({ synced: true, active: false, network });
    expect(api.control(true)).toMatchObject({ synced: false, missing: true });
    expect(api.control(true)).toMatchObject({ synced: false, error: 'ağ hatası' });
  });
});

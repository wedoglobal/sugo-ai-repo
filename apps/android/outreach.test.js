import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { load, memStore, size, tree } from './testkit.js';
const require = createRequire(import.meta.url);
const { createOutreach } = require('./lib/outreach.js');

const nearbyDump = (cards) => tree.parseDump([
  'Root||||0,0,1080,2400', ' LinearLayout|id_main_bottomtab_home|||0,2115,216,2270|c', ' LinearLayout|id_main_bottomtab_conv|||648,2115,864,2270|c',
  ' FrameLayout|id_home_tab_real_nearby|||300,93,600,225|c',
  ...cards.flatMap((c, i) => { const t = 300 + i * 275; return [` ViewGroup|layout_nearby_user|||0,${t},1080,${t + 250}`, `  ImageView|id_user_avatar_iv|||77,${t + 30},264,${t + 217}`, `  TextView|id_user_name_tv|${c.name}||297,${t + 20},700,${t + 70}`, `  ImageView|id_user_opt_msiv|||805,${t + 50},1003,${t + 200}|c${c.hi ? '|s' : ''}`]; }),
].join('\n'));

function world(cards) {
  let screen = 'home'; let t = 0; const clicks = [];
  const ui = {
    clicks, cards,
    snapshot() {
      if (screen === 'list') return { root: tree.parseDump('Root||||0,0,1080,2400\n TextView|id_conv_tab_all|Hepsi||45,390,233,470|c\n LinearLayout|id_main_bottomtab_conv|||648,2115,864,2270|c'), size };
      return { root: nearbyDump(cards), size };
    },
    click(n) {
      clicks.push(n.id);
      if (n.id === 'id_user_opt_msiv') { const name = tree.findById(n.parent, 'id_user_name_tv').text; cards.find((c) => c.name === name).hi = true; }
      else if (n.id === 'id_main_bottomtab_conv') screen = 'list';
    },
    swipe() {}, back() {}, sleep(ms) { t += ms; }, now: () => t,
  };
  return ui;
}
const api = () => { const calls = []; return { calls, control: () => ({ active: true }), ignore: (...a) => calls.push(['ignore', ...a]) }; };

describe('hi gönderimi', () => {
  it('selam atılmamış ilk karta doğrudan Hi basar, atılmışı atlar ve kaydeder', () => {
    const ui = world([{ name: 'ali', hi: true }, { name: 'veli', hi: false }, { name: 'can', hi: false }]);
    const store = memStore(); const logs = [];
    const o = createOutreach({ ui, api: api(), store, now: () => 1e9 + ui.now(), hour: () => 12, log: (m) => logs.push(m), random: () => 0.5 });
    expect(o.step()).toBe(true);
    expect(ui.cards.map((c) => c.hi)).toEqual([true, true, false]);
    expect(store.get('hi:log').length).toBe(1);
    expect(logs).toContain('hi gönderildi veli');
    expect(o.step()).toBe(false); // aralık dolmadan ikinci selam yok
  });
  it('saatlik tavan: gündüz 3, akşam 19-22 arası 8', () => {
    const ui = world([]);
    const mk = (hour) => createOutreach({ ui, api: api(), store: memStore(), now: () => 5e9, hour: () => hour, log() {} });
    expect(mk(12).capNow()).toBe(3);
    expect(mk(20).capNow()).toBe(8);
    expect(mk(22).capNow()).toBe(3);
  });
  it('tavan dolunca ve aralık dolmadan yeni selam atmaz', () => {
    const ui = world([]); const store = memStore();
    store.set('hi:log', [4.9990e9, 4.9995e9, 4.9999e9]);
    const o = createOutreach({ ui, api: api(), store, now: () => 5e9, hour: () => 12, log() {} });
    expect(o.allowed()).toBe(false);
    expect(createOutreach({ ui, api: api(), store: memStore(), now: () => 5e9, hour: () => 12, log() {} }).allowed()).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const tree = require('./lib/tree.js');
const parse = require('./lib/parse.js');
const nav = require('./lib/nav.js');
const size = { width: 1080, height: 2400 };
const load = (name) => tree.parseDump(readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8'));

/** Ekran makinesi: tıklama/geri uygulama davranışını taklit eder. `stuck` ekrana geçişi engeller. */
function fakeUi({ start = 'list', stuck = false } = {}) {
  const screens = { list: load('list'), chat: load('chat'), profile: load('profile') };
  let current = start; let t = 0; const calls = [];
  return {
    calls,
    get current() { return current; },
    snapshot: () => ({ root: screens[current], size }),
    click(node) {
      calls.push(`click:${node.id}`);
      if (stuck) return;
      if (node.id === 'll_chat_item') current = 'chat';
      else if (node.id === 'id_user_avatar_iv' && current === 'list') current = 'profile';
      else if (node.id === 'id_back' || node.id === 'backBtn') current = 'list';
    },
    back() { calls.push('back'); if (!stuck) current = 'list'; },
    sleep(ms) { t += ms; },
    now: () => t
  };
}

describe('gezinme doğrulaması', () => {
  it('sohbet açılır ve ekran doğrulanır', () => {
    const ui = fakeUi();
    const row = parse.chatRows(ui.snapshot().root, size)[0];
    expect(nav.openChat(ui, row)).not.toBeNull();
    expect(ui.current).toBe('chat');
  });
  it('sohbet açılmazsa null döner (kör devam yok)', () => {
    const ui = fakeUi({ stuck: true });
    const row = parse.chatRows(ui.snapshot().root, size)[0];
    expect(nav.openChat(ui, row)).toBeNull();
  });
  it('sohbetten ekrandaki geri düğmesiyle listeye dönülür ve doğrulanır', () => {
    const ui = fakeUi({ start: 'chat' });
    expect(nav.backTo(ui, 'list')).not.toBeNull();
    expect(ui.calls).toEqual(['click:id_back']);
  });
  it('listedeyken geri tuşuna basılmaz', () => {
    const ui = fakeUi({ start: 'list' });
    expect(nav.backTo(ui, 'chat')).toBeNull();
    expect(ui.calls).toEqual([]);
  });
  it('geri takılırsa yeniden dener, sonunda null döner', () => {
    const ui = fakeUi({ start: 'chat', stuck: true });
    expect(nav.backTo(ui, 'list', 500)).toBeNull();
    expect(ui.calls.filter((c) => c === 'back').length).toBeGreaterThan(0);
  });
  it('peer id profil sayfasından okunur ve listeye dönülür', () => {
    const ui = fakeUi();
    const row = parse.chatRows(ui.snapshot().root, size)[0];
    expect(nav.readPeerId(ui, row)).toEqual({ id: '100000001', gender: 'male', error: null });
    expect(ui.current).toBe('list');
  });
  it('profil açılmazsa id null ve hata döner', () => {
    const ui = fakeUi({ stuck: true });
    const row = parse.chatRows(ui.snapshot().root, size)[0];
    expect(nav.readPeerId(ui, row)).toEqual({ id: null, gender: null, error: 'profil açılmadı' });
  });
  it('ana sayfada alt sekmeyle Mesajlar listesine geçilir ve doğrulanır', () => {
    const ui = fakeUi();
    let on = 'home';
    const homeRoot = tree.parseDump('Root||||0,0,1080,2400\n LinearLayout|id_main_bottomtab_conv|||648,2115,864,2177|c');
    const listRoot = load('list');
    const wrapped = { calls: [], snapshot: () => ({ root: on === 'home' ? homeRoot : listRoot, size }), click(n) { wrapped.calls.push(n.id); if (n.id === 'id_main_bottomtab_conv') on = 'list'; }, back() {}, sleep: ui.sleep, now: ui.now };
    expect(nav.gotoList(wrapped)).not.toBeNull();
    expect(wrapped.calls).toEqual(['id_main_bottomtab_conv']);
  });
});

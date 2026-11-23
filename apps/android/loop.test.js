import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fakeApi, fakeUi, memStore, tree } from './testkit.js';
const require = createRequire(import.meta.url);
const { createLoop } = require('./lib/loop.js');
const { createPeers } = require('./lib/peers.js');

function setup({ rows, pages, profiles, chats, api: apiOpts, dryRun = false, allowPeers = null }) {
  const ui = fakeUi({ rows, pages, profiles, chats });
  const api = fakeApi(apiOpts);
  const peers = createPeers(memStore(), () => ui.now());
  const loop = createLoop({ ui, api, peers, now: () => ui.now(), log: () => {}, dryRun, allowPeers });
  return { ui, api, peers, loop };
}
const unreadRow = { name: 'Ali', preview: 'selam nasılsın', unread: 1 };
const text = (api, name) => api.calls.filter((c) => c[0] === name);

describe('döngü', () => {
  it('okunmamış sohbette profil → ingest → iş → gönder → complete akışı çalışır ve listeye dönülür', () => {
    const { ui, api, loop } = setup({
      rows: [unreadRow], profiles: { Ali: 'profile' },
      chats: { Ali: [{ dir: 'in', text: 'selam nasılsın' }] },
      api: { ingestResult: { job: { id: 'j1', status: 'pending', kind: 'reply' } }, job: { id: 'j1', kind: 'reply', peerSugoId: '100000001', text: 'iyiyim sen?', sendText: true } }
    });
    expect(loop.tick()).toBe(true);
    expect(ui.sent).toEqual([{ name: 'Ali', text: 'iyiyim sen?' }]);
    expect(text(api, 'ingest')[0][1]).toMatchObject({ peerSugoId: '100000001', peerName: 'Ali', voiceEnabled: false, messages: [{ dir: 'in', text: 'selam nasılsın' }] });
    expect(text(api, 'complete')).toEqual([['complete', 'j1']]);
    expect(ui.screen).toBe('list');
  });
  it('kadın profili sohbet açılmadan /ignore ile atlanır', () => {
    const { ui, api, loop } = setup({ rows: [unreadRow], profiles: { Ali: 'profile-female' } });
    loop.tick();
    expect(text(api, 'ignore')).toEqual([['ignore', '100000002', 'female']]);
    expect(text(api, 'ingest')).toHaveLength(0);
    expect(ui.calls).not.toContain('setText');
    expect(ui.screen).toBe('list');
  });
  it('profil bir defa ziyaret edilir, ikinci turda önbellek kullanılır', () => {
    const { ui, loop } = setup({ rows: [unreadRow], profiles: { Ali: 'profile' }, chats: { Ali: [{ dir: 'in', text: 'x' }] }, api: { ingestResult: {} } });
    loop.tick();
    const avatarClicks = () => ui.calls.filter((c) => c === 'click:id_user_avatar_iv').length;
    expect(avatarClicks()).toBe(1);
    for (const k of Object.keys(loop.state.handled)) delete loop.state.handled[k];
    loop.tick();
    expect(avatarClicks()).toBe(1);
  });
  it('panelden durdurulmuşsa hiçbir şeye dokunmaz', () => {
    const { ui, api, loop } = setup({ rows: [unreadRow], profiles: { Ali: 'profile' }, api: { active: false } });
    expect(loop.tick()).toBe(false);
    expect(ui.calls).toEqual([]);
    expect(api.calls).toEqual([]);
  });
  it('gönderim doğrulanamazsa iş fail edilir ve hata raporlanır', () => {
    const { ui, api, loop } = setup({
      rows: [unreadRow], profiles: { Ali: 'profile' }, chats: { Ali: [{ dir: 'in', text: 'x' }] },
      api: { ingestResult: { job: { id: 'j2', status: 'pending', kind: 'reply' } }, job: { id: 'j2', kind: 'reply', peerSugoId: '100000001', text: 'merhaba', sendText: true } }
    });
    ui.sendOk = false;
    loop.tick();
    expect(text(api, 'fail')[0][1]).toBe('j2');
    expect(text(api, 'error').length).toBeGreaterThan(0);
    expect(ui.screen).toBe('list');
  });
  it('yazmadan önce girişe dokunulur ve klavye/odak beklenir', () => {
    const { ui, loop } = setup({
      rows: [unreadRow], profiles: { Ali: 'profile' }, chats: { Ali: [{ dir: 'in', text: 'x' }] },
      api: { ingestResult: { job: { id: 'j9', status: 'pending', kind: 'reply' } }, job: { id: 'j9', kind: 'reply', peerSugoId: '100000001', text: 'merhaba', sendText: true } }
    });
    loop.tick();
    const i = ui.calls.indexOf('click:id_input_edit_text');
    expect(i).toBeGreaterThan(-1);
    expect(ui.calls.indexOf('setText')).toBeGreaterThan(i);
  });
  it('allowPeers dışındaki kişiyle sohbet açılmaz ve hiçbir şey gönderilmez', () => {
    const { ui, api, loop } = setup({ rows: [unreadRow], profiles: { Ali: 'profile' }, chats: { Ali: [{ dir: 'in', text: 'x' }] }, allowPeers: ['999'] });
    loop.tick();
    expect(text(api, 'ingest')).toHaveLength(0);
    expect(ui.calls).not.toContain('setText');
    expect(ui.screen).toBe('list');
  });
  it('medya işi (sendText:false) gönderilmez, fail edilir', () => {
    const { ui, api, loop } = setup({
      rows: [unreadRow], profiles: { Ali: 'profile' }, chats: { Ali: [{ dir: 'in', text: 'x' }] },
      api: { ingestResult: { job: { id: 'j3', status: 'pending', kind: 'nudge' } }, job: { id: 'j3', kind: 'nudge', peerSugoId: '100000001', text: '[fotoğraf]', sendText: false } }
    });
    loop.tick();
    expect(ui.sent).toEqual([]);
    expect(text(api, 'fail')[0][2]).toContain('medya');
  });
  it('DRY_RUN sunucuya yazmaz ve mesaj göndermez ama sohbeti okuyup geri döner', () => {
    const { ui, api, loop } = setup({ rows: [unreadRow], profiles: { Ali: 'profile' }, chats: { Ali: [{ dir: 'in', text: 'x' }] }, dryRun: true });
    loop.tick();
    expect(api.calls).toEqual([]);
    expect(ui.sent).toEqual([]);
    expect(ui.screen).toBe('list');
  });
  it('sohbet ekranında kalındıysa tick önce listeye döner', () => {
    const { ui, loop } = setup({ rows: [{ name: 'Ali', preview: 'x', unread: 0 }], profiles: { Ali: 'profile' }, chats: { Ali: [] } });
    ui.click(tree.findById(ui.snapshot().root, 'll_chat_item'));
    expect(ui.screen).toBe('chat');
    loop.tick();
    expect(ui.screen).toBe('list');
  });
  it('aşağıda kalan okunmamış sohbeti listeyi kaydırarak bulur', () => {
    const page1 = [{ name: 'A', preview: 'x', unread: 0 }, { name: 'B', preview: 'y', unread: 0 }];
    const page2 = [{ name: 'C', preview: 'z', unread: 0 }, { name: 'Ali', preview: 'selam', unread: 1 }];
    const { ui, api, loop } = setup({ pages: [page1, page2], profiles: { Ali: 'profile' }, chats: { Ali: [{ dir: 'in', text: 'selam' }] }, dryRun: true });
    for (let i = 0; i < 6; i++) loop.tick();
    expect(ui.calls).toContain('swipe');
    expect(ui.calls).toContain('click:id_user_avatar_iv');
    expect(ui.screen).toBe('list');
  });
  it('yanlış sohbet açılırsa (başlık uyuşmaz) geri dönülür ve hiçbir şey gönderilmez', () => {
    const { ui, api, loop } = setup({ rows: [unreadRow], profiles: { Ali: 'profile' }, chats: { Ali: [{ dir: 'in', text: 'x' }] },
      api: { ingestResult: { job: { id: 'j', status: 'pending', kind: 'reply' } }, job: { id: 'j', kind: 'reply', peerSugoId: '100000001', text: 'merhaba', sendText: true } } });
    const real = ui.snapshot;
    ui.snapshot = () => { const s = real(); if (ui.screen === 'chat') { const t = tree.findById(s.root, 'id_chatting_title_username_tv'); if (t) t.text = 'Başkası'; } return s; };
    loop.tick();
    expect(ui.sent).toEqual([]);
    expect(ui.screen).toBe('list');
  });
});

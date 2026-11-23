// Test yardımcıları: ekran makinesi olan sahte ui ve sahte api.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
export const tree = require('./lib/tree.js');
export const size = { width: 1080, height: 2400 };
export const load = (name) => tree.parseDump(readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8'));

export function listDump(rows) {
  const lines = ['Root||||0,0,1080,2400', ' ViewGroup|id_main_home_fragment_conv|||0,0,1080,2115', '  TextView|id_conv_tab_all|Hepsi||45,390,233,470|c', '  RecyclerView|id_recycler_view|||0,503,1080,2115'];
  rows.forEach((r, i) => {
    const t = 600 + i * 210;
    lines.push(`   ViewGroup||||0,${t},1080,${t + 210}|c`, `    ViewGroup|ll_chat_item|||0,${t},1080,${t + 210}`,
      `     ImageView|id_user_avatar_iv|||44,${t + 28},198,${t + 182}|c`, `     TextView|id_user_name_tv|${r.name}||231,${t + 40},500,${t + 90}`,
      `     TextView|id_latest_msg_tv|${r.preview}||231,${t + 110},900,${t + 150}`, `     TextView|id_online_time_tv|12:50||952,${t + 50},1036,${t + 90}`);
    if (r.unread) lines.push(`     LinearLayout|id_unread_ll|||986,${t + 110},1036,${t + 160}`, `      TextView|id_unread_tcv|${r.unread}||986,${t + 110},1036,${t + 160}`);
  });
  return tree.parseDump(lines.join('\n'));
}

/** peers: ad -> 'profile' | 'profile-female'. chatMessages: ad -> [{dir,text}]. */
export function fakeUi({ rows: rowsArg, pages: pagesArg, profiles, chats = {} }) {
  const pages = pagesArg ?? [rowsArg]; let page = 0;
  const rows = new Proxy([], { get: (_, p) => (pages[page])[p], has: (_, p) => p in pages[page] });
  let screen = 'list'; let focused = false; let current = null; let t = 0; let typed = ''; let sendOk = true;
  const sent = []; const calls = [];
  const chatTree = (name) => {
    const root = tree.parseDump(readFileSync(new URL('./fixtures/chat-empty-match.txt', import.meta.url), 'utf8'));
    const list = tree.findById(root, 'id_msg_list_view');
    let top = 300;
    for (const m of [...(chats[name] ?? []), ...sent.filter((s) => s.name === name).map((s) => ({ dir: 'out', text: s.text }))]) {
      const row = tree.makeNode('ViewGroup', '', '', '', 0, top, 1080, top + 120, false);
      const txt = tree.makeNode('TextView', 'id_chat_msg_text', m.text, '', 143, top, 898, top + 120);
      const av = tree.makeNode('ImageView', 'id_user_avatar_iv', '', '', m.dir === 'out' ? 920 : 44, top, m.dir === 'out' ? 1036 : 160, top + 116, true);
      for (const n of [txt, av]) { n.parent = row; row.children.push(n); }
      row.parent = list; list.children.push(row); top += 140;
    }
    const title = tree.findById(root, 'id_chatting_title_username_tv'); if (title) title.text = name;
    const input = tree.findById(root, 'id_input_edit_text'); input.text = typed || 'Bir şey söyle…'; input.focused = focused;
    return root;
  };
  const ui = {
    calls, sent, get screen() { return screen; }, set sendOk(v) { sendOk = v; },
    snapshot() {
      const root = screen === 'list' ? listDump(pages[page]) : screen === 'chat' ? chatTree(current) : load(profiles[current]);
      return { root, size };
    },
    click(node) {
      calls.push(`click:${node.id}`);
      if (screen === 'list') {
        const row = node.id === 'id_user_avatar_iv' ? node.parent : node;
        const name = tree.findById(row, 'id_user_name_tv').text; current = name;
        screen = node.id === 'id_user_avatar_iv' ? 'profile' : 'chat';
      } else if (node.id === 'id_back' || node.id === 'backBtn') { screen = 'list'; typed = ''; focused = false; }
      else if (node.id === 'id_input_edit_text') focused = true;
      else if (node.id === 'id_chat_send_btn' && sendOk) { sent.push({ name: current, text: typed }); typed = ''; }
    },
    setText(node, text) { if (!focused) throw new Error('odaksız yazıldı'); typed = text; calls.push('setText'); },
    swipe(x1, y1, x2, y2) { calls.push('swipe'); if (screen !== 'list') return; page = y1 > y2 ? Math.min(page + 1, pages.length - 1) : Math.max(page - 1, 0); },
    back() { calls.push('back'); if (screen !== 'list') screen = 'list'; },
    sleep(ms) { t += ms; }, now: () => t
  };
  return ui;
}

export function fakeApi({ active = true, ingestResult = {}, job = null, jobs = [] } = {}) {
  const calls = [];
  const queue = job ? [job] : jobs.slice();
  return {
    calls,
    control: () => ({ synced: true, active }),
    state: () => {},
    ingest(body) { calls.push(['ingest', body]); return ingestResult; },
    nextJob(o) {
      calls.push(['nextJob', o]);
      // Sunucu gibi: yalnız görünür sohbetlere ait işi verir.
      const i = queue.findIndex((j) => (o.visiblePeerIds ?? []).includes(String(j.peerSugoId)));
      return i >= 0 ? queue.splice(i, 1)[0] : null;
    },
    complete(id) { calls.push(['complete', id]); return {}; },
    fail(id, e) { calls.push(['fail', id, e]); return {}; },
    rejected: () => ({}),
    ignore(peer, reason) { calls.push(['ignore', peer, reason]); return {}; },
    reportError(peer, e) { calls.push(['error', peer, e]); }
  };
}

export function memStore() { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v) }; }

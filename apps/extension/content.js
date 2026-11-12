// sugo.live /messages: okunmamış sohbetleri dashboard'a iletir, kuyruktaki cevapları yazıp gönderir.
const POLL_MS = 700;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (m) => chrome.runtime.sendMessage({ type: 'api', ...m });
const getConfig = (fresh = false) => chrome.runtime.sendMessage({ type: 'config', ...(fresh ? { fresh: true } : {}) });
async function ensureRunning(cfg) {
  if (!cfg) return;
  const current = await getConfig(true);
  if (!current?.enabled || current.hostSugoId !== cfg.hostSugoId) throw new Error('Profil panelden durduruldu veya değiştirildi.');
}
async function checkedCall(request) {
  const response = await call(request);
  if (!response?.ok) throw new Error(response?.error || `API yanıt vermedi: ${request.path}`);
  return response.data;
}

const SEL = {
  row: '[data-message-conversation-id]',
  unread: '.conv-item-unread',
  rowButton: 'button[data-testid=message-single-chat-item]',
  preview: '[data-testid=message-conversation-preview-text]',
  matchPrefix: '[data-testid=conv-preview-match-prefix]',
  onlinePrefix: '[data-testid=conv-preview-online-prefix]',
  name: '.common-display-name-text',
  dialog: '[data-testid=message-detail-dialog-surface], [data-testid=message-content-pane]',
  message: ':is([data-testid=private-text-message], [data-testid=private-quote-message])',
  bubble: ':is([data-testid=private-text-bubble], [data-testid=private-quote-body])',
  input: '.message-input-text[contenteditable]',
  send: 'button[aria-label="Send message"]',
  userCard: '[data-testid=message-user-card]',
  gift: '[data-testid=private-gift-card]',
  image: '[data-testid=private-image-message]',
  voice: '[data-testid=private-voice-message]',
  system: '[data-testid=private-system-message]',
  female: '.common-user-badge-list-item-gender-and-age--female',
};

// box-female gibi sistem kutuları sohbet kullanıcısı değildir.
function conversationRows() {
  return Array.from(document.querySelectorAll(SEL.row))
    .filter((row) => /^\d{1,30}$/.test(row.getAttribute('data-message-conversation-id') ?? ''));
}

async function waitFor(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(100);
  }
  return null;
}

function rowFor(peerId) {
  return conversationRows().find((r) => r.getAttribute('data-message-conversation-id') === String(peerId));
}

async function openChat(row) {
  const prev = document.querySelector(SEL.dialog);
  (row.querySelector(SEL.rowButton) ?? row).click();
  if (prev) await sleep(300);
  const dialog = await waitFor(() => {
    const pane = document.querySelector(SEL.dialog);
    return pane?.querySelector('[data-testid=private-chat-content]') ? pane : null;
  });
  if (dialog) {
    await waitFor(() => dialog.querySelector(`${SEL.message}, ${SEL.gift}, ${SEL.image}, ${SEL.voice}, ${SEL.userCard}`), 1500);
    await sleep(250);
  }
  return dialog;
}

/** İş bitince sohbetten çıkar; boşta beklerken yeni mesajlar otomatik okunmasın. */
async function leaveChat() {
  const NOTIFICATION_TITLES = ['bildirimler', 'notifications', 'notification'];
  const header = [...document.querySelectorAll('.conv-header-row')].find((b) => NOTIFICATION_TITLES.includes(b.querySelector('.conv-header-title')?.innerText.trim().toLocaleLowerCase('tr')));
  if (!header) return console.warn('[sugo-host] Bildirimler satırı bulunamadı');
  humanClick(header);
  await sleep(200);
}

/** Hediye kartı: gönderen bizsek out, değilse in; başlık ve fiyat `[hediye]` önekli metne çevrilir. */
function giftMessage(el) {
  const title = el.querySelector('[data-testid=private-gift-title]')?.innerText.trim() ?? '';
  const price = el.querySelector('[data-testid=private-gift-price]')?.innerText.trim();
  return { dir: el.closest('article')?.className.includes('justify-end') ? 'out' : 'in', text: `[hediye] ${title}${price ? ` (${price} elmas)` : ''}`.trim(), ts: '' };
}

/** Gönderdiğimiz mesajın altındaki "x40" elmas rozeti; yoksa 0. */
function diamondsOf(el) {
  if (el.getAttribute('data-state') !== 'sent') return 0;
  return Number(el.querySelector('[data-testid=private-text-diamond-count-main]')?.innerText.replace(/\D/g, '')) || 0;
}

function mediaMessage(el, kind) {
  const direction = el.getAttribute('data-state') === 'sent' ? 'out' : 'in';
  const source = kind === 'ses' ? el.getAttribute('data-voice-asset-source') : el.querySelector('[data-testid=private-image-content]')?.getAttribute('src');
  if (!source) return null;
  let hash = 2166136261;
  for (const c of source.split('?')[0]) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const id = (hash >>> 0).toString(16).padStart(8, '0');
  return { dir: direction, text: `[${direction === 'in' ? 'gelen' : 'gönderilen'} ${kind}:${id}]`, ts: '', diamonds: 0 };
}

/** Medya kimlikleri tekrarsız okunur; alıntılarda yalnız yeni cevap gövdesi alınır. */
function parseMessages(dialog) {
  return [...dialog.querySelectorAll(`${SEL.message}, ${SEL.gift}, ${SEL.image}, ${SEL.voice}`)]
    .filter((el) => !el.querySelector('[data-testid=private-text-send-failed]'))
    .map((el) => el.matches(SEL.image) ? mediaMessage(el, 'fotoğraf') : el.matches(SEL.voice) ? mediaMessage(el, 'ses') : el.matches(SEL.gift) ? giftMessage(el) : ({
      dir: el.getAttribute('data-state') === 'sent' ? 'out' : 'in',
      text: (el.querySelector(SEL.bubble)?.innerText ?? '').trim(),
      ts: '',
      diamonds: diamondsOf(el),
    }))
    .filter((m) => m?.text);
}

function isFollowNotice(text) {
  return ['senitakipettim', 'senitakipettimbirbirimizitakipettiktensonraarkadaşolabiliriz']
    .includes(String(text).toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, ''));
}
const isOnlineNotice = (text) => /partner\s+çevrim\s*içi|çevrim\s*içi\s+oldu|\[çevrim\s*içi\]/iu.test(text);
async function getNextJob(cfg, replyOnly = false) {
  const visiblePeerIds = conversationRows()
    .map((row) => row.getAttribute('data-message-conversation-id')).filter((id) => id && !skipped.has(id));
  return checkedCall({ path: '/api/ext/jobs/next', method: 'POST', body: { host: cfg.hostSugoId, replyOnly, visiblePeerIds } });
}
function ignoredReason(dialog) {
  if (dialog.querySelector(SEL.female)) return 'female';
  const system = [...dialog.querySelectorAll(SEL.system)].map((el) => el.innerText).join(' ').replace(/\s+/g, ' ');
  if (/alıcı tarafından reddedildi|sizi engelledi|seni engelledi|engellendiğiniz|you (?:have been|are) blocked/iu.test(system)) return 'blocked';
  const messages = parseMessages(dialog);
  const incoming = messages.filter((m) => m.dir === 'in');
  const tail = messages.slice(messages.map((m) => m.dir).lastIndexOf('out') + 1).filter((m) => m.dir === 'in');
  if ((tail.length && tail.every((m) => isFollowNotice(m.text))) || (incoming.length && incoming.every((m) => isFollowNotice(m.text)))) return 'follow';
  if (!tail.length) {
    const events = [...dialog.querySelectorAll(`${SEL.message}, ${SEL.image}, ${SEL.voice}, ${SEL.gift}, ${SEL.system}`)];
    if (isOnlineNotice(events.at(-1)?.innerText ?? '')) return 'activity';
  }
  return null;
}
async function skipConversation(cfg, peerId, dialog) {
  const reason = ignoredReason(dialog);
  if (!reason) return false;
  const result = await checkedCall({ path: '/api/ext/ignore', method: 'POST', body: { hostSugoId: cfg.hostSugoId, peerSugoId: peerId, reason } });
  if (!result.ignored) return false;
  if (reason === 'female' || reason === 'blocked') skipped.add(String(peerId));
  else {
    const row = rowFor(peerId);
    if (row) handled.set(String(peerId), { sig: rowSignature(row), at: Date.now() });
  }
  await clearPending(cfg, peerId);
  await chrome.storage.local.remove(followupKey(cfg, peerId));
  console.info('[sugo-host] sohbet yanıtlanmadan okundu:', peerId, reason);
  return true;
}

const rand = (min, max) => min + Math.random() * (max - min);

function pointerSequence(el, types) {
  const r = el.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  for (const t of types) el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, init));
}

/** Gerçek bir tıklama gibi: hover, basma, odaklanma, bırakma, click. */
function humanClick(el) {
  pointerSequence(el, ['pointerover', 'mouseover', 'pointermove', 'mousemove', 'pointerdown', 'mousedown']);
  el.focus();
  pointerSequence(el, ['pointerup', 'mouseup', 'click']);
}

function keyInit(key) {
  const isLetter = /^[a-z]$/i.test(key);
  const isDigit = /^\d$/.test(key);
  const code = key === 'Enter' ? 'Enter' : key === ' ' ? 'Space' : isLetter ? `Key${key.toUpperCase()}` : isDigit ? `Digit${key}` : '';
  const keyCode = key === 'Enter' ? 13 : key === ' ' ? 32 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  return { key, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true, view: window };
}

function caretToEnd(el) {
  const sel = getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function insertChar(input, ch) {
  const init = keyInit(ch);
  input.dispatchEvent(new KeyboardEvent('keydown', init));
  // execCommand tarayıcının kendi beforeinput/input olaylarını üretir; olmazsa elle taklit edilir.
  if (!document.execCommand('insertText', false, ch)) {
    input.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: ch }));
    input.append(document.createTextNode(ch));
    caretToEnd(input);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: ch }));
  }
  input.dispatchEvent(new KeyboardEvent('keyup', init));
}

const sentCount = (dialog) => dialog.querySelectorAll(`${SEL.message}[data-state=sent]`).length;

function pressEnter(input) {
  const init = keyInit('Enter');
  input.dispatchEvent(new KeyboardEvent('keydown', init));
  input.dispatchEvent(new KeyboardEvent('keypress', init));
  input.dispatchEvent(new KeyboardEvent('keyup', init));
}

function pasteText(input, text) {
  const data = new DataTransfer();
  data.setData('text/plain', text);
  input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }));
}

async function typeText(input, text) {
  for (const ch of Array.from(text)) {
    insertChar(input, ch);
    await sleep(rand(40, 130) + (ch === ' ' ? rand(0, 90) : 0));
  }
}

/** Metni yapıştırır; kutu dolmazsa karakter karakter yazar. Gönder butonunu etkinleştirmek editörün kendi olaylarına bağlı. */
async function fillInput(input, text) {
  humanClick(input);
  await sleep(rand(150, 350));
  input.textContent = '';
  caretToEnd(input);
  pasteText(input, text);
  await sleep(150);
  if (input.innerText.trim() === text.trim()) return;
  input.textContent = '';
  caretToEnd(input);
  await typeText(input, text);
}

const failedCount = (dialog) => dialog.querySelectorAll('[data-testid=private-text-send-failed]').length;

/** Metni gönderir. Sugo filtresi reddedip kırmızı ünlem koyarsa false, gönderildiyse true döner. */
async function typeAndSend(dialog, text, cfg) {
  const input = await waitFor(() => dialog.querySelector(SEL.input) ?? document.querySelector(SEL.input));
  if (!input) throw new Error('mesaj kutusu bulunamadı');
  const before = sentCount(dialog);
  const beforeFailed = failedCount(dialog);
  const sent = async () => !!(await waitFor(() => sentCount(dialog) > before || failedCount(dialog) > beforeFailed, 4000));
  // Mesaj önce gönderildi görünüp sugo filtresi yüzünden birazdan kırmızı ünlemle işaretlenebilir: kısa bir süre sonra sohbet yeniden okunur.
  const outcome = async () => {
    await sleep(rand(800, 1100));
    return failedCount(dialog) <= beforeFailed;
  };

  await fillInput(input, text);
  await sleep(rand(100, 300));

  const button = await waitFor(() => {
    const b = document.querySelector(SEL.send);
    return b && !b.disabled ? b : null;
  }, 3000);
  if (button) {
    await ensureRunning(cfg);
    humanClick(button);
    if (await sent()) return outcome();
  }
  await ensureRunning(cfg);
  pressEnter(input);
  if (await sent()) return outcome();
  throw new Error('mesaj gönderilemedi (gönder butonu ve Enter denendi)');
}

const anySentCount = (dialog) => dialog.querySelectorAll('[data-state=sent]').length;

const mainOnce = (type, timeout = 8000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { window.removeEventListener('message', onMessage); reject(new Error(`sayfa betiği yanıt vermedi: ${type}`)); }, timeout);
  function onMessage(e) {
    if (e.source !== window || e.data?.source !== 'sugo-ext-main') return;
    if (e.data.type === 'mic-error') { clearTimeout(timer); window.removeEventListener('message', onMessage); reject(new Error(e.data.error)); }
    if (e.data.type !== type) return;
    clearTimeout(timer);
    window.removeEventListener('message', onMessage);
    resolve(e.data);
  }
  window.addEventListener('message', onMessage);
});

function holdPointer(el, down) {
  const r = el.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, buttons: down ? 1 : 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  const types = down ? ['pointerover', 'pointermove', 'pointerdown', 'mousedown'] : ['pointerup', 'mouseup'];
  for (const t of types) el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, init));
}

/** Sohbetteki sesli mesaj butonu açık mı? Kapalıyken butonun simgesi "disabled" dosyasıdır (yakınlık seviyesi yetersiz). */
function voiceEnabled() {
  const mic = document.querySelector('button[aria-label="Send voice message"]');
  return !!mic && !mic.disabled && mic.getAttribute('aria-disabled') !== 'true' && ![...mic.querySelectorAll('img')].some((i) => /disabled/i.test(i.getAttribute('src') ?? ''));
}

const decodeMedia = (res) => ({ bytes: Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0)), type: res.contentType });

/** Gizli dosya input'una fotoğrafı koyar; site change olayında kendisi sohbete gönderir. */
async function sendPhoto(dialog, media) {
  const file = new File([media.bytes], `photo.${media.type.split('/')[1] || 'jpg'}`, { type: media.type });
  const input = document.querySelector('input[type=file][accept^="image"]');
  if (!input) throw new Error('dosya input\'u bulunamadı');
  const before = anySentCount(dialog);
  const data = new DataTransfer();
  data.items.add(file);
  input.files = data.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  if (!(await waitFor(() => anySentCount(dialog) > before, 20000))) throw new Error('fotoğraf gönderilemedi');
}

/** Sahte mikrofona ses dosyasını verir, mikrofon butonuna basıp ses süresi kadar basılı tutar, bırakınca site gönderir. */
async function sendVoice(dialog, media) {
  const mic = document.querySelector('button[aria-label="Send voice message"]');
  if (!voiceEnabled()) throw new Error('sesli mesaj kapalı (yakınlık seviyesi yetersiz olabilir)');
  const ready = mainOnce('mic-ready');
  window.postMessage({ source: 'sugo-ext', type: 'mic-prepare', bytes: media.bytes.buffer.slice(0) }, '*');
  const { duration } = await ready;
  try {
    const before = anySentCount(dialog);
    humanClick(mic);
    const record = await waitFor(() => document.querySelector('[data-testid=message-voice-record-button]'), 4000);
    if (!record) throw new Error('kayıt butonu açılmadı');
    await sleep(rand(300, 600));
    holdPointer(record, true);
    window.postMessage({ source: 'sugo-ext', type: 'mic-play' }, '*');
    await sleep((duration + rand(0.4, 0.8)) * 1000);
    holdPointer(record, false);
    if (!(await waitFor(() => anySentCount(dialog) > before, 20000))) throw new Error('sesli mesaj gönderilemedi');
  } finally {
    window.postMessage({ source: 'sugo-ext', type: 'mic-clear' }, '*');
  }
}

async function sendMedia(dialog, mediaId, cfg) {
  const res = await chrome.runtime.sendMessage({ type: 'media', id: mediaId });
  if (!res?.ok) throw new Error(`medya indirilemedi: ${res?.error}`);
  await ensureRunning(cfg);
  const media = decodeMedia(res);
  if (media.type.startsWith('audio/')) await sendVoice(dialog, media);
  else await sendPhoto(dialog, media);
  await sleep(rand(1200, 2200));
}

const followupKey = (cfg, peerId) => `sugo-followup:${cfg.hostSugoId}:${peerId}`;
async function syncArrivals(cfg, job, dialog, flush = true) {
  if (!Array.isArray(job.coveredKeys)) return false;
  const covered = new Set(job.coveredKeys);
  const messages = parseMessages(dialog);
  const counts = new Map();
  let unansweredFrom = -1;
  for (const [i, m] of messages.entries()) {
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${m.dir}|${m.ts ?? ''}|${m.text}`));
    const base = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    if (m.dir === 'in' && !covered.has(`${base}#${n}`)) { unansweredFrom = i; break; }
  }
  if (unansweredFrom < 0) {
    const key = followupKey(cfg, job.peerSugoId);
    const saved = (await chrome.storage.local.get(key))[key];
    if (!saved) return false;
    if (flush) {
      await checkedCall({ path: '/api/ext/ingest', method: 'POST', body: saved });
      await chrome.storage.local.remove(key);
    }
    return true;
  }
  const body = { hostSugoId: cfg.hostSugoId, peerSugoId: job.peerSugoId, voiceEnabled: voiceEnabled(), messages, unansweredFrom };
  // Cevap hazırlanırken/yazılırken otomatik okunan yeni mesaj, bağlantı kopsa da kaybolmaz.
  await chrome.storage.local.set({ [followupKey(cfg, job.peerSugoId)]: body });
  await rememberPending(cfg, job.peerSugoId, 0);
  if (!flush) return true;
  await checkedCall({ path: '/api/ext/ingest', method: 'POST', body });
  await chrome.storage.local.remove(followupKey(cfg, job.peerSugoId));
  return true;
}

async function runJob(cfg, job, opened = null) {
  let completed = false;
  let dialog = null;
  try {
    dialog = opened && String(opened.peerSugoId) === String(job.peerSugoId) && opened.dialog.isConnected
      ? opened.dialog : null;
    if (!dialog) {
      const row = rowFor(job.peerSugoId);
      if (!row) throw new Error(`sohbet listede yok: ${job.peerSugoId}`);
      dialog = await openChat(row);
    }
    if (!dialog) throw new Error('sohbet penceresi açılmadı');
    if (await skipConversation(cfg, job.peerSugoId, dialog)) return;
    if (job.sendText !== false) {
      let text = job.text;
      for (let attempt = 0; !(await typeAndSend(dialog, text, cfg)); attempt++) {
        if (await skipConversation(cfg, job.peerSugoId, dialog)) return;
        if (attempt >= 2) throw new Error('sugo filtresi mesajları reddetti');
        const filler = await call({ path: `/api/ext/jobs/${job.id}/rejected`, method: 'POST', body: { text } });
        if (!filler.ok || !filler.data?.text) throw new Error('filtreye takılan mesaj için yedek cevap üretilemedi');
        text = filler.data.text;
        await sleep(rand(1500, 3000));
      }
      if (job.mediaId) await sleep(rand(800, 1800));
    }
    if (await skipConversation(cfg, job.peerSugoId, dialog)) return;
    if (job.mediaId) await sendMedia(dialog, job.mediaId, cfg);
    await syncArrivals(cfg, job, dialog, false);
    await checkedCall({ path: `/api/ext/jobs/${job.id}/complete`, method: 'POST' });
    completed = true;
    const more = await syncArrivals(cfg, job, dialog);
    if (!more) await clearPending(cfg, job.peerSugoId);
    if (job.kind === 'welcome') {
      greeted.set(String(job.peerSugoId), Date.now());
      lastMatchRepairAt = Date.now();
      normalRepliesSinceRepair = 0;
    } else if (job.kind === 'reply') normalRepliesSinceRepair++;
    const sentRow = rowFor(job.peerSugoId);
    if (sentRow) handled.set(String(job.peerSugoId), { sig: rowSignature(sentRow), at: Date.now() });
  } catch (e) {
    if (dialog) {
      try { if (await skipConversation(cfg, job.peerSugoId, dialog)) return; }
      catch (skipError) { console.warn('[sugo-host] atlama kararı sunucuya kaydedilemedi:', skipError.message); }
    }
    await rememberPending(cfg, job.peerSugoId, Date.now() + 15000);
    if (!completed) await checkedCall({ path: `/api/ext/jobs/${job.id}/fail`, method: 'POST', body: { error: e.message } });
    else console.warn('[sugo-host] cevap gönderildi, takip mesajlarının senkronizasyonu yeniden denenecek:', e.message);
  } finally {
    await leaveChat();
  }
}

/** Kadın veya engelli olduğu için okunup atlanan sohbetler. */
const skipped = new Set();
/**
 * Normal mesajlar en eskiden başlayarak seçilir; eşleşmeler ancak normal mesaj işi kalmayınca açılır.
 */
const GREET_RETRY_MS = 3 * 60 * 1000;
const MATCH_EVERY_REPLIES = 1;
const MATCH_MIN_GAP_MS = 5000;
const greeted = new Map();
let lastMatchRepairAt = 0;
let normalRepliesSinceRepair = 0;
/** Sohbet en son hangi satır görünümüyle (önizleme, saat) okundu. Site okunmadı işaretini kaldırmasa da aynı görünümdeki sohbet HANDLED_RETRY_MS boyunca yeniden açılmaz; süre dolunca okunmadı kaldıysa tekrar okunur, böylece cevapsız sohbet kalmaz. */
const HANDLED_RETRY_MS = 60 * 1000;
const handled = new Map();
// Sohbet açılınca site okunmadı rozetini kaldırsa da tamamlanmayan işler yeniden ele alınır.
const pendingRows = new Map();
let pendingHost = null;
const pendingKey = (cfg, peerId) => `sugo-pending:${cfg.hostSugoId}:${peerId}`;
async function loadPending(cfg) {
  if (pendingHost === cfg.hostSugoId) return;
  const stored = await chrome.storage.local.get(null);
  const prefix = `sugo-pending:${cfg.hostSugoId}:`;
  pendingRows.clear();
  for (const [key, at] of Object.entries(stored)) {
    if (key.startsWith(prefix)) pendingRows.set(key.slice(prefix.length), Number(at) || 0);
  }
  pendingHost = cfg.hostSugoId;
}
async function rememberPending(cfg, peerId, at) {
  pendingRows.set(String(peerId), at);
  await chrome.storage.local.set({ [pendingKey(cfg, peerId)]: at });
}
async function clearPending(cfg, peerId) {
  pendingRows.delete(String(peerId));
  await chrome.storage.local.remove(pendingKey(cfg, peerId));
}
const rowSignature = (r) => r.innerText.replace(/\s+/g, ' ').trim();
const rowPreview = (r) => r.querySelector(SEL.preview)?.innerText ?? rowSignature(r);
const isOnlineRow = (r) => !!r.querySelector(SEL.onlinePrefix) || isOnlineNotice(rowPreview(r));
const isMatchRow = (r) => !isOnlineRow(r) && (!!r.querySelector(SEL.matchPrefix) || /eşleşme/i.test(rowPreview(r)));
function hasPendingNormal(rows) {
  return rows.some((r) => {
    const id = r.getAttribute('data-message-conversation-id');
    if (skipped.has(id) || isMatchRow(r) || isOnlineRow(r)) return false;
    if (pendingRows.has(id)) return Date.now() >= pendingRows.get(id);
    const h = handled.get(id);
    return !!r.querySelector(SEL.unread) && !(h && h.sig === rowSignature(r) && Date.now() - h.at < HANDLED_RETRY_MS);
  });
}
function nextMatchRow(rows = conversationRows()) {
  return rows.find((r) => {
    const id = r.getAttribute('data-message-conversation-id');
    const h = handled.get(id);
    return !skipped.has(id) && isMatchRow(r) && Date.now() >= (pendingRows.get(id) ?? 0)
      && !(h && h.sig === rowSignature(r) && Date.now() - h.at < HANDLED_RETRY_MS)
      && Date.now() - (greeted.get(id) ?? 0) > GREET_RETRY_MS;
  }) ?? null;
}
function nextRow({ matches = true, online = false } = {}) {
  const rows = conversationRows();
  const normal = rows.filter((r) => {
    const id = r.getAttribute('data-message-conversation-id');
    if (skipped.has(id) || isMatchRow(r) || isOnlineRow(r) !== online) return false;
    if (pendingRows.has(id)) return Date.now() >= pendingRows.get(id);
    const h = handled.get(id);
    return !!r.querySelector(SEL.unread) && !(h && h.sig === rowSignature(r) && Date.now() - h.at < HANDLED_RETRY_MS);
  }).pop();
  if (normal || !matches) return normal ?? null;
  // Gönderilmeye hazır normal mesajlar önceliklidir; hata beklemesi eşleşmeleri durdurmaz.
  if (hasPendingNormal(rows)) return null;
  return nextMatchRow(rows);
}

let lastIdleLog = 0;
/** Boşta beklerken 20 sn'de bir durumu yazar: neden sohbet açılmadığı konsoldan görülsün. */
function logIdle() {
  if (Date.now() - lastIdleLog < 20000) return;
  lastIdleLog = Date.now();
  const rows = conversationRows();
  const unread = rows.filter((r) => r.querySelector(SEL.unread));
  const id = (r) => r.getAttribute('data-message-conversation-id');
  console.info('[sugo-host] boşta:', { adres: location.pathname, satır: rows.length, okunmamış: unread.length, okunmamışAtlanan: unread.filter((r) => skipped.has(id(r))).length, okunmamışBeklemede: unread.filter((r) => handled.has(id(r))).length, bildirimlerSatırı: !!document.querySelector('.conv-header-row') });
}

async function ingestUnread(cfg, row = nextRow()) {
  if (!row) {
    logIdle();
    return false;
  }
  const peerSugoId = row.getAttribute('data-message-conversation-id');
  await rememberPending(cfg, peerSugoId, Date.now() + 15000);
  const peerName = row.querySelector(SEL.name)?.innerText.trim() ?? '';
  let failedJob = false;
  try {
    const dialog = await openChat(row);
    if (!dialog) throw new Error('sohbet penceresi açılmadı');
    if (await skipConversation(cfg, peerSugoId, dialog)) {
      await leaveChat();
      return true;
    }
    const key = followupKey(cfg, peerSugoId);
    const saved = (await chrome.storage.local.get(key))[key];
    if (saved) {
      await checkedCall({ path: '/api/ext/ingest', method: 'POST', body: saved });
      await chrome.storage.local.remove(key);
    }
    const messages = parseMessages(dialog);
    if (!messages.length && (!isMatchRow(row) || !dialog.querySelector(SEL.userCard))) {
      throw new Error('sohbet açıldı ama okunabilir mesaj yüklenmedi');
    }
    const body = { hostSugoId: cfg.hostSugoId, peerSugoId, peerName, voiceEnabled: voiceEnabled(), messages };
    let res = await call({ path: '/api/ext/ingest', method: 'POST', body });
    if (res?.ok && !res.data?.job && messages.at(-1)?.dir === 'in') {
      // DOM'da son söz karşı taraftaysa eski "işlendi" kaydı yüzünden cevapsız bırakma.
      const unansweredFrom = messages.map((m) => m.dir).lastIndexOf('out') + 1;
      res = await call({ path: '/api/ext/ingest', method: 'POST', body: { ...body, unansweredFrom } });
    }
    if (!res?.ok) throw new Error(res?.error || 'mesajlar sunucuya iletilemedi');
    if (res.data?.job?.status === 'failed') {
      failedJob = true;
      throw new Error(res.data.job.error || 'cevap üretimi başarısız');
    }
    console.info('[sugo-host] sohbet okundu, sunucuya gönderildi:', peerSugoId, `${messages.length} mesaj`);
    // Ingest cevabı hazırlamayı bekler; hazır işi aynı sohbet açıkken kilitleyip gönder.
    if (res?.ok && res.data?.job?.status === 'pending') {
      const next = await getNextJob(cfg, res.data.job.kind !== 'welcome' && messages.length > 0);
      if (next.job) {
        await runJob(cfg, next.job, { peerSugoId, dialog });
        return true;
      }
      await rememberPending(cfg, peerSugoId, Date.now() + 3000);
    } else if (!res.data?.job) {
      if (messages.at(-1)?.dir === 'in') throw new Error('gelen mesaj var ama sunucu cevap işi oluşturmadı');
      await clearPending(cfg, peerSugoId);
      handled.set(peerSugoId, { sig: rowSignature(row), at: Date.now() });
      if (!messages.length) greeted.set(peerSugoId, Date.now());
    }
    await leaveChat();
    return true;
  } catch (e) {
    console.warn('[sugo-host] sohbet cevaplanamadı:', peerSugoId, e.message);
    await rememberPending(cfg, peerSugoId, Date.now() + 15000);
    if (!failedJob) {
      try {
        await checkedCall({ path: '/api/ext/errors', method: 'POST', body: { hostSugoId: cfg.hostSugoId, peerSugoId, error: e.message } });
      } catch (reportError) { console.error('[sugo-host] hata sunucuya kaydedilemedi:', reportError.message); }
    }
    await leaveChat();
    return false;
  }
}

let busy = false;

/** Popup'taki test düğmesi: metni TTS ile okutup açık sohbete sesli mesaj olarak gönderir. */
async function testVoice(text) {
  if (busy) return { ok: false, error: 'Otomasyon meşgul, birkaç saniye sonra tekrar dene' };
  busy = true;
  try {
    const cfg = await getConfig();
    if (!cfg.hostSugoId || !cfg.apiKey) return { ok: false, error: 'Host id ve API anahtarı ayarlı değil' };
    const dialog = document.querySelector(SEL.dialog);
    if (!location.pathname.startsWith('/messages') || !dialog) return { ok: false, error: 'Önce /messages sayfasında bir sohbeti aç' };
    const made = await call({ path: '/api/ext/tts-test', method: 'POST', body: { hostSugoId: cfg.hostSugoId, text } });
    if (!made.ok) return { ok: false, error: made.error };
    try {
      await sendMedia(dialog, made.data.mediaId);
    } finally {
      await call({ path: `/api/ext/media/${made.data.mediaId}`, method: 'DELETE' });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    busy = false;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'test-voice') return false;
  testVoice(String(msg.text ?? '')).then(reply);
  return true;
});
/** İş yaptıysa true döner; döngü bu durumda beklemeden sıradakine geçer. */
async function tick() {
  if (busy || !location.pathname.startsWith('/messages')) return false;
  busy = true;
  try {
    const cfg = await getConfig();
    if (!cfg.enabled || !cfg.hostSugoId || !cfg.apiKey) return false;
    await loadPending(cfg);
    // Sürekli normal trafik varken de her cevaptan sonra (en erken 5 sn arayla) bir eşleşme açılır.
    if (normalRepliesSinceRepair >= MATCH_EVERY_REPLIES && Date.now() - lastMatchRepairAt >= MATCH_MIN_GAP_MS) {
      const repair = nextMatchRow();
      if (repair) {
        lastMatchRepairAt = Date.now();
        normalRepliesSinceRepair = 0;
        return await ingestUnread(cfg, repair);
      }
    }
    const replies = await getNextJob(cfg, true);
    if (replies.job) { await runJob(cfg, replies.job); return true; }
    const normal = nextRow({ matches: false });
    if (normal) return await ingestUnread(cfg, normal);
    const rows = conversationRows();
    if (hasPendingNormal(rows)) return false;
    const next = await getNextJob(cfg);
    if (next.job) { await runJob(cfg, next.job); return true; }
    const match = nextRow();
    if (match) return await ingestUnread(cfg, match);
    const online = nextRow({ matches: false, online: true });
    return online ? await ingestUnread(cfg, online) : false;
  } catch (e) {
    console.warn('[sugo-host]', e);
    return false;
  } finally {
    busy = false;
  }
}

(async function loop() {
  for (;;) {
    const worked = await tick();
    if (!worked) await sleep(POLL_MS);
  }
})();

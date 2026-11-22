// sugo.live /messages: okunmamış sohbetleri dashboard'a iletir, kuyruktaki cevapları yazıp gönderir.
const POLL_MS = 400;
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
    await waitFor(() => dialog.querySelector(`${SEL.message}, ${SEL.gift}, ${SEL.image}, ${SEL.voice}, ${SEL.userCard}`), 3000);
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
async function getNextJob(cfg, replyOnly = false, only = null) {
  const visiblePeerIds = only ?? conversationRows()
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
  return null;
}
/** Sohbetin son olayı "partner çevrim içi" bildirimiyse karşılama selamı için sunucuya işaretlenir. */
function endsWithOnlineNotice(dialog) {
  const events = [...dialog.querySelectorAll(`${SEL.message}, ${SEL.image}, ${SEL.voice}, ${SEL.gift}, ${SEL.system}`)];
  return isOnlineNotice(events.at(-1)?.innerText ?? '');
}
async function skipConversation(cfg, peerId, dialog) {
  const reason = ignoredReason(dialog);
  // "Seni takip ettim" bildirimi yanıtsız bırakılmaz: sohbete düz karşılama mesajı gider.
  if (!reason || reason === 'follow') return false;
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
  setState(job.kind === 'welcome' ? 'karşılama gönderiyor' : 'cevap gönderiyor', String(job.peerSugoId));
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
    lastActivityAt = Date.now();
    await noteSent(cfg);
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
// Boş veya cevapsız eşleşme satırları bu süre geçmeden yeniden açılmaz.
const GREET_RETRY_MS = 30 * 60 * 1000;
const MATCH_RETRY_MS = 30 * 60 * 1000;
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
// Okunmamış rozetli eşleşme satırı, okunmuş eski eşleşmelerin önünde ve daha kısa bekleme ile açılır.
const UNREAD_MATCH_RETRY_MS = 5 * 60 * 1000;
function nextMatchRow(rows = conversationRows()) {
  const now = Date.now();
  const open = (r) => {
    const id = r.getAttribute('data-message-conversation-id');
    return !skipped.has(id) && isMatchRow(r) && now >= (pendingRows.get(id) ?? 0);
  };
  const recent = (r, ms) => {
    const h = handled.get(r.getAttribute('data-message-conversation-id'));
    return !!h && h.sig === rowSignature(r) && now - h.at < ms;
  };
  const unread = rows.filter((r) => open(r) && r.querySelector(SEL.unread) && !recent(r, UNREAD_MATCH_RETRY_MS)).pop();
  if (unread) return unread;
  return rows.find((r) => open(r) && !recent(r, MATCH_RETRY_MS)
    && now - (greeted.get(r.getAttribute('data-message-conversation-id')) ?? 0) > GREET_RETRY_MS) ?? null;
}
const LOAD_MORE_GAP_MS = 2 * 60 * 1000;
let lastLoadMoreAt = 0;
function listScroller() {
  for (let el = conversationRows()[0]?.parentElement; el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
  }
  return null;
}
/** Sohbet listesini en alta kaydırıp tembel yüklenen satırları DOM'a getirir, sonra başa döner. */
async function loadMoreRows(force = false) {
  if (!force && Date.now() - lastLoadMoreAt < LOAD_MORE_GAP_MS) return false;
  lastLoadMoreAt = Date.now();
  const area = listScroller();
  if (!area) return false;
  const before = conversationRows().length;
  for (let i = 0; i < 6; i++) {
    const count = conversationRows().length;
    area.scrollTo({ top: area.scrollHeight });
    await sleep(700);
    if (conversationRows().length === count && i > 0) break;
  }
  area.scrollTo({ top: 0 });
  await sleep(300);
  const after = conversationRows().length;
  if (after > before) console.info('[sugo-host] liste kaydırıldı:', { önce: before, sonra: after });
  return after > before;
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
  console.info('[sugo-host] boşta:', { adres: location.pathname, satır: rows.length, okunmamış: unread.length, okunmamışAtlanan: unread.filter((r) => skipped.has(id(r))).length, okunmamışBeklemede: unread.filter((r) => handled.has(id(r))).length, bildirimlerSatırı: !!document.querySelector('.conv-header-row'), sessizlikSn: Math.round((Date.now() - lastActivityAt) / 1000) });
}

async function ingestUnread(cfg, row = nextRow()) {
  if (!row) {
    logIdle();
    return false;
  }
  const peerSugoId = row.getAttribute('data-message-conversation-id');
  setState('sohbet okuyor', String(peerSugoId));
  await rememberPending(cfg, peerSugoId, Date.now() + 15000);
  const peerName = row.querySelector(SEL.name)?.innerText.trim() ?? '';
  let failedJob = false;
  let emptyAttempt = false;
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
    let messages = parseMessages(dialog);
    // Mesajlar geç yükleniyor olabilir; boş sayıp yinelenen selam atmamak için bir kez daha bakılır.
    if (!messages.length) {
      await sleep(2500);
      messages = parseMessages(dialog);
    }
    emptyAttempt = !messages.length;
    const followOnly = ignoredReason(dialog) === 'follow';
    if (!messages.length && !dialog.querySelector(`${SEL.userCard}, ${SEL.system}`)) {
      throw new Error('sohbet açıldı ama okunabilir mesaj yüklenmedi');
    }
    const body = { hostSugoId: cfg.hostSugoId, peerSugoId, peerName, voiceEnabled: voiceEnabled(), messages, ...(isOnlineRow(row) || endsWithOnlineNotice(dialog) ? { online: true } : {}), ...(!messages.length || followOnly ? { emptyChat: true } : {}) };
    let res = await call({ path: '/api/ext/ingest', method: 'POST', body });
    if (res?.ok && !res.data?.job && messages.at(-1)?.dir === 'in' && !followOnly) {
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
    if (res.data?.job) lastActivityAt = Date.now();
    // Ingest cevabı hazırlamayı bekler; hazır işi aynı sohbet açıkken kilitleyip gönder.
    if (res?.ok && res.data?.job?.status === 'pending') {
      // Boş sohbette yalnız bu sohbetin selamı alınır; böylece başka sohbetin işi araya girmez ve selam açık sohbette gider.
      const next = body.emptyChat ? await getNextJob(cfg, false, [peerSugoId]) : await getNextJob(cfg, res.data.job.kind !== 'welcome' && messages.length > 0);
      if (next.job) {
        await runJob(cfg, next.job, { peerSugoId, dialog });
        return true;
      }
      await rememberPending(cfg, peerSugoId, Date.now() + (messages.length ? 3000 : 20000));
    } else if (!res.data?.job) {
      if (messages.at(-1)?.dir === 'in' && !followOnly) throw new Error('gelen mesaj var ama sunucu cevap işi oluşturmadı');
      await clearPending(cfg, peerSugoId);
      handled.set(peerSugoId, { sig: rowSignature(row), at: Date.now() });
      if (!messages.length) greeted.set(peerSugoId, Date.now());
    }
    await leaveChat();
    return true;
  } catch (e) {
    console.warn('[sugo-host] sohbet cevaplanamadı:', peerSugoId, e.message);
    // Boş eşleşmede hata tekrarlanırsa sohbet saniyeler içinde yeniden açılıp durmasın.
    await rememberPending(cfg, peerSugoId, Date.now() + (failedJob ? 60000 : emptyAttempt ? 30000 : 15000));
    if (!failedJob) {
      try {
        await checkedCall({ path: '/api/ext/errors', method: 'POST', body: { hostSugoId: cfg.hostSugoId, peerSugoId, error: e.message } });
      } catch (reportError) { console.error('[sugo-host] hata sunucuya kaydedilemedi:', reportError.message); }
    }
    await leaveChat();
    return false;
  }
}

const HI = { homeLink: 'a[href="/"]', messagesLink: 'a[href="/messages"]' };
let lastActivityAt = Date.now();

/** Site içi bağlantıya tıklayıp rota değişmesini bekler (sayfa yenilenmez, betik yaşamaya devam eder). */
async function goTo(selector, path) {
  const link = await waitFor(() => document.querySelector(selector), 3000);
  if (!link) throw new Error(`gezinme bağlantısı bulunamadı: ${path}`);
  humanClick(link);
  if (!(await waitFor(() => location.pathname === path, 5000))) throw new Error(`sayfa açılmadı: ${path}`);
  await sleep(rand(800, 1500));
}

// Boştayken hesabın aktif görünmesi için rastgele insansı hareketler: fare gezintisi ve kaydırma.
// Sayfa değiştirmez, sohbet açmaz, mesaj göndermez; yalnız Mesajlar'da kalır.
const HUMAN_GAP_MS = [25000, 90000];
let nextHumanAt = Date.now() + rand(...HUMAN_GAP_MS);
let pointerAt = { x: rand(200, 800), y: rand(150, 500) };
const humanDue = (now, nextAt) => now >= nextAt;

function pointerEvent(type, x, y) {
  const target = document.elementFromPoint(x, y) ?? document.body;
  const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  target.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, init));
}

/** Fareyi mevcut konumdan rastgele bir noktaya eğri bir yolla götürür. */
async function wanderMouse() {
  const to = { x: rand(60, Math.max(120, innerWidth - 60)), y: rand(60, Math.max(120, innerHeight - 60)) };
  const bend = { x: rand(-120, 120), y: rand(-120, 120) };
  const steps = Math.round(rand(10, 28));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * t * (3 - 2 * t);
    const x = pointerAt.x + (to.x - pointerAt.x) * ease + Math.sin(Math.PI * t) * bend.x;
    const y = pointerAt.y + (to.y - pointerAt.y) * ease + Math.sin(Math.PI * t) * bend.y;
    const cx = Math.min(innerWidth - 1, Math.max(0, x));
    const cy = Math.min(innerHeight - 1, Math.max(0, y));
    pointerEvent('pointermove', cx, cy);
    pointerEvent('mousemove', cx, cy);
    await sleep(rand(8, 28));
  }
  pointerAt = to;
}

function scrollableAt(x, y) {
  for (let el = document.elementFromPoint(x, y); el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
  }
  return document.scrollingElement;
}

/** İmlecin altındaki kaydırılabilir alanı aşağı, sonra kısmen yukarı kaydırır. */
async function wanderScroll() {
  const area = scrollableAt(pointerAt.x, pointerAt.y);
  if (!area) return;
  const down = Math.round(rand(120, 520));
  for (const delta of [down, -Math.round(down * rand(0.3, 1))]) {
    const steps = Math.round(rand(5, 12));
    for (let i = 0; i < steps; i++) {
      const part = delta / steps;
      area.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, view: window, deltaY: part, clientX: pointerAt.x, clientY: pointerAt.y }));
      area.scrollBy({ top: part });
      await sleep(rand(30, 90));
    }
    await sleep(rand(400, 1600));
  }
}

async function humanIdle() {
  if (!humanDue(Date.now(), nextHumanAt)) return false;
  nextHumanAt = Date.now() + rand(...HUMAN_GAP_MS);
  await wanderMouse();
  if (Math.random() < 0.6) await wanderScroll();
  return false;
}


// Panelde "canlı durum" için eklentinin ne yaptığı 30 saniyede bir (ve önemli anlarda) sunucuya bildirilir.
let uiState = { state: 'başlıyor', detail: '', since: Date.now() };
let lastBeat = 0;
let beatCfg = null;
function setState(state, detail = '') {
  if (uiState.state === state && uiState.detail === detail) return;
  const changed = uiState.state !== state;
  uiState = { state, detail, since: changed ? Date.now() : uiState.since };
  // Durum değişince panel 30 sn'lik aralığı beklemesin (en çok 3 sn'de bir bildirilir).
  if (changed && beatCfg && Date.now() - lastBeat > 3000) heartbeat(beatCfg, true).catch(() => {});
}
async function heartbeat(cfg, force = false) {
  beatCfg = cfg;
  if (!force && Date.now() - lastBeat < 30000) return;
  lastBeat = Date.now();
  let version = '';
  try { version = chrome.runtime.getManifest().version; } catch {}
  const lastSentAt = Number((await chrome.storage.local.get(lastSentKey(cfg)))[lastSentKey(cfg)]) || 0;
  call({ path: '/api/ext/state', method: 'POST', body: { hostSugoId: cfg.hostSugoId, ...uiState, lastSentAt, lastActivityAt, version } });
}

let scriptStartedAt = Date.now();
const lastSentKey = (cfg) => `sugo-last-sent:${cfg.hostSugoId}`;

/** Mesaj gönderilince boşta sayacı sıfırlanır. */
async function noteSent(cfg) {
  await chrome.storage.local.set({ [lastSentKey(cfg)]: Date.now() });
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
// Sayfa Mesajlar dışında takılı kaldıysa (dinlenme/yenileme sonrası ana sayfada beklemek gibi) Mesajlar'a geçilir.
let nextBackTryAt = 0;
let backTries = 0;
async function backToMessages() {
  if (Date.now() - scriptStartedAt < 8000 || Date.now() < nextBackTryAt) return false;
  const cfg = await getConfig();
  if (!cfg?.enabled || !cfg.hostSugoId || !cfg.apiKey) return false;
  const waitKey = `sugo-back-after:${cfg.hostSugoId}`;
  if (Date.now() < (Number((await chrome.storage.local.get(waitKey))[waitKey]) || 0)) return false;
  nextBackTryAt = Date.now() + rand(8000, 15000);
  setState('mesajlara geçiyor', `sayfa: ${location.pathname}`);
  await heartbeat(cfg, true);
  try {
    await goTo(HI.messagesLink, '/messages');
    backTries = 0;
    return true;
  } catch (e) {
    console.warn('[sugo-host] Mesajlar sayfasına geçilemedi:', e.message);
    // Bağlantı hiç gelmediyse üçüncü denemeden sonra Ana sayfa (/) tam yüklenir; Mesajlar'a birkaç dakika sonra yine bağlantıya tıklanarak geçilir.
    if (++backTries >= 3) {
      backTries = 0;
      await chrome.storage.local.set({ [waitKey]: Date.now() + rand(2, 4) * 60000 });
      if (location.pathname === '/') location.reload(); else location.assign('/');
    }
    return false;
  }
}

async function tick() {
  if (busy) return false;
  if (!location.pathname.startsWith('/messages')) return await backToMessages();
  busy = true;
  try {
    const cfg = await getConfig();
    if (!cfg.enabled || !cfg.hostSugoId || !cfg.apiKey) return false;
    await loadPending(cfg);
    await heartbeat(cfg);
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
    if (online) return await ingestUnread(cfg, online);
    // Boştayken Ana sayfa/Yakınlarda gezintisi, hi gönderme ve sayfa değiştirme yapılmaz; yalnız Mesajlar'da beklenir.
    if (await loadMoreRows()) return true;
    setState('boşta', 'yeni mesaj/eşleşme bekleniyor');
    return await humanIdle();
  } catch (e) {
    if (/Extension context invalidated/i.test(e?.message ?? '')) { staleContext(); return false; }
    console.warn('[sugo-host]', e);
    return false;
  } finally {
    busy = false;
  }
}

/** Eklenti güncellenince eski content script bağlamını yitirir; döngüyü durdurup sayfayı yeniler, yenisi devralır. */
let stale = false;
function staleContext() {
  if (stale) return;
  stale = true;
  console.info('[sugo-host] eklenti güncellendi, sayfa yenileniyor');
  // Mesajlar rotasında tam yenileme yapılmaz: önce Ana sayfaya geçilir, yenileme orada olur.
  const home = location.pathname.startsWith('/messages') ? document.querySelector(HI.homeLink) : null;
  if (home) home.click();
  setTimeout(() => { if (!location.pathname.startsWith('/messages')) location.reload(); }, home ? 4000 : 1500);
}

(async function loop() {
  while (!stale) {
    const worked = await tick();
    if (!worked) await sleep(POLL_MS);
  }
})();

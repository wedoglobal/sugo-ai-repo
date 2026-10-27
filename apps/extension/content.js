// sugo.live /messages: okunmamış sohbetleri dashboard'a iletir, kuyruktaki cevapları yazıp gönderir.
const POLL_MS = 5000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (m) => chrome.runtime.sendMessage({ type: 'api', ...m });
const getConfig = () => chrome.runtime.sendMessage({ type: 'config' });

const SEL = {
  row: '[data-message-conversation-id]',
  unread: '.conv-item-unread',
  rowButton: 'button[data-testid=message-single-chat-item]',
  name: '.common-display-name-text',
  dialog: '[data-testid=message-detail-dialog-surface], [data-testid=message-content-pane]',
  message: '[data-testid=private-text-message]',
  bubble: '[data-testid=private-text-bubble]',
  input: '.message-input-text[contenteditable]',
  send: 'button[aria-label="Send message"]',
  userCard: '[data-testid=message-user-card]',
  gift: '[data-testid=private-gift-card]',
};

async function waitFor(fn, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(200);
  }
  return null;
}

function rowFor(peerId) {
  return [...document.querySelectorAll(SEL.row)].find((r) => r.getAttribute('data-message-conversation-id') === String(peerId));
}

async function openChat(row) {
  const prev = document.querySelector(SEL.dialog);
  (row.querySelector(SEL.rowButton) ?? row).click();
  if (prev) await sleep(600);
  const dialog = await waitFor(() => document.querySelector(SEL.dialog));
  if (dialog) await sleep(1000);
  return dialog;
}

/** Açık sohbetten çıkar: bekleme sırasında gelen mesajlar orada otomatik okundu olmasın diye Bildirimler satırına geçer. */
async function leaveChat() {
  const header = [...document.querySelectorAll('.conv-header-row')].find((b) => b.querySelector('.conv-header-title')?.innerText.trim().toLocaleLowerCase('tr') === 'bildirimler');
  if (!header) return console.warn('[sugo-host] Bildirimler satırı bulunamadı');
  humanClick(header);
  await sleep(600);
}

/** Hediye kartı: gönderen bizsek out, değilse in; başlık ve fiyat `[hediye]` önekli metne çevrilir. */
function giftMessage(el) {
  const title = el.querySelector('[data-testid=private-gift-title]')?.innerText.trim() ?? '';
  const price = el.querySelector('[data-testid=private-gift-price]')?.innerText.trim();
  return { dir: el.closest('article')?.className.includes('justify-end') ? 'out' : 'in', text: `[hediye] ${title}${price ? ` (${price} elmas)` : ''}`.trim(), ts: '' };
}

function parseMessages(dialog) {
  return [...dialog.querySelectorAll(`${SEL.message}, ${SEL.gift}`)]
    .map((el) => el.matches(SEL.gift) ? giftMessage(el) : ({
      dir: el.getAttribute('data-state') === 'sent' ? 'out' : 'in',
      text: (el.querySelector(SEL.bubble)?.innerText ?? '').trim(),
      ts: '',
    }))
    .filter((m) => m.text);
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
  await sleep(rand(400, 900));
  input.textContent = '';
  caretToEnd(input);
  pasteText(input, text);
  await sleep(300);
  if (input.innerText.trim() === text.trim()) return;
  input.textContent = '';
  caretToEnd(input);
  await typeText(input, text);
}

const failedCount = (dialog) => dialog.querySelectorAll('[data-testid=private-text-send-failed]').length;

/** Metni gönderir. Sugo filtresi reddedip kırmızı ünlem koyarsa false, gönderildiyse true döner. */
async function typeAndSend(dialog, text) {
  const input = await waitFor(() => dialog.querySelector(SEL.input) ?? document.querySelector(SEL.input));
  if (!input) throw new Error('mesaj kutusu bulunamadı');
  const before = sentCount(dialog);
  const beforeFailed = failedCount(dialog);
  const sent = async () => !!(await waitFor(() => sentCount(dialog) > before || failedCount(dialog) > beforeFailed, 4000));
  const outcome = () => failedCount(dialog) > beforeFailed ? false : true;

  await fillInput(input, text);
  await sleep(rand(300, 800));

  const button = await waitFor(() => {
    const b = document.querySelector(SEL.send);
    return b && !b.disabled ? b : null;
  }, 3000);
  if (button) {
    humanClick(button);
    if (await sent()) return outcome();
  }
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

async function sendMedia(dialog, mediaId) {
  const res = await chrome.runtime.sendMessage({ type: 'media', id: mediaId });
  if (!res?.ok) throw new Error(`medya indirilemedi: ${res?.error}`);
  const media = decodeMedia(res);
  if (media.type.startsWith('audio/')) await sendVoice(dialog, media);
  else await sendPhoto(dialog, media);
  await sleep(rand(1200, 2200));
}

async function runJob(cfg, job) {
  try {
    const row = rowFor(job.peerSugoId);
    if (!row) throw new Error(`sohbet listede yok: ${job.peerSugoId}`);
    const dialog = await openChat(row);
    if (!dialog) throw new Error('sohbet penceresi açılmadı');
    if (job.sendText !== false) {
      let text = job.text;
      for (let attempt = 0; !(await typeAndSend(dialog, text)); attempt++) {
        if (attempt >= 2) throw new Error('sugo filtresi mesajları reddetti');
        const filler = await call({ path: `/api/ext/jobs/${job.id}/rejected`, method: 'POST', body: { text } });
        if (!filler.ok || !filler.data?.text) throw new Error('filtreye takılan mesaj için yedek cevap üretilemedi');
        text = filler.data.text;
        await sleep(rand(1500, 3000));
      }
      if (job.mediaId) await sleep(rand(800, 1800));
    }
    if (job.mediaId) await sendMedia(dialog, job.mediaId);
    await call({ path: `/api/ext/jobs/${job.id}/complete`, method: 'POST' });
  } catch (e) {
    await call({ path: `/api/ext/jobs/${job.id}/fail`, method: 'POST', body: { error: e.message } });
  } finally {
    await leaveChat();
  }
}

/**
 * Sıradaki sohbet: liste en yeni üstte olduğundan en eski okunmamış sohbet listedeki sonuncusudur.
 * Okunmamış yoksa sugo'nun eşleşme verdiği (önizlemede "eşleşme" geçen), henüz açılmamış sohbet. Önizlemede hâlâ "eşleşme" yazıyorsa ona hiçbir şey gitmemiştir; kısa aralıkla yeniden denenir.
 */
const GREET_RETRY_MS = 3 * 60 * 1000;
const greeted = new Map();
function nextRow() {
  const unread = [...document.querySelectorAll(`${SEL.row}:has(${SEL.unread})`)].pop();
  if (unread) return unread;
  return [...document.querySelectorAll(SEL.row)].find((r) => Date.now() - (greeted.get(r.getAttribute('data-message-conversation-id')) ?? 0) > GREET_RETRY_MS && /eşleşme/i.test(r.innerText.toLocaleLowerCase('tr'))) ?? null;
}

async function ingestUnread(cfg) {
  const row = nextRow();
  if (!row) return;
  greeted.set(row.getAttribute('data-message-conversation-id'), Date.now());
  const peerSugoId = row.getAttribute('data-message-conversation-id');
  const peerName = row.querySelector(SEL.name)?.innerText.trim() ?? '';
  const dialog = await openChat(row);
  if (!dialog) return;
  const messages = parseMessages(dialog);
  if (!messages.length && !dialog.querySelector(SEL.userCard)) return leaveChat();
  await call({ path: '/api/ext/ingest', method: 'POST', body: { hostSugoId: cfg.hostSugoId, peerSugoId, peerName, voiceEnabled: voiceEnabled(), messages } });
  await leaveChat();
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
async function tick() {
  if (busy || !location.pathname.startsWith('/messages')) return;
  busy = true;
  try {
    const cfg = await getConfig();
    if (!cfg.enabled || !cfg.hostSugoId || !cfg.apiKey) return;
    const next = await call({ path: `/api/ext/jobs/next?host=${encodeURIComponent(cfg.hostSugoId)}` });
    if (next.ok && next.data.job) await runJob(cfg, next.data.job);
    else await ingestUnread(cfg);
  } catch (e) {
    console.warn('[sugo-host]', e);
  } finally {
    busy = false;
  }
}

setInterval(tick, POLL_MS);

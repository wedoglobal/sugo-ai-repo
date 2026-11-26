import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const tree = require('./lib/tree.js');
const screens = require('./lib/screens.js');
const parse = require('./lib/parse.js');
const size = { width: 1080, height: 2400 };
const load = (name) => tree.parseDump(readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8'));

describe('ekran tanıma', () => {
  it('her fixture doğru ekran olarak tanınır', () => {
    expect(screens.detect(load('list'), size.width)).toBe('list');
    expect(screens.detect(load('chat'), size.width)).toBe('chat');
    expect(screens.detect(load('chat-empty-match'), size.width)).toBe('chat');
    expect(screens.detect(load('profile'), size.width)).toBe('profile');
    expect(screens.detect(load('chat-settings'), size.width)).toBe('chat-settings');
  });
  it('bilinmeyen ağaçta unknown döner', () => {
    expect(screens.detect(tree.parseDump('Root||||0,0,1080,2400'), size.width)).toBe('unknown');
  });
});

describe('sohbet listesi', () => {
  const rows = parse.chatRows(load('list'), size);
  it('yalnız görünür ll_chat_item satırlarını döndürür (ekran dışı sayfa kopyaları yok)', () => {
    expect(rows.map((r) => r.name)).toEqual(['Emir', 'Mert 👾']);
  });
  it('önizleme, saat ve eşleşme bilgisini okur', () => {
    expect(rows[1]).toMatchObject({ preview: 'selam', time: '12:50', unread: 0, isMatch: false });
  });
  it('imza aynı satır için kararlıdır', () => {
    expect(parse.rowSignature(rows[0])).toBe(parse.rowSignature(parse.chatRows(load('list'), size)[0]));
  });
});

describe('sohbet ekranı', () => {
  const root = load('chat');
  it('tıklanabilir hata simgesi olan giden balonu geçmişe katmaz', () => {
    expect(parse.chatMessageRows(root, size)).toEqual([expect.objectContaining({ dir: 'out', status: 'failed' })]);
    expect(parse.chatMessages(root, size)).toEqual([]);
  });
  it('boş eşleşme sohbetinde mesaj yok, sistem ipucu var', () => {
    const empty = load('chat-empty-match');
    expect(parse.chatMessages(empty, size)).toEqual([]);
    expect(parse.systemTips(empty)).toHaveLength(1);
    expect(parse.chatTitle(empty, size)).toContain('kaplan');
  });
});

describe('profil', () => {
  it('sayısal sugo id okunur', () => {
    expect(parse.profileId(load('profile'))).toBe('100000001');
  });
  it('profil dışında null döner', () => {
    expect(parse.profileId(load('chat'))).toBeNull();
  });
});

describe('cinsiyet rozeti', () => {
  it('kadın profilinde selected rozetinden female döner', () => {
    expect(parse.gender(load('profile-female'), size)).toBe('female');
    expect(parse.profileId(load('profile-female'))).toBe('100000002');
  });
  it('erkek profilinde male döner', () => {
    expect(parse.gender(load('profile'), size)).toBe('male');
  });
  it('sohbet kartı cinsiyet kaynağı değildir (kadında da selected=false)', () => {
    expect(parse.gender(load('chat'), size)).toBeNull();
  });
  it('rozet yoksa null', () => {
    expect(parse.gender(load('chat-settings'), size)).toBeNull();
  });
});

describe('elmas rozeti ve teslim edilmiş giden balonlar', () => {
  const root = load('chat-diamonds');
  const rows = parse.chatMessageRows(root, size);
  it('yön ve metinleri sırayla okur', () => {
    expect(rows.map((r) => [r.dir, r.text])).toEqual([['in', 'yarın görüşürüz'], ['out', 'eve geldim'], ['out', 'geliyorum'], ['out', 'm'], ['in', 'bekliyorum, ne zaman gelirsin']]);
  });
  it('giden balonun xN rozetini okur; rozetsiz ve gelen balonda 0', () => {
    expect(rows.map((r) => r.diamonds)).toEqual([0, 60, 0, 0, 0]);
  });
  it('yeşil durum simgesi teslim edilmiş giden balonu geçmişten düşürmez, elmasıyla ingest edilir', () => {
    expect(rows.map((r) => r.status)).toEqual(['visible', 'visible', 'visible', 'visible', 'visible']);
    expect(parse.chatMessages(root, size)).toEqual([
      { dir: 'in', text: 'yarın görüşürüz', ts: '', diamonds: 0 },
      { dir: 'out', text: 'eve geldim', ts: '', diamonds: 60 },
      { dir: 'out', text: 'geliyorum', ts: '', diamonds: 0 },
      { dir: 'out', text: 'm', ts: '', diamonds: 0 },
      { dir: 'in', text: 'bekliyorum, ne zaman gelirsin', ts: '', diamonds: 0 }
    ]);
  });
});

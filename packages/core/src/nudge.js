import { createSpeechMedia, pickMedia } from './media.js';
import { readPersona } from './persona.js';

/** Dürtme yalnız son mesajımızdan bu süre içinde yapılır; eski sohbetler sunucu açılınca dürtülmesin. */
export const NUDGE_WINDOW_MS = 2 * 60 * 60 * 1000;
export const NUDGE_LINES = ['niye bakmıyorsun', 'beni sevmedin mi', 'off baksana', 'hellooo neredesin', 'ya cevap versene', 'kayboldun mu'];

function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const ms = (v) => Date.parse(v);

/**
 * Hostun son mesajına `nudgeMinutes` dakikadır cevap gelmeyen sohbet için sırayla dürtme kuyruğa alır:
 * önce hostun sesiyle okunan kısa bir sesli mesaj (sesli mesajı açıksa), sonra bu kişiye henüz göndermediği bir katalog fotoğrafı.
 * Her aşama kişinin son yazışından sonra bir kez gider; kişi hiç yazmadıysa (yalnız bizim ilk mesajımız varsa) dürtülmez.
 * Kuyruğa alınan job'ı ya da null döner.
 */
export async function queueNudge(db, deps, host, now = deps.now?.() ?? new Date()) {
  const persona = readPersona(host.persona);
  if (!host.active || !persona.nudge) return null;
  const after = now.getTime() - persona.nudgeMinutes * 60_000;
  const pairs = must(await db.from('pairs').select('id, nudged_at, voice_enabled')
    .eq('host_id', host.id)
    .lt('last_activity_at', new Date(after).toISOString())
    .gt('last_activity_at', new Date(now.getTime() - NUDGE_WINDOW_MS).toISOString()));

  for (const pair of pairs) {
    const active = must(await db.from('jobs').select('id').eq('pair_id', pair.id).in('status', ['pending', 'processing']).limit(1));
    if (active.length) continue;
    const [last] = must(await db.from('messages').select('direction, created_at').eq('pair_id', pair.id).order('id', { ascending: false }).limit(1));
    if (!last || last.direction !== 'out' || ms(last.created_at) > after) continue;
    const [lastIn] = must(await db.from('messages').select('created_at').eq('pair_id', pair.id).eq('direction', 'in').order('id', { ascending: false }).limit(1));
    if (!lastIn) continue;
    const done = must(await db.from('jobs').select('id').eq('pair_id', pair.id).eq('kind', 'nudge').neq('status', 'failed').gt('created_at', lastIn.created_at));

    const steps = [];
    if (pair.voice_enabled && persona.voice && deps.speech) steps.push('voice');
    const photo = await pickMedia(db, { hostId: host.id, pairId: pair.id, kind: 'image' });
    if (photo) steps.push('photo');
    const step = steps[done.length];
    if (!step) continue;

    // Eşzamanlı yoklamalarda aynı kişiye iki dürtme çıkmasın: önce nudged_at'i koşullu al.
    let claim = db.from('pairs').update({ nudged_at: now.toISOString() }).eq('id', pair.id);
    claim = pair.nudged_at ? claim.eq('nudged_at', pair.nudged_at) : claim.is('nudged_at', null);
    if (!must(await claim.select('id')).length) continue;

    try {
      if (step === 'photo') {
        return must(await db.from('jobs').insert({ pair_id: pair.id, host_id: host.id, kind: 'nudge', reply_text: '[fotoğraf]', media_id: photo.id, send_text: false }).select().single());
      }
      const lines = persona.nudgeLines.length ? persona.nudgeLines : NUDGE_LINES;
      const text = lines[Math.floor(Math.random() * lines.length)];
      const mediaId = await createSpeechMedia(db, deps, { host, persona, text, label: `nudge-${pair.id}` });
      return must(await db.from('jobs').insert({ pair_id: pair.id, host_id: host.id, kind: 'nudge', reply_text: text, media_id: mediaId, send_text: false }).select().single());
    } catch {
      continue;
    }
  }
  return null;
}

import { describe, expect, it, vi } from 'vitest';
import { queueNudge } from './nudge.js';

describe('fotoğrafla dürtme', () => {
  it.each([false, true])('ses erişimi %s olsa da ses üretmez, sessizlik başına bir fotoğraf gönderir', async (voiceEnabled) => {
    const now = new Date('2026-11-07T12:00:00Z');
    const old = '2026-11-07T11:50:00Z';
    const inserted = [];
    const db = { from(table) {
      let action = 'select';
      let value;
      const filters = {};
      const query = {
        select() { return query; },
        eq(key, val) { filters[key] = val; return query; },
        in() { return query; }, neq() { return query; }, gt() { return query; }, lt() { return query; },
        limit() { return query; }, order() { return query; }, is() { return query; }, single() { return query; },
        update(val) { action = 'update'; value = val; return query; },
        insert(val) { action = 'insert'; value = val; return query; },
        then(resolve, reject) {
          let data;
          if (table === 'pairs') data = [{ id: 'pair', voice_enabled: voiceEnabled }];
          else if (table === 'jobs' && action === 'insert') { inserted.push(value); data = value; }
          else if (table === 'jobs') data = filters.kind === 'nudge' ? inserted : [];
          else if (table === 'messages') data = [{ direction: filters.direction || 'out', created_at: old }];
          else if (table === 'media') data = [{ id: 'photo', content_type: 'image/jpeg' }];
          else if (table === 'media_sent') data = [];
          else throw new Error(table);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    } };
    const speech = vi.fn();
    const host = { id: 'host', active: true, persona: { voice: 'Kore', nudge: true, nudgeMinutes: 5 } };
    expect(await queueNudge(db, { speech }, host, now)).toMatchObject({ media_id: 'photo', kind: 'nudge', send_text: false });
    expect(await queueNudge(db, { speech }, host, now)).toBeNull();
    expect(speech).not.toHaveBeenCalled();
    expect(inserted).toHaveLength(1);
  });
});

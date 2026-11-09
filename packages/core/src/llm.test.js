import { describe, expect, it } from 'vitest';
import { createLlm } from './llm.js';

describe('LLM düşünme bütçesi', () => {
  it.each([
    [0, 150, { enabled: false }],
    [200, 350, { max_tokens: 200 }],
    [undefined, 1150, { max_tokens: 1000 }],
  ])('thinkTokens=%s için API bütçesini gönderir', async (thinkTokens, maxTokens, reasoning) => {
    let body;
    const llm = createLlm({ apiKey: 'test', fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'selam' }, finish_reason: 'stop' }] }));
    } });
    expect(await llm({ model: 'test', messages: [], maxTokens: 150, thinkTokens })).toBe('selam');
    expect(body).toMatchObject({ max_tokens: maxTokens, reasoning });
  });
});

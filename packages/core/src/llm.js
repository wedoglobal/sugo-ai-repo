const URL = 'https://openrouter.ai/api/v1/chat/completions';

export class LlmError extends Error {}

/**
 * OpenRouter chat istemcisi. `fetchImpl` testlerde enjekte edilir.
 * @returns {(req: {model:string, messages:object[], temperature?:number, json?:boolean, maxTokens?:number}) => Promise<string>}
 */
export function createLlm({ apiKey, fetchImpl = fetch, timeoutMs = 45000 }) {
  return async function chat({ model, messages, temperature = 0.8, json = false, maxTokens = 600 }) {
    if (!apiKey) throw new LlmError('OPENROUTER_API_KEY tanımlı değil');
    const res = await fetchImpl(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Sugo Host' },
      body: JSON.stringify({
        model, messages, temperature, max_tokens: maxTokens,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new LlmError(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const choice = data.choices?.[0];
    const text = choice?.message?.content;
    if (!text || choice.finish_reason === 'length') throw new LlmError('LLM boş veya kesilmiş cevap döndü');
    return text;
  };
}

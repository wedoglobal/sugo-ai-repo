import { createLlm, createSpeech } from '@sugo/core';
import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

let client;
export function db() {
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return client;
}

export function deps() {
  return {
    llm: createLlm({ apiKey: env.OPENROUTER_API_KEY }),
    speech: createSpeech({ apiKey: env.OPENROUTER_API_KEY }),
    models: {
      chat: env.SUGO_MODEL_CHAT || 'x-ai/grok-4.7',
      extract: env.SUGO_MODEL_EXTRACT || 'google/gemini-2.5-flash',
      speech: env.SUGO_MODEL_SPEECH || 'google/gemini-3.8-flash-lite-tts',
    },
  };
}

export function must({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

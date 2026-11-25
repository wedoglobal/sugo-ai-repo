import { runRepairAnalysisBatch } from '@sugo/core';
import { db } from './deps.js';

let nextCheckAt = 0;

export function webRepairClient(request) {
  const agent = request?.headers.get('user-agent') ?? '';
  return /\b(?:Chrome|Chromium)\/\d+/u.test(agent) && !/\b(?:Android|Mobile)\b/u.test(agent);
}

export function continueRepairAnalysis(platform, { running = false } = {}) {
  const now = Date.now();
  if (!platform?.ctx?.waitUntil || now < nextCheckAt) return;
  nextCheckAt = now + 3_000;
  platform.ctx.waitUntil(runRepairAnalysisBatch(db()).then((advanced) => {
    if (!advanced) nextCheckAt = Date.now() + (running ? 8_000 : 60_000);
  }).catch((error) => {
    nextCheckAt = Date.now() + 10_000;
    console.error('Sohbet akışı analizi ilerletilemedi', error.message);
  }));
}

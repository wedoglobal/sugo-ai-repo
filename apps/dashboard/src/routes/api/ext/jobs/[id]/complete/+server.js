import { json } from '@sveltejs/kit';
import { completeJob } from '@sugo/core';
import { db } from '$lib/server/deps.js';

export async function POST({ params }) {
  try {
    const job = await completeJob(db(), Number(params.id));
    return json({ job: { id: job.id, status: job.status } });
  } catch (e) {
    return json({ error: e.message }, { status: 400 });
  }
}

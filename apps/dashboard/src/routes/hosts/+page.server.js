import { fail, redirect } from '@sveltejs/kit';
import { db, must } from '$lib/server/deps.js';

export const load = async () => ({
  hosts: must(await db().from('hosts').select('id, sugo_id, name, active').order('created_at')),
});

export const actions = {
  create: async ({ request }) => {
    const f = await request.formData();
    const sugoId = String(f.get('sugo_id') ?? '').trim();
    if (!/^\d+$/.test(sugoId)) return fail(400, { error: 'Sugo id sayısal olmalı' });
    const { data, error } = await db().from('hosts').insert({ sugo_id: sugoId, name: String(f.get('name') ?? '').trim() }).select('id').single();
    if (error) return fail(400, { error: error.code === '23505' ? 'Bu sugo id zaten kayıtlı' : error.message });
    redirect(303, `/hosts/${data.id}`);
  },
};

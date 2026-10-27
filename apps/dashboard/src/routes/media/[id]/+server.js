import { mediaResponse } from '$lib/server/media.js';

export const GET = ({ params }) => mediaResponse(params.id);

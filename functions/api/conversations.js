import { json, readJson, supabase } from '../_lib/supabase.js';

export async function onRequestGet(context) {
  const sessionId = new URL(context.request.url).searchParams.get('session_id');
  if (!sessionId) return json({ error: 'session_id é obrigatório.' }, 400);
  try {
    const response = await supabase(context.env, `conversations?session_id=eq.${encodeURIComponent(sessionId)}&select=id,title,created_at,updated_at&order=updated_at.desc`);
    return json({ conversations: await readJson(response) });
  } catch (error) { return json({ error: error.message }, 500); }
}

import { json, readJson, supabase } from '../../_lib/supabase.js';

export async function onRequestGet(context) {
  const sessionId = new URL(context.request.url).searchParams.get('session_id');
  const { id } = context.params;
  if (!sessionId) return json({ error: 'session_id é obrigatório.' }, 400);
  try {
    const conversationResponse = await supabase(context.env, `conversations?id=eq.${id}&session_id=eq.${encodeURIComponent(sessionId)}&select=id,title`);
    const conversations = await readJson(conversationResponse);
    if (!conversations.length) return json({ error: 'Conversa não encontrada.' }, 404);
    const messagesResponse = await supabase(context.env, `messages?conversation_id=eq.${id}&select=id,role,content,created_at&order=created_at.asc`);
    return json({ conversation: conversations[0], messages: await readJson(messagesResponse) });
  } catch (error) { return json({ error: error.message }, 500); }
}

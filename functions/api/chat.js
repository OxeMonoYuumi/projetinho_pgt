import { json, readJson, supabase } from '../_lib/supabase.js';

function titleFromMessage(message) {
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > 42 ? `${clean.slice(0, 42)}...` : clean;
}

async function getConversation(env, id, sessionId) {
  if (!id) return null;
  const response = await supabase(env, `conversations?id=eq.${id}&session_id=eq.${encodeURIComponent(sessionId)}&select=id,title`);
  const conversations = await readJson(response);
  return conversations[0] || null;
}

export async function onRequestPost(context) {
  try {
    const missingVariables = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GROQ_API_KEY']
      .filter((name) => !context.env[name]);
    if (missingVariables.length) {
      return json({ error: `Configuração ausente no Cloudflare: ${missingVariables.join(', ')}.` }, 500);
    }

    const body = await context.request.json();
    const sessionId = String(body.session_id || '');
    const message = String(body.message || '').trim();
    if (!sessionId || !message) return json({ error: 'session_id e message são obrigatórios.' }, 400);
    if (message.length > 4000) return json({ error: 'A mensagem deve ter até 4.000 caracteres.' }, 400);

    let conversation;
    try {
      conversation = await getConversation(context.env, body.conversation_id, sessionId);
    } catch (error) {
      throw new Error(`Supabase (leitura da conversa): ${error.message}`);
    }
    if (!conversation) {
      try {
        const createdResponse = await supabase(context.env, 'conversations', { method: 'POST', body: JSON.stringify({ session_id: sessionId, title: titleFromMessage(message) }) });
        conversation = (await readJson(createdResponse))[0];
      } catch (error) {
        throw new Error(`Supabase (criação da conversa): ${error.message}`);
      }
    }

    let history;
    try {
      const historyResponse = await supabase(context.env, `messages?conversation_id=eq.${conversation.id}&select=role,content&order=created_at.asc&limit=20`);
      history = await readJson(historyResponse);
      const userMessageResponse = await supabase(context.env, 'messages', { method: 'POST', body: JSON.stringify({ conversation_id: conversation.id, role: 'user', content: message }) });
      await readJson(userMessageResponse);
    } catch (error) {
      throw new Error(`Supabase (mensagens): ${error.message}`);
    }

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${context.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: context.env.GROQ_MODEL || 'openai/gpt-oss-20b',
        temperature: 0.7,
        max_completion_tokens: 1400,
        messages: [
          { role: 'system', content: 'Você é Nexo, uma inteligência clara, perspicaz e humana. Responda em português do Brasil, com profundidade prática e sem frases genéricas. Use Markdown para facilitar a leitura: títulos curtos com ##, listas quando houver etapas, negrito para conceitos importantes e blocos de código quando necessário. Estruture respostas longas em blocos curtos.' },
          ...history,
          { role: 'user', content: message },
        ],
      }),
    });
    const groqData = await groqResponse.json();
    if (!groqResponse.ok) throw new Error(`Groq (${groqResponse.status}): ${groqData.error?.message || 'O modelo não respondeu.'}`);
    const reply = groqData.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('O modelo retornou uma resposta vazia.');

    try {
      const assistantResponse = await supabase(context.env, 'messages', { method: 'POST', body: JSON.stringify({ conversation_id: conversation.id, role: 'assistant', content: reply }) });
      await readJson(assistantResponse);
    } catch (error) {
      throw new Error(`Supabase (salvamento da resposta): ${error.message}`);
    }
    return json({ reply, conversation: { id: conversation.id, title: conversation.title } });
  } catch (error) { return json({ error: error.message || 'Erro interno ao conversar.' }, 500); }
}

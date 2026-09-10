const state = {
  sessionId: localStorage.getItem('nexo_session_id') || crypto.randomUUID(),
  conversationId: null,
  conversations: [],
  sending: false,
};
localStorage.setItem('nexo_session_id', state.sessionId);

const elements = {
  list: document.querySelector('#conversationList'),
  count: document.querySelector('#historyCount'),
  title: document.querySelector('#conversationTitle'),
  messages: document.querySelector('#messages'),
  welcome: document.querySelector('#welcomeState'),
  input: document.querySelector('#messageInput'),
  form: document.querySelector('#composerForm'),
  send: document.querySelector('#sendButton'),
  toast: document.querySelector('#toast'),
  sidebar: document.querySelector('#sidebar'),
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove('visible'), 3500);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function inlineMarkdown(value) {
  const placeholders = [];
  const protect = (html) => {
    const token = `%%INLINE_${placeholders.length}%%`;
    placeholders.push(html);
    return token;
  };
  let formatted = value.replace(/`([^`]+)`/g, (_, code) => protect(`<code>${code}</code>`));
  formatted = formatted.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => protect(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`));
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_]+)__/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/_([^_]+)_/g, '<em>$1</em>');
  return formatted.replace(/%%INLINE_(\d+)%%/g, (_, index) => placeholders[index]);
}

function formatAssistantMessage(value) {
  const lines = escapeHtml(value).replace(/\r/g, '').split('\n');
  const output = [];
  let paragraph = [];
  let listType = null;
  let code = false;

  const closeParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  };

  const tableCells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  const isTableSeparator = (line) => tableCells(line).length > 0 && tableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell));

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^```\s*[\w-]*\s*$/);
    if (fence) {
      closeParagraph();
      closeList();
      if (code) {
        output.push('</code></pre>');
      } else {
        output.push('<pre><code>');
      }
      code = !code;
      continue;
    }
    if (code) {
      output.push(`${line}\n`);
      continue;
    }
    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      closeParagraph();
      closeList();
      const header = tableCells(line);
      index += 1;
      const rows = [];
      while (index + 1 < lines.length && lines[index + 1].includes('|') && !isTableSeparator(lines[index + 1])) {
        index += 1;
        rows.push(tableCells(lines[index]));
      }
      output.push(`<div class="table-scroll"><table><thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${header.map((_, cellIndex) => `<td>${inlineMarkdown(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      closeParagraph();
      closeList();
      output.push('<hr>');
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      closeParagraph();
      closeList();
      output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length + 2;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const item = line.match(/^\s*([-*]|\d+[.)])\s+(.+)$/);
    if (item) {
      closeParagraph();
      const nextType = /^\d/.test(item[1]) ? 'ol' : 'ul';
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        output.push(`<${listType}>`);
      }
      const checked = item[2].match(/^\[([ xX])\]\s+(.+)$/);
      output.push(`<li${checked ? ' class="task-item"' : ''}>${checked ? `<span class="task-check ${checked[1].toLowerCase() === 'x' ? 'is-checked' : ''}">${checked[1].toLowerCase() === 'x' ? '✓' : ''}</span>${inlineMarkdown(checked[2])}` : inlineMarkdown(item[2])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  closeParagraph();
  closeList();
  if (code) output.push('</code></pre>');
  return output.join('');
}

function renderConversations() {
  elements.count.textContent = state.conversations.length;
  if (!state.conversations.length) {
    elements.list.innerHTML = '<p class="empty-history">Suas conversas vão aparecer aqui.</p>';
    return;
  }
  elements.list.innerHTML = state.conversations.map((conversation) => `
    <button class="conversation-item ${conversation.id === state.conversationId ? 'active' : ''}" data-id="${conversation.id}" type="button">
      <span class="conversation-text">${escapeHtml(conversation.title || 'Nova conversa')}</span>
    </button>
  `).join('');
  elements.list.querySelectorAll('.conversation-item').forEach((item) => item.addEventListener('click', () => loadConversation(item.dataset.id)));
}

function addMessage(role, content, pending = false) {
  elements.welcome.hidden = true;
  const message = document.createElement('article');
  message.className = `message ${role}`;
  const formattedContent = role === 'assistant' ? formatAssistantMessage(content) : escapeHtml(content).replace(/\n/g, '<br>');
  message.innerHTML = `<div class="message-avatar">${role === 'user' ? 'VC' : 'N'}</div><div class="message-body"><div class="message-role">${role === 'user' ? 'Você' : 'Nexo'}</div><div class="message-content">${pending ? '<span class="typing-dots"><i></i><i></i><i></i></span>' : formattedContent}</div></div>`;
  elements.messages.appendChild(message);
  elements.messages.parentElement.scrollTo({ top: elements.messages.parentElement.scrollHeight, behavior: 'smooth' });
  return message;
}

function resetView() {
  state.conversationId = null;
  elements.title.textContent = 'Nova conversa';
  elements.messages.innerHTML = '';
  elements.welcome.hidden = false;
  elements.input.value = '';
  elements.input.style.height = 'auto';
  renderConversations();
}

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir a operação.');
  return payload;
}

async function loadConversations() {
  try {
    const data = await api(`/api/conversations?session_id=${encodeURIComponent(state.sessionId)}`);
    state.conversations = data.conversations || [];
    renderConversations();
  } catch (error) {
    renderConversations();
    showToast('O histórico ainda não está conectado ao servidor.');
  }
}

async function loadConversation(id) {
  try {
    const data = await api(`/api/conversations/${id}?session_id=${encodeURIComponent(state.sessionId)}`);
    state.conversationId = id;
    elements.title.textContent = data.conversation.title || 'Conversa';
    elements.messages.innerHTML = '';
    elements.welcome.hidden = true;
    (data.messages || []).forEach((message) => addMessage(message.role, message.content));
    renderConversations();
    elements.sidebar.classList.remove('open');
  } catch (error) { showToast(error.message); }
}

async function sendMessage(content) {
  if (!content.trim() || state.sending) return;
  state.sending = true;
  elements.send.disabled = true;
  elements.input.value = '';
  elements.input.style.height = 'auto';
  addMessage('user', content);
  const pendingMessage = addMessage('assistant', '', true);
  try {
    const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ session_id: state.sessionId, conversation_id: state.conversationId, message: content }) });
    pendingMessage.remove();
    addMessage('assistant', data.reply);
    state.conversationId = data.conversation.id;
    elements.title.textContent = data.conversation.title;
    await loadConversations();
  } catch (error) {
    pendingMessage.remove();
    showToast(error.message);
    addMessage('assistant', 'Não consegui responder agora. Verifique a configuração do servidor e tente novamente.');
  } finally {
    state.sending = false;
    elements.send.disabled = false;
    elements.input.focus();
  }
}

elements.form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(elements.input.value); });
elements.input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); elements.form.requestSubmit(); } });
elements.input.addEventListener('input', () => { elements.input.style.height = 'auto'; elements.input.style.height = `${Math.min(elements.input.scrollHeight, 130)}px`; });
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { elements.input.value = button.dataset.prompt; elements.input.focus(); elements.input.dispatchEvent(new Event('input')); }));
document.querySelector('#newChatButton').addEventListener('click', resetView);
document.querySelector('#clearButton').addEventListener('click', () => { if (state.conversationId) loadConversation(state.conversationId); else resetView(); });
document.querySelector('#menuButton').addEventListener('click', () => elements.sidebar.classList.toggle('open'));
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); resetView(); elements.input.focus(); } });

loadConversations();

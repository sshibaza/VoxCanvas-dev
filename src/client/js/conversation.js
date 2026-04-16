import { showToast, formatTime, addLogEntry } from './ui-utils.js';

let messages = [];
let currentCall = null;

export function initConversation(api) {
  const panel = document.getElementById('conversation-panel');

  panel.innerHTML = `
    <!-- Conversation Header -->
    <div class="px-4 py-2 border-b border-white/[0.06] flex justify-center gap-8 bg-white/[0.02] shrink-0">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-sf-orange"></span>
        <span class="text-xs font-semibold text-sf-orange">Customer</span>
        <span id="conv-customer-phone" class="text-[0.5rem] opacity-40"></span>
      </div>
      <div class="w-px bg-white/10"></div>
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-sf-blue"></span>
        <span class="text-xs font-semibold text-sf-blue">Agent</span>
        <span class="text-[0.5rem] opacity-40">Operator</span>
      </div>
    </div>

    <!-- Split Panels -->
    <div class="flex flex-1 overflow-hidden">
      ${createChatPanel('customer', 'sf-orange', 'Type as customer...')}
      <div class="w-px bg-white/[0.06]"></div>
      ${createChatPanel('agent', 'sf-blue', 'Type as agent...')}
    </div>
  `;

  // Listen for call events
  window.addEventListener('voxcanvas:call-started', (e) => {
    currentCall = e.detail;
    messages = [];
    clearMessages();
    document.getElementById('conv-customer-phone').textContent = document.getElementById('call-from').value;
    enableInputs(true);
  });

  window.addEventListener('voxcanvas:call-ended', () => {
    currentCall = null;
    enableInputs(false);
  });

  // Setup send handlers for both panels
  setupSendHandler('customer', 'END_USER', api);
  setupSendHandler('agent', 'HUMAN_AGENT', api);

  // Initially disabled
  enableInputs(false);
}

function createChatPanel(role, color, placeholder) {
  const quickPhrases = role === 'customer'
    ? ['Account inquiry', 'I need help with...', 'Thank you']
    : ['How can I help?', 'Let me check...', 'One moment please'];

  return `
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Messages -->
      <div id="${role}-messages" class="flex-1 p-4 overflow-y-auto">
        <div class="flex flex-col gap-2"></div>
      </div>

      <!-- Quick Phrases -->
      <div class="px-3 py-1.5 border-t border-white/[0.04] flex gap-1.5 flex-wrap shrink-0">
        ${quickPhrases
          .map(
            (p) =>
              `<button class="quick-phrase bg-${color}/10 border border-${color}/20 rounded-full px-2.5 py-0.5 text-[0.5rem] hover:bg-${color}/20 transition-colors" data-role="${role}">${p}</button>`
          )
          .join('')}
      </div>

      <!-- Input -->
      <div class="px-3 py-2.5 border-t border-white/[0.06] flex gap-2 items-center shrink-0">
        <input id="${role}-input" type="text" placeholder="${placeholder}" disabled
          class="flex-1 bg-white/5 border border-${color}/20 rounded-lg px-3 py-2 text-xs focus:border-${color} focus:outline-none disabled:opacity-30" />
        <button id="${role}-send" disabled
          class="bg-${color} w-7 h-7 rounded-md flex items-center justify-center text-sm hover:brightness-110 transition-all disabled:opacity-30">
          &#9654;
        </button>
      </div>
    </div>
  `;
}

function setupSendHandler(role, senderType, api) {
  const sendMessage = async () => {
    const input = document.getElementById(`${role}-input`);
    const text = input.value.trim();
    if (!text || !currentCall) return;

    input.value = '';

    // Add to local UI immediately
    const msg = { role, text, timestamp: Date.now() };
    messages.push(msg);
    renderMessage(msg);

    // Send to Salesforce
    try {
      await api.post(`/api/voice-call/${currentCall.vendorCallKey}/transcription`, {
        content: text,
        senderType,
      });
      addLogEntry(`Transcription ${senderType}: ${text}`, 'info');
    } catch (err) {
      addLogEntry(`Transcription failed (${senderType}): ${err.message}`, 'error');
      showToast(`Transcription failed: ${err.message}`, 'error');
    }
  };

  const input = document.getElementById(`${role}-input`);
  const sendBtn = document.getElementById(`${role}-send`);

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    // Plain Enter sends; Shift+Enter is reserved for future multiline inputs.
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Quick phrases
  document.querySelectorAll(`.quick-phrase[data-role="${role}"]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = btn.textContent;
      input.focus();
    });
  });
}

function renderMessage(msg) {
  const ownPanel = document.querySelector(`#${msg.role}-messages .flex`);
  const otherRole = msg.role === 'customer' ? 'agent' : 'customer';
  const otherPanel = document.querySelector(`#${otherRole}-messages .flex`);
  const color = msg.role === 'customer' ? 'sf-orange' : 'sf-blue';
  const otherColor = msg.role === 'customer' ? 'sf-blue' : 'sf-orange';
  const roleLabel = msg.role === 'customer' ? 'Customer' : 'Agent';
  const time = formatTime(msg.timestamp);

  // Own panel: right-aligned
  const ownBubble = document.createElement('div');
  ownBubble.className = `message-bubble self-end bg-${color}/15 border border-${color}/20 rounded-xl rounded-br-sm px-3 py-2 max-w-[80%] text-xs`;
  ownBubble.innerHTML = `${escapeHtml(msg.text)}<div class="text-[0.45rem] opacity-40 text-right mt-1">${time}</div>`;
  ownPanel.appendChild(ownBubble);

  // Other panel: left-aligned, dimmed
  const otherBubble = document.createElement('div');
  otherBubble.className = `message-bubble self-start bg-${color}/10 border border-${color}/15 rounded-xl rounded-bl-sm px-3 py-2 max-w-[80%] text-xs opacity-50`;
  otherBubble.innerHTML = `<span class="text-[0.5rem] text-${color} font-medium">${roleLabel}:</span> ${escapeHtml(msg.text)}<div class="text-[0.45rem] opacity-40 mt-1">${time}</div>`;
  otherPanel.appendChild(otherBubble);

  // Auto-scroll both panels
  ownPanel.parentElement.scrollTop = ownPanel.parentElement.scrollHeight;
  otherPanel.parentElement.scrollTop = otherPanel.parentElement.scrollHeight;
}

function clearMessages() {
  ['customer', 'agent'].forEach((role) => {
    const container = document.querySelector(`#${role}-messages .flex`);
    if (container) container.innerHTML = '';
  });
}

function enableInputs(enabled) {
  ['customer', 'agent'].forEach((role) => {
    const input = document.getElementById(`${role}-input`);
    const send = document.getElementById(`${role}-send`);
    if (input) input.disabled = !enabled;
    if (send) send.disabled = !enabled;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

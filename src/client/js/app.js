import { initCallControl } from './call-control.js';
import { initConversation } from './conversation.js';
import { initTools } from './tools.js';
import { ApiClient } from './api-client.js';

const api = new ApiClient();

async function checkHealth() {
  try {
    const health = await api.get('/api/health');
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (health.configured) {
      dot.className = 'w-2 h-2 rounded-full bg-sf-success status-pulse';
      text.textContent = 'Connected';
    } else {
      dot.className = 'w-2 h-2 rounded-full bg-sf-orange status-pulse';
      text.textContent = 'Not Configured';
    }
  } catch {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.className = 'w-2 h-2 rounded-full bg-sf-error';
    text.textContent = 'Server Offline';
  }
}

async function init() {
  await checkHealth();
  initCallControl(api);
  initConversation(api);
  initTools(api);
  setInterval(checkHealth, 30000);
}

init();

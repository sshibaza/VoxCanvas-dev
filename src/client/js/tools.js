import { showToast } from './ui-utils.js';
import { getActiveCall } from './call-control.js';

let logEntries = [];

export function initTools(api) {
  const panel = document.getElementById('tools-panel');
  panel.innerHTML = `
    <div class="p-4 flex-1 overflow-y-auto">
      <div class="text-[0.6rem] font-bold tracking-widest opacity-40 mb-3">TOOLS</div>

      <!-- Recording Upload -->
      <div class="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 mb-3">
        <div class="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <span>&#127908;</span> Call Recording
        </div>
        <div id="drop-zone"
          class="border border-dashed border-white/15 rounded-md py-4 px-2 text-center mb-2 transition-colors hover:border-sf-blue/40 cursor-pointer">
          <div class="text-[0.55rem] opacity-40">Drop audio file here</div>
          <div class="text-[0.5rem] opacity-30">or click to browse</div>
          <input id="recording-file" type="file" accept="audio/*" class="hidden" />
        </div>
        <div id="recording-filename" class="text-[0.5rem] opacity-50 mb-2 hidden"></div>
        <input id="recording-url" type="text" placeholder="or paste recording URL"
          class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[0.55rem] mb-2 focus:border-sf-blue focus:outline-none" />
        <button id="btn-upload-recording"
          class="w-full bg-sf-blue/20 border border-sf-blue/30 py-1.5 rounded text-[0.55rem] font-semibold hover:bg-sf-blue/30 transition-colors">
          Upload Recording
        </button>
      </div>

      <!-- Voicemail -->
      <div class="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 mb-3">
        <div class="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <span>&#128232;</span> Voicemail
        </div>
        <div class="mb-2">
          <div class="text-[0.5rem] opacity-50 mb-0.5">From</div>
          <input id="vm-from" type="text" value="090-1234-5678"
            class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[0.55rem] focus:border-sf-blue focus:outline-none" />
        </div>
        <div class="mb-2">
          <div class="text-[0.5rem] opacity-50 mb-0.5">To</div>
          <input id="vm-to" type="text" value="0120-000-000"
            class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[0.55rem] focus:border-sf-blue focus:outline-none" />
        </div>
        <div class="mb-2">
          <div class="text-[0.5rem] opacity-50 mb-0.5">Transcript</div>
          <textarea id="vm-transcript" rows="2" placeholder="Voicemail transcript..."
            class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[0.55rem] focus:border-sf-blue focus:outline-none resize-none"></textarea>
        </div>
        <button id="btn-send-voicemail"
          class="w-full bg-sf-success/20 border border-sf-success/30 py-1.5 rounded text-[0.55rem] font-semibold hover:bg-sf-success/30 transition-colors">
          Send Voicemail
        </button>
      </div>

      <!-- Activity Log -->
      <div class="bg-white/[0.03] border border-white/[0.08] rounded-lg p-3">
        <div class="text-xs font-semibold mb-2 flex items-center gap-1.5">
          <span>&#128203;</span> Activity Log
        </div>
        <div class="text-[0.5rem] opacity-40 mb-2">API calls, responses, errors</div>
        <button id="btn-toggle-log"
          class="w-full bg-white/[0.08] py-1.5 rounded text-[0.55rem] hover:bg-white/[0.12] transition-colors">
          Show Log
        </button>
      </div>
    </div>

    <!-- Log Drawer (hidden) -->
    <div id="log-drawer" class="hidden fixed inset-y-0 right-0 w-96 bg-panel-bg border-l border-white/10 z-40 flex flex-col shadow-2xl">
      <div class="p-3 border-b border-white/[0.06] flex justify-between items-center">
        <span class="text-xs font-bold">Activity Log</span>
        <button id="btn-close-log" class="text-xs opacity-50 hover:opacity-100">Close</button>
      </div>
      <div id="log-entries" class="flex-1 p-3 overflow-y-auto font-mono text-[0.55rem] space-y-2">
      </div>
    </div>
  `;

  // Drop zone
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('recording-file');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-sf-blue/40', 'bg-sf-blue/5');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-sf-blue/40', 'bg-sf-blue/5');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-sf-blue/40', 'bg-sf-blue/5');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      showSelectedFile(e.dataTransfer.files[0].name);
    }
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
      showSelectedFile(fileInput.files[0].name);
    }
  });

  // Upload recording
  document.getElementById('btn-upload-recording').addEventListener('click', async () => {
    const call = getActiveCall();
    if (!call) {
      showToast('No active call', 'warning');
      return;
    }
    const url = document.getElementById('recording-url').value.trim();
    if (!url) {
      showToast('Enter a recording URL', 'warning');
      return;
    }
    try {
      await api.patch(`/api/voice-call/${call.vendorCallKey}`, {
        voiceCallId: call.voiceCallId,
        recordingUrl: url,
      });
      addLogEntry('Recording uploaded', 'success');
      showToast('Recording uploaded', 'success');
    } catch (err) {
      addLogEntry(`Recording upload failed: ${err.message}`, 'error');
      showToast(`Recording upload failed: ${err.message}`, 'error');
    }
  });

  // Send voicemail
  document.getElementById('btn-send-voicemail').addEventListener('click', async () => {
    const from = document.getElementById('vm-from').value.trim();
    const to = document.getElementById('vm-to').value.trim();
    const transcripts = document.getElementById('vm-transcript').value.trim();
    if (!from || !to || !transcripts) {
      showToast('Fill in all voicemail fields', 'warning');
      return;
    }
    try {
      await api.post('/api/voicemail', { from, to, transcripts });
      addLogEntry('Voicemail sent', 'success');
      showToast('Voicemail sent', 'success');
    } catch (err) {
      addLogEntry(`Voicemail failed: ${err.message}`, 'error');
      showToast(`Voicemail failed: ${err.message}`, 'error');
    }
  });

  // Log drawer toggle
  document.getElementById('btn-toggle-log').addEventListener('click', () => {
    document.getElementById('log-drawer').classList.remove('hidden');
  });
  document.getElementById('btn-close-log').addEventListener('click', () => {
    document.getElementById('log-drawer').classList.add('hidden');
  });
}

function showSelectedFile(name) {
  const el = document.getElementById('recording-filename');
  el.textContent = `Selected: ${name}`;
  el.classList.remove('hidden');
}

export function addLogEntry(message, type = 'info') {
  const container = document.getElementById('log-entries');
  if (!container) return;

  const colors = {
    info: 'text-white/60',
    success: 'text-sf-success',
    error: 'text-sf-error',
    warning: 'text-sf-orange',
  };

  const entry = document.createElement('div');
  entry.className = `${colors[type] || colors.info} border-b border-white/5 pb-1`;

  const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  entry.innerHTML = `<span class="opacity-40">[${time}]</span> ${message}`;
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;

  logEntries.push({ time, message, type });
}

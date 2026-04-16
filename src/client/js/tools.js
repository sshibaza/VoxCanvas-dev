import { showToast, addLogEntry } from './ui-utils.js';
import { getActiveCall } from './call-control.js';

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
        <div class="text-[0.55rem] opacity-50 mb-2 leading-relaxed">
          Paste a publicly-accessible recording URL (S3 presigned, etc.) and attach it to the active call.
        </div>
        <input id="recording-url" type="text" placeholder="https://..."
          class="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-[0.55rem] mb-2 focus:border-sf-blue focus:outline-none" />
        <button id="btn-upload-recording"
          class="w-full bg-sf-blue/20 border border-sf-blue/30 py-1.5 rounded text-[0.55rem] font-semibold hover:bg-sf-blue/30 transition-colors">
          Attach Recording
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

import { showToast, formatDuration, addLogEntry } from './ui-utils.js';

let activeCall = null;
let timerInterval = null;
let callStartTime = null;

export function initCallControl(api) {
  const panel = document.getElementById('call-control-panel');
  panel.innerHTML = `
    <!-- Call Setup -->
    <div class="p-4 border-b border-white/[0.06]">
      <div class="text-[0.6rem] font-bold tracking-widest opacity-40 mb-3">CALL CONTROL</div>

      <!-- Call Type Toggle -->
      <div class="mb-3">
        <div class="text-xs opacity-50 mb-1">Call Type</div>
        <div class="flex bg-white/5 rounded-md p-0.5" id="call-type-toggle">
          <button data-type="inbound" class="flex-1 py-1.5 text-xs font-semibold rounded text-center transition-colors bg-sf-blue/30">Inbound</button>
          <button data-type="outbound" class="flex-1 py-1.5 text-xs font-semibold rounded text-center transition-colors opacity-50">Outbound</button>
        </div>
      </div>

      <!-- Phone Inputs -->
      <div class="mb-2">
        <label class="text-xs opacity-50 mb-1 block">From (Customer)</label>
        <input id="call-from" type="text" value="090-1234-5678"
          class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-sf-blue focus:outline-none" />
      </div>
      <div class="mb-3">
        <label class="text-xs opacity-50 mb-1 block">To (Contact Center)</label>
        <input id="call-to" type="text" value="0120-000-000"
          class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-sf-blue focus:outline-none" />
      </div>

      <!-- Start Call Button -->
      <button id="btn-start-call"
        class="w-full bg-gradient-to-r from-sf-orange to-sf-orange-dark py-2.5 rounded-lg text-sm font-bold tracking-wide hover:brightness-110 transition-all">
        Start Call
      </button>
    </div>

    <!-- Active Call Info (hidden initially) -->
    <div id="active-call-section" class="p-4 border-b border-white/[0.06] flex-1 hidden">
      <div class="text-[0.6rem] font-bold tracking-widest opacity-40 mb-3">ACTIVE CALL</div>
      <div class="bg-sf-success/10 border border-sf-success/30 rounded-lg p-3">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs text-sf-success font-semibold">In Progress</span>
          <span id="call-timer" class="text-sm font-bold font-mono">00:00</span>
        </div>
        <div class="text-[0.5rem] opacity-40 mt-1">VendorCallKey:</div>
        <div id="vendor-call-key" class="text-[0.5rem] font-mono opacity-60 break-all"></div>
      </div>

      <button id="btn-end-call"
        class="w-full mt-3 bg-sf-error/30 border border-sf-error/50 py-2 rounded-md text-xs font-semibold hover:bg-sf-error/50 transition-colors">
        End Call
      </button>
    </div>

    <!-- Footer -->
    <div class="mt-auto p-3 border-t border-white/[0.06] text-[0.5rem] opacity-30">
      Server: 127.0.0.1:3030
    </div>
  `;

  // Call type toggle
  let selectedType = 'inbound';
  const toggleBtns = panel.querySelectorAll('#call-type-toggle button');
  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      toggleBtns.forEach((b) => {
        b.className = b.dataset.type === selectedType
          ? 'flex-1 py-1.5 text-xs font-semibold rounded text-center transition-colors bg-sf-blue/30'
          : 'flex-1 py-1.5 text-xs font-semibold rounded text-center transition-colors opacity-50';
      });
    });
  });

  // Start Call
  document.getElementById('btn-start-call').addEventListener('click', async () => {
    const from = document.getElementById('call-from').value.trim();
    const to = document.getElementById('call-to').value.trim();
    if (!from) {
      showToast('Enter a "From" phone number', 'warning');
      return;
    }
    try {
      const result = await api.post('/api/voice-call', {
        callType: selectedType,
        from,
        to,
      });
      activeCall = result;
      onCallStarted(result);
      addLogEntry(`Call started (${selectedType}) vendorCallKey=${result.vendorCallKey}`, 'success');
      showToast('Call started successfully', 'success');
    } catch (err) {
      addLogEntry(`Start call failed: ${err.message}`, 'error');
      showToast(`Failed to start call: ${err.message}`, 'error');
    }
  });

  // End Call
  document.getElementById('btn-end-call').addEventListener('click', async () => {
    if (!activeCall) return;
    try {
      await api.patch(`/api/voice-call/${activeCall.vendorCallKey}`, {
        voiceCallId: activeCall.voiceCallId,
        isActiveCall: false,
        endTime: new Date().toISOString(),
      });
      addLogEntry(`Call ended vendorCallKey=${activeCall.vendorCallKey}`, 'info');
      onCallEnded();
      showToast('Call ended', 'info');
    } catch (err) {
      addLogEntry(`End call failed: ${err.message}`, 'error');
      showToast(`Failed to end call: ${err.message}`, 'error');
    }
  });
}

function onCallStarted(callData) {
  activeCall = callData;
  document.getElementById('active-call-section').classList.remove('hidden');
  document.getElementById('vendor-call-key').textContent = callData.vendorCallKey;

  callStartTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    document.getElementById('call-timer').textContent = formatDuration(elapsed);
  }, 1000);

  // Dispatch custom event for conversation panel
  window.dispatchEvent(new CustomEvent('voxcanvas:call-started', { detail: callData }));
}

function onCallEnded() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  activeCall = null;
  document.getElementById('active-call-section').classList.add('hidden');

  window.dispatchEvent(new CustomEvent('voxcanvas:call-ended'));
}

export function getActiveCall() {
  return activeCall;
}

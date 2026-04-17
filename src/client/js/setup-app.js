const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'certificate', label: 'Certificate' },
  { id: 'org-auth', label: 'Org' },
  { id: 'contact-center', label: 'Contact Center' },
  { id: 'permset', label: 'Permissions' },
  { id: 'test', label: 'Connect' },
  { id: 'complete', label: 'Verify' },
];

let currentStep = 0;
let state = {};

async function init() {
  const status = await fetch('/api/setup/status').then((r) => r.json());
  state = status;
  renderStepIndicators();
  renderStep();
}

function renderStepIndicators() {
  const container = document.getElementById('step-indicators');
  container.innerHTML = STEPS.map(
    (step, i) => `
    <div class="flex items-center gap-1.5">
      <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
        ${i < currentStep ? 'bg-sf-success/40' : i === currentStep ? 'bg-sf-blue/40' : 'bg-white/10'}">
        ${i < currentStep ? '&#10003;' : i + 1}
      </div>
      <span class="text-xs font-medium ${i === currentStep ? 'opacity-100' : 'opacity-40'}">${step.label}</span>
    </div>
    ${i < STEPS.length - 1 ? '<div class="w-6 h-px bg-white/20"></div>' : ''}
  `
  ).join('');
}

function renderStep() {
  renderStepIndicators();
  const container = document.getElementById('step-content');

  switch (STEPS[currentStep].id) {
    case 'welcome':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Welcome to VoxCanvas Setup</h2>
        <p class="text-sm opacity-60 mb-6 leading-relaxed">This wizard will help you connect VoxCanvas to your Salesforce org. You need a Salesforce org with Service Cloud Voice (Partner Telephony) enabled.</p>
        <div class="text-sm font-semibold mb-3">Environment Check:</div>
        <div class="space-y-2 mb-6">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-sf-success">&#10003;</span> Node.js ${state.nodeVersion || 'detected'}
          </div>
          <div class="flex items-center gap-2 text-sm">
            ${state.opensslAvailable ? '<span class="text-sf-success">&#10003;</span> OpenSSL available' : '<span class="text-sf-error">&#10007;</span> OpenSSL not found (required)'}
          </div>
          <div class="flex items-center gap-2 text-sm">
            ${state.sfCliVersion ? `<span class="text-sf-success">&#10003;</span> Salesforce CLI: ${state.sfCliVersion}` : '<span class="text-sf-orange">&#9888;</span> Salesforce CLI not found <span class="opacity-40">(optional)</span>'}
          </div>
        </div>
        <div class="flex justify-end">
          <button onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold transition-colors">Next &rarr;</button>
        </div>
      `;
      break;

    case 'certificate':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Certificate Generation</h2>
        <p class="text-sm opacity-60 mb-6">Generate certificates for HTTPS and JWT authentication.</p>
        <div class="flex gap-4 mb-6">
          <button id="btn-generate-certs" class="flex-1 bg-sf-success/10 border border-sf-success/30 rounded-lg p-4 text-left hover:bg-sf-success/20 transition-colors">
            <div class="text-sm font-bold text-sf-success mb-1">&#9889; Auto-Generate (Recommended)</div>
            <div class="text-xs opacity-50">RSA 2048-bit self-signed certificates</div>
          </button>
        </div>
        <div id="cert-result" class="hidden bg-sf-success/10 border border-sf-success/30 rounded-lg p-3 mb-4 text-sm"></div>
        <div class="flex justify-between">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm transition-colors">&larr; Back</button>
          <button id="btn-cert-next" onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold transition-colors opacity-30 pointer-events-none">Next &rarr;</button>
        </div>
      `;
      document.getElementById('btn-generate-certs').addEventListener('click', async () => {
        const result = await fetch('/api/setup/certificate', { method: 'POST' }).then((r) => r.json());
        if (result.success) {
          document.getElementById('cert-result').classList.remove('hidden');
          document.getElementById('cert-result').innerHTML =
            '&#10003; Certificates generated. Continue to the next step to register the public key on your Contact Center.';
          const btn = document.getElementById('btn-cert-next');
          btn.classList.remove('opacity-30', 'pointer-events-none');
        }
      });
      break;

    case 'org-auth':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Select Salesforce Org <span id="srv-ver" class="text-[0.65rem] opacity-30 font-mono ml-2"></span></h2>
        <div id="org-current" class="text-sm opacity-70 mb-4">Loading...</div>
        <div class="space-y-3">
          <button id="btn-use-default" class="w-full bg-sf-blue/40 hover:bg-sf-blue/60 px-4 py-2 rounded-md text-sm font-semibold hidden">Use default org</button>
          <details class="bg-white/5 rounded-md">
            <summary class="text-sm p-2 cursor-pointer">Pick a different org</summary>
            <div id="org-list" class="p-2 space-y-1 text-sm"></div>
          </details>
          <details class="bg-white/5 rounded-md">
            <summary class="text-sm p-2 cursor-pointer">Login a new org</summary>
            <div class="p-2 space-y-2 text-sm">
              <input id="new-alias" placeholder="alias (alnum/._-)" class="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-sm font-mono" />
              <button id="btn-login" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-4 py-1.5 rounded text-sm">Launch browser login</button>
              <div id="login-log"></div>
            </div>
          </details>
        </div>
        <div class="flex justify-between mt-6">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm">&larr; Back</button>
          <button id="btn-org-next" onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold opacity-30 pointer-events-none">Next &rarr;</button>
        </div>
      `;

      (async () => {
        const info = document.getElementById('org-current');
        const useBtn = document.getElementById('btn-use-default');
        // Probe server version — if this 404s the server is pre-fix.
        try {
          const ver = await fetch('/api/setup/version').then((x) => x.ok ? x.json() : null);
          const el = document.getElementById('srv-ver');
          if (ver?.version) el.textContent = `server: ${ver.version}`;
          else el.innerHTML = '<span class="text-sf-error">server: stale (no /api/setup/version) — git pull + restart npm run dev</span>';
        } catch { /* ignore */ }
        const r = await fetch('/api/setup/org').then((x) => x.json());
        if (r.error) {
          info.innerHTML = `<div class="text-sf-error">sf CLI error: ${r.message}</div>
            <div class="opacity-60 text-xs mt-1">Verify <code>sf --version</code> is on PATH and at least one org is logged in (<code>sf org login web</code>).</div>`;
        } else if (r.hasDefault) {
          info.innerHTML = `<div>Default alias: <b>${r.alias}</b></div><div class="opacity-60 text-xs">${r.username} — ${r.orgId}</div><div class="opacity-60 text-xs mt-1">SCRT: ${r.scrtBaseUrl}</div>`;
          useBtn.classList.remove('hidden');
          useBtn.addEventListener('click', async () => {
            await selectOrg(r.alias);
          });
        } else {
          info.textContent = 'No default org set. Pick one below or log in.';
        }

        const list = await fetch('/api/setup/org/list').then((x) => x.json());
        const listEl = document.getElementById('org-list');
        if (list.error) {
          listEl.innerHTML = `<div class="text-sf-error text-xs p-2">Failed to list orgs: ${list.message}</div>`;
        } else if (!list.orgs || list.orgs.length === 0) {
          listEl.innerHTML = '<div class="opacity-60 text-xs p-2">No authenticated orgs found. Use "Login a new org" below.</div>';
        } else {
          listEl.innerHTML = list.orgs.map((o) => {
            const aliasAttr = o.alias || o.username;
            const label = o.alias ? `<b>${o.alias}</b> <span class="opacity-60">${o.username}</span>` : `<span>${o.username}</span>`;
            const badge = o.bucket && o.bucket !== 'nonScratchOrgs' ? `<span class="opacity-40 text-[0.65rem] ml-1">[${o.bucket}]</span>` : '';
            return `<button data-alias="${aliasAttr}" class="block w-full text-left hover:bg-white/10 px-2 py-1 rounded">${label}${badge}</button>`;
          }).join('');
          listEl.querySelectorAll('button[data-alias]').forEach((b) => {
            b.addEventListener('click', () => selectOrg(b.dataset.alias));
          });
        }

        document.getElementById('btn-login').addEventListener('click', async () => {
          const alias = document.getElementById('new-alias').value.trim();
          if (!alias) return;
          const logPanel = createLogPanel('login-log');
          await streamSse('/api/setup/org/login', { alias }, (event, data) => {
            if (event === 'log') logPanel.append(data.line || data.message, data.level);
            else if (event === 'done') {
              logPanel.attachFile(data.runId);
              if (data.success) selectOrg(alias);
            }
          });
        });
      })();

      async function selectOrg(alias) {
        const r = await fetch('/api/setup/org/select', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alias }),
        }).then((x) => x.json());
        if (r.error) { alert(r.message); return; }
        state.orgAlias = alias;
        state.orgId = r.orgId;
        state.username = r.username;
        state.scrtBaseUrl = r.scrtBaseUrl;
        const btn = document.getElementById('btn-org-next');
        btn.classList.remove('opacity-30', 'pointer-events-none');
        document.getElementById('org-current').innerHTML = `<div class="text-sf-success">Selected: <b>${alias}</b> (${r.username})</div>`;
      }
      break;

    case 'contact-center':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Contact Center Configuration</h2>
        <div class="text-sm opacity-60 mb-4 leading-relaxed">
          ウィザードが ngrok tunnel の起動、<code>ConversationVendorInfo</code> と <code>ContactCenter</code> の
          Metadata API deploy までを自動で実行します。Public Key(jwt.pem)は Contact Center レコードに自動登録されます。
        </div>

        <div class="space-y-3 mb-4">
          <div>
            <label class="text-xs opacity-60 block mb-1">Service Endpoint URL</label>
            <div id="tunnel-display" class="bg-black/30 border border-white/10 rounded px-3 py-2 text-sm font-mono min-h-[2.25rem] flex items-center gap-2">
              <span class="opacity-50">Provisioning tunnel...</span>
            </div>
            <div id="tunnel-status" class="text-xs opacity-60 mt-1"></div>
          </div>
          <div>
            <label class="text-xs opacity-60 block mb-1">CC Developer Name</label>
            <input id="cc-dev-name" value="VoxCanvas_CC" class="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-sm font-mono" />
          </div>
          <div>
            <label class="text-xs opacity-60 block mb-1">CC Master Label</label>
            <input id="cc-label" value="VoxCanvas Contact Center" class="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-sm" />
          </div>
        </div>

        <button id="btn-deploy" class="w-full bg-sf-blue/50 hover:bg-sf-blue/70 px-4 py-2 rounded font-semibold text-sm opacity-30 pointer-events-none" disabled>Deploy</button>
        <div id="deploy-log"></div>

        <div class="flex justify-between mt-6">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm">&larr; Back</button>
          <button id="btn-cc-next" onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold opacity-30 pointer-events-none">Next &rarr;</button>
        </div>
      `;

      (async () => {
        const display = document.getElementById('tunnel-display');
        const statusEl = document.getElementById('tunnel-status');
        const deployBtn = document.getElementById('btn-deploy');

        function setTunnelReady(url, pid, reused) {
          display.innerHTML = `<span class="text-sf-success">&#10003;</span> <span class="break-all">${url}</span>`;
          statusEl.textContent = reused ? `Reused existing tunnel (pid ${pid})` : `pid ${pid}`;
          state.serviceEndpoint = url;
          state.ngrokStarted = true;
          deployBtn.classList.remove('opacity-30', 'pointer-events-none');
          deployBtn.disabled = false;
        }

        function setTunnelError(message) {
          display.innerHTML = `<span class="text-sf-error">&#10007; Tunnel unavailable</span>`;
          statusEl.innerHTML = `<span class="text-sf-error">${message}</span><br>
            <span class="opacity-70">Install: <code>brew install ngrok</code> &mdash; then <code>ngrok config add-authtoken &lt;your token&gt;</code>. Free token: <a href="https://dashboard.ngrok.com/get-started/your-authtoken" target="_blank" class="underline">ngrok dashboard</a>.</span>
            <button id="btn-tunnel-retry" class="mt-2 bg-sf-blue/40 hover:bg-sf-blue/60 px-3 py-1 rounded text-xs">Retry</button>`;
          const retry = document.getElementById('btn-tunnel-retry');
          if (retry) retry.addEventListener('click', provisionTunnel);
        }

        async function provisionTunnel() {
          display.innerHTML = '<span class="opacity-50">Provisioning tunnel...</span>';
          statusEl.textContent = '';
          try {
            // Reuse if a previous visit to this step already started ngrok.
            const existing = await fetch('/api/setup/ngrok/status').then((x) => x.json());
            if (existing.running && existing.url) {
              setTunnelReady(existing.url, existing.pid, true);
              return;
            }
            const r = await fetch('/api/setup/ngrok/start', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ port: 3030 }),
            }).then((x) => x.json());
            if (r.error) { setTunnelError(r.message); return; }
            setTunnelReady(r.url, r.pid, r.reused);
          } catch (err) {
            setTunnelError(err.message);
          }
        }

        provisionTunnel();
      })();

      document.getElementById('btn-deploy').addEventListener('click', async () => {
        if (!state.serviceEndpoint) {
          alert('Tunnel not provisioned yet. Wait for "Provisioning tunnel..." to finish or click Retry.');
          return;
        }
        const serviceEndpoint = state.serviceEndpoint;
        const developerName = document.getElementById('cc-dev-name').value.trim();
        const masterLabel = document.getElementById('cc-label').value.trim();

        const check = await fetch(`/api/setup/cc/check?name=${encodeURIComponent(developerName)}`).then((x) => x.json());
        if (check.exists) {
          if (!confirm(`Contact Center "${developerName}" already exists (Id=${check.id}). Overwrite?`)) return;
        }

        const logPanel = createLogPanel('deploy-log');
        await streamSse('/api/setup/cc/deploy', { serviceEndpoint, developerName, masterLabel }, (event, data) => {
          if (event === 'log') logPanel.append(data.line || data.message, data.level);
          else if (event === 'done') {
            logPanel.attachFile(data.runId);
            if (data.success) {
              state.callCenterApiName = data.callCenterApiName;
              document.getElementById('btn-cc-next').classList.remove('opacity-30', 'pointer-events-none');
            }
          }
        });
      });
      break;

    case 'permset':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Assign Permission Sets</h2>
        <div class="text-sm opacity-60 mb-4">
          Admin と Agent の Permission Set を割り当てます。
        </div>
        <div class="space-y-2 mb-4 text-sm">
          <div class="bg-white/5 px-3 py-2 rounded"><code>ContactCenterAdminExternalTelephony</code></div>
          <div class="bg-white/5 px-3 py-2 rounded"><code>ContactCenterAgentExternalTelephony</code></div>
        </div>
        <div class="mb-4">
          <label class="text-xs opacity-60 block mb-1">Target User (optional)</label>
          <input id="permset-user" placeholder="${state.username || 'connected user'}" class="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-sm font-mono" />
        </div>
        <button id="btn-assign" class="w-full bg-sf-blue/50 hover:bg-sf-blue/70 px-4 py-2 rounded font-semibold text-sm">Assign</button>
        <div id="permset-log"></div>
        <div class="flex justify-between mt-6">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm">&larr; Back</button>
          <button id="btn-permset-next" onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold opacity-30 pointer-events-none">Next &rarr;</button>
        </div>
      `;

      document.getElementById('btn-assign').addEventListener('click', async () => {
        const targetUser = document.getElementById('permset-user').value.trim() || undefined;
        const logPanel = createLogPanel('permset-log');
        await streamSse('/api/setup/permset/assign', {
          permsetNames: ['ContactCenterAdminExternalTelephony', 'ContactCenterAgentExternalTelephony'],
          targetUser,
        }, (event, data) => {
          if (event === 'log') logPanel.append(data.line || data.message, data.level);
          else if (event === 'done') {
            logPanel.attachFile(data.runId);
            if (data.success) {
              document.getElementById('btn-permset-next').classList.remove('opacity-30', 'pointer-events-none');
            }
          }
        });
      });
      break;

    case 'test':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Test Connection</h2>
        <div class="text-center py-6">
          <button id="btn-test-connection" class="bg-sf-blue/30 hover:bg-sf-blue/50 px-8 py-3 rounded-lg text-sm font-bold transition-colors">Test Connection</button>
          <div id="test-results" class="mt-6 space-y-2 max-w-xs mx-auto hidden"></div>
        </div>
        <div class="flex justify-between mt-4">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm transition-colors">&larr; Back</button>
          <button id="btn-test-next" onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold transition-colors opacity-30 pointer-events-none">Next &rarr;</button>
        </div>
      `;
      document.getElementById('btn-test-connection').addEventListener('click', async () => {
        const resultsDiv = document.getElementById('test-results');
        resultsDiv.classList.remove('hidden');

        const scrtBaseUrl = state.scrtBaseUrl || '';
        const orgId = state.orgId || '';
        const callCenterApiName = state.callCenterApiName || '';

        if (!scrtBaseUrl || !orgId || !callCenterApiName) {
          resultsDiv.innerHTML =
            '<div class="text-sm text-sf-error">&#10007; Prior steps incomplete (Org / Contact Center not set).</div>';
          return;
        }

        resultsDiv.innerHTML = `
          <div class="flex items-center gap-2 text-sm"><span class="text-sf-success">&#10003;</span> Org: ${state.orgAlias}</div>
          <div class="flex items-center gap-2 text-sm"><span class="text-sf-success">&#10003;</span> SCRT URL: <code class="text-xs">${scrtBaseUrl}</code></div>
          <div class="flex items-center gap-2 text-sm"><span class="text-sf-success">&#10003;</span> Contact Center: ${callCenterApiName}</div>
          <div class="flex items-center gap-2 text-sm mt-2"><span class="text-sf-orange">&#9888;</span> JWT auth is tested after .env save in the next step.</div>
        `;
        const btn = document.getElementById('btn-test-next');
        btn.classList.remove('opacity-30', 'pointer-events-none');
      });
      break;

    case 'complete':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Review & Finish</h2>
        <div class="text-sm opacity-70 space-y-1 mb-4">
          <div>Org Alias: <b>${state.orgAlias || '(none)'}</b></div>
          <div>Username: ${state.username || '-'}</div>
          <div>Org ID: ${state.orgId || '-'}</div>
          <div>SCRT Base URL: <code>${state.scrtBaseUrl || '-'}</code></div>
          <div>Contact Center: ${state.callCenterApiName || '-'}</div>
        </div>

        <div class="mb-4">
          <label class="text-xs opacity-60 block mb-1">Call Center Phone (optional)</label>
          <input id="cc-phone" placeholder="0120-000-000" class="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-sm font-mono" />
        </div>

        <div class="bg-white/5 rounded p-3 mb-4">
          <div class="text-xs font-semibold opacity-70 mb-2">Cleanup</div>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="chk-logs" checked> Delete setup logs</label>
          <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="chk-tmp" checked> Delete tmp metadata dirs</label>
          <div id="process-list" class="mt-2 text-sm"></div>
        </div>

        <button id="btn-finish" class="w-full bg-sf-success/50 hover:bg-sf-success/70 px-4 py-2 rounded font-semibold text-sm">Save & Finish</button>
        <div id="finish-result" class="mt-3 text-sm"></div>
      `;

      (async () => {
        const procs = await fetch('/api/setup/processes').then((x) => x.json());
        const procList = document.getElementById('process-list');
        if (procs.processes?.length) {
          procList.innerHTML = '<div class="text-xs opacity-60 mb-1">Wizard-started processes:</div>' +
            procs.processes.map((p) => `<label class="flex items-center gap-2"><input type="checkbox" class="proc-chk" data-name="${p.name}" checked> ${p.label} (pid ${p.pid})</label>`).join('');
        }
      })();

      document.getElementById('btn-finish').addEventListener('click', async () => {
        const stopProcesses = [...document.querySelectorAll('.proc-chk')]
          .filter((c) => c.checked).map((c) => c.dataset.name);
        const body = {
          scrtBaseUrl: state.scrtBaseUrl,
          orgId: state.orgId,
          callCenterApiName: state.callCenterApiName,
          callCenterPhone: document.getElementById('cc-phone').value.trim(),
          cleanup: {
            deleteLogs: document.getElementById('chk-logs').checked,
            deleteTmp: document.getElementById('chk-tmp').checked,
            stopProcesses,
          },
        };
        const r = await fetch('/api/setup/complete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then((x) => x.json());
        const out = document.getElementById('finish-result');
        if (r.success) {
          out.innerHTML = `<div class="text-sf-success">Done. ${r.cleanup.logsDeleted} logs, ${r.cleanup.tmpDirsDeleted} tmp dirs deleted, stopped: ${r.cleanup.processesStopped.join(', ') || 'none'}.</div>
            <a href="/" class="underline text-sf-blue">Open Dashboard</a>`;
        } else {
          out.innerHTML = `<div class="text-sf-error">${r.message}</div>`;
        }
      });
      break;
  }
}

function nextStep() {
  if (currentStep < STEPS.length - 1) {
    currentStep++;
    renderStep();
  }
}

function prevStep() {
  if (currentStep > 0) {
    currentStep--;
    renderStep();
  }
}

// Expose to inline onclick handlers
window.nextStep = nextStep;
window.prevStep = prevStep;

init();

function createLogPanel(containerId) {
  const panel = document.getElementById(containerId);
  panel.innerHTML = `
    <div class="bg-black/40 border border-white/10 rounded-md mt-3">
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <span class="text-xs opacity-60">Log</span>
        <div class="flex gap-2">
          <button class="text-xs opacity-60 hover:opacity-100" data-act="copy">Copy</button>
          <a class="text-xs opacity-60 hover:opacity-100 hidden" data-act="open">File</a>
        </div>
      </div>
      <pre class="text-[0.7rem] font-mono px-3 py-2 max-h-60 overflow-auto" data-log></pre>
    </div>`;
  const pre = panel.querySelector('[data-log]');
  const copy = panel.querySelector('[data-act="copy"]');
  const openLink = panel.querySelector('[data-act="open"]');
  const append = (line, level) => {
    const div = document.createElement('div');
    const colors = { error: 'text-sf-error', warn: 'text-yellow-400', hint: 'text-sf-blue font-semibold', info: 'opacity-80' };
    div.className = colors[level] || 'opacity-70';
    div.textContent = line;
    pre.appendChild(div);
    pre.scrollTop = pre.scrollHeight;
  };
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(pre.innerText);
  });
  const attachFile = (runId) => {
    openLink.href = `/api/setup/logs/${runId}`;
    openLink.classList.remove('hidden');
    openLink.target = '_blank';
  };
  return { append, attachFile };
}

async function streamSse(url, body, onEvent) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.body) throw new Error('no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const part of parts) {
      const lines = part.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7);
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      try {
        onEvent(event, JSON.parse(data));
      } catch { /* partial */ }
    }
  }
}

window.createLogPanel = createLogPanel;
window.streamSse = streamSse;

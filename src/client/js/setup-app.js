const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'certificate', label: 'Certificate' },
  { id: 'connected-app', label: 'Connected App' },
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
            '&#10003; Certificates generated. <a href="/api/setup/certificate/download" class="underline text-sf-blue">Download jwt.pem</a> for the Connected App.';
          const btn = document.getElementById('btn-cert-next');
          btn.classList.remove('opacity-30', 'pointer-events-none');
        }
      });
      break;

    case 'connected-app':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Connected App &amp; Tenant Configuration</h2>
        <div class="text-sm opacity-60 mb-4 leading-relaxed">
          In your Salesforce org:<br>
          1. Setup &rarr; App Manager &rarr; New Connected App<br>
          2. Enable OAuth, select scopes: <code class="bg-white/10 px-1 rounded text-xs">api</code>, <code class="bg-white/10 px-1 rounded text-xs">refresh_token</code><br>
          3. Upload the <a href="/api/setup/certificate/download" class="underline text-sf-blue">jwt.pem</a> certificate<br>
          4. Fill the Connected App and tenant fields below
        </div>
        <div class="space-y-3 mb-6">
          <div>
            <label class="text-xs opacity-50 mb-1 block">Consumer Key (Client ID)</label>
            <input id="setup-consumer-key" type="text" placeholder="3MVG9..."
              class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm font-mono focus:border-sf-blue focus:outline-none" />
          </div>
          <div>
            <label class="text-xs opacity-50 mb-1 block">Salesforce Username</label>
            <input id="setup-username" type="text" placeholder="admin@myorg.com"
              class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-sf-blue focus:outline-none" />
          </div>
          <div>
            <label class="text-xs opacity-50 mb-1 block">Login URL</label>
            <div class="flex gap-2">
              <button class="login-url-btn bg-sf-blue/30 px-3 py-1.5 rounded text-xs font-medium" data-url="https://login.salesforce.com">login.salesforce.com</button>
              <button class="login-url-btn bg-white/10 px-3 py-1.5 rounded text-xs font-medium" data-url="https://test.salesforce.com">test.salesforce.com</button>
            </div>
            <input id="setup-login-url" type="hidden" value="https://login.salesforce.com" />
          </div>
          <div class="border-t border-white/[0.06] pt-3 mt-4">
            <div class="text-xs font-semibold opacity-70 mb-2">Tenant / Contact Center</div>
            <div class="text-[0.65rem] opacity-40 mb-2 leading-relaxed">
              Find SCRT Base URL in Setup &rarr; Service Cloud Voice &rarr; Partner Telephony.
              Org ID is in Setup &rarr; Company Information.
            </div>
          </div>
          <div>
            <label class="text-xs opacity-50 mb-1 block">SCRT2 Base URL</label>
            <input id="setup-scrt-base-url" type="text" placeholder="https://xxx.my.salesforce-scrt.com"
              class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm font-mono focus:border-sf-blue focus:outline-none" />
          </div>
          <div>
            <label class="text-xs opacity-50 mb-1 block">Salesforce Org ID</label>
            <input id="setup-org-id" type="text" placeholder="00D..."
              class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm font-mono focus:border-sf-blue focus:outline-none" />
          </div>
          <div>
            <label class="text-xs opacity-50 mb-1 block">Call Center API Name</label>
            <input id="setup-call-center-api-name" type="text" placeholder="VoxCanvas_CallCenter"
              class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm font-mono focus:border-sf-blue focus:outline-none" />
          </div>
          <div>
            <label class="text-xs opacity-50 mb-1 block">Call Center Phone (optional)</label>
            <input id="setup-call-center-phone" type="text" placeholder="0120-000-000"
              class="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm focus:border-sf-blue focus:outline-none" />
          </div>
        </div>
        <div class="flex justify-between">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm transition-colors">&larr; Back</button>
          <button onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold transition-colors">Next &rarr;</button>
        </div>
      `;
      document.querySelectorAll('.login-url-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.login-url-btn').forEach((b) => (b.className = 'login-url-btn bg-white/10 px-3 py-1.5 rounded text-xs font-medium'));
          btn.className = 'login-url-btn bg-sf-blue/30 px-3 py-1.5 rounded text-xs font-medium';
          document.getElementById('setup-login-url').value = btn.dataset.url;
          state.loginUrl = btn.dataset.url;
        });
      });

      // Restore previously-entered values if the user navigates back.
      const setIfPresent = (id, value) => {
        const el = document.getElementById(id);
        if (el && value) el.value = value;
      };
      setIfPresent('setup-consumer-key', state.consumerKey);
      setIfPresent('setup-username', state.username);
      setIfPresent('setup-scrt-base-url', state.scrtBaseUrl);
      setIfPresent('setup-org-id', state.orgId);
      setIfPresent('setup-call-center-api-name', state.callCenterApiName);
      setIfPresent('setup-call-center-phone', state.callCenterPhone);

      // Re-sync the login URL button highlight + hidden input so the UI
      // reflects state.loginUrl (otherwise Back navigation resets the
      // visible selection to login.salesforce.com while state still holds
      // test.salesforce.com, and the POST uses state).
      if (state.loginUrl) {
        document.querySelectorAll('.login-url-btn').forEach((b) => {
          b.className = b.dataset.url === state.loginUrl
            ? 'login-url-btn bg-sf-blue/30 px-3 py-1.5 rounded text-xs font-medium'
            : 'login-url-btn bg-white/10 px-3 py-1.5 rounded text-xs font-medium';
        });
        document.getElementById('setup-login-url').value = state.loginUrl;
      }

      // Capture each field into `state` so it survives re-renders.
      const bind = (id, key) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => { state[key] = el.value.trim(); });
      };
      bind('setup-consumer-key', 'consumerKey');
      bind('setup-username', 'username');
      bind('setup-scrt-base-url', 'scrtBaseUrl');
      bind('setup-org-id', 'orgId');
      bind('setup-call-center-api-name', 'callCenterApiName');
      bind('setup-call-center-phone', 'callCenterPhone');
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
        resultsDiv.innerHTML = '<div class="text-sm opacity-50">Saving configuration...</div>';

        const consumerKey = state.consumerKey || '';
        const username = state.username || '';
        const loginUrl = state.loginUrl || 'https://login.salesforce.com';
        const scrtBaseUrl = state.scrtBaseUrl || '';
        const orgId = state.orgId || '';
        const callCenterApiName = state.callCenterApiName || '';
        const callCenterPhone = state.callCenterPhone || '';

        if (!consumerKey || !username || !scrtBaseUrl || !orgId || !callCenterApiName) {
          resultsDiv.innerHTML =
            '<div class="text-sm text-sf-error">&#10007; Go back and fill in all required fields.</div>';
          return;
        }

        const saveResult = await fetch('/api/setup/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consumerKey, username, loginUrl,
            scrtBaseUrl, orgId, callCenterApiName, callCenterPhone,
          }),
        }).then((r) => r.json());

        if (saveResult.success) {
          resultsDiv.innerHTML = `
            <div class="flex items-center gap-2 text-sm"><span class="text-sf-success">&#10003;</span> Configuration saved</div>
            <div class="flex items-center gap-2 text-sm"><span class="text-sf-orange">&#9888;</span> Restart server to test JWT auth</div>
          `;
          const btn = document.getElementById('btn-test-next');
          btn.classList.remove('opacity-30', 'pointer-events-none');
        } else {
          resultsDiv.innerHTML = `<div class="text-sm text-sf-error">&#10007; ${saveResult.message}</div>`;
        }
      });
      break;

    case 'complete':
      container.innerHTML = `
        <div class="text-center py-8">
          <div class="text-4xl mb-4">&#10003;</div>
          <h2 class="text-xl font-bold text-sf-success mb-2">VoxCanvas is ready!</h2>
          <p class="text-sm opacity-50 mb-6">Configuration saved. Restart the server and open the dashboard.</p>
          <a href="/" class="inline-block bg-sf-blue/40 hover:bg-sf-blue/60 px-8 py-3 rounded-lg text-sm font-bold transition-colors">Open Dashboard &rarr;</a>
        </div>
      `;
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

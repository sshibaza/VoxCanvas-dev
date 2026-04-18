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
            ${state.sfCliVersion ? `<span class="text-sf-success">&#10003;</span> Salesforce CLI: ${state.sfCliVersion}` : '<span class="text-sf-error">&#10007;</span> Salesforce CLI not found (required)'}
          </div>
          <div class="flex items-center gap-2 text-sm">
            ${state.ngrokVersion ? `<span class="text-sf-success">&#10003;</span> ngrok: ${state.ngrokVersion}` : '<span class="opacity-40">&#8212;</span> ngrok not found <span class="opacity-40">(optional, Tunnel mode only)</span>'}
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
        state.instanceUrl = r.instanceUrl;
        const btn = document.getElementById('btn-org-next');
        btn.classList.remove('opacity-30', 'pointer-events-none');
        document.getElementById('org-current').innerHTML = `<div class="text-sf-success">Selected: <b>${alias}</b> (${r.username})</div>`;
      }
      break;

    case 'contact-center': {
      const LOCAL_ENDPOINT = 'https://127.0.0.1:3030/';
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Contact Center Configuration</h2>
        <div class="text-sm opacity-60 mb-4 leading-relaxed">
          ウィザードが <code>ConversationVendorInfo</code> と Apex stub を自動デプロイし、
          Contact Center 用の Import XML(JWT 公開鍵埋め込み済)を生成します。
          生成した XML を Salesforce の Setup UI から 1 クリックで Import してください。
        </div>

        <div class="bg-white/5 border border-white/10 rounded p-3 mb-4 text-sm">
          <div class="text-xs opacity-60 mb-2">Endpoint mode</div>
          <label class="flex items-start gap-2 mb-2 cursor-pointer">
            <input type="radio" name="ep-mode" value="local" checked class="mt-1">
            <div>
              <div class="font-semibold">Local (127.0.0.1)</div>
              <div class="opacity-60 text-xs">同じ Mac で Salesforce Lightning と VoxCanvas を動かすデモ(FDE の画面共有デモなど)。ngrok 不要。</div>
            </div>
          </label>
          <label class="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="ep-mode" value="tunnel" class="mt-1">
            <div>
              <div class="font-semibold">Tunnel (ngrok)</div>
              <div class="opacity-60 text-xs">別の PC から agent として Salesforce にログインする/リモート同僚と共有する場合。ngrok の事前設定が必要。</div>
            </div>
          </label>
        </div>

        <div class="space-y-3 mb-4">
          <div>
            <label class="text-xs opacity-60 block mb-1">Service Endpoint URL</label>
            <div id="tunnel-display" class="bg-black/30 border border-white/10 rounded px-3 py-2 text-sm font-mono min-h-[2.25rem] flex items-center gap-2">
              <span class="opacity-50">—</span>
            </div>
            <div id="tunnel-status" class="text-xs opacity-60 mt-1"></div>
          </div>
          <div>
            <label class="text-xs opacity-60 block mb-1">CC Internal Name <span class="opacity-50">(英字始まりの英数字のみ、40 文字以下、記号・スペース不可)</span></label>
            <input id="cc-dev-name" value="VoxCanvasDemoCenter" pattern="[A-Za-z][A-Za-z0-9]{0,39}" maxlength="40" class="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-sm font-mono" />
          </div>
          <div>
            <label class="text-xs opacity-60 block mb-1">CC Display Name</label>
            <input id="cc-label" value="VoxCanvas Demo Center" maxlength="80" class="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-sm" />
          </div>
        </div>

        <button id="btn-deploy" class="w-full bg-sf-blue/50 hover:bg-sf-blue/70 px-4 py-2 rounded font-semibold text-sm opacity-30 pointer-events-none" disabled>Deploy</button>
        <div id="deploy-log"></div>

        <div class="flex justify-between mt-6">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm">&larr; Back</button>
          <button id="btn-cc-next" onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold opacity-30 pointer-events-none">Next &rarr;</button>
        </div>
      `;

      const display = document.getElementById('tunnel-display');
      const statusEl = document.getElementById('tunnel-status');
      const deployBtn = document.getElementById('btn-deploy');

      function setEndpointReady(url, note) {
        display.innerHTML = `<span class="text-sf-success">&#10003;</span> <span class="break-all">${url}</span>`;
        statusEl.textContent = note || '';
        state.serviceEndpoint = url;
        deployBtn.classList.remove('opacity-30', 'pointer-events-none');
        deployBtn.disabled = false;
      }

      function setEndpointError(html) {
        display.innerHTML = `<span class="text-sf-error">&#10007; Endpoint unavailable</span>`;
        statusEl.innerHTML = html;
        state.serviceEndpoint = null;
        deployBtn.classList.add('opacity-30', 'pointer-events-none');
        deployBtn.disabled = true;
      }

      function copyCmd(cmd) {
        return `<div class="flex items-center gap-2 bg-black/40 border border-white/10 rounded px-2 py-1 font-mono text-[0.7rem]">
          <span class="flex-1 break-all">${cmd}</span>
          <button data-copy="${cmd.replace(/"/g, '&quot;')}" class="opacity-60 hover:opacity-100 text-xs">copy</button>
        </div>`;
      }
      function wireCopyButtons(root) {
        root.querySelectorAll('button[data-copy]').forEach((b) => {
          b.addEventListener('click', () => {
            navigator.clipboard.writeText(b.dataset.copy);
            const orig = b.textContent;
            b.textContent = 'copied';
            setTimeout(() => { b.textContent = orig; }, 1000);
          });
        });
      }

      async function enterLocalMode() {
        state.endpointMode = 'local';
        display.innerHTML = `<span class="opacity-50">Checking 127.0.0.1 reachability...</span>`;
        statusEl.textContent = '';
        try {
          const r = await fetch('/api/health', { cache: 'no-store' });
          if (!r.ok) throw new Error(`health returned ${r.status}`);
          setEndpointReady(LOCAL_ENDPOINT,
            'VoxCanvas is reachable on 127.0.0.1. Agent browser on THIS Mac can load the connector directly — no tunnel needed.');
        } catch (err) {
          // Most commonly: browser hasn't accepted the self-signed cert yet.
          setEndpointError(`
            <div class="bg-white/5 border border-white/10 rounded p-3 space-y-2 text-xs">
              <div class="font-semibold opacity-80">Self-signed 証明書を受理してください(初回のみ)</div>
              <div class="opacity-80"><b>1.</b> 新しいタブで以下を開く:</div>
              ${copyCmd('https://127.0.0.1:3030/')}
              <div class="opacity-80"><b>2.</b> ブラウザの警告画面で <b>[詳細設定]</b> → <b>[このまま続行](このサイトにアクセスする)</b></div>
              <div class="opacity-80"><b>3.</b> 下の <b>Re-check</b> を押す</div>
              <div class="opacity-50 text-[0.65rem] mt-1">もし VoxCanvas サーバーが起動していない場合は <code>npm run dev</code> を先に実行してください。</div>
            </div>
            <button id="btn-local-retry" class="mt-3 bg-sf-blue/50 hover:bg-sf-blue/70 px-4 py-1.5 rounded text-sm font-semibold">Re-check</button>`);
          wireCopyButtons(statusEl);
          document.getElementById('btn-local-retry')?.addEventListener('click', enterLocalMode);
        }
      }

      async function enterTunnelMode() {
        state.endpointMode = 'tunnel';
        display.innerHTML = '<span class="opacity-50">Provisioning tunnel...</span>';
        statusEl.textContent = '';
        try {
          const existing = await fetch('/api/setup/ngrok/status').then((x) => x.json());
          if (existing.running && existing.url) {
            setEndpointReady(existing.url, `Reused existing tunnel (pid ${existing.pid})`);
            return;
          }
          const r = await fetch('/api/setup/ngrok/start', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ port: 3030 }),
          }).then((x) => x.json());
          if (r.error) { showTunnelInstall(r.message); return; }
          setEndpointReady(r.url, `pid ${r.pid}`);
        } catch (err) {
          showTunnelInstall(err.message);
        }
      }

      function showTunnelInstall(message) {
        setEndpointError(`
          <div class="text-sf-error mb-2">${message}</div>
          <div class="bg-white/5 border border-white/10 rounded p-3 space-y-2 text-xs">
            <div class="font-semibold opacity-80">ngrok セットアップ(初回のみ、約 2 分)</div>
            <div class="opacity-80"><b>1.</b> アカウント作成(無料): <a href="https://dashboard.ngrok.com/signup" target="_blank" class="underline text-sf-blue">dashboard.ngrok.com/signup</a></div>
            <div>
              <div class="opacity-80 mb-1"><b>2.</b> インストール(macOS):</div>
              ${copyCmd('brew install ngrok')}
              <div class="opacity-50 text-[0.65rem] mt-1">Windows / Linux: <a href="https://ngrok.com/download" target="_blank" class="underline">ngrok.com/download</a></div>
            </div>
            <div class="opacity-80"><b>3.</b> authtoken を取得: <a href="https://dashboard.ngrok.com/get-started/your-authtoken" target="_blank" class="underline text-sf-blue">Your Authtoken ページ</a> からトークン文字列をコピー</div>
            <div>
              <div class="opacity-80 mb-1"><b>4.</b> authtoken を登録(<code>YOUR_TOKEN_HERE</code> を実際の値に置換):</div>
              ${copyCmd('ngrok config add-authtoken YOUR_TOKEN_HERE')}
            </div>
            <div class="opacity-80"><b>5.</b> 下の <b>Retry</b> を押す(または Local mode に切替)</div>
          </div>
          <button id="btn-tunnel-retry" class="mt-3 bg-sf-blue/50 hover:bg-sf-blue/70 px-4 py-1.5 rounded text-sm font-semibold">Retry</button>`);
        wireCopyButtons(statusEl);
        document.getElementById('btn-tunnel-retry')?.addEventListener('click', enterTunnelMode);
      }

      container.querySelectorAll('input[name="ep-mode"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          if (radio.checked && radio.value === 'local') enterLocalMode();
          if (radio.checked && radio.value === 'tunnel') enterTunnelMode();
        });
      });

      // Default: Local mode
      enterLocalMode();

      // After the vendor + Apex deploy succeeds, render a panel that
      // lets the admin download the pre-populated Contact Center XML
      // and Import it in Salesforce Setup UI, then verify the record
      // exists. Metadata API cannot deploy a Partner Telephony
      // CallCenter directly — the schema is locked to classic CTI
      // fields — so Setup UI Import is the only supported path.
      // We intentionally do NOT deep-link to a Setup URL — the Contact
      // Centers page path has shifted across Salesforce releases and a
      // stale URL shows "Page Not Found". Describe the navigation
      // steps instead; the Quick Find flow is stable across releases.
      function renderImportPanel(developerName, masterLabel) {
        const mount = document.getElementById('deploy-log');
        mount.insertAdjacentHTML('beforeend', `
          <div id="import-panel" class="mt-6 bg-white/5 border border-sf-blue/30 rounded p-4 text-sm">
            <div class="font-semibold mb-2">Next: Import the Contact Center XML</div>
            <div class="opacity-70 text-xs leading-relaxed mb-3">
              <code>ConversationVendorInfo</code> のデプロイは完了しました。
              Partner Telephony 用 Contact Center は Metadata API デプロイ対象外のため、
              Salesforce の Setup UI から Import してください。JWT 公開鍵 (<code>jwt.pem</code>) は
              XML に埋め込み済みです。
            </div>

            <div class="bg-black/20 border border-white/10 rounded p-2 mb-3 text-xs">
              <label class="block opacity-60 mb-1">Conversation Vendor Info (XML の <code>reqVendorInfoApiName</code> に書き込む値)</label>
              <select id="vendor-select" class="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono">
                <option>Loading vendors...</option>
              </select>
              <div class="opacity-50 mt-1">
                Setup UI の <b>[Import]</b> で選ぶベンダーと <b>一致している必要があります</b>。
                不一致だと <i>"XML ファイル内のベンダー名は、選択したベンダーの名前に一致する必要があります"</i> で失敗します。
              </div>
            </div>

            <ol class="list-decimal ml-5 space-y-2 text-xs mb-4">
              <li>
                <a id="btn-download-xml" href="#" download="${developerName}.callCenter.xml" class="inline-block bg-sf-success/30 hover:bg-sf-success/50 px-3 py-1.5 rounded text-sm font-semibold opacity-50 pointer-events-none">
                  Download ${developerName}.callCenter.xml &#8681;
                </a>
              </li>
              <li>
                Salesforce の <b>Setup</b> を開き、Quick Find に <code>Contact Centers</code> と入力 →
                <b>Service Cloud Voice → Contact Centers</b> を選択
              </li>
              <li>画面上部の <b>[Import]</b> をクリック → Vendor ドロップダウンで <b>上で選択したベンダー</b> を選ぶ → 先ほどダウンロードした <code>${developerName}.callCenter.xml</code> を選択 → <b>[Import]</b></li>
              <li>作成された Contact Center を開き、内容を確認して <b>[Save]</b></li>
              <li>下の <b>Verify</b> ボタンでウィザードに通知</li>
            </ol>
            <div class="flex items-center gap-3">
              <button id="btn-verify-cc" class="bg-sf-blue/50 hover:bg-sf-blue/70 px-4 py-1.5 rounded text-sm font-semibold">Verify</button>
              <div id="verify-status" class="text-xs opacity-70">Import が完了したら Verify を押してください。</div>
            </div>
          </div>
        `);

        // Load vendor list from SOQL so the reqVendorInfoApiName in the
        // downloaded XML always matches what the Setup UI Import
        // dropdown will offer. Default to the one we just deployed
        // ("VoxCanvas") if present.
        const vendorSelect = document.getElementById('vendor-select');
        const downloadLink = document.getElementById('btn-download-xml');
        function updateDownloadHref() {
          const vendorName = vendorSelect.value;
          if (!vendorName) return;
          downloadLink.href = `/api/setup/cc/import-xml?developerName=${encodeURIComponent(developerName)}`
            + `&masterLabel=${encodeURIComponent(masterLabel)}`
            + `&vendorDeveloperName=${encodeURIComponent(vendorName)}`;
          downloadLink.classList.remove('opacity-50', 'pointer-events-none');
        }
        vendorSelect.addEventListener('change', updateDownloadHref);
        (async () => {
          try {
            const r = await fetch('/api/setup/cc/vendors').then((x) => x.json());
            const vendors = r.vendors || [];
            if (vendors.length === 0) {
              vendorSelect.innerHTML = '<option value="">(no ConversationVendorInfo found — did deploy succeed?)</option>';
              return;
            }
            vendorSelect.innerHTML = vendors.map((v) => {
              const ns = v.namespacePrefix ? ` [${v.namespacePrefix}]` : '';
              return `<option value="${v.apiName}">${v.masterLabel}${ns} — ${v.apiName}</option>`;
            }).join('');
            // Prefer our own "VoxCanvas" vendor as the default if it
            // exists in the list; otherwise use whatever is first.
            const ours = vendors.findIndex((v) => v.apiName === 'VoxCanvas');
            vendorSelect.selectedIndex = ours >= 0 ? ours : 0;
            updateDownloadHref();
          } catch (err) {
            vendorSelect.innerHTML = `<option value="">(failed to load vendors: ${err.message})</option>`;
          }
        })();

        const statusEl = document.getElementById('verify-status');
        const verifyBtn = document.getElementById('btn-verify-cc');
        // First check on mount is "silent" — if the CC already exists
        // (admin re-running the wizard after a previous import), we
        // light up Next; but if it doesn't (the common case — admin
        // has not imported yet), we show a neutral "waiting" message
        // rather than a red error. Subsequent Verify clicks show the
        // red "not found" error because at that point the admin has
        // claimed to have imported.
        let firstCheck = true;
        async function verifyOnce() {
          statusEl.innerHTML = '<span class="opacity-70">Checking...</span>';
          try {
            const r = await fetch(`/api/setup/cc/check?name=${encodeURIComponent(developerName)}`).then((x) => x.json());
            if (r.exists) {
              statusEl.innerHTML = `<span class="text-sf-success">&#10003; ContactCenter found (Id=${r.id})</span>`;
              state.callCenterApiName = developerName;
              document.getElementById('btn-cc-next').classList.remove('opacity-30', 'pointer-events-none');
              verifyBtn.disabled = true;
              verifyBtn.classList.add('opacity-50', 'pointer-events-none');
              firstCheck = false;
              return true;
            }
            if (firstCheck) {
              statusEl.innerHTML = '<span class="opacity-70">Import が完了したら Verify を押してください。</span>';
            } else {
              statusEl.innerHTML = '<span class="text-sf-error">&#10007; まだ見つかりません。Setup UI で Import を完了してから再度 Verify してください。</span>';
            }
            firstCheck = false;
            return false;
          } catch (err) {
            statusEl.innerHTML = `<span class="text-sf-error">Verify failed: ${err.message}</span>`;
            firstCheck = false;
            return false;
          }
        }
        verifyBtn.addEventListener('click', verifyOnce);
        // Initial silent check — skips the Import step entirely if
        // the CC was already imported in a prior wizard run.
        verifyOnce();
      }

      document.getElementById('btn-deploy').addEventListener('click', async () => {
        if (!state.serviceEndpoint) {
          alert('Endpoint not ready yet. Accept the cert / set up ngrok, then retry.');
          return;
        }
        const serviceEndpoint = state.serviceEndpoint;
        const developerName = document.getElementById('cc-dev-name').value.trim();
        const masterLabel = document.getElementById('cc-label').value.trim();

        const deployBtn = document.getElementById('btn-deploy');
        deployBtn.disabled = true;
        deployBtn.classList.add('opacity-50', 'pointer-events-none');

        const logPanel = createLogPanel('deploy-log');
        let deployedOk = false;
        try {
          await streamSse('/api/setup/cc/deploy', { serviceEndpoint, developerName, masterLabel }, (event, data) => {
            if (event === 'log') logPanel.append(data.line || data.message, data.level);
            else if (event === 'done') {
              logPanel.attachFile(data.runId);
              if (data.success) {
                deployedOk = true;
                renderImportPanel(data.callCenterApiName, data.masterLabel || masterLabel);
              }
            }
          });
        } catch (err) {
          logPanel.append(`streamSse failed: ${err.message}`, 'error');
        } finally {
          // Re-enable Deploy only on failure; on success the admin's
          // next action is the Import flow, not a re-deploy.
          if (!deployedOk) {
            deployBtn.disabled = false;
            deployBtn.classList.remove('opacity-50', 'pointer-events-none');
          }
        }
      });
      break;
    }

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

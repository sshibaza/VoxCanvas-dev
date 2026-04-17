# Wizard CC Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Setup Wizard (`setup.html`) から Partner Telephony Contact Center の作成と Permission Set 割り当てまでを完結させ、README の手動 `sf` CLI 手順を不要にする。

**Architecture:** Express server が `sf` / `ngrok` を `child_process.spawn` で呼び出す backend layer を新設。メタデータテンプレート (`metadata/voxcanvas-contact-center/`) をレンダリングして一時ディレクトリに書き出し `sf project deploy start` で deploy。バックエンドは SSE でログを配信、フロントは 7ステップのウィザード UI に再構成する。

**Tech Stack:** Node.js + Express 5 + Vite + Vanilla JS + Tailwind / `sf` CLI v2 / `ngrok` v3 / `node:test` 組み込みテストランナー / `supertest` (HTTP テスト用)

Spec: `docs/superpowers/specs/2026-04-17-wizard-cc-automation-design.md`

---

## File Structure

### 新規ファイル

```
metadata/voxcanvas-contact-center/
  package.xml
  conversationVendorInfos/VoxCanvas.conversationVendorInfo-meta.xml
  contactCenters/TEMPLATE.contactCenter-meta.xml

src/server/setup/
  logger.js              ログバッファ + ファイル追記 + SSE ブロードキャスト
  hints.js               stderr パターン → ユーザー向けヒント
  metadataRenderer.js    テンプレート XML の値差し込み + tmp dir 管理
  sfRunner.js            sf CLI を spawn、stdout/stderr を logger へ
  ngrokRunner.js         ngrok を spawn、管理 API から URL 取得
  processRegistry.js     ウィザード発 child_process の PID 管理

tests/setup/
  logger.test.js
  hints.test.js
  metadataRenderer.test.js
  sfRunner.test.js
  processRegistry.test.js
  routes.test.js

docs/superpowers/plans/2026-04-17-wizard-cc-automation-plan.md  (this file)
```

### 改修ファイル

```
src/server/routes/setup.js     エンドポイント大量追加
src/server/index.js             shutdown hook 登録
src/client/js/setup-app.js      7ステップ再構成、SSE 購読、ログパネル
src/client/setup.html           ログパネル DOM
README.md                       ウィザード中心に書き換え
package.json                    devDependencies に supertest 追加
```

---

## Phase 1: プロジェクト準備

### Task 1: テスト用 devDependencies を追加

**Files:**
- Modify: `package.json`

- [ ] **Step 1: `supertest` を devDependencies に追加**

```bash
npm install --save-dev supertest
```

`uuid` は既に dependencies にあるので追加不要。`node:test` は Node 18+ 組み込み。

- [ ] **Step 2: `package.json` に test スクリプトを追加**

`scripts` に以下を追加:

```json
"test": "node --test tests/"
```

- [ ] **Step 3: 動作確認**

```bash
npm test
```

Expected: `0 tests` などで exit 0(まだテストファイルがないため)。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(test): add node:test + supertest for setup tests"
```

---

### Task 2: ディレクトリスケルトンを作成

**Files:**
- Create: `src/server/setup/.gitkeep`
- Create: `tests/setup/.gitkeep`
- Create: `metadata/voxcanvas-contact-center/.gitkeep`

- [ ] **Step 1: ディレクトリを作成**

```bash
mkdir -p src/server/setup tests/setup metadata/voxcanvas-contact-center/conversationVendorInfos metadata/voxcanvas-contact-center/contactCenters
touch src/server/setup/.gitkeep tests/setup/.gitkeep metadata/voxcanvas-contact-center/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add src/server/setup tests/setup metadata
git commit -m "chore: scaffold setup/ metadata/ directories"
```

---

## Phase 2: メタデータテンプレート

### Task 3: ConversationVendorInfo テンプレート

**Files:**
- Create: `metadata/voxcanvas-contact-center/conversationVendorInfos/VoxCanvas.conversationVendorInfo-meta.xml`

- [ ] **Step 1: ファイル作成**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ConversationVendorInfo xmlns="http://soap.sforce.com/2006/04/metadata">
    <developerName>VoxCanvas</developerName>
    <masterLabel>VoxCanvas Partner Telephony</masterLabel>
    <conversationVendorType>VOICE_PARTNER</conversationVendorType>
    <serviceEndpoint>{{SERVICE_ENDPOINT}}</serviceEndpoint>
    <apiVersion>61.0</apiVersion>
</ConversationVendorInfo>
```

- [ ] **Step 2: Commit**

```bash
git add metadata/voxcanvas-contact-center/conversationVendorInfos/VoxCanvas.conversationVendorInfo-meta.xml
git commit -m "feat(metadata): add ConversationVendorInfo template"
```

---

### Task 4: ContactCenter テンプレート + package.xml

**Files:**
- Create: `metadata/voxcanvas-contact-center/contactCenters/TEMPLATE.contactCenter-meta.xml`
- Create: `metadata/voxcanvas-contact-center/package.xml`

- [ ] **Step 1: ContactCenter テンプレート**

`metadata/voxcanvas-contact-center/contactCenters/TEMPLATE.contactCenter-meta.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ContactCenter xmlns="http://soap.sforce.com/2006/04/metadata">
    <developerName>{{CC_DEVELOPER_NAME}}</developerName>
    <masterLabel>{{CC_MASTER_LABEL}}</masterLabel>
    <conversationVendorInfo>VoxCanvas</conversationVendorInfo>
    <publicKey>{{PUBLIC_KEY_PEM}}</publicKey>
</ContactCenter>
```

- [ ] **Step 2: package.xml**

`metadata/voxcanvas-contact-center/package.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>VoxCanvas</members>
        <name>ConversationVendorInfo</name>
    </types>
    <types>
        <members>{{CC_DEVELOPER_NAME}}</members>
        <name>ContactCenter</name>
    </types>
    <version>61.0</version>
</Package>
```

- [ ] **Step 3: Commit**

```bash
git add metadata/voxcanvas-contact-center/contactCenters metadata/voxcanvas-contact-center/package.xml
git commit -m "feat(metadata): add ContactCenter template + package.xml"
```

---

## Phase 3: バックエンドユーティリティ (TDD)

### Task 5: logger.js (ログバッファ + SSE ブロードキャスタ)

**Files:**
- Create: `src/server/setup/logger.js`
- Create: `tests/setup/logger.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/setup/logger.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Logger } from '../../src/server/setup/logger.js';

describe('Logger', () => {
  test('formats log line with timestamp, step, level, action, message', () => {
    const logger = new Logger();
    const line = logger.format({
      level: 'info',
      step: 'deploy',
      action: 'sf-exec',
      message: 'sf project deploy start',
    });
    assert.match(line, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[deploy\]\s+INFO\s+sf-exec\s+sf project deploy start$/);
  });

  test('writes to file when runId is opened', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
    const logger = new Logger({ logsDir: tmpDir });
    const runId = 'test-run-1';
    logger.open(runId);
    logger.log(runId, { level: 'info', step: 'test', action: 'tick', message: 'hello' });
    await logger.close(runId);
    const content = fs.readFileSync(path.join(tmpDir, `setup-${runId}.log`), 'utf-8');
    assert.match(content, /INFO\s+tick\s+hello/);
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('broadcasts log events to SSE subscribers', () => {
    const logger = new Logger();
    const runId = 'test-run-2';
    logger.open(runId);
    const received = [];
    const unsubscribe = logger.subscribe(runId, (event) => received.push(event));
    logger.log(runId, { level: 'warn', step: 's', action: 'a', message: 'm' });
    unsubscribe();
    logger.log(runId, { level: 'info', step: 's', action: 'a', message: 'after unsub' });
    assert.equal(received.length, 1);
    assert.equal(received[0].level, 'warn');
  });

  test('deleteAll() removes all setup-*.log files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-del-'));
    fs.writeFileSync(path.join(tmpDir, 'setup-a.log'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'setup-b.log'), 'y');
    fs.writeFileSync(path.join(tmpDir, 'other.txt'), 'z');
    const logger = new Logger({ logsDir: tmpDir });
    const count = logger.deleteAll();
    assert.equal(count, 2);
    assert.ok(fs.existsSync(path.join(tmpDir, 'other.txt')));
    fs.rmSync(tmpDir, { recursive: true });
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npm test -- tests/setup/logger.test.js
```

Expected: FAIL(`Cannot find module`)。

- [ ] **Step 3: 最小実装**

`src/server/setup/logger.js`:

```js
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LOGS_DIR = 'logs';

export class Logger {
  constructor({ logsDir = DEFAULT_LOGS_DIR } = {}) {
    this.logsDir = logsDir;
    this.streams = new Map(); // runId -> WriteStream
    this.subscribers = new Map(); // runId -> Set<fn>
  }

  format({ level, step, action, message }) {
    const ts = new Date().toISOString();
    const lvl = String(level || 'info').toUpperCase().padEnd(5);
    const stepStr = `[${step || '-'}]`.padEnd(10);
    const actStr = String(action || '-').padEnd(12);
    return `${ts} ${stepStr} ${lvl} ${actStr} ${message}`;
  }

  open(runId) {
    if (this.streams.has(runId)) return;
    if (!fs.existsSync(this.logsDir)) fs.mkdirSync(this.logsDir, { recursive: true });
    const file = path.join(this.logsDir, `setup-${runId}.log`);
    const stream = fs.createWriteStream(file, { flags: 'a' });
    this.streams.set(runId, stream);
    this.subscribers.set(runId, new Set());
  }

  log(runId, event) {
    const line = this.format(event);
    const stream = this.streams.get(runId);
    if (stream) stream.write(line + '\n');
    const subs = this.subscribers.get(runId);
    if (subs) for (const fn of subs) fn({ ...event, line });
  }

  subscribe(runId, fn) {
    const subs = this.subscribers.get(runId);
    if (!subs) return () => {};
    subs.add(fn);
    return () => subs.delete(fn);
  }

  async close(runId) {
    const stream = this.streams.get(runId);
    if (stream) {
      await new Promise((resolve) => stream.end(resolve));
      this.streams.delete(runId);
    }
    this.subscribers.delete(runId);
  }

  deleteAll() {
    if (!fs.existsSync(this.logsDir)) return 0;
    const entries = fs.readdirSync(this.logsDir);
    let count = 0;
    for (const entry of entries) {
      if (entry.startsWith('setup-') && entry.endsWith('.log')) {
        fs.unlinkSync(path.join(this.logsDir, entry));
        count++;
      }
    }
    return count;
  }
}

export const defaultLogger = new Logger();
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- tests/setup/logger.test.js
```

Expected: PASS(4 tests)。

- [ ] **Step 5: Commit**

```bash
git add src/server/setup/logger.js tests/setup/logger.test.js
git commit -m "feat(setup): add Logger utility with SSE broadcast + file persistence"
```

---

### Task 6: hints.js (エラーパターン → ヒント)

**Files:**
- Create: `src/server/setup/hints.js`
- Create: `tests/setup/hints.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/setup/hints.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchHint } from '../../src/server/setup/hints.js';

describe('matchHint', () => {
  test('matches Partner Telephony license error', () => {
    const hint = matchHint('INVALID_TYPE: sObject type ConversationVendorInfo is not supported');
    assert.ok(hint);
    assert.match(hint, /Partner Telephony ライセンス/);
  });

  test('matches duplicate developer name', () => {
    const hint = matchHint('DUPLICATE_DEVELOPER_NAME: developer name is already in use');
    assert.match(hint, /同名.*Contact Center/);
  });

  test('matches missing permission set', () => {
    const hint = matchHint('Permission set "ContactCenterAdminExternalTelephony" does not exist');
    assert.match(hint, /Partner Telephony Permission Set/);
  });

  test('matches access denied', () => {
    const hint = matchHint('You do not have access to the requested resource');
    assert.match(hint, /権限不足/);
  });

  test('matches auth expired', () => {
    const hint = matchHint('No authorization information found for myorg');
    assert.match(hint, /認証切れ/);
  });

  test('returns null for unknown patterns', () => {
    assert.equal(matchHint('some random error'), null);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npm test -- tests/setup/hints.test.js
```

Expected: FAIL(モジュール未作成)。

- [ ] **Step 3: 最小実装**

`src/server/setup/hints.js`:

```js
const PATTERNS = [
  {
    regex: /INVALID_TYPE.*ConversationVendorInfo/,
    hint: 'Partner Telephony ライセンス未有効の可能性。Setup → Feature Settings → Service → Partner Telephony で有効化してください',
  },
  {
    regex: /DUPLICATE_DEVELOPER_NAME/,
    hint: '同名の Contact Center が既に存在します。ウィザードで [名前変更] または [上書き] を選択してください',
  },
  {
    regex: /Permission set .* does not exist/,
    hint: 'Partner Telephony Permission Set が未有効化です。Feature Settings を確認してください',
  },
  {
    regex: /You do not have access/i,
    hint: 'ログインユーザーに権限不足です。System Administrator プロファイルで再ログインしてください',
  },
  {
    regex: /No authorization information found/,
    hint: '認証切れです。`sf org login web --alias <alias>` で再ログインしてください',
  },
  {
    regex: /request to .* failed/,
    hint: 'Salesforce への接続失敗。ネットワークまたは `sf org display` で認証期限を確認してください',
  },
  {
    regex: /MalformedQueryException/,
    hint: '`sf` CLI バージョン不一致の可能性。`sf update` で更新してください',
  },
];

export function matchHint(text) {
  if (!text) return null;
  for (const { regex, hint } of PATTERNS) {
    if (regex.test(text)) return hint;
  }
  return null;
}

export const HINT_PATTERNS = PATTERNS;
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- tests/setup/hints.test.js
```

Expected: PASS(6 tests)。

- [ ] **Step 5: Commit**

```bash
git add src/server/setup/hints.js tests/setup/hints.test.js
git commit -m "feat(setup): add error hint matcher for sf CLI stderr"
```

---

### Task 7: metadataRenderer.js (テンプレートレンダリング)

**Files:**
- Create: `src/server/setup/metadataRenderer.js`
- Create: `tests/setup/metadataRenderer.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/setup/metadataRenderer.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { renderMetadata, escapeXml, encodePem } from '../../src/server/setup/metadataRenderer.js';

describe('escapeXml', () => {
  test('escapes &, <, >, ", \'', () => {
    assert.equal(escapeXml('a & b < c > d " e \' f'), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });

  test('leaves plain text unchanged', () => {
    assert.equal(escapeXml('hello-world_1'), 'hello-world_1');
  });
});

describe('encodePem', () => {
  test('converts newlines to &#10;', () => {
    const pem = '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----\n';
    const encoded = encodePem(pem);
    assert.ok(!encoded.includes('\n'));
    assert.match(encoded, /&#10;/);
  });
});

describe('renderMetadata', () => {
  const templatesDir = path.resolve('metadata/voxcanvas-contact-center');

  test('renders all files into a new tmp directory', () => {
    const result = renderMetadata({
      templatesDir,
      values: {
        SERVICE_ENDPOINT: 'https://abc.ngrok.io',
        CC_DEVELOPER_NAME: 'VoxCanvas_CC',
        CC_MASTER_LABEL: 'VoxCanvas CC',
        PUBLIC_KEY_PEM: '-----BEGIN PUBLIC KEY-----\nABC\n-----END PUBLIC KEY-----',
      },
    });

    const vendorFile = path.join(result.tmpDir, 'conversationVendorInfos', 'VoxCanvas.conversationVendorInfo-meta.xml');
    const ccFile = path.join(result.tmpDir, 'contactCenters', 'VoxCanvas_CC.contactCenter-meta.xml');
    const pkgFile = path.join(result.tmpDir, 'package.xml');

    assert.ok(fs.existsSync(vendorFile));
    assert.ok(fs.existsSync(ccFile));
    assert.ok(fs.existsSync(pkgFile));

    const vendor = fs.readFileSync(vendorFile, 'utf-8');
    assert.match(vendor, /https:\/\/abc\.ngrok\.io/);
    assert.ok(!vendor.includes('{{SERVICE_ENDPOINT}}'));

    const cc = fs.readFileSync(ccFile, 'utf-8');
    assert.match(cc, /<developerName>VoxCanvas_CC<\/developerName>/);
    assert.match(cc, /&#10;/);

    const pkg = fs.readFileSync(pkgFile, 'utf-8');
    assert.match(pkg, /<members>VoxCanvas_CC<\/members>/);

    result.cleanup();
    assert.ok(!fs.existsSync(result.tmpDir));
  });

  test('throws if a placeholder is left unfilled', () => {
    assert.throws(() =>
      renderMetadata({
        templatesDir,
        values: { SERVICE_ENDPOINT: 'https://abc.ngrok.io' }, // missing others
      }),
    /Unfilled placeholder/);
  });

  test('XML-escapes dangerous characters in values', () => {
    const result = renderMetadata({
      templatesDir,
      values: {
        SERVICE_ENDPOINT: 'https://a&b.com',
        CC_DEVELOPER_NAME: 'Safe_Name',
        CC_MASTER_LABEL: '<not-a-tag>',
        PUBLIC_KEY_PEM: 'KEY',
      },
    });
    const vendor = fs.readFileSync(path.join(result.tmpDir, 'conversationVendorInfos', 'VoxCanvas.conversationVendorInfo-meta.xml'), 'utf-8');
    const cc = fs.readFileSync(path.join(result.tmpDir, 'contactCenters', 'Safe_Name.contactCenter-meta.xml'), 'utf-8');
    assert.match(vendor, /https:\/\/a&amp;b\.com/);
    assert.match(cc, /&lt;not-a-tag&gt;/);
    result.cleanup();
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npm test -- tests/setup/metadataRenderer.test.js
```

Expected: FAIL(モジュール未作成)。

- [ ] **Step 3: 最小実装**

`src/server/setup/metadataRenderer.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function encodePem(pem) {
  return escapeXml(pem).replace(/\r?\n/g, '&#10;');
}

function substitute(text, values) {
  return text.replace(PLACEHOLDER, (_, key) => {
    if (!(key in values)) {
      throw new Error(`Unfilled placeholder: ${key}`);
    }
    return values[key];
  });
}

function copyAndRender(srcDir, dstDir, values) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const renderedName = entry.name.replace(/TEMPLATE/g, values.CC_DEVELOPER_NAME);
    const dstPath = path.join(dstDir, renderedName);
    if (entry.isDirectory()) {
      copyAndRender(srcPath, dstPath, values);
    } else if (entry.name.endsWith('.xml')) {
      const content = fs.readFileSync(srcPath, 'utf-8');
      fs.writeFileSync(dstPath, substitute(content, values));
    }
  }
}

export function renderMetadata({ templatesDir, values }) {
  const encodedValues = {};
  for (const [key, raw] of Object.entries(values)) {
    encodedValues[key] = key === 'PUBLIC_KEY_PEM' ? encodePem(raw) : escapeXml(raw);
  }
  const tmpDir = path.join(os.tmpdir(), `voxcanvas-meta-${randomUUID()}`);
  copyAndRender(templatesDir, tmpDir, encodedValues);
  return {
    tmpDir,
    cleanup() {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

export function cleanupAllTmpDirs() {
  const base = os.tmpdir();
  let count = 0;
  for (const entry of fs.readdirSync(base)) {
    if (entry.startsWith('voxcanvas-meta-')) {
      try {
        fs.rmSync(path.join(base, entry), { recursive: true, force: true });
        count++;
      } catch { /* ignore */ }
    }
  }
  return count;
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- tests/setup/metadataRenderer.test.js
```

Expected: PASS(5 tests)。

- [ ] **Step 5: Commit**

```bash
git add src/server/setup/metadataRenderer.js tests/setup/metadataRenderer.test.js
git commit -m "feat(setup): add metadata template renderer with XML escape"
```

---

### Task 8: sfRunner.js (sf CLI spawn)

**Files:**
- Create: `src/server/setup/sfRunner.js`
- Create: `tests/setup/sfRunner.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/setup/sfRunner.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../../src/server/setup/sfRunner.js';

describe('runCommand', () => {
  test('captures stdout of a successful command', async () => {
    const lines = [];
    const result = await runCommand({
      command: 'node',
      args: ['-e', 'console.log("hello"); console.log("world");'],
      onLine: (line, stream) => lines.push({ line, stream }),
    });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(lines.map((l) => l.line), ['hello', 'world']);
    assert.deepEqual(lines.map((l) => l.stream), ['stdout', 'stdout']);
  });

  test('captures stderr separately', async () => {
    const lines = [];
    await runCommand({
      command: 'node',
      args: ['-e', 'console.error("err-line")'],
      onLine: (line, stream) => lines.push({ line, stream }),
    });
    assert.deepEqual(lines, [{ line: 'err-line', stream: 'stderr' }]);
  });

  test('returns non-zero exitCode on failure', async () => {
    const result = await runCommand({
      command: 'node',
      args: ['-e', 'process.exit(7)'],
      onLine: () => {},
    });
    assert.equal(result.exitCode, 7);
  });

  test('uses shell: false — does not expand shell metachars', async () => {
    const lines = [];
    await runCommand({
      command: 'node',
      args: ['-e', 'console.log(process.argv[1])', '$HOME'],
      onLine: (line) => lines.push(line),
    });
    assert.equal(lines[0], '$HOME');
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
npm test -- tests/setup/sfRunner.test.js
```

Expected: FAIL。

- [ ] **Step 3: 最小実装**

`src/server/setup/sfRunner.js`:

```js
import { spawn } from 'node:child_process';

export function runCommand({ command, args = [], env, cwd, onLine, timeoutMs = 180_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      env: env ? { ...process.env, ...env } : process.env,
      cwd,
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    function flush(buf, stream) {
      const parts = buf.split(/\r?\n/);
      const tail = parts.pop();
      for (const line of parts) {
        if (line.length) onLine?.(line, stream);
      }
      return tail;
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuf = flush(stdoutBuf + chunk.toString('utf-8'), 'stdout');
    });
    child.stderr.on('data', (chunk) => {
      stderrBuf = flush(stderrBuf + chunk.toString('utf-8'), 'stderr');
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      if (stdoutBuf) onLine?.(stdoutBuf, 'stdout');
      if (stderrBuf) onLine?.(stderrBuf, 'stderr');
      resolve({ exitCode });
    });
  });
}

export async function runSfJson({ args, logger, runId, step }) {
  let jsonOutput = '';
  const { exitCode } = await runCommand({
    command: 'sf',
    args,
    onLine: (line, stream) => {
      if (stream === 'stdout') jsonOutput += line + '\n';
      logger?.log(runId, { level: stream === 'stderr' ? 'error' : 'info', step, action: 'sf-exec', message: line });
    },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(jsonOutput);
  } catch { /* not json */ }
  return { exitCode, json: parsed, raw: jsonOutput };
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- tests/setup/sfRunner.test.js
```

Expected: PASS(4 tests)。

- [ ] **Step 5: Commit**

```bash
git add src/server/setup/sfRunner.js tests/setup/sfRunner.test.js
git commit -m "feat(setup): add sfRunner wrapping child_process.spawn with line capture"
```

---

### Task 9: processRegistry.js (プロセス追跡)

**Files:**
- Create: `src/server/setup/processRegistry.js`
- Create: `tests/setup/processRegistry.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`tests/setup/processRegistry.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { ProcessRegistry } from '../../src/server/setup/processRegistry.js';

describe('ProcessRegistry', () => {
  test('registers a child process and lists it', () => {
    const reg = new ProcessRegistry();
    const child = spawn('node', ['-e', 'setTimeout(()=>{}, 5000)']);
    reg.register('test-proc', child, { label: 'test' });
    const items = reg.list();
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'test-proc');
    assert.equal(items[0].pid, child.pid);
    child.kill();
  });

  test('auto-removes on process exit', async () => {
    const reg = new ProcessRegistry();
    const child = spawn('node', ['-e', 'process.exit(0)']);
    reg.register('short', child);
    await new Promise((resolve) => child.on('exit', resolve));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(reg.list().length, 0);
  });

  test('stop() sends SIGTERM to named process', async () => {
    const reg = new ProcessRegistry();
    const child = spawn('node', ['-e', 'setTimeout(()=>{}, 10000)']);
    reg.register('kill-me', child);
    await reg.stop('kill-me');
    await new Promise((resolve) => child.on('exit', resolve));
    assert.equal(child.killed, true);
  });

  test('stopAll() stops everything registered', async () => {
    const reg = new ProcessRegistry();
    const c1 = spawn('node', ['-e', 'setTimeout(()=>{}, 10000)']);
    const c2 = spawn('node', ['-e', 'setTimeout(()=>{}, 10000)']);
    reg.register('a', c1);
    reg.register('b', c2);
    await reg.stopAll();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(reg.list().length, 0);
  });
});
```

- [ ] **Step 2: 実行して失敗を確認**

```bash
npm test -- tests/setup/processRegistry.test.js
```

Expected: FAIL。

- [ ] **Step 3: 最小実装**

`src/server/setup/processRegistry.js`:

```js
export class ProcessRegistry {
  constructor() {
    this.entries = new Map();
  }

  register(name, child, { label } = {}) {
    this.entries.set(name, {
      name,
      pid: child.pid,
      child,
      label: label || name,
      startedAt: new Date().toISOString(),
    });
    child.once('exit', () => {
      this.entries.delete(name);
    });
  }

  list() {
    return [...this.entries.values()].map(({ child, ...rest }) => rest);
  }

  async stop(name, { timeoutMs = 3000 } = {}) {
    const entry = this.entries.get(name);
    if (!entry) return false;
    entry.child.kill('SIGTERM');
    const exited = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs);
      entry.child.once('exit', () => {
        clearTimeout(t);
        resolve(true);
      });
    });
    if (!exited) entry.child.kill('SIGKILL');
    this.entries.delete(name);
    return true;
  }

  async stopAll() {
    const names = [...this.entries.keys()];
    await Promise.all(names.map((n) => this.stop(n)));
  }
}

export const defaultRegistry = new ProcessRegistry();
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- tests/setup/processRegistry.test.js
```

Expected: PASS(4 tests)。

- [ ] **Step 5: Commit**

```bash
git add src/server/setup/processRegistry.js tests/setup/processRegistry.test.js
git commit -m "feat(setup): add ProcessRegistry for wizard-spawned subprocesses"
```

---

### Task 10: ngrokRunner.js (ngrok起動 + URL取得)

**Files:**
- Create: `src/server/setup/ngrokRunner.js`

Note: 実ngrokに依存するユニットテストは不安定なため、このタスクはテストなしで書き、ルート統合テストで間接的に検証する。

- [ ] **Step 1: 実装を書く**

`src/server/setup/ngrokRunner.js`:

```js
import { spawn } from 'node:child_process';
import http from 'node:http';

const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';

function fetchTunnels(timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get(NGROK_API, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('ngrok API timeout')));
  });
}

export async function startNgrok({ port = 3030, registry, logger, runId } = {}) {
  const child = spawn('ngrok', ['http', String(port), '--log=stdout'], {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (c) => logger?.log(runId, { level: 'info', step: 'ngrok', action: 'ngrok', message: c.toString().trim() }));
  child.stderr.on('data', (c) => logger?.log(runId, { level: 'error', step: 'ngrok', action: 'ngrok', message: c.toString().trim() }));

  registry?.register('ngrok', child, { label: `ngrok http ${port}` });

  // Poll for tunnel URL, up to ~10s
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const data = await fetchTunnels();
      const tunnel = data?.tunnels?.find((t) => t.proto === 'https');
      if (tunnel?.public_url) {
        return { url: tunnel.public_url, pid: child.pid };
      }
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }

  child.kill('SIGTERM');
  throw new Error('ngrok tunnel did not become ready within 10s');
}

export async function stopNgrok({ registry } = {}) {
  return registry?.stop('ngrok');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/setup/ngrokRunner.js
git commit -m "feat(setup): add ngrok runner with tunnel URL polling"
```

---

## Phase 4: Backend API

### Task 11: router のリファクタ準備(共有状態導入)

**Files:**
- Modify: `src/server/routes/setup.js`
- Create: `tests/setup/routes.test.js`(以降のタスクで拡張)

- [ ] **Step 1: routes.test.js に status のスモークテストを追加**

`tests/setup/routes.test.js`:

```js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createSetupRouter } from '../../src/server/routes/setup.js';

function makeApp() {
  const app = express();
  app.use(express.json());
  const dummyClient = { configure: () => {} };
  app.use('/api', createSetupRouter(dummyClient));
  return app;
}

describe('GET /api/setup/status', () => {
  test('returns expected fields', async () => {
    const res = await request(makeApp()).get('/api/setup/status');
    assert.equal(res.status, 200);
    assert.ok('hasEnv' in res.body);
    assert.ok('hasCerts' in res.body);
    assert.ok('sfCliVersion' in res.body);
    assert.ok('ngrokVersion' in res.body);
    assert.ok('opensslAvailable' in res.body);
  });
});

describe('localhostOnly', () => {
  test('rejects non-loopback IPs', async () => {
    const app = makeApp();
    app.set('trust proxy', true);
    const res = await request(app)
      .get('/api/setup/status')
      .set('X-Forwarded-For', '10.0.0.1');
    assert.equal(res.status, 403);
  });
});
```

- [ ] **Step 2: 現状は `ngrokVersion` 未実装なのでテストは FAIL する。実装を進める**

`src/server/routes/setup.js` の `/setup/status` に `ngrokVersion` 追加 + router-scoped state を導入。以下を差し替え/追加:

```js
import { Router } from 'express';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../setup/logger.js';
import { ProcessRegistry } from '../setup/processRegistry.js';
```

既存の `createSetupRouter` 内に以下を追加(関数冒頭):

```js
  const logger = new Logger();
  const registry = new ProcessRegistry();
  const routerState = {
    selectedOrgAlias: null,
    selectedOrgUsername: null,
    lastRunIds: {},
  };
```

`/setup/status` ハンドラ内に ngrok 検出を追加:

```js
    let ngrokVersion = null;
    try {
      ngrokVersion = execSync('ngrok version', { encoding: 'utf-8' }).trim();
    } catch { /* not installed */ }
```

`res.json` に `ngrokVersion` を含める。

- [ ] **Step 3: テスト実行**

```bash
npm test -- tests/setup/routes.test.js
```

Expected: 2 tests pass。

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/setup.js tests/setup/routes.test.js
git commit -m "refactor(setup): add Logger/Registry state to router, add ngrok version to status"
```

---

### Task 12: /setup/org エンドポイント群(org 情報取得)

**Files:**
- Modify: `src/server/routes/setup.js`

- [ ] **Step 1: 実装**

`createSetupRouter` 内に以下エンドポイントを追加:

```js
  router.get('/setup/org', (req, res) => {
    try {
      const defaultOrg = execSync('sf config get target-org --json', { encoding: 'utf-8' });
      const parsed = JSON.parse(defaultOrg);
      const alias = parsed?.result?.[0]?.value || null;
      if (!alias) {
        return res.json({ hasDefault: false });
      }
      const display = JSON.parse(execSync(`sf org display --target-org ${alias} --json`, { encoding: 'utf-8' }));
      const r = display?.result || {};
      const myDomainUrl = r.instanceUrl || '';
      const scrtBaseUrl = myDomainUrl.replace('.my.salesforce.com', '.my.salesforce-scrt.com');
      res.json({
        hasDefault: true,
        alias,
        username: r.username,
        orgId: r.id,
        instanceUrl: r.instanceUrl,
        myDomainUrl,
        scrtBaseUrl,
      });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SF_ORG_FAILED', message: err.message });
    }
  });

  router.get('/setup/org/list', (req, res) => {
    try {
      const out = JSON.parse(execSync('sf org list --json', { encoding: 'utf-8' }));
      const all = [...(out?.result?.nonScratchOrgs || []), ...(out?.result?.scratchOrgs || [])];
      const orgs = all.map((o) => ({
        alias: o.alias,
        username: o.username,
        instanceUrl: o.instanceUrl,
        isDefault: !!o.isDefaultUsername || !!o.isDefaultDevHubUsername,
      }));
      res.json({ orgs });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SF_LIST_FAILED', message: err.message });
    }
  });

  router.post('/setup/org/select', async (req, res) => {
    const { alias } = req.body || {};
    if (!alias || !/^[A-Za-z0-9._-]+$/.test(alias)) {
      return res.status(400).json({ error: true, code: 'INVALID_ALIAS', message: 'alias required (alnum/._-)' });
    }
    try {
      const display = JSON.parse(execSync(`sf org display --target-org ${alias} --json`, { encoding: 'utf-8' }));
      const r = display?.result || {};
      routerState.selectedOrgAlias = alias;
      routerState.selectedOrgUsername = r.username;
      const myDomainUrl = r.instanceUrl || '';
      const scrtBaseUrl = myDomainUrl.replace('.my.salesforce.com', '.my.salesforce-scrt.com');
      res.json({ alias, username: r.username, orgId: r.id, instanceUrl: r.instanceUrl, myDomainUrl, scrtBaseUrl });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SF_DISPLAY_FAILED', message: err.message });
    }
  });
```

- [ ] **Step 2: テストを追加**

`tests/setup/routes.test.js` に追記:

```js
describe('POST /api/setup/org/select', () => {
  test('rejects invalid alias', async () => {
    const res = await request(makeApp())
      .post('/api/setup/org/select')
      .send({ alias: 'bad; rm -rf /' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_ALIAS');
  });
});
```

(`sf` 実呼び出しが絡むため happy path は手動検証。)

- [ ] **Step 3: テスト実行**

```bash
npm test
```

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/setup.js tests/setup/routes.test.js
git commit -m "feat(setup): add /setup/org, /setup/org/list, /setup/org/select endpoints"
```

---

### Task 13: /setup/org/login エンドポイント(SSE)

**Files:**
- Modify: `src/server/routes/setup.js`

- [ ] **Step 1: SSE ヘルパーを routes ファイル上部に追加**

```js
function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  return send;
}
```

- [ ] **Step 2: `/setup/org/login` を追加**

```js
  router.post('/setup/org/login', async (req, res) => {
    const { alias } = req.body || {};
    if (!alias || !/^[A-Za-z0-9._-]+$/.test(alias)) {
      return res.status(400).json({ error: true, code: 'INVALID_ALIAS', message: 'alias required (alnum/._-)' });
    }
    const { randomUUID } = await import('node:crypto');
    const runId = randomUUID();
    logger.open(runId);
    routerState.lastRunIds.orgLogin = runId;
    const send = openSse(res);
    const unsubscribe = logger.subscribe(runId, (ev) => send('log', ev));
    send('log', { ts: new Date().toISOString(), level: 'info', step: 'org-login', action: 'prepare', message: `Launching sf org login web --alias ${alias}` });
    try {
      const { runCommand } = await import('../setup/sfRunner.js');
      const { exitCode } = await runCommand({
        command: 'sf',
        args: ['org', 'login', 'web', '--alias', alias],
        onLine: (line, stream) => logger.log(runId, { level: stream === 'stderr' ? 'error' : 'info', step: 'org-login', action: 'sf-exec', message: line }),
      });
      send('done', { success: exitCode === 0, runId, exitCode });
    } catch (err) {
      send('done', { success: false, runId, message: err.message });
    } finally {
      unsubscribe();
      await logger.close(runId);
      res.end();
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/setup.js
git commit -m "feat(setup): add /setup/org/login SSE endpoint for sf CLI web login"
```

---

### Task 14: /setup/cc/check + /setup/cc/deploy

**Files:**
- Modify: `src/server/routes/setup.js`

- [ ] **Step 1: cc/check エンドポイント**

```js
  router.get('/setup/cc/check', (req, res) => {
    const name = String(req.query.name || '');
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      return res.status(400).json({ error: true, code: 'INVALID_NAME', message: 'name must be alphanumeric + _' });
    }
    if (!routerState.selectedOrgAlias) {
      return res.status(400).json({ error: true, code: 'NO_ORG_SELECTED', message: 'select an org first' });
    }
    try {
      const out = JSON.parse(execSync(
        `sf data query -q "SELECT Id, DeveloperName FROM ContactCenter WHERE DeveloperName = '${name}'" --target-org ${routerState.selectedOrgAlias} --json`,
        { encoding: 'utf-8' },
      ));
      const records = out?.result?.records || [];
      res.json({ exists: records.length > 0, id: records[0]?.Id || null });
    } catch (err) {
      res.status(500).json({ error: true, code: 'SF_QUERY_FAILED', message: err.message });
    }
  });
```

- [ ] **Step 2: cc/deploy エンドポイント**

```js
  router.post('/setup/cc/deploy', async (req, res) => {
    const { serviceEndpoint, developerName, masterLabel } = req.body || {};
    if (!serviceEndpoint || !developerName || !masterLabel) {
      return res.status(400).json({ error: true, code: 'MISSING_FIELDS', message: 'serviceEndpoint, developerName, masterLabel required' });
    }
    if (!/^https:\/\/[A-Za-z0-9.\-/_:]+$/.test(serviceEndpoint)) {
      return res.status(400).json({ error: true, code: 'INVALID_ENDPOINT', message: 'serviceEndpoint must be https URL' });
    }
    if (!/^[A-Za-z0-9_]+$/.test(developerName)) {
      return res.status(400).json({ error: true, code: 'INVALID_NAME', message: 'developerName must be alphanumeric + _' });
    }
    if (!routerState.selectedOrgAlias) {
      return res.status(400).json({ error: true, code: 'NO_ORG_SELECTED', message: 'select an org first' });
    }
    const jwtPem = 'certs/jwt.pem';
    if (!fs.existsSync(jwtPem)) {
      return res.status(400).json({ error: true, code: 'NO_CERT', message: 'run certificate step first' });
    }

    const { randomUUID } = await import('node:crypto');
    const { renderMetadata } = await import('../setup/metadataRenderer.js');
    const { runCommand } = await import('../setup/sfRunner.js');
    const { matchHint } = await import('../setup/hints.js');

    const runId = randomUUID();
    logger.open(runId);
    routerState.lastRunIds.ccDeploy = runId;
    const send = openSse(res);
    const unsubscribe = logger.subscribe(runId, (ev) => send('log', ev));

    let rendered = null;
    try {
      const pem = fs.readFileSync(jwtPem, 'utf-8');
      logger.log(runId, { level: 'info', step: 'deploy', action: 'prepare', message: `Rendering metadata (endpoint=${serviceEndpoint}, cc=${developerName})` });
      rendered = renderMetadata({
        templatesDir: path.resolve('metadata/voxcanvas-contact-center'),
        values: {
          SERVICE_ENDPOINT: serviceEndpoint,
          CC_DEVELOPER_NAME: developerName,
          CC_MASTER_LABEL: masterLabel,
          PUBLIC_KEY_PEM: pem,
        },
      });
      logger.log(runId, { level: 'info', step: 'deploy', action: 'sf-exec', message: `sf project deploy start --source-dir ${rendered.tmpDir} --target-org ${routerState.selectedOrgAlias}` });
      const { exitCode } = await runCommand({
        command: 'sf',
        args: ['project', 'deploy', 'start', '--source-dir', rendered.tmpDir, '--target-org', routerState.selectedOrgAlias, '--json'],
        onLine: (line, stream) => {
          logger.log(runId, { level: stream === 'stderr' ? 'error' : 'info', step: 'deploy', action: 'sf-exec', message: line });
          const hint = matchHint(line);
          if (hint) logger.log(runId, { level: 'hint', step: 'deploy', action: 'hint', message: hint });
        },
      });
      send('done', { success: exitCode === 0, runId, exitCode, callCenterApiName: developerName });
    } catch (err) {
      logger.log(runId, { level: 'error', step: 'deploy', action: 'sf-exec', message: err.message });
      const hint = matchHint(err.message);
      if (hint) logger.log(runId, { level: 'hint', step: 'deploy', action: 'hint', message: hint });
      send('done', { success: false, runId, message: err.message });
    } finally {
      rendered?.cleanup();
      unsubscribe();
      await logger.close(runId);
      res.end();
    }
  });
```

- [ ] **Step 3: テスト(バリデーション系のみ)**

`tests/setup/routes.test.js` に追記:

```js
describe('POST /api/setup/cc/deploy validation', () => {
  test('rejects non-https endpoint', async () => {
    const res = await request(makeApp())
      .post('/api/setup/cc/deploy')
      .send({ serviceEndpoint: 'http://insecure.example', developerName: 'Good', masterLabel: 'Good' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_ENDPOINT');
  });

  test('rejects bad developerName', async () => {
    const res = await request(makeApp())
      .post('/api/setup/cc/deploy')
      .send({ serviceEndpoint: 'https://a.b', developerName: 'bad name', masterLabel: 'L' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_NAME');
  });
});
```

- [ ] **Step 4: テスト実行**

```bash
npm test
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/setup.js tests/setup/routes.test.js
git commit -m "feat(setup): add /setup/cc/check and /setup/cc/deploy (SSE)"
```

---

### Task 15: /setup/permset/assign

**Files:**
- Modify: `src/server/routes/setup.js`

- [ ] **Step 1: 実装**

```js
  router.post('/setup/permset/assign', async (req, res) => {
    const { permsetNames, targetUser } = req.body || {};
    if (!Array.isArray(permsetNames) || permsetNames.length === 0) {
      return res.status(400).json({ error: true, code: 'MISSING_PERMSETS', message: 'permsetNames array required' });
    }
    for (const n of permsetNames) {
      if (!/^[A-Za-z0-9_]+$/.test(n)) {
        return res.status(400).json({ error: true, code: 'INVALID_PERMSET', message: `bad permset: ${n}` });
      }
    }
    if (targetUser && !/^[A-Za-z0-9._@+-]+$/.test(targetUser)) {
      return res.status(400).json({ error: true, code: 'INVALID_USER', message: 'bad targetUser format' });
    }
    if (!routerState.selectedOrgAlias) {
      return res.status(400).json({ error: true, code: 'NO_ORG_SELECTED', message: 'select an org first' });
    }

    const { randomUUID } = await import('node:crypto');
    const { runCommand } = await import('../setup/sfRunner.js');
    const { matchHint } = await import('../setup/hints.js');

    const runId = randomUUID();
    logger.open(runId);
    routerState.lastRunIds.permset = runId;
    const send = openSse(res);
    const unsubscribe = logger.subscribe(runId, (ev) => send('log', ev));

    const results = [];
    try {
      for (const name of permsetNames) {
        const args = ['org', 'assign', 'permset', '--name', name, '--target-org', routerState.selectedOrgAlias];
        if (targetUser) args.push('--on-behalf-of', targetUser);
        logger.log(runId, { level: 'info', step: 'permset', action: 'sf-exec', message: `sf ${args.join(' ')}` });
        const { exitCode } = await runCommand({
          command: 'sf',
          args,
          onLine: (line, stream) => {
            logger.log(runId, { level: stream === 'stderr' ? 'error' : 'info', step: 'permset', action: 'sf-exec', message: line });
            const hint = matchHint(line);
            if (hint) logger.log(runId, { level: 'hint', step: 'permset', action: 'hint', message: hint });
          },
        });
        results.push({ name, exitCode });
      }
      const allOk = results.every((r) => r.exitCode === 0);
      send('done', { success: allOk, runId, results });
    } catch (err) {
      send('done', { success: false, runId, message: err.message });
    } finally {
      unsubscribe();
      await logger.close(runId);
      res.end();
    }
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/routes/setup.js
git commit -m "feat(setup): add /setup/permset/assign (SSE)"
```

---

### Task 16: /setup/ngrok/* エンドポイント

**Files:**
- Modify: `src/server/routes/setup.js`

- [ ] **Step 1: 実装**

```js
  router.post('/setup/ngrok/start', async (req, res) => {
    const { port = 3030 } = req.body || {};
    if (typeof port !== 'number' || port < 1 || port > 65535) {
      return res.status(400).json({ error: true, code: 'INVALID_PORT', message: 'port must be 1-65535' });
    }
    const { randomUUID } = await import('node:crypto');
    const { startNgrok } = await import('../setup/ngrokRunner.js');
    const runId = randomUUID();
    logger.open(runId);
    try {
      const { url, pid } = await startNgrok({ port, registry, logger, runId });
      res.json({ url, pid, runId });
    } catch (err) {
      res.status(500).json({ error: true, code: 'NGROK_FAILED', message: err.message, runId });
    } finally {
      await logger.close(runId);
    }
  });

  router.post('/setup/ngrok/stop', async (req, res) => {
    await registry.stop('ngrok');
    res.json({ stopped: true });
  });

  router.get('/setup/processes', (req, res) => {
    res.json({ processes: registry.list() });
  });

  router.post('/setup/processes/stop-all', async (req, res) => {
    await registry.stopAll();
    res.json({ stopped: true });
  });

  router.get('/setup/logs/:runId', (req, res) => {
    const { runId } = req.params;
    if (!/^[A-Za-z0-9-]+$/.test(runId)) {
      return res.status(400).json({ error: true, code: 'INVALID_RUN_ID' });
    }
    const file = `logs/setup-${runId}.log`;
    if (!fs.existsSync(file)) {
      return res.status(404).json({ error: true, code: 'NOT_FOUND' });
    }
    res.type('text/plain').send(fs.readFileSync(file, 'utf-8'));
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/server/routes/setup.js
git commit -m "feat(setup): add ngrok + processes + logs endpoints"
```

---

### Task 17: /setup/complete のクリーンアップ対応

**Files:**
- Modify: `src/server/routes/setup.js`

- [ ] **Step 1: 既存 `/setup/complete` を拡張**

既存ハンドラの `res.json({ success: true, message: 'Configuration saved.' });` の前に以下を挿入:

```js
      const { cleanupAllTmpDirs } = await import('../setup/metadataRenderer.js');
      const cleanup = req.body?.cleanup || {};
      const cleanupResult = { logsDeleted: 0, tmpDirsDeleted: 0, processesStopped: [] };
      if (cleanup.deleteLogs) {
        cleanupResult.logsDeleted = logger.deleteAll();
      }
      if (cleanup.deleteTmp) {
        cleanupResult.tmpDirsDeleted = cleanupAllTmpDirs();
      }
      if (Array.isArray(cleanup.stopProcesses)) {
        for (const name of cleanup.stopProcesses) {
          if (await registry.stop(name)) cleanupResult.processesStopped.push(name);
        }
      }
```

`res.json` を以下に差し替え:

```js
      res.json({ success: true, message: 'Configuration saved.', cleanup: cleanupResult });
```

また function を `async` に変更(`import` を使うため)。

- [ ] **Step 2: Commit**

```bash
git add src/server/routes/setup.js
git commit -m "feat(setup): extend /setup/complete with cleanup (logs/tmp/processes)"
```

---

### Task 18: サーバー停止時の cleanup hook

**Files:**
- Modify: `src/server/index.js`

- [ ] **Step 1: 既存 `createSetupRouter(scrt2Client)` の返り値から registry を取り出せるように変更**

`src/server/routes/setup.js` の末尾を以下に変更:

```js
  return { router, logger, registry };
}
```

呼び出し側(`src/server/index.js`)で以下のように使う:

```js
import { createSetupRouter } from './routes/setup.js';
// ...
const { router: setupRouter, registry: setupRegistry } = createSetupRouter(scrt2Client);
app.use('/api', setupRouter);

function shutdown() {
  console.log('Shutting down, stopping wizard-spawned processes...');
  setupRegistry.stopAll().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 2: 他の `createSetupRouter` 呼び出し箇所(テスト含む)を更新**

`tests/setup/routes.test.js` の `makeApp`:

```js
function makeApp() {
  const app = express();
  app.use(express.json());
  const dummyClient = { configure: () => {} };
  const { router } = createSetupRouter(dummyClient);
  app.use('/api', router);
  return app;
}
```

- [ ] **Step 3: テスト実行**

```bash
npm test
```

Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/setup.js src/server/index.js tests/setup/routes.test.js
git commit -m "feat(setup): register SIGTERM/SIGINT cleanup for wizard processes"
```

---

## Phase 5: フロントエンド

### Task 19: ステップ配列を 7 ステップに再構成

**Files:**
- Modify: `src/client/js/setup-app.js`

- [ ] **Step 1: STEPS 配列を置き換え**

先頭の `STEPS` を:

```js
const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'certificate', label: 'Certificate' },
  { id: 'org-auth', label: 'Org' },
  { id: 'contact-center', label: 'Contact Center' },
  { id: 'permset', label: 'Permissions' },
  { id: 'test', label: 'Connect' },
  { id: 'complete', label: 'Verify' },
];
```

- [ ] **Step 2: `case 'org-auth':`, `case 'permset':` の空スタブを `switch` に追加(次タスクで実装)**

```js
    case 'org-auth':
      container.innerHTML = `<div class="text-sm">Org auth step — to be implemented</div>
        <div class="flex justify-between mt-4">
          <button onclick="prevStep()" class="text-sm opacity-50">&larr; Back</button>
          <button onclick="nextStep()" class="bg-sf-blue/40 px-6 py-2 rounded-md text-sm">Next &rarr;</button>
        </div>`;
      break;

    case 'permset':
      container.innerHTML = `<div class="text-sm">Permset step — to be implemented</div>
        <div class="flex justify-between mt-4">
          <button onclick="prevStep()" class="text-sm opacity-50">&larr; Back</button>
          <button onclick="nextStep()" class="bg-sf-blue/40 px-6 py-2 rounded-md text-sm">Next &rarr;</button>
        </div>`;
      break;
```

- [ ] **Step 3: 動作確認**

```bash
npm run dev
```

ブラウザで `http://127.0.0.1:5173/setup.html` を開き、7 ステップ全てが表示され、Next/Back で遷移することを目視確認。

- [ ] **Step 4: Commit**

```bash
git add src/client/js/setup-app.js
git commit -m "refactor(setup-ui): restructure wizard into 7 steps (org-auth + permset stubs)"
```

---

### Task 20: ログパネルコンポーネント(再利用部品)

**Files:**
- Modify: `src/client/js/setup-app.js`

- [ ] **Step 1: SSE ユーティリティを追加**

`setup-app.js` の末尾に追加:

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/client/js/setup-app.js
git commit -m "feat(setup-ui): add reusable log panel + SSE streaming helper"
```

---

### Task 21: Step 3 (org-auth) UI 実装

**Files:**
- Modify: `src/client/js/setup-app.js`

- [ ] **Step 1: `case 'org-auth':` を本実装に置き換え**

```js
    case 'org-auth':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Select Salesforce Org</h2>
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
        const r = await fetch('/api/setup/org').then((x) => x.json());
        if (r.hasDefault) {
          info.innerHTML = `<div>Default alias: <b>${r.alias}</b></div><div class="opacity-60 text-xs">${r.username} — ${r.orgId}</div><div class="opacity-60 text-xs mt-1">SCRT: ${r.scrtBaseUrl}</div>`;
          useBtn.classList.remove('hidden');
          useBtn.addEventListener('click', async () => {
            await selectOrg(r.alias);
          });
        } else {
          info.textContent = 'No default org. Pick or log in below.';
        }
        const list = await fetch('/api/setup/org/list').then((x) => x.json());
        const listEl = document.getElementById('org-list');
        listEl.innerHTML = (list.orgs || []).map((o) => `
          <button data-alias="${o.alias || o.username}" class="block w-full text-left hover:bg-white/10 px-2 py-1 rounded">
            ${o.alias || '(no alias)'} — <span class="opacity-60">${o.username}</span>
          </button>
        `).join('');
        listEl.querySelectorAll('button[data-alias]').forEach((b) => {
          b.addEventListener('click', () => selectOrg(b.dataset.alias));
        });
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
```

- [ ] **Step 2: 動作確認**

`npm run dev`、ブラウザ `setup.html` の Step 3 で既定 Org が表示され、[Use default org] を押すと選択・Next が活性化することを目視確認(要: `sf` 認証済み Org が手元に存在すること)。

- [ ] **Step 3: Commit**

```bash
git add src/client/js/setup-app.js
git commit -m "feat(setup-ui): implement org-auth step (pick default / list / login)"
```

---

### Task 22: Step 4 (contact-center) を deploy 実行型に改修

**Files:**
- Modify: `src/client/js/setup-app.js`

- [ ] **Step 1: 既存 `case 'contact-center':` ブロックを全面書き換え**

```js
    case 'contact-center':
      container.innerHTML = `
        <h2 class="text-lg font-bold mb-4">Contact Center Configuration</h2>
        <div class="text-sm opacity-60 mb-4 leading-relaxed">
          ウィザードが <code>ConversationVendorInfo</code> と <code>ContactCenter</code> を Metadata API で deploy します。
          Public Key(jwt.pem)は Contact Center レコードに自動登録されます。
        </div>

        <div class="space-y-3 mb-4">
          <div>
            <label class="text-xs opacity-60 block mb-1">Service Endpoint URL (ngrok 等)</label>
            <div class="flex gap-2">
              <input id="svc-endpoint" class="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-sm font-mono" placeholder="https://xxxx.ngrok.io" />
              <button id="btn-ngrok" class="bg-sf-blue/30 hover:bg-sf-blue/50 px-3 rounded text-xs">Launch ngrok</button>
            </div>
            <div id="ngrok-status" class="text-xs opacity-60 mt-1"></div>
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

        <button id="btn-deploy" class="w-full bg-sf-blue/50 hover:bg-sf-blue/70 px-4 py-2 rounded font-semibold text-sm">Deploy</button>
        <div id="deploy-log"></div>

        <div class="flex justify-between mt-6">
          <button onclick="prevStep()" class="opacity-50 hover:opacity-100 text-sm">&larr; Back</button>
          <button id="btn-cc-next" onclick="nextStep()" class="bg-sf-blue/40 hover:bg-sf-blue/60 px-6 py-2 rounded-md text-sm font-semibold opacity-30 pointer-events-none">Next &rarr;</button>
        </div>
      `;

      document.getElementById('btn-ngrok').addEventListener('click', async () => {
        const status = document.getElementById('ngrok-status');
        status.textContent = 'Starting ngrok...';
        const r = await fetch('/api/setup/ngrok/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port: 3030 }),
        }).then((x) => x.json());
        if (r.error) {
          status.textContent = `Error: ${r.message}`;
          return;
        }
        document.getElementById('svc-endpoint').value = r.url;
        state.ngrokStarted = true;
        status.textContent = `Tunnel: ${r.url} (pid ${r.pid})`;
      });

      document.getElementById('btn-deploy').addEventListener('click', async () => {
        const serviceEndpoint = document.getElementById('svc-endpoint').value.trim();
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
```

- [ ] **Step 2: 動作確認**

`npm run dev` でブラウザ確認。ngrok 未インストールでも [Launch ngrok] ボタンが押せる(エラーになる)ことだけは確認。deploy の happy path は実 Org が要るため手動。

- [ ] **Step 3: Commit**

```bash
git add src/client/js/setup-app.js
git commit -m "feat(setup-ui): implement contact-center deploy step with ngrok + SSE log"
```

---

### Task 23: Step 5 (permset) UI 実装

**Files:**
- Modify: `src/client/js/setup-app.js`

- [ ] **Step 1: `case 'permset':` を本実装に置き換え**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/client/js/setup-app.js
git commit -m "feat(setup-ui): implement permset assignment step"
```

---

### Task 24: Step 7 (complete) UI を cleanup セクション付きに改修

**Files:**
- Modify: `src/client/js/setup-app.js`

- [ ] **Step 1: 既存 `case 'complete':`(または `case 'done':`)を書き換え**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/client/js/setup-app.js
git commit -m "feat(setup-ui): implement complete step with cleanup section"
```

---

## Phase 6: ドキュメント

### Task 25: README をウィザード中心に書き換え

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Setup セクションを簡略化**

README の `## Setup` 全体を以下に差し替え:

````markdown
## Setup

Setup Wizard が `sf` CLI を呼び出して Contact Center 作成・Permission Set 割り当て・.env 書き出しまで完結させます。

### 前提

- `sf` CLI v2.x 以降(`sf --version` で確認)
- `ngrok` v3.x(optional、Salesforce から VoxCanvas に到達させる tunnel 用。`ngrok config add-authtoken <token>` 済みであること)
- 対象 Salesforce Org:
  - Service Cloud Voice for Partner Telephony ライセンス有効
  - ログインユーザーが System Administrator 相当

### 手順

```bash
npm install
npm run dev
```

ブラウザで `http://127.0.0.1:5173/setup.html` を開き、ウィザードに従って以下を実行:

1. **Welcome** — 環境チェック(node / sf / openssl / ngrok)
2. **Certificate** — HTTPS + JWT 証明書を生成
3. **Org** — `sf` 既定 Org を使用 or 別の alias を選択 or 新規ログイン
4. **Contact Center** — ngrok 起動 + Contact Center 名を入力 → Deploy
5. **Permissions** — Admin + Agent permset を割り当て
6. **Connect** — SCRT2 疎通テスト
7. **Verify** — 設定サマリ確認 + cleanup 実行 + `.env` 保存

### 完了後

```bash
npm start   # 本番モード(HTTPS、port 3030)
```

### 手動実行が必要な項目(自動化対象外)

- Service Console に Omni-Channel Utility を追加
- Presence Status "Available for Phone" を作成
- Voice Call レコードページに Enhanced Conversation を配置

これらは Lightning App Builder で実施してください。
````

- [ ] **Step 2: "Important Notes" は既存のままで OK、変更不要**

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite Setup section around the Setup Wizard"
```

---

### Task 26: 最終回帰確認

**Files:** なし(確認のみ)

- [ ] **Step 1: 全テスト実行**

```bash
npm test
```

Expected: 全 PASS。

- [ ] **Step 2: Dev サーバーで UI 目視確認**

```bash
npm run dev
```

`http://127.0.0.1:5173/setup.html` を開き:
- 7 ステップのインジケータが出る
- Step 3 で `sf org display` が呼ばれ結果が表示される
- Step 4 の [Launch ngrok] ボタンが反応する(ngrok 未インストールならエラー表示)
- Step 4 の [Deploy] で SSE ログパネルが開く(要 `sf` 認証 + 対象 Org)
- Step 7 で cleanup セクションが表示され、[Save & Finish] で `.env` が更新される

エラーがあれば該当タスクに戻って修正。

- [ ] **Step 3: Commit(変更なしなら不要)**

---

## Self-Review Checklist

### Spec coverage

| Spec 節 | 対応タスク |
|---|---|
| §3 Step 1 welcome | 既存、Task 11 で ngrokVersion 追加 |
| §3 Step 2 certificate | 既存(変更なし) |
| §3 Step 3 org-auth | Task 12, 13, 21 |
| §3 Step 4 contact-center | Task 14, 22(deploy)、Task 16(ngrok) |
| §3 Step 5 permset | Task 15, 23 |
| §3 Step 6 test | 既存(変更なし) |
| §3 Step 7 complete | Task 17, 24 |
| §4 Architecture | Task 5-10(backend setup/) |
| §5 API 一覧 | Task 11-17 |
| §6 メタデータテンプレート | Task 3, 4, 7 |
| §7 ログ設計 | Task 5, 20(UIパネル) |
| §8 クリーンアップ | Task 17, 18, 24 |
| §9 依存関係 | Task 1 |
| §10 テスト観点 | Task 5-9(unit)、Task 11, 14(route)、Task 26(手動) |
| §11 環境要件 | Task 25(README) |
| §12 ファイル変更 | Task 1-26 全体 |

すべて対応。

### Type consistency

- `renderMetadata({ templatesDir, values })` は Task 7 と Task 14 で同じシグネチャ
- `runCommand({ command, args, onLine, ... })` は Task 8 と Task 13-15 で同じ
- `logger.log(runId, event)` / `logger.open(runId)` は Task 5 と全 SSE エンドポイントで統一
- `registry.register(name, child, { label })` は Task 9, 10, 16 で整合
- `startNgrok({ port, registry, logger, runId })` は Task 10 定義 / Task 16 呼び出しで一致

### No placeholders

- 全タスクで実コードを提示
- "add appropriate error handling" 等の曖昧な指示なし
- API エラーは各エンドポイントで具体的なコード(`INVALID_ALIAS`, `NO_ORG_SELECTED` 等)で返す

### Open items (spec §13)

以下は実装時に検証 → 必要に応じて修正する前提:
1. `<publicKey>` の `&#10;` エスケープで Salesforce が正しく受け入れるか
2. `apiVersion` 61.0 が現時点の最新か
3. `sf org assign permset` の `--on-behalf-of` 構文(ドキュメント確認)
4. `ContactCenter` XML の public key 埋め込みが deploy 時に有効化されるか
5. ngrok 管理 API (`:4040/api/tunnels`) の応答構造
6. `<conversationVendorInfo>` 参照フィールド名(メタデータリファレンスで確認)
7. developerName と CALL_CENTER_API_NAME の namespace 対応

各項目は Task 26 の回帰確認で当たりをつけ、失敗時は該当 Task に戻って修正コミットを積む。

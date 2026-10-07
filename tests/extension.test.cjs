const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const extension = path.join(ROOT, 'extension');
const tempRoot = fs.realpathSync(os.tmpdir());
const userDataDir = fs.mkdtempSync(path.join(tempRoot, 'application-extension-test-'));
let server, context;

(async () => {
  server = spawn('python', [path.join(ROOT, 'tools/serve_demo.py'), '--port', '0'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('server timeout')), 10000);
    server.stdout.on('data', data => { const url = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (url) { clearTimeout(timer); resolve(url[0]); } });
    server.on('error', reject);
  });
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
  const id = new URL(worker.url()).host;
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.getByRole('textbox', { name: '基本资料 姓名', exact: true }).fill('扩展测试同学');
  await options.getByRole('button', { name: '保存资料', exact: true }).click();
  await options.reload();
  assert.equal(await options.getByRole('textbox', { name: '基本资料 姓名', exact: true }).inputValue(), '扩展测试同学');
  console.log('PASS real extension manifest, service worker, options page and chrome.storage.local');
  const site = await context.newPage();
  await site.goto(`${base}/demo/index.html`);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  // The actual toolbar popup requires a human gesture. This smoke test verifies
  // that real chrome.scripting cannot access a website without that grant.
  await site.bringToFront();
  await worker.evaluate(async () => {
    // activeTab cannot be synthesized by a page script; the injection API must reject it.
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) throw Error('test tab unavailable');
    let rejected = false;
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['schema.js', 'content.js'] }); }
    catch { rejected = true; }
    if (!rejected) throw Error('activeTab access unexpectedly available without user gesture');
  });
  console.log('PASS activeTab denies page access without a toolbar user gesture');
  await popup.bringToFront();
  await popup.getByRole('button', { name: '① 识别当前页面' }).click();
  await popup.locator('#status').filter({ hasText: '操作失败' }).waitFor();
  console.log('PASS restricted-page / missing-activeTab errors are visible to user');
  console.log('Extension smoke scenarios passed: 3');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await context?.close(); server?.kill();
  // Remove only this generated, isolated test profile after checking its exact boundary.
  const resolved = path.resolve(userDataDir);
  if (path.dirname(resolved) === tempRoot && path.basename(resolved).startsWith('application-extension-test-')) {
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3 });
  }
});

const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const http = require('node:http');
const ROOT = path.resolve(__dirname, '..'), fixtures = path.join(ROOT, 'tests/fixtures');
const tempRoot = fs.realpathSync(os.tmpdir()), testRoot = fs.mkdtempSync(path.join(tempRoot, 'application-v2-test-'));
let server, context, aiServer; let passed = 0;
const pass = message => { passed++; console.log(`PASS ${message}`); };
const source = '示例同学\n手机号码：13800000000\n邮箱：demo@example.com\n教育背景\n2023.09 - 2027.06\n示例理工大学\n电子信息科学与技术\n本科\n项目经历\n2024.03 - 2024.12\n环境采集演示项目\n负责人\n项目背景：基于控制器与传感器完成演示。\n个人职责：编写采集程序并调试。\n项目成果：完成数据采集和显示。';
async function prepare() {
  fs.mkdirSync(fixtures, { recursive: true }); fs.writeFileSync(path.join(fixtures, '虚构简历.txt'), source, 'utf8');
  const zip = new JSZip();
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${source.split('\n').map(line => `<w:p><w:r><w:t>${escape(line)}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
  fs.writeFileSync(path.join(fixtures, '虚构简历.docx'), await zip.generateAsync({ type: 'nodebuffer' }));
  const pdf = await PDFDocument.create(), page = pdf.addPage([600, 500]), font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('DEMO RESUME\nPhone: 13800000000\nEmail: demo@example.com\nProject: Sensor Demo\nResponsibilities: Program and test the controller.', { x: 30, y: 450, size: 18, font, lineHeight: 35 });
  fs.writeFileSync(path.join(fixtures, '虚构文字简历.pdf'), await pdf.save());
}
async function baseURL() {
  server = spawn('python', [path.join(ROOT, 'tools/serve_demo.py'), '--port', '0'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('server timeout')), 10000); server.stdout.on('data', data => { const url = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/); if (url) { clearTimeout(timer); resolve(url[0]); } }); server.on('error', reject); });
}
(async () => {
  await prepare(); const base = await baseURL();
  const extension = path.join(testRoot, 'extension'); fs.cpSync(path.join(ROOT, 'extension'), extension, { recursive: true });
  const manifestPath = path.join(extension, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // Grant localhost only to this isolated TEST COPY to simulate the toolbar activeTab grant.
  // The production manifest remains unchanged and has no permanent host permissions.
  manifest.host_permissions = ['http://127.0.0.1/*']; fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  context = await chromium.launchPersistentContext(path.join(testRoot, 'profile'), { executablePath: process.env.BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, viewport: { width: 1450, height: 1000 }, ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host, prefix = `chrome-extension://${id}`;
  const options = await context.newPage(); const errors = []; options.on('pageerror', e => errors.push(e.message));
  await options.goto(`${prefix}/options.html`);
  assert.equal(await options.getByRole('textbox', { name: '基本资料 姓名', exact: true }).inputValue(), '');
  pass('fresh extension starts empty and offers user-selected material import');
  await options.locator('#file').setInputFiles(path.join(fixtures, '虚构简历.docx'));
  await options.locator('#apply-import').waitFor({ state: 'visible' }); await options.locator('#apply-import:not([disabled])').waitFor();
  assert.equal(await options.getByRole('textbox', { name: '草稿 基本资料 姓名', exact: true }).inputValue(), '示例同学');
  assert.equal(await options.getByRole('textbox', { name: '基本资料 姓名', exact: true }).inputValue(), '');
  pass('DOCX is parsed locally into editable review without changing saved profile');
  await options.getByRole('button', { name: '确认并应用导入', exact: true }).click();
  await options.locator('#import-dialog').waitFor({ state: 'hidden' });
  assert.equal(await options.getByRole('textbox', { name: '基本资料 姓名', exact: true }).inputValue(), '示例同学');
  assert.equal(await options.getByRole('textbox', { name: '项目经历 1 项目开始时间', exact: true }).inputValue(), '2024-03');
  assert.equal(await options.locator('.attachment-row').count(), 1);
  const filePresent = await options.evaluate(async () => { const lib = await ApplicationLibrary.load(), file = await ApplicationLibrary.attachment('get', lib.attachments[0].id); return file?.size; });
  assert.equal(filePresent, fs.statSync(path.join(fixtures, '虚构简历.docx')).size);
  pass('confirmed import retains month precision, source text and selected attachment');
  // Read the generated text PDF through a test-created File; never fetch private user files.
  const pdfResult = await options.evaluate(async bytes => {
    const result = await ApplicationImporter.read(new File([new Uint8Array(bytes)], 'text.pdf'));
    return { text: result.text, phone: result.profile.basic.phone };
  }, Array.from(fs.readFileSync(path.join(fixtures, '虚构文字简历.pdf'))));
  assert.ok(pdfResult.text.includes('demo@example.com')); assert.equal(pdfResult.phone, '13800000000'); pass('text PDF extraction works using bundled PDF.js');
  const imagePage = await context.newPage(); await imagePage.goto(base + '/demo/index.html');
  await imagePage.setContent('<div id="ocr" style="font:42px Microsoft YaHei, sans-serif;line-height:1.9;padding:35px;background:white;color:black;width:1000px">测试材料<br>姓名：示例同学<br>手机号码：13800000000<br>邮箱：demo@example.com<br>项目：环境采集演示</div>');
  const png = await imagePage.locator('#ocr').screenshot({ path: path.join(fixtures, '虚构扫描图.png') });
  const scanPDF = await PDFDocument.create(), scanImage = await scanPDF.embedPng(png), scanPage = scanPDF.addPage([1000, scanImage.height]); scanPage.drawImage(scanImage, { x: 0, y: 0, width: 1000, height: scanImage.height });
  fs.writeFileSync(path.join(fixtures, '虚构扫描简历.pdf'), await scanPDF.save());
  const ocrResult = await options.evaluate(async bytes => { const r = await ApplicationImporter.read(new File([new Uint8Array(bytes)], 'image.png', { type: 'image/png' })); return r.text; }, Array.from(png));
  assert.ok(ocrResult.replace(/\s/g, '').includes('13800000000'), ocrResult); pass('bundled Chinese / English OCR recognizes a generated scan without external service');
  const scanResult = await options.evaluate(async bytes => { const r = await ApplicationImporter.read(new File([new Uint8Array(bytes)], 'scan.pdf')); return r.text; }, Array.from(fs.readFileSync(path.join(fixtures, '虚构扫描简历.pdf'))));
  assert.ok(scanResult.replace(/\s/g, '').includes('13800000000'), scanResult); pass('image-only PDF automatically renders and runs local OCR');
  const site = await context.newPage(); await site.goto(base + '/demo/index.html');
  await site.evaluate(() => { const old = document.querySelector('#assistant'); old.parentElement.remove(); document.body.style.minWidth = '0'; document.querySelector('#application').style.height = 'auto'; });
  await site.bringToFront();
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  const nonce = 'test-panel-binding';
  await worker.evaluate(async ({ tabId, nonce, base }) => {
    await chrome.storage.session.set({ panelBindings: { [tabId]: { nonce, origin: base } } });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['schema.js', 'content.js', 'overlay.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, func: config => ApplicationOverlay.show(config), args: [{ tabId, nonce, url: chrome.runtime.getURL('panel.html') }] });
  }, { tabId, nonce, base });
  let panel;
  for (let i = 0; i < 100; i++) { panel = site.frames().find(f => f.url().startsWith(prefix + '/panel.html')); if (panel) break; await new Promise(r => setTimeout(r, 50)); }
  assert.ok(panel, 'floating extension panel available'); await panel.locator('.quick-card').first().waitFor();
  assert.ok(await panel.locator('.quick-card').count() > 10); pass('real extension iframe shows searchable cards in a persistent floating panel');
  await site.locator('#full-name').click();
  await panel.getByRole('searchbox', { name: '搜索资料' }).fill('基本资料 · 姓名');
  await panel.locator('.quick-card').getByRole('button', { name: '插入', exact: true }).click();
  await panel.locator('#status').filter({ hasText: '已插入' }).waitFor(); assert.equal(await site.locator('#full-name').inputValue(), '示例同学'); pass('card insertion reaches the saved webpage focus through background authentication');
  await panel.getByRole('button', { name: '撤销上次填写', exact: true }).click(); await panel.locator('#status').filter({ hasText: '已撤销' }).waitFor(); assert.equal(await site.locator('#full-name').inputValue(), '');
  await site.locator('#project-description').fill('前后'); await site.locator('#project-description').evaluate(el => el.setSelectionRange(1, 1));
  await panel.locator('#insert-mode').selectOption('cursor'); await panel.locator('#workbench').evaluate(el => el.open = true); await panel.locator('#draft').fill('中');
  await panel.locator('#draft-insert').click(); await panel.locator('#status').filter({ hasText: '已插入' }).waitFor(); assert.equal(await site.locator('#project-description').inputValue(), '前中后'); pass('cursor insertion preserves surrounding text and undo restores the field');
  await site.locator('#verification').click(); await panel.locator('#draft-insert').click(); await panel.locator('#status').filter({ hasText: '手动处理' }).waitFor(); assert.equal(await site.locator('#verification').inputValue(), ''); pass('quick insertion still refuses verification fields');
  await site.mouse.click(1450 - 374 - 18, 140); assert.equal(await site.locator('#application-helper-overlay').evaluate(el => el.style.width), '0px'); await site.mouse.click(1450 - 18, 140); assert.equal(await site.locator('#application-helper-overlay').evaluate(el => el.style.width), '374px'); pass('closed-shadow overlay collapses and reopens without closing the application form');
  await panel.locator('#search').fill(''); await panel.locator('.application-note').evaluate(el => el.open = true); await panel.locator('#company').fill('虚构公司'); await panel.locator('#job').fill('测试岗位'); await panel.locator('#save-application').click(); await panel.locator('#status').filter({ hasText: '投递记录已保存' }).waitFor();
  const stored = await options.evaluate(() => ApplicationLibrary.load()); assert.equal(stored.applications[0].status, '准备中'); pass('application record is explicit and does not turn filling into submitted status');
  await options.reload(); await options.getByRole('button', { name: '复制为新版本' }).click(); await options.getByRole('textbox', { name: '资料版本名称' }).fill('硬件岗位'); await options.getByRole('button', { name: '保存资料', exact: true }).click();
  await options.reload(); assert.equal(await options.locator('#version option').count(), 2); pass('job-specific versions persist independently');
  const denial = await panel.evaluate(async () => chrome.runtime.sendMessage({ type: 'application-panel', tabId: Number(new URLSearchParams(location.search).get('tab')), nonce: 'wrong-token', action: 'scan' })); assert.equal(denial.ok, false); pass('panel cannot route requests with an incorrect page binding');
  let aiRequest;
  aiServer = http.createServer((req, res) => { let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { aiRequest = JSON.parse(body); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: '编写采集程序并完成联调。' } }] })); }); });
  await new Promise(resolve => aiServer.listen(0, '127.0.0.1', resolve));
  await options.locator('#ai-endpoint').fill(`http://127.0.0.1:${aiServer.address().port}/v1/chat/completions`);
  await options.locator('#ai-model').fill('local-test-model'); await options.locator('#ai-key').fill('fake-local-test-key'); await options.locator('#save-ai').click(); await options.locator('#ai-status').filter({ hasText: '配置已保存' }).waitFor();
  assert.equal(await options.locator('#ai-key').inputValue(), '');
  const keyState = await options.evaluate(async () => ({ local: (await chrome.storage.local.get('aiKey')).aiKey, session: Boolean((await chrome.storage.session.get('aiKey')).aiKey) }));
  assert.equal(keyState.local, undefined); assert.equal(keyState.session, true); pass('user API key stays in browser session by default and is not displayed');
  await panel.locator('#workbench').evaluate(el => el.open = true); await panel.locator('#draft').fill('仅发送这段虚构项目的个人职责'); await panel.locator('#ai-shorten').click(); await panel.locator('#status').filter({ hasText: '建议已生成' }).waitFor();
  assert.equal(aiRequest.messages[1].content, '仅发送这段虚构项目的个人职责'); assert.equal(aiRequest.profile, undefined); assert.equal(await panel.locator('#ai-result').inputValue(), '编写采集程序并完成联调。');
  assert.equal(await panel.locator('#draft').inputValue(), '仅发送这段虚构项目的个人职责'); await panel.locator('#ai-adopt').click(); assert.equal(await panel.locator('#draft').inputValue(), '编写采集程序并完成联调。');
  const backup = await options.evaluate(() => ApplicationLibrary.load()); assert.equal(JSON.stringify(backup).includes('fake-local-test-key'), false); assert.equal(backup.profiles[0].profile.projects[0].responsibilities, '个人职责：编写采集程序并调试。');
  pass('AI UI sends one chosen paragraph, previews output and preserves original profile until manual use');
  await panel.locator('#draft').fill('本地演示项目的个人职责');
  await site.screenshot({ path: path.join(ROOT, 'demo/新版悬浮面板.png'), fullPage: false });
  assert.deepEqual(errors, []); pass('new interface and material import render without JavaScript errors');
  console.log(`New-version browser scenarios passed: ${passed}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await context?.close(); server?.kill(); aiServer?.close();
  if (path.dirname(path.resolve(testRoot)) === tempRoot && path.basename(testRoot).startsWith('application-v2-test-')) fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 5 });
});

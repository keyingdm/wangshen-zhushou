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
  const help = await context.newPage(); await help.goto(`${prefix}/help.html`); assert.equal(await help.locator('nav li').count(), 14); assert.equal(await help.locator('img').count(), 5); for (let index = 0; index < 5; index++) { const image = help.locator('img').nth(index); await image.scrollIntoViewIfNeeded(); await image.evaluate(el => el.decode()); } await help.close(); pass('bundled offline help opens inside the real extension with all tutorial screenshots');
  await options.goto(`${prefix}/options.html`);
  assert.equal(await options.getByRole('textbox', { name: '基本资料 姓名', exact: true }).inputValue(), '');
  pass('fresh extension starts empty and offers user-selected material import');
  await options.evaluate(async () => {
    const library = ApplicationLibrary.emptyLibrary();
    library.profiles[0].profile.declarations = { relativeAvoidance: '否', examCity1: '示例考试城市' };
    await ApplicationStorage.set('library', library);
  });
  await options.reload(); assert.equal(await options.locator('#profile-declarations').count(), 0);
  await options.getByRole('textbox', { name: '基本资料 现居城市', exact: true }).fill('示例居住城市');
  await options.locator('#status').filter({ hasText: '已自动保存' }).waitFor();
  const download = await Promise.all([options.waitForEvent('download'), options.locator('#export').click()]).then(([file]) => file);
  const oldBackup = fs.readFileSync(await download.path());
  assert.equal(JSON.parse(oldBackup).profiles[0].profile.declarations.examCity1, '示例考试城市');
  pass('old declaration values survive autosave and actual JSON export while their editor is absent');
  await options.locator('#file').setInputFiles({ name: '虚构旧备份.json', mimeType: 'application/json', buffer: oldBackup });
  await options.locator('#apply-import:not([disabled])').waitFor(); options.once('dialog', dialog => dialog.accept());
  await options.locator('#apply-import').click(); await options.locator('#import-dialog').waitFor({ state: 'hidden' });
  assert.equal(await options.locator('#profile-declarations').count(), 0);
  assert.equal((await options.evaluate(() => ApplicationLibrary.load())).profiles[0].profile.declarations.relativeAvoidance, '否');
  pass('restoring a legacy backup preserves hidden values without recreating the removed section');
  await options.locator('#file').setInputFiles(path.join(fixtures, '虚构简历.docx'));
  await options.locator('#apply-import').waitFor({ state: 'visible' }); await options.locator('#apply-import:not([disabled])').waitFor();
  assert.equal(await options.getByRole('textbox', { name: '草稿 基本资料 姓名', exact: true }).inputValue(), '示例同学');
  assert.equal(await options.getByRole('textbox', { name: '基本资料 姓名', exact: true }).inputValue(), '');
  assert.equal(await options.locator('#candidate-declarations, #assign-field option[value^="declarations."]').count(), 0);
  pass('DOCX is parsed locally into editable review without changing saved profile');
  await options.getByRole('button', { name: '确认并应用导入', exact: true }).click();
  await options.locator('#import-dialog').waitFor({ state: 'hidden' });
  assert.equal(await options.getByRole('textbox', { name: '基本资料 姓名', exact: true }).inputValue(), '示例同学');
  assert.equal(await options.getByRole('textbox', { name: '项目经历 1 项目开始时间', exact: true }).inputValue(), '2024-03');
  assert.equal(await options.locator('.attachment-row').count(), 1);
  const filePresent = await options.evaluate(async () => { const lib = await ApplicationLibrary.load(), file = await ApplicationLibrary.attachment('get', lib.attachments[0].id); return file?.size; });
  assert.equal(filePresent, fs.statSync(path.join(fixtures, '虚构简历.docx')).size);
  pass('confirmed import retains month precision, source text and selected attachment');
  await options.locator('#file').setInputFiles(path.join(fixtures, '虚构简历.docx')); await options.locator('#apply-import:not([disabled])').waitFor(); await options.locator('#apply-import').click(); await options.locator('#import-dialog').waitFor({ state: 'hidden' }); const reimported = await options.evaluate(() => ApplicationLibrary.load()); assert.equal(reimported.profiles[0].profile.projects.length, 1); assert.equal(reimported.sources.length, 1); assert.equal(reimported.attachments.length, 1); pass('reimporting the same DOCX deduplicates experiences, source and binary attachment');
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
  assert.equal(await panel.locator('#category option[value="declarations"]').count(), 0);
  await site.evaluate(() => {
    const label = document.createElement('label'); label.htmlFor = 'retired-exam-city'; label.textContent = '首选考试城市';
    const input = document.createElement('input'); input.id = 'retired-exam-city';
    const container = document.createElement('div'); container.append(label, input); document.querySelector('form').append(container);
  });
  await site.locator('#retired-exam-city').click();
  await panel.locator('#target').filter({ hasText: '首选考试城市' }).waitFor();
  assert.equal(await panel.locator('#recommended-cards .quick-card').count(), 0);
  await panel.locator('#tab-batch').click();
  const batch = panel.frameLocator('#batch');
  try { await batch.locator('#scan').click({ timeout: 5000 }); } catch (error) { console.error('Batch frame URLs:', site.frames().map(frame => frame.url())); throw error; }
  await batch.locator('#rows .field-row').first().waitFor();
  assert.equal(await batch.locator('option[value^="declarations."]').count(), 0);
  await panel.locator('#tab-quick').click();
  pass('retired fields are absent from floating categories, focused recommendations and batch mappings');
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
  await panel.locator('#panel-width').selectOption('440'); await panel.locator('#status').filter({ hasText: '已调整' }).waitFor(); assert.equal(await site.locator('#application-helper-overlay').evaluate(el => el.style.width), '440px'); await panel.locator('#panel-width').selectOption('374'); await panel.locator('#status').filter({ hasText: '已调整' }).waitFor(); pass('real authenticated background routing adjusts the overlay width');
  const located = await panel.evaluate(async () => { const params = new URLSearchParams(location.search), send = (action, payload) => chrome.runtime.sendMessage({ type: 'application-panel', tabId: Number(params.get('tab')), nonce: params.get('nonce'), action, payload }); const scan = await send('scan'); const field = scan.result.fields.find(f => f.id === 'full-name'); return send('locate', { session: scan.result.session, uid: field.uid, fingerprint: ApplicationSchema.fingerprint(field) }); }); assert.equal(located.ok, true); assert.equal(await site.evaluate(() => document.activeElement.id), 'full-name'); pass('real extension locating reaches the webpage through the bound tab');
  await panel.locator('#search').fill(''); await panel.locator('.application-note').evaluate(el => el.open = true); await panel.locator('#company').fill('虚构公司'); await panel.locator('#job').fill('测试岗位'); await panel.locator('#save-application').click(); await panel.locator('#status').filter({ hasText: '投递记录已保存' }).waitFor();
  const stored = await options.evaluate(() => ApplicationLibrary.load()); assert.equal(stored.applications[0].status, '准备中'); pass('application record is explicit and does not turn filling into submitted status');
  await options.getByRole('textbox', { name: '基本资料 现居城市', exact: true }).fill('演示城市'); await options.locator('#status').filter({ hasText: '已自动保存' }).waitFor(); const concurrent = await options.evaluate(() => ApplicationLibrary.load()); assert.equal(concurrent.applications.length, 1); assert.equal(concurrent.profiles[0].profile.basic.city, '演示城市'); pass('autosaving an older editor snapshot preserves records added in the floating panel');
  await options.reload(); await options.getByRole('button', { name: '复制为新版本' }).click(); await options.getByRole('textbox', { name: '资料版本名称' }).fill('硬件岗位'); await options.getByRole('button', { name: '保存资料', exact: true }).click();
  await options.reload(); assert.equal(await options.locator('#version option').count(), 2); pass('job-specific versions persist independently');
  const denial = await panel.evaluate(async () => chrome.runtime.sendMessage({ type: 'application-panel', tabId: Number(new URLSearchParams(location.search).get('tab')), nonce: 'wrong-token', action: 'scan' })); assert.equal(denial.ok, false); pass('panel cannot route requests with an incorrect page binding');
  const deniedResize = await panel.evaluate(async () => chrome.runtime.sendMessage({ type: 'application-panel', tabId: Number(new URLSearchParams(location.search).get('tab')), nonce: 'wrong-token', action: 'resize', payload: { width: 520 } })); assert.equal(deniedResize.ok, false); pass('new overlay actions retain the page binding permission check');
  let aiRequest, delayAI = false, aiStarted, aiStopped;
  aiServer = http.createServer((req, res) => { let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => {
    aiRequest = JSON.parse(body); res.setHeader('Content-Type', 'application/json');
    const reply = () => res.end(JSON.stringify({ choices: [{ message: { content: '编写采集程序并完成联调。' } }] }));
    if (!delayAI) return reply();
    const timer = setTimeout(reply, 10000); res.on('close', () => { clearTimeout(timer); aiStopped?.(); }); aiStarted?.();
  }); });
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
  for (const action of ['close', 'collapse']) {
    const denied = await panel.evaluate(async action => { const params = new URLSearchParams(location.search); return chrome.runtime.sendMessage({ type: 'application-panel', tabId: Number(params.get('tab')), nonce: 'wrong-token', action }); }, action);
    assert.equal(denied.ok, false);
  }
  assert.equal(await site.locator('#application-helper-overlay').count(), 1);
  pass('close and collapse reject messages without the current page binding');
  await panel.locator('#collapse-panel').click();
  await site.waitForFunction(() => document.querySelector('#application-helper-overlay').style.width === '0px');
  await site.mouse.click(1450 - 18, 140); await panel.locator('#close-panel').waitFor({ state: 'visible' });
  pass('header collapse leaves the side handle available for reopening');
  await panel.evaluate(() => { globalThis.originalStorageSet = ApplicationStorage.set; ApplicationStorage.set = async (key, value) => { if (key.startsWith('panelState:')) throw Error('虚构磁盘写入失败'); return originalStorageSet(key, value); }; });
  await panel.locator('#close-panel').click(); await panel.locator('#status').filter({ hasText: '虚构磁盘写入失败' }).waitFor();
  assert.equal(await site.locator('#application-helper-overlay').count(), 1);
  await panel.evaluate(() => { ApplicationStorage.set = originalStorageSet; delete globalThis.originalStorageSet; });
  pass('a draft storage failure leaves the panel open and displays a visible error');
  const closingDraft = '关闭前刚刚输入、还没等自动保存的虚构草稿';
  await panel.locator('#search').fill('项目'); await panel.locator('#draft').fill(closingDraft);
  delayAI = true; const started = new Promise(resolve => { aiStarted = resolve; }), stopped = new Promise(resolve => { aiStopped = resolve; });
  await panel.locator('#ai-shorten').click(); await started;
  assert.equal(await panel.locator('#close-panel').isEnabled(), true);
  await panel.locator('#close-panel').click();
  let stopTimeout; try { await Promise.race([stopped, new Promise((_, reject) => { stopTimeout = setTimeout(() => reject(Error('AI request was not cancelled')), 4000); })]); } finally { clearTimeout(stopTimeout); }
  pass('the close button stays usable during AI generation and cancels the pending request');
  await site.locator('#application-helper-overlay').waitFor({ state: 'detached' });
  await options.waitForFunction(async tabId => !(await chrome.storage.session.get('panelBindings')).panelBindings?.[tabId], tabId);
  const savedDraft = await options.evaluate(async () => { const library = await ApplicationLibrary.load(); return ApplicationStorage.get('panelState:' + library.activeId); });
  assert.equal(savedDraft.draft, closingDraft);
  pass('closing flushes the pending draft, removes the entire overlay and revokes its binding');
  const reopenedNonce = 'test-reopened-panel-binding';
  await worker.evaluate(async ({ tabId, nonce, base }) => {
    await chrome.storage.session.set({ panelBindings: { [tabId]: { nonce, origin: base } } });
    const width = (await chrome.storage.local.get('panelWidth')).panelWidth || 374;
    await chrome.scripting.executeScript({ target: { tabId }, func: config => ApplicationOverlay.show(config), args: [{ tabId, nonce, width, url: chrome.runtime.getURL('panel.html') }] });
  }, { tabId, nonce: reopenedNonce, base });
  for (let index = 0; index < 100; index++) { panel = site.frames().find(f => f.url().includes('nonce=' + reopenedNonce)); if (panel) break; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.ok(panel); await panel.locator('#draft').waitFor({ state: 'visible' });
  assert.equal(await panel.locator('#draft').inputValue(), closingDraft); assert.equal(await panel.locator('#search').inputValue(), '项目');
  const staleClose = await panel.evaluate(async oldNonce => { const params = new URLSearchParams(location.search); return chrome.runtime.sendMessage({ type: 'application-panel', tabId: Number(params.get('tab')), nonce: oldNonce, action: 'close' }); }, nonce);
  assert.equal(staleClose.ok, false); assert.equal(await site.locator('#application-helper-overlay').count(), 1);
  pass('a fresh toolbar-style open recreates the panel, restores its draft and rejects the old binding');
  assert.deepEqual(errors, []); pass('new interface and material import render without JavaScript errors');
  console.log(`New-version browser scenarios passed: ${passed}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await context?.close(); server?.kill(); aiServer?.close();
  if (path.dirname(path.resolve(testRoot)) === tempRoot && path.basename(testRoot).startsWith('application-v2-test-')) fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 5 });
});

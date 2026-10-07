const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../extension/schema.js');
const memory = new Map();
global.ApplicationStorage = { get: async (key, fallback) => memory.get(key) ?? fallback, set: async (key, value) => memory.set(key, value), remove: async key => memory.delete(key) };
const L = require('../extension/library.js'), I = require('../extension/importer.js'), AI = require('../extension/ai.js');

test('new library contains no preloaded applicant data', () => {
  const l = L.emptyLibrary(); assert.equal(l.profiles.length, 1); assert.equal(S.entries(L.active(l).profile).every(e => !e.value), true);
  assert.deepEqual(l.sources, []); assert.deepEqual(l.applications, []); assert.deepEqual(l.attachments, []);
});
test('raw text produces a reviewable draft and preserves source month precision', () => {
  const p = I.parseText('示例同学\n手机号码：13800000000\n邮箱：demo@example.com\n教育背景\n2023.09 - 2027.06\n示例理工大学\n电子信息科学与技术\n本科\n项目经历\n2024.03 - 2024.12\n示例项目\n负责人\n项目背景：采集传感器数据\n个人职责：编写程序\n项目成果：完成演示', 'sample.txt');
  assert.equal(p.basic.phone, '13800000000'); assert.equal(p.basic.email, 'demo@example.com');
  assert.equal(p.education[0].start, '2023-09'); assert.equal(p.projects[0].end, '2024-12');
  assert.equal(p.projects[0].results, '完成演示'); assert.equal(p.basic.idNumber, ''); assert.equal(p.basic.gender, '');
  assert.ok(p._meta.reviewNotes[0].includes('核对'));
});
test('merging preserves existing scalar values and appends independent experiences', () => {
  const old = S.emptyProfile(), incoming = S.emptyProfile(); old.basic.name = '已确认姓名'; incoming.basic.name = '另一个名字'; incoming.basic.phone = '13800000000'; incoming.projects = [{ ...S.blankRecord('projects'), name: '新增项目' }];
  const merged = L.merge(old, incoming); assert.equal(merged.basic.name, old.basic.name); assert.equal(merged.basic.phone, incoming.basic.phone); assert.equal(merged.projects.length, 1);
});
test('quick cards distinguish description, responsibilities, results and combined text', () => {
  const p = S.emptyProfile(); p.projects = [{ ...S.blankRecord('projects'), description: '项目整体', responsibilities: '个人职责', results: '团队成果' }];
  const entries = L.quickEntries(p); assert.equal(entries.find(e => e.path.endsWith('.description')).value, '项目整体');
  assert.equal(entries.find(e => e.path.endsWith('.$combined')).value, '个人职责\n项目成果：团队成果');
});
test('backups exclude keys and reject invalid duplicate profile IDs', () => {
  const l = L.emptyLibrary(); l.aiKey = 'secret'; l.apiConfig = { key: 'secret' }; const cleaned = L.validate(l);
  assert.equal(JSON.stringify(cleaned).includes('secret'), false);
  assert.throws(() => L.validate({ ...l, profiles: [l.profiles[0], l.profiles[0]] }));
});
test('AI endpoint permits HTTPS and localhost but rejects credentials and remote HTTP', () => {
  assert.equal(AI.endpoint('https://api.example.com/v1/chat/completions').permission, 'https://api.example.com/*');
  assert.equal(AI.endpoint('http://127.0.0.1:8080/v1/chat/completions').permission, 'http://127.0.0.1/*');
  for (const url of ['http://remote.example.com/chat', 'https://key@example.com/chat', 'https://example.com/chat?key=abc', 'javascript:alert(1)']) assert.throws(() => AI.endpoint(url));
});
test('AI sends only explicit working text and keeps over-length output for review', async () => {
  memory.set('aiConfig', { endpoint: 'https://ai.example.com/chat/completions', model: 'test-model', rememberKey: true }); memory.set('aiKey', 'fake-test-key');
  const originalFetch = global.fetch; let body;
  global.fetch = async (url, init) => { assert.equal(url, 'https://ai.example.com/chat/completions'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit'); body = JSON.parse(init.body); return { ok: true, json: async () => ({ choices: [{ message: { content: 'x'.repeat(31) } }] }) }; };
  try { const result = await AI.shorten('只发这段示例职责', 30); assert.equal(body.messages[1].content, '只发这段示例职责'); assert.equal(result.text.length, 31); assert.equal(result.withinLimit, false); assert.equal(body.profile, undefined); }
  finally { global.fetch = originalFetch; }
});
test('AI configuration requires an explicitly granted provider origin', async () => {
  await assert.rejects(AI.save({ endpoint: 'https://ai.example.com/chat', model: 'm', key: 'fake', rememberKey: false }, false));
  await AI.save({ endpoint: 'https://ai.example.com/chat', model: 'm', key: 'fake', rememberKey: false }, true);
  assert.equal(memory.has('aiKey'), false); assert.equal(global.ApplicationDemoKey, 'fake'); await AI.clear(); assert.equal(memory.has('aiConfig'), false);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../extension/schema.js');
const memory = new Map();
global.ApplicationStorage = { get: async (key, fallback) => structuredClone(memory.get(key) ?? fallback), set: async (key, value) => memory.set(key, structuredClone(value)), remove: async key => memory.delete(key) };
const L = require('../extension/library.js'), U = require('../extension/ux.js');
const field = (label, type = 'text') => ({ label, type, aliases: [], sensitive: false });

test('version 1/2 backups migrate without losing values or retired declarations', () => {
  for (const version of [1, 2]) { const old = S.emptyProfile(); delete old._custom; old.version = version; old.basic.name = '虚构旧资料'; old.declarations = { examCity1: '旧资料城市' }; const p = S.validateProfile(old); assert.equal(p.version, 3); assert.equal(p.basic.name, old.basic.name); assert.equal(p.declarations.examCity1, old.declarations.examCity1); assert.deepEqual(p._custom.sections, []); }
});
test('custom directories, added builtin fields and values survive JSON round-trips', () => {
  const p = S.emptyProfile(), group = S.addSection(p, '志愿服务'), key = S.putField(p, group, field('服务内容', 'multiline')), extra = S.putField(p, 'basic', { ...field('微信号'), aliases: ['WeChat'] });
  p[group][key] = '虚构服务经历'; p.basic[extra] = 'demo_wechat'; const lib = L.emptyLibrary(); lib.profiles[0].profile = p;
  const restored = L.active(L.validate(JSON.parse(JSON.stringify(lib)))).profile;
  assert.equal(restored[group][key], '虚构服务经历'); assert.equal(restored.basic[extra], 'demo_wechat'); assert.equal(S.entries(restored).find(e => e.key === key).multiline, true); assert.equal(S.entries(restored).find(e => e.key === extra).aliases.includes('WeChat'), true);
});
test('repeatable custom records have stable favorites after rename, edits and row removal', () => {
  const p = S.emptyProfile(), group = S.addSection(p, '志愿经历', true), key = S.putField(p, group, field('服务名称'));
  p[group] = [S.blankRecord(group, p), S.blankRecord(group, p)]; p[group][1][key] = '第二条';
  const before = U.entryKey(S.entries(p).find(e => e.path === `${group}.1.${key}`), p); S.renameSection(p, group, '社区服务'); S.putField(p, group, field('服务项目'), key); p[group][1][key] = '改后的标题'; p[group].shift();
  assert.equal(U.entryKey(S.entries(p).find(e => e.path === `${group}.0.${key}`), p), before);
});
test('hiding builtin groups removes fill/card entries and restores all stored values', () => {
  const p = S.emptyProfile(); p.basic.name = '示例'; S.hideSection(p, 'basic', true);
  assert.equal(S.entries(p).some(e => e.group === 'basic'), false); assert.equal(S.infer({ label: '姓名', section: '基本资料' }, p).path, '');
  const backup = S.validateProfile(JSON.parse(JSON.stringify(p))); S.hideSection(backup, 'basic', false); assert.equal(backup.basic.name, '示例');
});
test('custom aliases produce reviewed matches and ambiguity never selects a winner', () => {
  const p = S.emptyProfile(), a = S.addSection(p, '网申补充'), key = S.putField(p, a, { ...field('微信号'), aliases: ['WeChat'] }); p[a][key] = 'demo';
  assert.deepEqual(S.infer({ label: 'WeChat', section: '网申补充' }, p), { path: `${a}.${key}`, confidence: 'low', reason: '自定义字段，请核对并勾选' });
  const b = S.addSection(p, '另一目录'); S.putField(p, b, { ...field('账号'), aliases: ['WeChat'] }); assert.equal(S.infer({ label: 'WeChat' }, p).path, '');
  assert.equal(S.infer({ label: '验证码', section: '网申补充' }, p).path, '');
});
test('custom record merge deduplicates and exposes conflicting contents', () => {
  const old = S.emptyProfile(), group = S.addSection(old, '自定义经历', true), key = S.putField(old, group, field('职责', 'multiline')); old[group].push(S.blankRecord(group, old)); old[group][0][key] = '原职责';
  const incoming = structuredClone(old); incoming[group][0][key] = '新职责'; const plan = L.planMerge(old, incoming);
  assert.equal(plan.profile[group].length, 1); assert.equal(plan.duplicates, 1); assert.equal(plan.profile[group][0][key], '原职责'); assert.equal(plan.conflicts[0].path, `${group}.0.${key}`);
  L.setPath(plan.profile, plan.conflicts[0].path, plan.conflicts[0].incoming); assert.equal(plan.profile[group][0][key], '新职责'); assert.equal(L.planMerge(plan.profile, plan.profile).profile[group].length, 1);
});
test('new sections and fields merge into current layout without erasing existing values', () => {
  const old = S.emptyProfile(), key = S.putField(old, 'basic', field('额外联系方式')); old.basic[key] = '旧内容';
  const incoming = S.emptyProfile(), group = S.addSection(incoming, '额外问答'), other = S.putField(incoming, group, field('问题一')); incoming[group][other] = '新答案'; const p = L.planMerge(old, incoming).profile;
  assert.equal(p.basic[key], '旧内容'); assert.equal(p[group][other], '新答案'); assert.equal(S.entries(p).some(e => e.key === key), true);
});
test('duplicate names, unsafe IDs and prototype paths are rejected without changing existing values', () => {
  const p = S.emptyProfile(); assert.throws(() => S.addSection(p, '基本资料')); const g = S.addSection(p, '自定义'), f = S.putField(p, g, field('内容'));
  assert.throws(() => S.putField(p, g, field('内容'))); assert.throws(() => S.putField(p, 'basic', field('姓名')));
  const unsafe = structuredClone(p); unsafe._custom.sections[0].id = '__proto__'; assert.throws(() => S.validateProfile(unsafe));
  assert.throws(() => L.setPath(p, 'basic.__proto__.polluted', 'yes')); assert.equal({}.polluted, undefined); assert.equal(p[g][f], '');
});
test('custom limits and malformed record types are rejected without truncation', () => {
  const p = S.emptyProfile(), g = S.addSection(p, '记录', true), f = S.putField(p, g, field('正文')); p[g].push(S.blankRecord(g, p)); p[g][0][f] = 'x'.repeat(15001); assert.throws(() => S.validateProfile(p), /15000/);
  p[g][0][f] = 123; assert.throws(() => S.validateProfile(p)); p[g][0][f] = ''; p[g].push({ ...p[g][0] }); assert.throws(() => S.validateProfile(p), /重复/);
  assert.throws(() => S.putField(p, g, { ...field('错误类型'), type: 'script' }));
});
test('directory and field ordering persists and empty profiles can reuse layouts', () => {
  const p = S.emptyProfile(), g = S.addSection(p, '补充'), a = S.putField(p, g, field('A')), b = S.putField(p, g, field('B')); p[g][a] = '内容'; S.moveField(p, g, b, -1); S.moveSection(p, g, -1); S.renameSection(p, 'basic', '个人信息');
  const empty = S.emptyProfile(p._custom); assert.equal(Object.values(empty[g]).every(v => !v), true); assert.equal(S.groupsFor(empty)[g].fields[0].key, b); assert.equal(S.groupsFor(empty).basic.label, '个人信息'); assert.equal(Object.keys(S.groupsFor(empty)).at(-2), g);
});
test('removing custom fields clears affected values, variants and remembered mappings', async () => {
  memory.clear(); const lib = L.emptyLibrary(), p = lib.profiles[0].profile, g = S.addSection(p, '问答'), f = S.putField(p, g, field('回答')); p[g][f] = '内容'; const key = S.entryKey(S.entries(p).find(e => e.key === f), p);
  lib.textVariants = [{ id: 'variant', profileId: lib.activeId, entryKey: key, label: '短版', value: '短内容' }]; await L.save(lib); memory.set('rules', { example: 'old' });
  const next = await L.update(current => { S.removeField(L.active(current).profile, g, f); return current; }); assert.equal(next.textVariants.length, 0); assert.equal(memory.has('rules'), false); assert.equal(f in L.active(next).profile[g], false);
});
test('same custom field edited concurrently raises a conflict', () => {
  const base = L.emptyLibrary(), p = base.profiles[0].profile, g = S.addSection(p, '补充'), f = S.putField(p, g, field('内容')); const local = structuredClone(base), remote = structuredClone(base); local.profiles[0].profile[g][f] = '本窗口'; remote.profiles[0].profile[g][f] = '另一窗口'; assert.throws(() => L.reconcile(base, local, remote), /另一个窗口/);
});

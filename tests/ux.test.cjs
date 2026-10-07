const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../extension/schema.js');
global.ApplicationStorage = { get: async (_, fallback) => fallback, set: async () => {}, remove: async () => {} };
const L = require('../extension/library.js'), U = require('../extension/ux.js');
const project = (name, other = {}) => ({ ...S.blankRecord('projects'), name, start: '2024-03', end: '2024-12', ...other });
test('reimport deduplicates experiences and surfaces conflicting values without overwriting', () => {
  const old = S.emptyProfile(), incoming = S.emptyProfile(); old.basic.phone = '13800000000'; incoming.basic.phone = '13900000000';
  old.projects = [project('采集项目', { responsibilities: '旧职责' })]; incoming.projects = [project('采集项目', { responsibilities: '新职责', results: '新成果' })];
  const result = L.planMerge(old, incoming);
  assert.equal(result.profile.projects.length, 1); assert.equal(result.duplicates, 1); assert.equal(result.profile.projects[0].results, '新成果');
  assert.equal(result.profile.basic.phone, old.basic.phone); assert.equal(result.profile.projects[0].responsibilities, '旧职责');
  assert.deepEqual(result.conflicts.map(c => c.path), ['basic.phone', 'projects.0.responsibilities']);
  L.setPath(result.profile, result.conflicts[1].path, result.conflicts[1].incoming); assert.equal(result.profile.projects[0].responsibilities, '新职责');
});
test('same-name projects with different dates remain separate and ambiguous records are not merged', () => {
  const old = S.emptyProfile(), incoming = S.emptyProfile(); old.projects = [project('同名项目')]; incoming.projects = [project('同名项目', { start: '2025-03' })];
  assert.equal(L.planMerge(old, incoming).profile.projects.length, 2);
  old.projects.push(project('同名项目', { start: '2025-03' })); incoming.projects = [project('同名项目', { start: '', end: '', responsibilities: '未确定年份' })];
  assert.equal(L.planMerge(old, incoming).profile.projects.length, 3);
});
test('context recommendations cover each project while refusing verification fields and cross-family guesses', () => {
  const p = S.emptyProfile(); p.projects = [project('A', { responsibilities: '职责A' }), project('B', { responsibilities: '职责B' })]; p.basic.name = '示例'; p.family = [{ ...S.blankRecord('family'), name: '家人' }];
  assert.deepEqual(U.recommend(p, { label: '责任描述', section: '项目经历', type: 'textarea' }).map(e => e.value), ['职责A', '职责B']);
  assert.deepEqual(U.recommend(p, { label: '验证码', type: 'text' }), []);
  assert.deepEqual(U.recommend(p, { label: '姓名', section: '个人信息', type: 'text' }).map(e => e.value), ['示例']);
});
test('experience keys preserve favorites when unrelated records are removed', () => {
  const p = S.emptyProfile(); p.projects = [project('A'), project('B')];
  const before = U.entryKey(S.entries(p).find(e => e.path === 'projects.1.name'), p); p.projects.shift();
  assert.equal(U.entryKey(S.entries(p).find(e => e.path === 'projects.0.name'), p), before);
  assert.equal(U.groups(S.entries(p).filter(e => e.group === 'projects'), p).length, 1);
});
test('length preview counts retained cursor content and never truncates text', () => {
  assert.deepEqual(U.lengthInfo('1234', { current: '前中后', selectionStart: 1, selectionEnd: 2, maxLength: 5 }, 'cursor'), { length: 6, limit: 5, exceeded: true });
  assert.equal(U.lengthInfo('1234', { maxLength: 5 }).exceeded, false);
});
test('three-way saves preserve concurrent application records and unrelated profile edits', () => {
  const base = L.validate(L.emptyLibrary()), local = structuredClone(base), remote = structuredClone(base);
  local.profiles[0].profile.basic.name = '本次编辑'; remote.applications.push({ id: 'other', company: '另一窗口', role: '岗位' }); remote.profiles[0].profile.basic.email = 'demo@example.com';
  const merged = L.reconcile(base, local, remote); assert.equal(merged.profiles[0].profile.basic.name, '本次编辑'); assert.equal(merged.profiles[0].profile.basic.email, 'demo@example.com'); assert.equal(merged.applications[0].id, 'other');
});
test('concurrent edits to the same field are rejected rather than silently lost', () => {
  const base = L.validate(L.emptyLibrary()), local = structuredClone(base), remote = structuredClone(base);
  local.profiles[0].profile.basic.name = 'A'; remote.profiles[0].profile.basic.name = 'B'; assert.throws(() => L.reconcile(base, local, remote), /另一个窗口/);
});
test('backups retain text variants but exclude UI drafts and API credentials', () => {
  const library = L.emptyLibrary(); library.textVariants = [{ id: 'v', profileId: library.activeId, entryKey: 'key', label: '短版', value: '短内容' }]; library.panelDraft = 'temporary'; library.apiKey = 'secret';
  const cleaned = L.validate(library); assert.equal(cleaned.textVariants[0].value, '短内容'); assert.equal(cleaned.panelDraft, undefined); assert.equal(cleaned.apiKey, undefined);
});
test('fresh windows share a stable unsaved baseline and text variants are never silently truncated', async () => {
  const one = await L.load(), two = await L.load(); assert.equal(one.activeId, two.activeId);
  const lib = L.emptyLibrary(); lib.textVariants = [{ id: 'v', profileId: lib.activeId, entryKey: 'key', label: '短版', value: 'x'.repeat(15001) }]; assert.throws(() => L.validate(lib), /15000/);
});

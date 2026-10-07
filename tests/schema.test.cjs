const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../extension/schema.js');
const p = S.emptyProfile();
p.basic.name = '测试用户'; p.basic.gender = '男'; p.basic.idNumber = 'TEST';
p.education = [{ ...S.blankRecord('education'), school: '测试大学', start: '2023-09' }];
p.projects = [{ ...S.blankRecord('projects'), name: '项目一', start: '2024-03' }, { ...S.blankRecord('projects'), name: '项目二', start: '2025-05' }];
const field = (label, section = '') => ({ label, section, type: 'text', options: [] });

test('separates date labels by education / project section', () => {
  assert.equal(S.infer(field('开始时间', '教育经历'), p).path, 'education.0.start');
  assert.equal(S.infer(field('开始时间', '项目经历'), p).path, 'projects.0.start');
  assert.equal(S.infer(field('开始时间'), p).path, '');
});
test('maps basic contact and selected project record', () => {
  assert.equal(S.infer(field('姓名', '基本信息'), p).path, 'basic.name');
  assert.equal(S.infer(field('项目名称', '项目经历'), p, { projects: 1 }).path, 'projects.1.name');
});
test('blocks OTP, bank cards and custom controls', () => {
  for (const f of [field('验证码'), field('银行卡号'), { ...field('学校'), unsupported: 'custom' }]) {
    assert.equal(S.infer(f, p).path, '');
    assert.equal(S.prepare('x', f).ok, false);
  }
});
test('family and emergency fields do not borrow applicant values', () => {
  assert.equal(S.infer(field('姓名', '家庭成员'), p).path, '');
  p.family = [{ ...S.blankRecord('family'), name: '家人示例', relation: '父亲' }];
  const inferred = S.infer(field('姓名', '家庭成员'), p);
  assert.equal(inferred.path, 'family.0.name'); assert.equal(inferred.confidence, 'low');
  assert.equal(S.infer(field('姓名', '个人信息'), p).path, 'basic.name');
  assert.equal(S.infer(field('紧急联系电话', '个人信息'), p).path, 'basic.emergencyPhone');
  assert.equal(S.infer(field('紧急联系电话', '个人信息'), p).confidence, 'low');
});
test('sensitive information never receives high confidence', () => {
  assert.equal(S.infer(field('身份证号码'), p).confidence, 'low');
});
test('does not invent a day for month precision', () => {
  assert.equal(S.prepare('2023-09', { type: 'date' }).ok, false);
  assert.equal(S.prepare('2023-9', { type: 'month' }).value, '2023-09');
  assert.equal(S.prepare('2023-9', { type: 'text', isDate: true }, 'dot').value, '2023.09');
});
test('validates real dates, leap years and ongoing text', () => {
  assert.equal(S.prepare('2024-02-29', { type: 'date' }).ok, true);
  assert.equal(S.prepare('2023-02-29', { type: 'date' }).ok, false);
  assert.equal(S.prepare('2023-13', { type: 'month' }).ok, false);
  assert.equal(S.prepare('至今', { type: 'date' }).ok, false);
});
test('matches select aliases uniquely and rejects placeholder / ambiguity', () => {
  assert.equal(S.optionFor('本科', [{ label: '请选择', value: '' }, { label: '大学本科', value: 'bachelor' }]), 'bachelor');
  assert.equal(S.optionFor('男', [{ label: '男性', value: 'M' }]), 'M');
  assert.equal(S.optionFor('女', [{ label: '男性', value: 'M' }]), null);
  assert.equal(S.optionFor('本科', [{ label: '本科', value: 'a' }, { label: '大学本科', value: 'b' }]), null);
});
test('never truncates long text silently', () => {
  assert.equal(S.prepare('12345', { type: 'textarea', maxLength: 4 }).ok, false);
  assert.equal(S.prepare('12345', { type: 'textarea', maxLength: 5 }).value, '12345');
});
test('strict schema rejects unknown version and non-string fields', () => {
  assert.throws(() => S.validateProfile({ version: 3 }));
  assert.throws(() => S.validateProfile({ version: 1, basic: { name: 3 } }));
  const sanitized = S.validateProfile(JSON.parse('{"version":1,"basic":{"name":" ok ","__proto__":{"polluted":true}},"extraneous":"drop"}'));
  assert.equal(sanitized.basic.name, 'ok');
  assert.equal(sanitized.extraneous, undefined);
  assert.equal({}.polluted, undefined);
});
test('migrates version 1 while separating hometown, household and source city', () => {
  const migrated = S.validateProfile({ version: 1, basic: { name: '旧资料' } });
  assert.equal(migrated.version, 2); assert.equal(migrated.basic.name, '旧资料'); assert.equal(migrated.basic.origin, '');
  assert.equal(S.infer(field('生源所在地', '个人信息'), migrated).path, 'basic.origin');
  assert.equal(S.infer(field('籍贯省份', '个人信息'), migrated).path, 'basic.hometownProvince');
});
test('fingerprint ignores current content and changes with structural identity', () => {
  const base = field('项目名称', '项目经历');
  assert.equal(S.fingerprint({ ...base, current: 'a' }), S.fingerprint({ ...base, current: 'b' }));
  assert.notEqual(S.fingerprint(base), S.fingerprint({ ...base, ordinal: 1 }));
  assert.notEqual(S.fingerprint(base), S.fingerprint({ ...base, section: '教育经历' }));
});

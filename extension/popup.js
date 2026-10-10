(async function () {
  'use strict';
  const S = ApplicationSchema, Store = ApplicationStorage;
  const $ = id => document.getElementById(id);
  const library = await ApplicationLibrary.load();
  let profile = ApplicationLibrary.active(library).profile;
  let snapshot = null, tabId = null, plan = [], busy = false;
  const preferred = {};
  let pendingRefresh = false;
  const status = message => { $('status').textContent = message; };
  function node(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text) n.textContent = text; return n; }
  async function run(action, payload) {
    if (globalThis.ApplicationDemoBridge) return ApplicationDemoBridge(action, payload);
    const params = new URLSearchParams(location.search);
    if (params.has('nonce')) {
      const response = await chrome.runtime.sendMessage({ type: 'application-panel', tabId: Number(params.get('tab')), nonce: params.get('nonce'), action, payload });
      if (!response?.ok) throw Error(response?.error || '无法连接页面');
      return response.result;
    }
    if (action === 'scan') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw Error('请在普通 http / https 网申页面使用；浏览器设置页和 PDF 页面不支持。');
      tabId = tab.id;
    }
    if (!tabId) throw Error('请先识别当前页面。');
    await chrome.scripting.executeScript({ target: { tabId }, files: ['schema.js', 'content.js'] });
    const result = await chrome.scripting.executeScript({ target: { tabId }, func: (command, data) => globalThis.ApplicationAgent[command](data), args: [action, payload ?? null] });
    if (!result[0]?.result) throw Error('页面未返回结果，请重新识别。');
    return result[0].result;
  }
  async function task(fn) {
    if (busy) return;
    busy = true; controls();
    try { await fn(); } catch (error) { status(`操作失败：${error.message}`); }
    finally { busy = false; controls(); if (pendingRefresh) { pendingRefresh = false; await reloadProfile(); } }
  }
  function controls() {
    $('scan').disabled = busy;
    $('fill').disabled = busy || !plan.some(p => p.checked && readyFor(p).ok);
    $('undo').disabled = busy || !snapshot?.undoAvailable;
    $('remember').disabled = busy || !snapshot;
    $('diagnostic').disabled = busy || !snapshot;
    $('check-pending').disabled = busy;
    $('edit').disabled = busy;
    $('rows').inert = busy;
    $('selectors').inert = busy;
    $('overwrite').disabled = busy;
    $('date-style').disabled = busy;
    for (const p of plan) if (p.checkbox) p.checkbox.disabled = busy || !readyFor(p).ok;
  }
  function entryFor(path) { return S.entries(profile).find(e => e.path === path); }
  function readyFor(p) {
    if (!p.field.empty && !$('overwrite').checked) return { ok: false, reason: '已有内容，默认保留' };
    return S.prepare(p.value, { ...p.field, isDate: Boolean(entryFor(p.path)?.date) }, $('date-style').value);
  }
  function refreshSummary() {
    let count = 0;
    for (const p of plan) {
      const ready = readyFor(p);
      if (!ready.ok) p.checked = false;
      if (p.checkbox) { p.checkbox.checked = p.checked; p.checkbox.disabled = !ready.ok || busy; }
      if (p.note) p.note.textContent = p.result || (!ready.ok ? ready.reason : p.reason);
      if (p.checked && ready.ok) count++;
    }
    $('summary').textContent = snapshot ? `共 ${plan.length} 个可见字段 · 已选 ${count} 项${snapshot.inaccessibleFrames ? ` · ${snapshot.inaccessibleFrames} 个跨域框架需手动处理` : ''}` : '';
    refreshPending();
    controls();
  }
  function pendingReasons(p) {
    const reasons = []; if (p.field.required && p.field.empty) reasons.push('必填未处理');
    if (p.field.maxLength > 0 && (p.field.empty ? p.value : p.field.current).length > p.field.maxLength) reasons.push(`超过 ${p.field.maxLength} 字符`);
    if (p.field.empty && (p.field.unsupported || S.blocked(p.field))) reasons.push('需网页手动处理');
    if (p.field.required && p.field.empty && !p.value) reasons.push('缺少对应资料');
    return reasons;
  }
  function refreshPending() {
    const pending = plan.map(p => ({ p, reasons: pendingReasons(p) })).filter(item => item.reasons.length);
    $('pending-list').replaceChildren();
    for (const { p, reasons } of pending) { const button = node('button', 'pending-item', `${p.field.label}：${reasons.join(' · ')} ↗`); button.onclick = () => task(async () => { const result = await run('locate', { session: snapshot.session, uid: p.field.uid, fingerprint: S.fingerprint(p.field) }); status(`已定位“${result.label}”，请在网页检查或填写。`); }); $('pending-list').append(button); }
    $('pending-summary').textContent = snapshot ? `当前可见字段有 ${pending.length} 项待处理${snapshot.inaccessibleFrames ? `；另有 ${snapshot.inaccessibleFrames} 个跨域框架需手动检查` : ''}。隐藏栏目请展开后重新识别。` : '先识别当前页面。';
    for (const p of plan) if (p.row) p.row.hidden = $('only-pending').checked && !pendingReasons(p).length;
  }
  function selectors() {
    $('selectors').replaceChildren();
    for (const [group, config] of Object.entries(S.groupsFor(profile))) {
      if (!config.repeat || !profile[group].length) continue;
      const label = node('label', '', `本页${config.label} `), select = node('select');
      profile[group].forEach((r, i) => { const option = node('option', '', `${i + 1}. ${r.name || r.school || r.organization || config.label}`); option.value = String(i); select.append(option); });
      select.value = String(preferred[group] || 0);
      select.addEventListener('change', () => task(async () => {
        preferred[group] = Number(select.value);
        if (snapshot) { await buildPlan(false); status('已切换资料，请核对本页对应关系。'); }
      }));
      label.append(select); $('selectors').append(label);
    }
    $('welcome').hidden = S.entries(profile).some(e => e.value);
  }
  async function buildPlan(useSaved = true) {
    const rules = useSaved ? (await Store.get('rules', {}))[snapshot.url] || {} : {};
    plan = snapshot.fields.map(field => {
      const guessed = S.infer(field, profile, preferred);
      const saved = rules[S.fingerprint(field)];
      const savedEntry = saved ? entryFor(saved) : null;
      const inferred = savedEntry && !S.blocked(field) && !field.unsupported ? { path: saved, confidence: savedEntry.sensitive || savedEntry.custom ? 'low' : 'high', reason: '已记住的对应关系，请核对' } : guessed;
      return { field, ...inferred, value: entryFor(inferred.path)?.value || '', checked: false, result: '' };
    });
    const counts = new Map();
    plan.forEach(p => { if (p.path) counts.set(p.path, (counts.get(p.path) || 0) + 1); });
    for (const p of plan) {
      if (counts.get(p.path) > 1) { p.confidence = 'low'; p.reason = '重复字段，请分别选择对应经历并勾选'; }
      p.checked = p.confidence === 'high' && readyFor(p).ok;
    }
    renderPlan();
  }
  function renderPlan() {
    $('rows').replaceChildren();
    const allEntries = S.entries(profile);
    for (const p of plan) {
      const row = node('article', 'field-row');
      p.row = row;
      const head = node('div', 'field-head'), checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.setAttribute('aria-label', `填写 ${p.field.label}`);
      p.checkbox = checkbox;
      checkbox.addEventListener('change', () => { p.checked = checkbox.checked; refreshSummary(); });
      const title = node('div', 'field-title'); title.append(node('strong', '', p.field.label), node('span', 'muted', `${p.field.section || '未识别分区'} · ${p.field.type}${p.field.required ? ' · 必填' : ''}`));
      const badge = node('span', `badge ${p.confidence === 'high' ? 'good' : 'warn'}`, p.confidence === 'high' ? '匹配' : '需核对');
      head.append(checkbox, title, badge); row.append(head);
      if (!p.field.empty) row.append(node('div', 'existing', `当前内容：${p.field.current}`));
      const select = node('select', 'mapping'); select.setAttribute('aria-label', `${p.field.label}对应资料`);
      const empty = node('option', '', '— 跳过 / 临时填写 —'); empty.value = ''; select.append(empty);
      let lastGroup = '', optgroup;
      for (const e of allEntries) {
        const groupLabel = S.groupsFor(profile)[e.group].label;
        if (groupLabel !== lastGroup) { optgroup = node('optgroup'); optgroup.label = groupLabel; select.append(optgroup); lastGroup = groupLabel; }
        const option = node('option', '', `${e.title}${!e.value ? '（空）' : ''}`); option.value = e.path; optgroup.append(option);
      }
      select.value = p.path;
      const preview = node('textarea', 'preview'); preview.rows = 2; preview.value = p.value; preview.setAttribute('aria-label', `${p.field.label}待填内容`);
      preview.placeholder = '选择资料字段，或在这里输入本次填写内容';
      const note = node('span', 'field-note'); p.note = note;
      select.addEventListener('change', () => {
        p.path = select.value; p.value = entryFor(p.path)?.value || ''; preview.value = p.value;
        p.reason = entryFor(p.path)?.sensitive ? '敏感信息，请核对并单独勾选' : '手动选择，请核对并勾选'; p.result = ''; p.checked = false; refreshSummary();
      });
      preview.addEventListener('input', () => { p.value = preview.value; p.checked = false; p.result = ''; p.reason = '内容已修改，请核对并勾选'; refreshSummary(); });
      const copy = node('button', 'subtle', '复制内容'); copy.addEventListener('click', () => task(async () => { await navigator.clipboard.writeText(preview.value); status(`已复制“${p.field.label}”的内容。`); }));
      if (S.blocked(p.field)) { select.disabled = true; preview.readOnly = true; }
      const foot = node('div', 'row-foot'); foot.append(note, copy);
      row.append(select, preview, foot); $('rows').append(row);
    }
    if (!plan.length) $('rows').append(node('p', 'empty', '未发现可见表单。请打开填写页 / 展开经历栏后重新识别。'));
    refreshSummary();
  }
  $('scan').addEventListener('click', () => task(async () => {
    status('正在识别字段…'); snapshot = await run('scan'); await buildPlan();
    status(`已识别“${snapshot.title || '当前页面'}”。检查内容后再填写；新增经历块后请重新识别。`);
  }));
  $('check-pending').onclick = () => task(async () => { snapshot = await run('scan'); await buildPlan(); status('已重新检查当前可见字段。点击待处理项可定位到网页输入框。'); });
  $('only-pending').onchange = refreshPending;
  $('fill').addEventListener('click', () => task(async () => {
    const items = plan.filter(p => p.checked && readyFor(p).ok).map(p => ({ uid: p.field.uid, value: p.value, before: p.field.current, fingerprint: S.fingerprint(p.field), isDate: Boolean(entryFor(p.path)?.date) }));
    if (!items.length) return;
    status(`正在填写 ${items.length} 项…`);
    const result = await run('fill', { session: snapshot.session, items, overwrite: $('overwrite').checked, dateStyle: $('date-style').value });
    let filled = 0;
    for (const r of result.results) {
      const p = plan.find(x => x.field.uid === r.uid);
      if (p) { p.result = r.reason; p.checked = false; if (r.ok) { filled++; const written = readyFor(p).value || p.value; p.field.empty = false; p.field.current = written; } }
    }
    snapshot.undoAvailable = result.undoAvailable; refreshSummary();
    status(`已填写 ${filled} 项，跳过 ${items.length - filled} 项。请核对网页内容，并由你点击保存 / 提交。再次填写请重新识别。`);
  }));
  $('undo').addEventListener('click', () => task(async () => {
    const result = await run('undo'); snapshot = await run('scan'); await buildPlan();
    status(`已撤销 ${result.restored} 项；${result.skipped} 项因后续修改或页面变化而保留。`);
  }));
  $('remember').addEventListener('click', () => task(async () => {
    const rules = await Store.get('rules', {}), saved = {};
    for (const p of plan) if (p.path && !p.field.unsupported && !S.blocked(p.field)) saved[S.fingerprint(p.field)] = p.path;
    rules[snapshot.url] = saved;
    if (Object.keys(rules).length > 100) delete rules[Object.keys(rules)[0]];
    await Store.set('rules', rules); status('已记住本页面结构的字段对应关系；网页结构变化后需重新校正。');
  }));
  $('diagnostic').addEventListener('click', () => {
    const fields = snapshot.fields.map(f => ({ label: f.label, name: f.name, id: f.id, section: f.section, type: f.type, required: f.required, maxLength: f.maxLength, optionCount: f.options.length, unsupported: f.unsupported }));
    Store.download('网申字段诊断.json', { version: 1, host: new URL(snapshot.url).host, fields, inaccessibleFrames: snapshot.inaccessibleFrames });
    status('已导出字段结构，不含填写值或资料库。分享前可检查标签是否含个人信息。');
  });
  $('overwrite').addEventListener('change', refreshSummary);
  $('date-style').addEventListener('change', refreshSummary);
  $('edit').addEventListener('click', () => { if (globalThis.chrome?.runtime?.openOptionsPage) chrome.runtime.openOptionsPage(); else window.open('options.html', '_blank'); });
  $('import').addEventListener('click', () => $('file').click());
  $('file').addEventListener('change', () => task(async () => {
    const file = $('file').files[0]; if (!file) return;
    if (file.size > 1024 * 1024) throw Error('资料文件最大为 1 MB。');
    profile = S.validateProfile(JSON.parse(await file.text())); ApplicationLibrary.active(library).profile = profile; await ApplicationLibrary.save(library);
    selectors(); if (snapshot) await buildPlan(false); status('资料已导入本机。可以先到“管理资料”检查、补充。'); $('file').value = '';
  }));
  async function reloadProfile() {
    if (busy) { pendingRefresh = true; return; }
    await task(async () => { const next = await ApplicationLibrary.load(); profile = ApplicationLibrary.active(next).profile; for (const key of Object.keys(preferred)) delete preferred[key]; selectors(); if (snapshot) await buildPlan(false); status('资料库已更新，请重新核对对应关系和勾选项。'); });
  }
  if (globalThis.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.library) reloadProfile(); });
  window.addEventListener('storage', event => { if (event.key === 'application-demo:library') reloadProfile(); });
  selectors(); controls();
})();


(async function () {
  'use strict';
  const S = ApplicationSchema, L = ApplicationLibrary, Store = ApplicationStorage, $ = id => document.getElementById(id);
  let library = await L.load(), dirty = false, importing = false, staged = [], candidate = S.emptyProfile();
  let rawSelection = { start: 0, end: 0 };
  const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
  const status = text => { $('status').textContent = text; };
  const active = () => L.active(library);
  const markDirty = () => { dirty = true; status('有未保存的资料修改'); };
  async function attempt(fn) { try { await fn(); } catch (e) { status(`操作失败：${e.message}`); } }
  function editor(profile, target, prefix, changed) {
    target.replaceChildren();
    for (const [group, config] of Object.entries(S.groups)) {
      const section = node('section', 'editor-section'); section.id = `${prefix}-${group}`;
      const title = node('div', 'section-head'); title.append(node('h2', '', config.label));
      if (config.repeat) {
        const add = node('button', 'secondary', '+ 添加一条');
        add.onclick = () => { if (profile[group].length >= 30) return status('最多 30 条'); profile[group].push(S.blankRecord(group)); changed(); editor(profile, target, prefix, changed); if (prefix === 'candidate') assignmentOptions(); };
        title.append(add);
      }
      section.append(title);
      const rows = config.repeat ? profile[group] : [profile[group]];
      if (!rows.length) section.append(node('p', 'muted', '暂无记录，可以留空或添加。'));
      rows.forEach((record, index) => {
        const card = node('div', 'record');
        if (config.repeat) {
          const heading = node('div', 'section-head'); heading.append(node('strong', '', `${index + 1}. ${record.name || record.school || record.organization || config.label}`));
          const remove = node('button', 'subtle danger', '删除这一条');
          remove.onclick = () => { if (confirm('删除这条记录？')) { profile[group].splice(index, 1); changed(); editor(profile, target, prefix, changed); if (prefix === 'candidate') assignmentOptions(); } }; heading.append(remove); card.append(heading);
        }
        const grid = node('div', 'editor-grid');
        for (const f of config.fields) {
          const label = node('label', f.multiline ? 'wide' : ''); label.append(node('span', '', f.label + (f.sensitive ? '（逐项核对）' : '')));
          const input = node(f.multiline ? 'textarea' : 'input'); if (f.multiline) input.rows = 4; else input.type = 'text';
          input.value = record[f.key]; input.maxLength = 15000; input.placeholder = f.date ? 'YYYY-MM 或 YYYY-MM-DD；按真实日期' : '未提供可留空';
          input.setAttribute('aria-label', `${prefix === 'candidate' ? '草稿 ' : ''}${config.label}${config.repeat ? ` ${index + 1}` : ''} ${f.label}`);
          input.oninput = () => { record[f.key] = input.value; changed(); };
          label.append(input); grid.append(label);
        }
        card.append(grid); section.append(card);
      });
      target.append(section);
    }
  }
  function render() {
    $('version').replaceChildren(); library.profiles.forEach(p => { const option = node('option', '', p.name); option.value = p.id; $('version').append(option); }); $('version').value = library.activeId; $('version-name').value = active().name;
    $('nav').replaceChildren();
    for (const [g, config] of Object.entries(S.groups)) { const link = node('a', '', config.label); link.href = `#group-${g}`; $('nav').append(link); }
    for (const [key, label] of [['sources', '导入原文'], ['attachments', '电子附件'], ['applications', '投递记录'], ['ai-settings', 'AI 设置']]) { const link = node('a', '', label); link.href = `#${key}`; $('nav').append(link); }
    $('review').replaceChildren(); const meta = active().profile._meta;
    if (meta.source) $('review').append(node('strong', '', `来源：${meta.source}`)); meta.reviewNotes.forEach(n => $('review').append(node('p', '', n))); $('review').hidden = !meta.source && !meta.reviewNotes.length;
    editor(active().profile, $('editor'), 'group', markDirty); renderSources(); renderAttachments(); renderApplications();
  }
  function renderSources() {
    $('source-list').replaceChildren();
    library.sources.forEach(source => { const detail = node('details', 'record'); detail.append(node('summary', '', source.name)); const text = node('textarea'); text.rows = 10; text.value = source.text; text.readOnly = true; text.className = 'source-text'; const copy = node('button', 'secondary', '复制全部原文'); copy.onclick = () => attempt(async () => { await navigator.clipboard.writeText(source.text); status('已复制原文'); }); detail.append(text, copy); $('source-list').append(detail); });
    if (!library.sources.length) $('source-list').append(node('p', 'muted', '未导入材料。'));
  }
  function renderAttachments() {
    $('attachment-list').replaceChildren();
    for (const item of library.attachments) {
      const row = node('div', 'attachment-row'); row.append(node('strong', '', item.name), node('span', 'muted', `${(item.size / 1024).toFixed(0)} KB`));
      const category = node('input'); category.value = item.category; category.placeholder = '用途：简历 / 学籍 / 成绩 / 证书'; category.setAttribute('aria-label', `${item.name}附件用途`); category.oninput = () => { item.category = category.value; markDirty(); };
      const copy = node('button', 'secondary', '复制文件名'); copy.onclick = () => attempt(async () => { await navigator.clipboard.writeText(item.name); status('文件名已复制'); });
      const download = node('button', 'secondary', '下载'); download.onclick = () => attempt(async () => { const file = await L.attachment('get', item.id); if (!file) throw Error('这里只有附件清单，请重新选择原文件'); const url = URL.createObjectURL(file), link = node('a'); link.href = url; link.download = item.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
      const remove = node('button', 'subtle danger', '删除'); remove.onclick = () => attempt(async () => { if (!confirm(`移除本机附件“${item.name}”？`)) return; await L.attachment('delete', item.id); library.attachments = library.attachments.filter(x => x.id !== item.id); await L.save(library, false); renderAttachments(); }); row.append(category, copy, download, remove); $('attachment-list').append(row);
    }
    if (!library.attachments.length) $('attachment-list').append(node('p', 'muted', '没有附件。'));
  }
  function renderApplications() {
    $('application-list').replaceChildren();
    for (const item of library.applications) {
      const card = node('div', 'record'), head = node('div', 'section-head'); head.append(node('strong', '', `${item.company} · ${item.role}`), node('span', 'muted', `${item.date} · ${item.profileName}`));
      const select = node('select'); ['准备中', '已投递', '笔试', '面试', '录用', '未通过'].forEach(s => select.append(node('option', '', s))); select.value = item.status; select.onchange = () => { item.status = select.value; markDirty(); };
      const note = node('textarea'); note.rows = 2; note.value = item.note; note.placeholder = '截止时间、下一步、备注'; note.className = 'source-text'; note.oninput = () => { item.note = note.value; markDirty(); };
      const remove = node('button', 'subtle danger', '删除记录'); remove.onclick = () => { if (confirm('删除这条投递记录？')) { library.applications = library.applications.filter(x => x.id !== item.id); markDirty(); renderApplications(); } }; card.append(head, select, note, remove); $('application-list').append(card);
    }
    if (!library.applications.length) $('application-list').append(node('p', 'muted', '在右侧面板中手动记录投递，状态不会根据填写动作自动改变。'));
  }
  $('save').onclick = () => attempt(async () => { active().name = $('version-name').value.trim() || '未命名版本'; await L.save(library); dirty = false; status('资料、附件清单和投递记录已保存'); });
  $('version-name').oninput = () => { active().name = $('version-name').value; markDirty(); };
  $('version').onchange = () => attempt(async () => { if (dirty && !confirm('切换前保存当前修改？选择取消则继续留在当前版本。')) { $('version').value = library.activeId; return; } library.activeId = $('version').value; await L.save(library); dirty = false; render(); status('已切换岗位版本'); });
  function createVersion(clone) { if (library.profiles.length >= 20) return status('最多 20 个版本'); const record = { id: L.id(), name: clone ? `${active().name}（副本）` : '新岗位资料', profile: clone ? structuredClone(active().profile) : S.emptyProfile() }; library.profiles.push(record); library.activeId = record.id; markDirty(); render(); }
  $('clone-version').onclick = () => createVersion(true); $('blank-version').onclick = () => createVersion(false);
  $('remove-version').onclick = () => { if (library.profiles.length <= 1) return status('至少保留一个版本；可以清空资料'); if (confirm(`删除版本“${active().name}”？保存后生效。`)) { library.profiles = library.profiles.filter(p => p.id !== library.activeId); library.activeId = library.profiles[0].id; markDirty(); render(); } };
  $('export').onclick = () => attempt(async () => { Store.download('网申资料库备份_v2.json', L.validate(library)); status('已导出资料库和清单；不包含 API Key 或附件本体'); });
  $('clear').onclick = () => attempt(async () => { if (!confirm('清空本机所有资料版本、原文、附件、投递记录和规则？磁盘上的文件不受影响。')) return; await L.attachment('clear'); await Store.remove('profile'); await Store.remove('rules'); library = L.emptyLibrary(); await L.save(library); dirty = false; render(); status('资料库已清空；AI 配置可单独清除'); });
  $('import').onclick = () => $('file').click();
  $('close-import').onclick = () => { if (importing) { $('import-status').textContent = '正在本机识别，请完成后关闭'; return; } $('import-dialog').close(); staged = []; };
  $('import-dialog').addEventListener('cancel', event => { if (importing) event.preventDefault(); });
  function assignmentOptions() {
    const old = $('assign-field').value; $('assign-field').replaceChildren(); S.entries(candidate).forEach(e => { const option = node('option', '', e.title); option.value = e.path; $('assign-field').append(option); }); if (S.entries(candidate).some(e => e.path === old)) $('assign-field').value = old;
  }
  function rawSource() { $('import-raw').value = staged[Number($('source-picker').value)]?.text || ''; rawSelection = { start: 0, end: 0 }; }
  $('source-picker').onchange = rawSource;
  $('import-raw').addEventListener('select', () => { rawSelection = { start: $('import-raw').selectionStart, end: $('import-raw').selectionEnd }; });
  $('assign-selection').onclick = () => {
    const value = $('import-raw').value.slice(rawSelection.start, rawSelection.end);
    if (!value) { $('import-status').textContent = '先在提取原文里选中需要的文字'; return; }
    const entry = S.entries(candidate).find(e => e.path === $('assign-field').value); if (!entry) return;
    (S.groups[entry.group].repeat ? candidate[entry.group][entry.index] : candidate[entry.group])[entry.key] = value;
    editor(candidate, $('candidate-editor'), 'candidate', () => {}); $('import-status').textContent = `已放入 ${entry.title}；仍需点击“确认并应用导入”`;
  };
  $('file').onchange = () => attempt(async () => {
    const files = [...$('file').files]; if (!files.length) return;
    if (files.length > 8 || files.reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024) throw Error('一次最多 8 个材料，总计不超过 100 MB');
    if (dirty && !confirm('导入前保存当前未保存修改？取消可先自行整理。')) return;
    if (dirty) { await L.save(library); dirty = false; }
    staged = []; candidate = S.emptyProfile(); importing = true; $('apply-import').disabled = true; $('import-review').hidden = true; $('import-dialog').showModal();
    try {
      for (const file of files) {
        $('import-status').textContent = `正在本机读取 ${file.name}…`;
        const result = await ApplicationImporter.read(file, message => { $('import-status').textContent = `${file.name} · ${message}`; }, $('force-ocr').checked);
        staged.push(result); if (result.profile) candidate = L.merge(candidate, result.profile);
      }
      if (staged.some(x => x.backup) && staged.length !== 1) throw Error('资料库备份请单独导入，不要与其他材料混选');
      $('source-picker').replaceChildren(); staged.forEach((s, i) => { const option = node('option', '', s.name); option.value = String(i); $('source-picker').append(option); }); rawSource();
      if (staged[0]?.backup) { $('import-status').textContent = '这是完整资料库备份，确认后会替换当前资料库（附件只恢复清单）'; $('import-review').hidden = true; }
      else { assignmentOptions(); editor(candidate, $('candidate-editor'), 'candidate', () => {}); $('import-review').hidden = false; $('import-status').textContent = `已提取 ${staged.length} 个材料。请核对 / 修改草稿，空缺项不会凭空补齐。`; }
      $('apply-import').disabled = false;
    } catch (error) { $('import-status').textContent = `识别失败：${error.message}。当前资料未被替换。`; staged = []; throw error; }
    finally { importing = false; $('file').value = ''; }
  });
  async function putFiles(files, destination) {
    const newIds = [];
    if (destination.attachments.length + files.length > 100) throw Error('附件库最多 100 个文件');
    try { for (const file of files) { if (file.size > 30 * 1024 * 1024) throw Error('每个附件最大 30 MB'); const key = L.id(); await L.attachment('put', key, file); newIds.push(key); destination.attachments.push({ id: key, name: file.name, category: '', type: file.type, size: file.size, createdAt: new Date().toISOString() }); } return newIds; }
    catch (e) { for (const key of newIds) await L.attachment('delete', key); throw e; }
  }
  $('apply-import').onclick = () => attempt(async () => {
    if (importing || !staged.length) return; const next = structuredClone(library); let newIds = [];
    try {
      if (staged[0].backup) { if (!confirm('用备份替换全部岗位版本、原文和投递记录？现有文件本体保留，但清单按备份恢复。')) return; const restored = L.validate(staged[0].backup); await L.save(restored); library = restored; }
      else {
        const draft = S.validateProfile(candidate), mode = $('import-mode').value;
        if (mode === 'new') { if (next.profiles.length >= 20) throw Error('最多 20 个版本'); const p = { id: L.id(), name: staged[0].name.replace(/\.[^.]+$/, '').slice(0, 80), profile: draft }; next.profiles.push(p); next.activeId = p.id; }
        else L.active(next).profile = mode === 'replace' ? draft : L.merge(L.active(next).profile, draft);
        for (const s of staged) if (s.text) next.sources.push({ id: L.id(), name: s.name, text: s.text, format: s.format, createdAt: new Date().toISOString() });
        L.validate(next);
        if ($('keep-files').checked) newIds = await putFiles(staged.map(s => s.file), next);
        await L.save(next); library = next;
      }
      dirty = false; staged = []; $('import-dialog').close(); render(); status('已按你的确认导入到本机，可以继续修改并保存。');
    } catch (e) { for (const key of newIds) await L.attachment('delete', key); throw e; }
  });
  $('add-attachment').onclick = () => $('attachment-file').click();
  $('attachment-file').onchange = () => attempt(async () => { const files = [...$('attachment-file').files]; if (!files.length) return; const next = structuredClone(library), added = await putFiles(files, next); try { await L.save(next, false); library = next; renderAttachments(); status('附件已保存到本机'); } catch (e) { for (const key of added) await L.attachment('delete', key); throw e; } finally { $('attachment-file').value = ''; } });
  $('save-ai').onclick = async () => {
    try {
      const checked = ApplicationAI.endpoint($('ai-endpoint').value);
      const grant = globalThis.chrome?.permissions ? await chrome.permissions.request({ origins: [checked.permission] }) : confirm(`允许演示向 ${checked.url} 发起 AI 请求？`);
      await ApplicationAI.save({ endpoint: checked.url, model: $('ai-model').value, key: $('ai-key').value, rememberKey: $('remember-key').checked }, grant); $('ai-key').value = ''; $('ai-status').textContent = '配置已保存。仅主动点击精简时调用。';
    } catch (e) { $('ai-status').textContent = e.message; }
  };
  $('clear-ai').onclick = () => attempt(async () => { await ApplicationAI.clear(); $('ai-endpoint').value = ''; $('ai-model').value = ''; $('ai-key').value = ''; $('remember-key').checked = false; $('ai-status').textContent = 'AI 配置与 Key 已清除'; });
  const ai = await ApplicationAI.get(); $('ai-endpoint').value = ai.endpoint; $('ai-model').value = ai.model; $('remember-key').checked = ai.rememberKey; $('ai-status').textContent = ai.key ? '已有 Key（不显示）。修改时重新填写。' : '尚未配置 Key';
  window.addEventListener('beforeunload', event => { if (dirty || importing) { event.preventDefault(); event.returnValue = ''; } });
  render();
})();

(async function () {
  const S = ApplicationSchema, L = ApplicationLibrary, U = ApplicationUX, Store = ApplicationStorage, $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let library = await L.load(), busy = false, draftDate = false, aiController, target = null, editingKey = '', state = {}, stateTimer, stateChain = Promise.resolve();
  const status = message => { $('status').textContent = message; };
  const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };
  const profile = () => L.active(library).profile;
  const keyFor = entry => U.entryKey(entry, profile());
  async function command(action, payload) {
    if (globalThis.ApplicationDemoBridge) return ApplicationDemoBridge(action, payload);
    const response = await chrome.runtime.sendMessage({ type: 'application-panel', tabId: Number(params.get('tab')), nonce: params.get('nonce'), action, payload });
    if (!response?.ok) throw Error(response?.error || '请点击工具栏重新打开助手'); return response.result;
  }
  function controls() { document.querySelectorAll('button').forEach(button => { if (button.id !== 'ai-cancel') button.disabled = busy; }); $('profile').disabled = busy; }
  async function attempt(fn) { if (busy) return; busy = true; controls(); try { await fn(); } catch (e) { status(e.name === 'AbortError' ? '操作已取消或超时' : e.message); } finally { busy = false; controls(); } }
  function snapshotState() {
    return { ...state, search: $('search').value, category: $('category').value, filter: $('quick-filter').value,
      draft: $('draft').value, aiResult: $('ai-result').value, limit: $('limit').value, mode: $('insert-mode').value,
      workbench: $('workbench').open, editingKey, draftDate };
  }
  function persistState() {
    clearTimeout(stateTimer); const id = library.activeId, value = snapshotState();
    stateChain = stateChain.catch(() => {}).then(async () => { if (!(await L.load()).profiles.some(p => p.id === id)) return; await Store.set('panelState:' + id, value); if (!(await L.load()).profiles.some(p => p.id === id)) await Store.remove('panelState:' + id); });
    stateChain.then(() => { if (library.activeId === id) $('draft-status').textContent = '草稿已保存到本机'; }).catch(e => { $('draft-status').textContent = '草稿保存失败：' + e.message; });
    return stateChain;
  }
  function scheduleState() { $('draft-status').textContent = '正在保存草稿…'; clearTimeout(stateTimer); stateTimer = setTimeout(persistState, 250); }
  async function restoreState() {
    clearTimeout(stateTimer); state = await Store.get('panelState:' + library.activeId, {});
    for (const [id, value] of Object.entries({ search: state.search || '', category: state.category || '', 'quick-filter': state.filter || 'all', draft: state.draft || '', 'ai-result': state.aiResult || '', limit: state.limit || '300', 'insert-mode': state.mode || 'replace' })) $(id).value = value;
    editingKey = state.editingKey || ''; draftDate = Boolean(state.draftDate); $('workbench').open = Boolean(state.workbench); count();
    $('draft-status').textContent = state.draft ? '已恢复上次草稿' : '';
  }
  function render() {
    const active = L.active(library); $('profile').replaceChildren();
    library.profiles.forEach(p => { const option = node('option', '', p.name); option.value = p.id; $('profile').append(option); }); $('profile').value = active.id;
    const category = $('category').value; $('category').replaceChildren(node('option', '', '全部分类'));
    for (const [key, config] of Object.entries(S.groups)) { const option = node('option', '', config.label); option.value = key; $('category').append(option); }
    $('category').value = category; renderCards(); renderRecommended();
  }
  function remember(entry) { const key = keyFor(entry); state.recent = [key, ...(state.recent || []).filter(k => k !== key)].slice(0, 20); scheduleState(); }
  function edit(entry, value = entry.value) { $('draft').value = value; editingKey = keyFor(entry); draftDate = Boolean(entry.date); $('workbench').open = true; count(); scheduleState(); $('draft').focus(); }
  function card(entry, suggestion = false) {
    const e = entry, key = keyFor(e), article = node('article', suggestion ? 'suggestion-card' : 'quick-card'), head = node('div', 'card-title');
    head.append(node('strong', '', e.title)); if (e.sensitive) head.append(node('span', 'badge warn', '需核对'));
    const pin = node('button', 'subtle pin', (state.pinned || []).includes(key) ? '★' : '☆'); pin.setAttribute('aria-label', `置顶 ${e.title}`); pin.setAttribute('aria-pressed', String((state.pinned || []).includes(key)));
    pin.onclick = () => { const set = new Set(state.pinned || []); set.has(key) ? set.delete(key) : set.add(key); state.pinned = [...set].slice(-100); scheduleState(); renderCards(); renderRecommended(); }; head.append(pin);
    const buttons = node('div', 'toolbar'), copy = node('button', 'secondary', '复制'), insert = node('button', 'primary', '插入'), editing = node('button', 'subtle', '编辑');
    copy.onclick = () => attempt(async () => { await navigator.clipboard.writeText(e.value); remember(e); status(`已复制：${e.title}`); });
    const expectedTarget = target?.uid;
    insert.onclick = () => insertText(e.value, Boolean(e.date), e, suggestion ? expectedTarget : undefined);
    editing.onclick = () => edit(e); buttons.append(editing, copy, insert);
    article.append(head, node('div', 'card-value', e.value), buttons);
    const variants = (library.textVariants || []).filter(v => v.profileId === library.activeId && v.entryKey === key);
    if (variants.length) { const versions = node('div', 'variants'); for (const variant of variants) { const button = node('button', 'subtle', `${variant.label} · ${variant.value.length}字`); button.onclick = () => edit(e, variant.value); versions.append(button); } article.append(versions); }
    return article;
  }
  function renderCards() {
    $('cards').replaceChildren(); const query = $('search').value.toLowerCase(), category = $('category').value, filter = $('quick-filter').value;
    const entries = L.quickEntries(profile()).filter(e => (!category || e.group === category) && `${e.title} ${e.value}`.toLowerCase().includes(query) && (filter === 'all' || (state[filter === 'pinned' ? 'pinned' : 'recent'] || []).includes(keyFor(e))));
    if (filter !== 'all') entries.sort((a, b) => (state[filter === 'pinned' ? 'pinned' : 'recent'] || []).indexOf(keyFor(a)) - (state[filter === 'pinned' ? 'pinned' : 'recent'] || []).indexOf(keyFor(b)));
    for (const group of U.groups(entries, profile())) {
      const details = node('details', 'experience-group'); details.open = Boolean(query || category || filter !== 'all' || (state.groupOpen?.[group.key] ?? !S.groups[group.entries[0].group].repeat));
      details.append(node('summary', '', group.title)); group.entries.forEach(e => details.append(card(e)));
      details.addEventListener('click', event => { if (event.target.tagName === 'SUMMARY') setTimeout(() => { state.groupOpen = { ...state.groupOpen, [group.key]: details.open }; scheduleState(); }, 0); }); $('cards').append(details);
    }
    if (!entries.length) $('cards').append(node('p', 'empty', query || filter !== 'all' ? '没有匹配内容。可清除搜索或切回“全部资料”。' : '资料库是空的。点击“导入材料”，由你选择简历或证书，核对后保存。'));
  }
  function renderRecommended() { const entries = U.recommend(profile(), target); $('recommended-cards').replaceChildren(...entries.map(e => card(e, true))); $('recommendations').hidden = !entries.length; }
  const insertText = (value, isDate = false, entry, targetUid) => attempt(async () => { const result = await command('insertFocused', { value, isDate, mode: $('insert-mode').value, targetUid }); if (entry) remember(entry); status(`已插入“${result.label}”，可撤销。`); });
  function count() {
    const info = U.lengthInfo($('draft').value, target, $('insert-mode').value);
    $('count').textContent = info.limit ? `${info.length} / ${info.limit} 字符${info.exceeded ? ' · 已超出，请精简后插入' : ''}${$('insert-mode').value === 'cursor' ? '（含网页保留内容）' : ''}` : `${info.length} 字符 · 网页未提供明确字符上限`;
    $('count').classList.toggle('over-limit', info.exceeded);
  }
  const manage = hash => { if (globalThis.chrome?.runtime?.getURL) chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) }); else window.open(`options.html${hash}`, '_blank'); };
  $('manage').onclick = () => manage(''); $('import-materials').onclick = () => manage('#import-materials');
  $('profile').onchange = () => attempt(async () => { const id = $('profile').value; await persistState(); library = await L.update(current => { current.activeId = id; return current; }, true); await restoreState(); render(); if (!$('batch').hidden) $('batch').src = 'popup.html' + location.search; status('已切换岗位版本'); });
  for (const id of ['search', 'category', 'quick-filter']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { renderCards(); scheduleState(); });
  $('search').onkeydown = event => { if (event.key === 'ArrowDown') { event.preventDefault(); $('cards').querySelector('.quick-card .toolbar button')?.focus(); } if (event.key === 'Escape') { $('search').value = ''; renderCards(); scheduleState(); } };
  $('draft').oninput = () => { draftDate = false; count(); scheduleState(); };
  $('insert-mode').onchange = () => { count(); scheduleState(); };
  $('limit').oninput = scheduleState; $('workbench').ontoggle = scheduleState;
  $('draft-copy').onclick = () => attempt(async () => { await navigator.clipboard.writeText($('draft').value); status('已复制工作区内容'); });
  $('draft-insert').onclick = () => insertText($('draft').value, draftDate);
  $('quick-undo').onclick = () => attempt(async () => { const r = await command('undo'); status(`已撤销 ${r.restored} 项；${r.skipped} 项因后续修改保留`); });
  $('save-variant').onclick = () => attempt(async () => {
    if (!editingKey) throw Error('先点击资料卡的“编辑”，选择这个文字版本所属的字段');
    if (!$('draft').value.trim()) throw Error('先填写文字版本内容');
    const label = $('variant-label').value, value = $('draft').value, profileId = library.activeId, entryKey = editingKey;
    library = await L.update(current => { const rows = current.textVariants || []; const found = rows.find(v => v.profileId === profileId && v.entryKey === entryKey && v.label === label); if (found) found.value = value; else rows.push({ id: L.id(), profileId, entryKey, label, value }); current.textVariants = rows; return current; });
    renderCards(); renderRecommended(); await persistState(); status(`已保存${label}，原资料保留；同名版本再次保存会更新内容。`);
  });
  $('tab-quick').onclick = () => { $('quick-view').hidden = false; $('batch').hidden = true; $('tab-quick').classList.add('selected'); $('tab-batch').classList.remove('selected'); };
  $('tab-batch').onclick = () => { $('quick-view').hidden = true; $('batch').hidden = false; $('batch').onload = () => { if (globalThis.ApplicationDemoBridge) $('batch').contentWindow.ApplicationDemoBridge = ApplicationDemoBridge; }; $('batch').src = 'popup.html' + location.search; $('tab-batch').classList.add('selected'); $('tab-quick').classList.remove('selected'); };
  $('ai-shorten').onclick = () => attempt(async () => {
    const selected = $('draft').value; if (!selected.trim()) throw Error('先把需要精简的那段文字放入工作区');
    aiController = new AbortController(); $('ai-cancel').hidden = false; status('正在生成精简建议，只发送工作区这一段文字…');
    try { const result = await ApplicationAI.shorten(selected, Number($('limit').value), AbortSignal.any([aiController.signal, AbortSignal.timeout(45000)])); $('ai-result').value = result.text; scheduleState(); status(result.withinLimit ? '建议已生成，请核对事实后采用' : '建议仍超出目标长度，请继续编辑；没有自动截断'); } finally { $('ai-cancel').hidden = true; }
  });
  $('ai-cancel').onclick = () => aiController?.abort();
  $('ai-result').oninput = scheduleState;
  $('ai-adopt').onclick = () => { if (!$('ai-result').value) return status('还没有精简结果'); $('draft').value = $('ai-result').value; draftDate = false; count(); scheduleState(); status('已放入工作区，原资料保留。检查后可复制 / 插入。'); };
  $('application-date').value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  $('save-application').onclick = () => attempt(async () => {
    if (!$('company').value.trim() || !$('job').value.trim()) throw Error('请填写公司和岗位');
    let url = ''; try { url = (await command('scan')).url; } catch {}
    const item = { id: L.id(), company: $('company').value.trim(), role: $('job').value.trim(), date: $('application-date').value, status: $('application-status').value, profileName: L.active(library).name, url, note: '' };
    library = await L.update(current => { current.applications.unshift(item); return current; }); status('投递记录已保存，可在资料库中查看 / 修改');
  });
  $('panel-width').value = String(await Store.get('panelWidth', 374)); $('compact').checked = await Store.get('panelCompact', false); document.body.classList.toggle('compact', $('compact').checked);
  $('panel-width').onchange = () => attempt(async () => { const width = Number($('panel-width').value); await command('resize', { width }); await Store.set('panelWidth', width); status('已调整并记住面板宽度'); });
  $('compact').onchange = () => attempt(async () => { document.body.classList.toggle('compact', $('compact').checked); await Store.set('panelCompact', $('compact').checked); });
  async function reloadLibrary() { const before = library.activeId; const next = await L.load(); if (before !== next.activeId) { clearTimeout(stateTimer); await stateChain.catch(() => {}); library = next; render(); await restoreState(); } else library = next; render(); }
  if (globalThis.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.library) reloadLibrary().catch(e => status(e.message)); });
  window.addEventListener('storage', event => { if (event.key === 'application-demo:library') reloadLibrary().catch(e => status(e.message)); });
  document.addEventListener('keydown', event => { if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'Enter') { const entries = U.recommend(profile(), target).filter(e => !e.sensitive); if (entries.length === 1) { event.preventDefault(); insertText(entries[0].value, Boolean(entries[0].date), entries[0], target?.uid); } else status('推荐有多条或属于敏感资料，请手动选择后插入'); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) persistState().catch(() => {}); });
  window.addEventListener('pagehide', () => persistState().catch(() => {}));
  let checking = false;
  async function refreshTarget() {
    if (busy || checking || document.hidden) return; checking = true;
    try { const fresh = await command('focused'); const changed = JSON.stringify(target) !== JSON.stringify(fresh); const oldLimit = target?.maxLength; target = fresh;
      $('target').textContent = target ? `目标：${target.label}${target.unsupported || target.blocked ? '（请手动处理）' : ''}${target.maxLength > 0 ? ` · 最多 ${target.maxLength} 字符` : ''}` : '目标：先点击网页输入框';
      if (changed) { if (target?.maxLength > 0 && (target.maxLength !== oldLimit)) { $('limit').value = Math.max(1, Math.min(5000, target.maxLength)); scheduleState(); } count(); renderRecommended(); }
    } catch { $('target').textContent = '目标：请点击工具栏重新连接页面'; target = null; renderRecommended(); } finally { checking = false; }
  }
  render(); await restoreState(); render(); setInterval(refreshTarget, 600); refreshTarget();
})();

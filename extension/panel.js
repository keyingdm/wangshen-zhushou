(async function () {
  const S = ApplicationSchema, L = ApplicationLibrary, $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  let library = await L.load(), busy = false, draftDate = false, aiController;
  const status = message => { $('status').textContent = message; };
  const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; return el; };
  async function command(action, payload) {
    if (globalThis.ApplicationDemoBridge) return ApplicationDemoBridge(action, payload);
    const response = await chrome.runtime.sendMessage({ type: 'application-panel', tabId: Number(params.get('tab')), nonce: params.get('nonce'), action, payload });
    if (!response?.ok) throw Error(response?.error || '请点击工具栏重新打开助手'); return response.result;
  }
  function controls() { document.querySelectorAll('button').forEach(button => { if (button.id !== 'ai-cancel') button.disabled = busy; }); $('profile').disabled = busy; }
  async function attempt(fn) { if (busy) return; busy = true; controls(); try { await fn(); } catch (e) { status(e.name === 'AbortError' ? '操作已取消或超时' : e.message); } finally { busy = false; controls(); } }
  function render() {
    const active = L.active(library);
    $('profile').replaceChildren(); library.profiles.forEach(p => { const option = node('option', '', p.name); option.value = p.id; $('profile').append(option); }); $('profile').value = active.id;
    const category = $('category').value; $('category').replaceChildren(node('option', '', '全部分类'));
    for (const [key, config] of Object.entries(S.groups)) { const option = node('option', '', config.label); option.value = key; $('category').append(option); }
    $('category').value = category; renderCards();
  }
  function renderCards() {
    $('cards').replaceChildren();
    const query = $('search').value.toLowerCase(), category = $('category').value;
    const entries = L.quickEntries(L.active(library).profile).filter(e => (!category || e.group === category) && `${e.title} ${e.value}`.toLowerCase().includes(query));
    for (const e of entries) {
      const card = node('article', 'quick-card'), head = node('div', 'card-title'); head.append(node('strong', '', e.title));
      if (e.sensitive) head.append(node('span', 'badge warn', '需核对'));
      const buttons = node('div', 'toolbar');
      const copy = node('button', 'secondary', '复制'); copy.addEventListener('click', () => attempt(async () => { await navigator.clipboard.writeText(e.value); status(`已复制：${e.title}`); }));
      const insert = node('button', 'primary', '插入'); insert.addEventListener('click', () => insertText(e.value, Boolean(e.date)));
      const edit = node('button', 'subtle', '编辑'); edit.addEventListener('click', () => { $('draft').value = e.value; draftDate = Boolean(e.date); $('workbench').open = true; count(); $('draft').focus(); });
      buttons.append(edit, copy, insert); card.append(head, node('div', 'card-value', e.value), buttons); $('cards').append(card);
    }
    if (!entries.length) $('cards').append(node('p', 'empty', query ? '没有匹配内容。' : '资料库是空的。点击“导入材料”，由你选择简历或证书，核对后保存。'));
  }
  const insertText = (value, isDate = false) => attempt(async () => { const result = await command('insertFocused', { value, isDate, mode: $('insert-mode').value }); status(`已插入“${result.label}”，可撤销。`); });
  function count() { const value = $('draft').value; $('count').textContent = `${value.length} 字符 · 去除空白 ${value.replace(/\s/g, '').length} 字符；网页限制按实际字符计算`; }
  const manage = hash => { if (globalThis.chrome?.runtime?.getURL) chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${hash}`) }); else window.open(`options.html${hash}`, '_blank'); };
  $('manage').onclick = () => manage(''); $('import-materials').onclick = () => manage('#import-materials');
  $('profile').onchange = () => attempt(async () => { library.activeId = $('profile').value; await L.save(library); render(); if (!$('batch').hidden) $('batch').src = 'popup.html' + location.search; status('已切换岗位版本'); });
  $('search').oninput = renderCards; $('category').onchange = renderCards;
  $('draft').oninput = () => { draftDate = false; count(); };
  $('draft-copy').onclick = () => attempt(async () => { await navigator.clipboard.writeText($('draft').value); status('已复制工作区内容'); });
  $('draft-insert').onclick = () => insertText($('draft').value, draftDate);
  $('quick-undo').onclick = () => attempt(async () => { const r = await command('undo'); status(`已撤销 ${r.restored} 项；${r.skipped} 项因后续修改保留`); });
  $('tab-quick').onclick = () => { $('quick-view').hidden = false; $('batch').hidden = true; $('tab-quick').classList.add('selected'); $('tab-batch').classList.remove('selected'); };
  $('tab-batch').onclick = () => { $('quick-view').hidden = true; $('batch').hidden = false; $('batch').onload = () => { if (globalThis.ApplicationDemoBridge) $('batch').contentWindow.ApplicationDemoBridge = ApplicationDemoBridge; }; $('batch').src = 'popup.html' + location.search; $('tab-batch').classList.add('selected'); $('tab-quick').classList.remove('selected'); };
  $('ai-shorten').onclick = () => attempt(async () => {
    const selected = $('draft').value;
    if (!selected.trim()) throw Error('先把需要精简的那段文字放入工作区');
    aiController = new AbortController(); $('ai-cancel').hidden = false; status('正在生成精简建议，只发送工作区这一段文字…');
    try { const result = await ApplicationAI.shorten(selected, Number($('limit').value), AbortSignal.any([aiController.signal, AbortSignal.timeout(45000)])); $('ai-result').value = result.text; status(result.withinLimit ? '建议已生成，请核对事实后采用' : '建议仍超出目标长度，请继续编辑；没有自动截断'); } finally { $('ai-cancel').hidden = true; }
  });
  $('ai-cancel').onclick = () => aiController?.abort();
  $('ai-adopt').onclick = () => { if (!$('ai-result').value) return status('还没有精简结果'); $('draft').value = $('ai-result').value; draftDate = false; count(); status('已放入工作区，原资料保留。检查后可复制 / 插入。'); };
  $('application-date').value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  $('save-application').onclick = () => attempt(async () => {
    if (!$('company').value.trim() || !$('job').value.trim()) throw Error('请填写公司和岗位');
    let url = ''; try { url = (await command('scan')).url; } catch {}
    library = await L.load(); library.applications.unshift({ id: L.id(), company: $('company').value.trim(), role: $('job').value.trim(), date: $('application-date').value, status: $('application-status').value, profileName: L.active(library).name, url, note: '' });
    await L.save(library, false); status('投递记录已保存，可在资料库中查看 / 修改');
  });
  if (globalThis.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener(async (changes, area) => { if (area === 'local' && changes.library) { library = await L.load(); render(); } });
  window.addEventListener('storage', async event => { if (event.key === 'application-demo:library') { library = await L.load(); render(); } });
  let checking = false;
  setInterval(async () => { if (busy || checking || document.hidden) return; checking = true; try { const target = await command('focused'); $('target').textContent = target ? `目标：${target.label}${target.unsupported || target.blocked ? '（请手动处理）' : ''}` : '目标：先点击网页输入框'; } catch { $('target').textContent = '目标：请点击工具栏重新连接页面'; } finally { checking = false; } }, 1200);
  render();
})();

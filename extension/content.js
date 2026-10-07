(function () {
  'use strict';
  if (globalThis.ApplicationAgent) return;
  const S = globalThis.ApplicationSchema;
  const registry = new Map();
  const history = [];
  let sequence = 0;
  let focusedRecord = null, selection = { start: 0, end: 0 };
  const watched = new WeakSet();
  const pageSession = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  function track(root, documentKey) {
    if (watched.has(root)) return;
    watched.add(root);
    const rememberSelection = () => {
      const el = focusedRecord?.el;
      if (el && typeof el.selectionStart === 'number' && (el.ownerDocument.activeElement === el || el.getRootNode().activeElement === el)) selection = { start: el.selectionStart, end: el.selectionEnd };
    };
    root.addEventListener('focusin', event => {
      const el = event.composedPath()[0];
      if (!el?.matches?.('input,textarea,select,[role="combobox"]') || el.closest?.('[data-application-helper]') || el.type === 'radio') return;
      focusedRecord = { el, documentKey, uid: `${pageSession}:${++sequence}`, ordinal: -1 };
      selection = { start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
    }, true);
    ['selectionchange', 'keyup', 'pointerup', 'input', 'focusout'].forEach(type => root.addEventListener(type, rememberSelection, true));
  }
  function visible(el) {
    if (!el.isConnected || !el.getClientRects().length) return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function ariaText(el) {
    return clean((el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => el.getRootNode().getElementById?.(id)?.textContent).filter(Boolean).join(' '));
  }
  function labelFor(el) {
    const labels = [...(el.labels || [])].map(l => {
      const clone = l.cloneNode(true);
      clone.querySelectorAll('input,textarea,select,button').forEach(n => n.remove());
      return clone.textContent;
    }).join(' ');
    const container = el.closest('.form-item,.ant-form-item,.el-form-item,.layui-form-item,.form-group,.field,.form-row,[data-field],td');
    const label = container?.querySelector('label,.ant-form-item-label,.el-form-item__label,.layui-form-label,.field-label,.col-form-label');
    const cell = el.closest('td'), previous = cell?.previousElementSibling;
    const tableLabel = previous && /^(TD|TH)$/.test(previous.tagName) && !previous.querySelector('input,select,textarea') ? previous.textContent : '';
    let result = clean(labels || el.getAttribute('aria-label') || ariaText(el) || label?.textContent || tableLabel || el.placeholder || el.name || el.id || '未标注字段');
    const normalized = S.normalize(result), splitLabels = { '籍贯': ['籍贯省份', '籍贯城市'], '现户口所在': ['户籍省份', '户籍城市'], '生源所在地': ['生源省份', '生源城市'] };
    if (container && splitLabels[normalized]) {
      const selects = [...container.querySelectorAll('select')];
      if (selects.length === 2 && selects.includes(el)) result = splitLabels[normalized][selects.indexOf(el)];
    }
    return result;
  }
  function sectionFor(el) {
    let fallback = '';
    for (let parent = el.parentElement; parent && parent.tagName !== 'BODY'; parent = parent.parentElement) {
      const explicit = parent.getAttribute('data-section') || parent.getAttribute('aria-label');
      const heading = [...parent.children].find(n => /^(LEGEND|H[1-6])$/.test(n.tagName) || n.classList.contains('section-title'));
      const title = clean(explicit || heading?.textContent);
      if (!fallback && title) fallback = title;
      if (S.sectionGroup(title)) return title;
    }
    return fallback;
  }
  function radioLabel(elements) {
    const first = elements[0];
    const group = first.closest('[role=radiogroup],fieldset,.form-item,.ant-form-item,.el-form-item,.form-group,.field');
    const legend = group?.querySelector('legend,.field-label,.ant-form-item-label,.el-form-item__label');
    return clean(group?.getAttribute('aria-label') || legend?.textContent || first.name || '单选项');
  }
  function valueOf(record) {
    if (record.elements) return record.elements.find(e => e.checked)?.value || '';
    return record.el.value ?? '';
  }
  function describe(record) {
    const { el } = record;
    const type = record.elements ? 'radio' : el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.getAttribute('role') === 'combobox' ? 'custom' : el.type || 'text';
    let unsupported = '';
    if (type === 'custom' || el.getAttribute('role') === 'combobox') unsupported = '自定义下拉框，请复制内容后手动选择';
    else if (el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true') unsupported = '字段不可编辑';
    else if (!['text', 'email', 'tel', 'url', 'search', 'number', 'date', 'month', 'textarea', 'select', 'radio'].includes(type)) unsupported = '该控件需要手动处理';
    const options = record.elements ? record.elements.map(e => ({ label: labelFor(e), value: e.value, disabled: e.disabled })) : type === 'select' ? [...el.options].map(o => ({ label: clean(o.textContent), value: o.value, disabled: o.disabled })) : [];
    const current = valueOf(record);
    const selectedLabel = options.find(o => o.value === current)?.label || '';
    return {
      uid: record.uid, documentKey: record.documentKey, ordinal: record.ordinal,
      label: record.elements ? radioLabel(record.elements) : labelFor(el),
      section: sectionFor(el), name: el.name || '', id: el.id || '',
      autocomplete: (el.autocomplete || '').split(/\s+/).at(-1),
      type, maxLength: Number(el.getAttribute('maxlength')) || 0,
      required: Boolean(el.required), current,
      empty: !current || ((type === 'select') && /请选择|请选|select|choose/i.test(selectedLabel)),
      options, unsupported
    };
  }
  function scan(scope) {
    registry.clear();
    const fields = [];
    let inaccessibleFrames = 0;
    const visit = (root, documentKey) => {
      track(root, documentKey);
      const all = [...root.querySelectorAll('input,textarea,select,[role="combobox"]')];
      const used = new Set();
      const formIds = new Map();
      for (const el of all) {
        if (el.closest?.('[data-application-helper]')) continue;
        if (used.has(el) || !visible(el)) continue;
        if (el.tagName === 'INPUT' && ['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'file', 'password'].includes(el.type)) continue;
        const record = { el, documentKey, uid: `${pageSession}:${++sequence}`, ordinal: fields.length };
        if (el.type === 'radio') {
          if (!el.name) continue;
          if (!formIds.has(el.form)) formIds.set(el.form, formIds.size);
          const elements = all.filter(e => e.type === 'radio' && e.name === el.name && e.form === el.form && visible(e));
          elements.forEach(e => used.add(e));
          record.elements = elements;
        }
        used.add(el);
        registry.set(record.uid, record);
        fields.push(describe(record));
      }
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot && !el.closest?.('[data-application-helper]')) visit(el.shadowRoot, `${documentKey}/shadow-${el.tagName.toLowerCase()}`);
      [...root.querySelectorAll('iframe')].forEach((frame, i) => {
        if (frame.closest?.('[data-application-helper]')) return;
        if (!visible(frame)) return;
        try {
          if (frame.contentDocument) visit(frame.contentDocument, `${documentKey}/frame-${i}`);
          else inaccessibleFrames++;
        } catch { inaccessibleFrames++; }
      });
    };
    visit(scope && typeof scope.querySelectorAll === 'function' ? scope : document, 'main');
    return { session: pageSession, url: location.origin + location.pathname, title: document.title, fields, inaccessibleFrames, undoAvailable: history.length > 0 };
  }
  function dispatch(el) {
    const win = el.ownerDocument.defaultView;
    el.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
  }
  function setNative(el, value) {
    const win = el.ownerDocument.defaultView;
    const proto = el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  }
  function capture(record) { return record.elements ? record.elements.map(el => el.checked) : valueOf(record); }
  function restore(record, before) {
    if (record.elements) {
      record.elements.forEach((el, i) => { el.checked = before[i]; dispatch(el); });
    } else { setNative(record.el, before); dispatch(record.el); }
  }
  async function fill(payload) {
    if (payload.session !== pageSession) throw Error('页面已重新加载，请重新识别。');
    if (!Array.isArray(payload.items) || payload.items.length > 300) throw Error('填写任务格式无效。');
    const applied = [], results = [];
    const seen = new Set();
    for (const item of payload.items) {
      const record = registry.get(item.uid);
      const fail = reason => results.push({ uid: item.uid, ok: false, reason });
      if (!record || seen.has(item.uid) || !visible(record.el)) { fail('字段已变化，请重新识别'); continue; }
      seen.add(item.uid);
      const current = describe(record);
      if (S.fingerprint(current) !== item.fingerprint || current.current !== item.before) { fail('字段或原内容已变化，请重新识别'); continue; }
      if (!current.empty && !payload.overwrite) { fail('已有内容，已保留'); continue; }
      const ready = S.prepare(String(item.value || ''), { ...current, isDate: item.isDate }, payload.dateStyle);
      if (!ready.ok) { fail(ready.reason); continue; }
      const before = capture(record);
      try {
        if (record.elements) {
          const target = record.elements.find(el => el.value === ready.value && !el.disabled);
          if (!target) { fail('选项不可用'); continue; }
          record.elements.forEach(el => { el.checked = el === target; });
          dispatch(target);
        } else {
          setNative(record.el, ready.value);
          if (record.el.validity && !record.el.validity.valid) { restore(record, before); fail('网站校验未通过，请手动检查格式'); continue; }
          dispatch(record.el);
        }
        // Let framework state updates settle before reporting success.
        await new Promise(resolve => setTimeout(resolve, 30));
        if (!record.el.isConnected || valueOf(record) !== ready.value) {
          if (record.el.isConnected) restore(record, before);
          fail('网站重新渲染或未保留内容，请重新识别 / 手动填写'); continue;
        }
        applied.push({ record, before, written: capture(record) });
        results.push({ uid: item.uid, ok: true, reason: '已填写' });
      } catch { if (record.el.isConnected) restore(record, before); fail('网站控件拒绝填写'); }
    }
    if (applied.length) {
      history.push(applied);
      if (history.length > 10) history.shift();
    }
    return { results, undoAvailable: history.length > 0 };
  }
  function undo() {
    const last = history.pop();
    if (!last) return { restored: 0, skipped: 0, undoAvailable: false };
    let restored = 0, skipped = 0;
    for (const change of [...last].reverse()) {
      const { record, before, written } = change;
      if (!record.el.isConnected || JSON.stringify(capture(record)) !== JSON.stringify(written)) { skipped++; continue; }
      try { restore(record, before); restored++; } catch { skipped++; }
    }
    return { restored, skipped, undoAvailable: history.length > 0 };
  }
  function focused() {
    if (!focusedRecord?.el?.isConnected || !visible(focusedRecord.el)) return null;
    const field = describe(focusedRecord);
    return { label: field.label, type: field.type, unsupported: field.unsupported, blocked: S.blocked(field) };
  }
  async function insertFocused(payload) {
    const record = focusedRecord;
    if (!record?.el?.isConnected || !visible(record.el)) throw Error('先点击网页中要填写的输入框，再点“插入”。');
    const field = describe(record);
    if (S.blocked(field) || field.unsupported) throw Error(field.unsupported || '该字段需要在网页手动处理');
    let value = String(payload?.value || '');
    if (!value) throw Error('资料为空');
    if (payload.mode === 'cursor' && ['text', 'email', 'tel', 'url', 'search', 'textarea'].includes(field.type)) {
      const start = Math.min(selection.start, field.current.length), end = Math.min(selection.end, field.current.length);
      value = field.current.slice(0, start) + value + field.current.slice(end);
    }
    registry.set(record.uid, record);
    const result = await fill({ session: pageSession, overwrite: true, dateStyle: payload.dateStyle || 'dash', items: [{ uid: record.uid, before: field.current, fingerprint: S.fingerprint(field), value, isDate: Boolean(payload.isDate) }] });
    if (!result.results[0]?.ok) throw Error(result.results[0]?.reason || '插入失败');
    selection = { start: value.length, end: value.length };
    return { label: field.label, undoAvailable: result.undoAvailable };
  }
  track(document, 'main');
  globalThis.ApplicationAgent = { scan, fill, undo, focused, insertFocused };
  scan(); // Register focus tracking in accessible child frames before the first insertion.
})();

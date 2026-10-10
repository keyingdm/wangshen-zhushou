(function (root) {
  const S = root.ApplicationSchema, Store = root.ApplicationStorage;
  const id = () => crypto.randomUUID();
  function emptyLibrary() { const first = id(); return { version: 2, activeId: first, profiles: [{ id: first, name: '默认资料', profile: S.emptyProfile() }], sources: [], applications: [], attachments: [] }; }
  function validate(value) {
    if (!value || value.version !== 2 || !Array.isArray(value.profiles) || !value.profiles.length || value.profiles.length > 20) throw Error('资料库格式无效，最多 20 个岗位版本');
    const result = emptyLibrary();
    const seen = new Set();
    result.profiles = value.profiles.map(p => {
      if (!p.id || typeof p.id !== 'string' || p.id.length > 80 || seen.has(p.id)) throw Error('资料版本 ID 无效');
      seen.add(p.id);
      return { id: p.id, name: String(p.name || '未命名版本').slice(0, 80), profile: S.validateProfile(p.profile) };
    });
    result.activeId = seen.has(value.activeId) ? value.activeId : result.profiles[0].id;
    const list = (key, limit, convert) => {
      const rows = value[key] || []; if (!Array.isArray(rows) || rows.length > limit) throw Error(`${key} 数量超出限制`);
      result[key] = rows.map(convert);
    };
    list('sources', 60, x => ({ id: String(x.id || id()).slice(0, 80), name: String(x.name || '').slice(0, 200), text: String(x.text || '').slice(0, 200000), format: String(x.format || '').slice(0, 20), createdAt: String(x.createdAt || '').slice(0, 40) }));
    list('applications', 500, x => ({ id: String(x.id || id()).slice(0, 80), company: String(x.company || '').slice(0, 150), role: String(x.role || '').slice(0, 150), url: String(x.url || '').slice(0, 1000), date: String(x.date || '').slice(0, 30), status: String(x.status || '').slice(0, 50), profileName: String(x.profileName || '').slice(0, 80), note: String(x.note || '').slice(0, 3000) }));
    list('attachments', 100, x => ({ id: String(x.id || id()).slice(0, 80), name: String(x.name || '').slice(0, 200), category: String(x.category || '').slice(0, 100), type: String(x.type || '').slice(0, 100), size: Number(x.size) || 0, sha256: /^[a-f0-9]{64}$/.test(x.sha256 || '') ? x.sha256 : '', createdAt: String(x.createdAt || '').slice(0, 40) }));
    list('textVariants', 300, x => { if (typeof x.value !== 'string' || x.value.length > 15000) throw Error('文字版本必须为不超过 15000 字符的文本'); return { id: String(x.id || id()).slice(0, 80), profileId: String(x.profileId || '').slice(0, 80), entryKey: String(x.entryKey || '').slice(0, 1000), label: String(x.label || '短版').slice(0, 40), value: x.value }; });
    return result;
  }
  async function load() {
    const stored = await Store.get('library', null);
    if (stored) return validate(stored);
    const result = emptyLibrary(), old = await Store.get('profile', null);
    // Until the first write, every extension window must share the same empty baseline.
    result.activeId = result.profiles[0].id = 'default-profile';
    if (old) { result.profiles[0].profile = S.validateProfile(old); result.profiles[0].name = '原有资料'; }
    return result;
  }
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function reconcile(base, local, remote) {
    if (equal(base, local)) return remote;
    if (equal(base, remote) || equal(local, remote)) return local;
    if ([base, local, remote].every(v => v && typeof v === 'object' && !Array.isArray(v))) {
      const result = {};
      for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
        const value = reconcile(base[key], local[key], remote[key]); if (value !== undefined) result[key] = value;
      }
      return result;
    }
    if ([base, local, remote].every(v => Array.isArray(v) && v.every(r => r && typeof r.id === 'string'))) {
      const maps = [base, local, remote].map(rows => new Map(rows.map(r => [r.id, r])));
      return [...new Set([...local, ...remote].map(r => r.id))].map(key => reconcile(...maps.map(map => map.get(key)))).filter(Boolean);
    }
    throw Error('同一项资料已在另一个窗口修改。当前编辑仍保留，请先导出备份，再刷新核对。');
  }
  const lock = fn => root.navigator?.locks ? root.navigator.locks.request('application-library-write', fn) : fn();
  async function update(fn, resetRules = false) {
    return lock(async () => {
      const remote = await load(), baseline = structuredClone(remote);
      const shape = value => JSON.stringify([value.activeId, value.profiles.map(p => [p.id, p.profile._custom, ...Object.entries(identityFields).map(([g, keys]) => p.profile[g].map(row => keys.map(key => row[key]))), ...p.profile._custom.sections.filter(s => s.repeat).map(s => p.profile[s.id].map(r => r._id))])]);
      const before = shape(baseline), next = validate(await fn(remote)), removed = new Map();
      for (const old of baseline.profiles) { const current = next.profiles.find(p => p.id === old.id); const keys = new Set(current ? S.entries(current.profile, true).map(e => S.entryKey(e, current.profile)) : []); removed.set(old.id, new Set(S.entries(old.profile, true).map(e => S.entryKey(e, old.profile)).filter(key => !keys.has(key)))); }
      next.textVariants = next.textVariants.filter(v => !removed.get(v.profileId)?.has(v.entryKey));
      await Store.set('library', next); if (resetRules || before !== shape(next)) await Store.remove('rules'); return next;
    });
  }
  async function save(library, resetRules = true) { return update(() => library, resetRules); }
  async function commit(base, local, resetRules = false) { return update(remote => reconcile(base, local, remote), resetRules); }
  function active(library) { return library.profiles.find(p => p.id === library.activeId) || library.profiles[0]; }
  const identityFields = {
    education: ['school', 'start', 'end'], projects: ['name', 'start', 'end'], campus: ['name', 'start', 'end'],
    work: ['organization', 'role', 'start', 'end'], certificates: ['name', 'number', 'issuer', 'date'],
    family: ['name', 'relation'], achievements: ['name', 'number', 'type', 'date'], awards: ['name', 'date', 'issuer']
  };
  function planMerge(existing, draft) {
    const profile = S.validateProfile(existing), incoming = S.validateProfile(draft);
    const conflicts = []; let duplicates = 0, added = 0;
    const mergeFields = (old, fresh) => [...old, ...fresh.filter(f => !old.some(o => o.key === f.key))];
    const layout = profile._custom, freshLayout = incoming._custom;
    for (const s of freshLayout.sections) { const old = layout.sections.find(o => o.id === s.id); if (old) { if (old.repeat !== s.repeat) throw Error('同一自定义目录的记录类型不同，请使用新版本或备份恢复。'); old.fields = mergeFields(old.fields, s.fields); } else layout.sections.push(structuredClone(s)); }
    for (const [g, fields] of Object.entries(freshLayout.extras)) layout.extras[g] = mergeFields(layout.extras[g] || [], fields);
    layout.labels = { ...freshLayout.labels, ...layout.labels }; layout.order = [...new Set([...layout.order, ...freshLayout.order])];
    // Merging keeps the current layout and values. New-version/replacement modes use the reviewed draft directly.
    profile._custom = S.validateLayout(layout); const configs = S.groupsFor(profile, true);
    for (const [g, c] of Object.entries(configs)) {
      profile[g] ??= c.repeat ? [] : S.blankRecord(g, profile);
      for (const record of c.repeat ? profile[g] : [profile[g]]) for (const f of c.fields) record[f.key] ??= '';
    }
    const mergeRecord = (old, fresh, group, index) => {
      for (const field of configs[group].fields) {
        const value = fresh[field.key], before = old[field.key];
        if (!value) continue;
        if (!before) old[field.key] = value;
        else if (before !== value) conflicts.push({ path: configs[group].repeat ? `${group}.${index}.${field.key}` : `${group}.${field.key}`, title: `${configs[group].label}${configs[group].repeat ? ` ${index + 1}` : ''} · ${field.label}`, before, incoming: value });
      }
    };
    for (const [group, config] of Object.entries(configs)) {
      if (!incoming[group]) continue;
      if (!config.repeat) { mergeRecord(profile[group], incoming[group], group); continue; }
      for (const row of incoming[group]) {
        if (!config.fields.some(f => row[f.key])) continue;
        const exact = profile[group].findIndex(old => config.fields.every(f => (old[f.key] || '') === (row[f.key] || '')));
        const keys = identityFields[group] || ['_id'], primary = keys[0];
        const matches = profile[group].map((old, index) => ({ old, index })).filter(({ old }) => row[primary] && S.normalize(old[primary]) === S.normalize(row[primary]) && keys.slice(1).every(key => !old[key] || !row[key] || S.normalize(old[key]) === S.normalize(row[key])));
        const index = exact >= 0 ? exact : matches.length === 1 ? matches[0].index : -1;
        if (index >= 0) { duplicates++; mergeRecord(profile[group][index], row, group, index); }
        else { profile[group].push({ ...S.blankRecord(group, profile), ...row }); added++; }
      }
    }
    if (incoming.declarations) {
      profile.declarations ||= {};
      for (const [key, value] of Object.entries(incoming.declarations)) if (!profile.declarations[key]) profile.declarations[key] = value;
    }
    profile._meta.source = incoming._meta.source || profile._meta.source;
    profile._meta.reviewNotes = [...new Set([...profile._meta.reviewNotes, ...incoming._meta.reviewNotes])].slice(0, 30);
    return { profile: S.validateProfile(profile), conflicts, duplicates, added };
  }
  function setPath(profile, path, value) { const [group, part, last] = path.split('.'), config = S.groupsFor(profile, true)[group], key = config?.repeat ? last : part; if (!config || !config.fields.some(f => f.key === key) || (config.repeat ? !/^\d+$/.test(part) || path.split('.').length !== 3 : path.split('.').length !== 2)) throw Error('资料字段路径无效。'); const record = config.repeat ? profile[group][Number(part)] : profile[group]; if (!record) throw Error('资料记录不存在。'); record[key] = value; }
  function merge(existing, draft) { return planMerge(existing, draft).profile; }
  function quickEntries(profile) {
    const list = S.entries(profile).filter(e => e.value);
    if (S.groupsFor(profile).projects) profile.projects.forEach((p, index) => {
      if (p.responsibilities && p.results) list.push({ path: `projects.${index}.$combined`, group: 'projects', index, title: `项目经历 ${index + 1} · 职责 + 成果`, label: '职责 + 成果', value: `${p.responsibilities}\n项目成果：${p.results}`, multiline: true });
      if (p.start && p.end) list.push({ path: `projects.${index}.$range`, group: 'projects', index, title: `项目经历 ${index + 1} · 起止时间`, label: '起止时间', value: `${p.start} 至 ${p.end}` });
    });
    return list;
  }
  async function db() {
    return new Promise((resolve, reject) => { const req = indexedDB.open('application-helper-attachments', 1); req.onupgradeneeded = () => req.result.createObjectStore('files'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(Error('无法打开附件库')); });
  }
  async function attachment(action, key, value) {
    const database = await db();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('files', action === 'get' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('files');
        const request = action === 'put' ? store.put(value, key) : action === 'get' ? store.get(key) : action === 'delete' ? store.delete(key) : store.clear();
        let result; request.onsuccess = () => { result = request.result; }; transaction.oncomplete = () => resolve(result); transaction.onerror = () => reject(Error('附件保存失败，请检查磁盘空间')); transaction.onabort = () => reject(Error('附件操作已中止'));
      });
    } finally { database.close(); }
  }
  const api = { id, emptyLibrary, validate, load, save, update, commit, reconcile, active, merge, planMerge, setPath, quickEntries, attachment };
  root.ApplicationLibrary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

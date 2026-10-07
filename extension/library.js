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
    list('attachments', 100, x => ({ id: String(x.id || id()).slice(0, 80), name: String(x.name || '').slice(0, 200), category: String(x.category || '').slice(0, 100), type: String(x.type || '').slice(0, 100), size: Number(x.size) || 0, createdAt: String(x.createdAt || '').slice(0, 40) }));
    return result;
  }
  async function load() {
    const stored = await Store.get('library', null);
    if (stored) return validate(stored);
    const result = emptyLibrary(), old = await Store.get('profile', null);
    if (old) { result.profiles[0].profile = S.validateProfile(old); result.profiles[0].name = '原有资料'; }
    return result;
  }
  async function save(library, resetRules = true) { await Store.set('library', validate(library)); if (resetRules) await Store.remove('rules'); }
  function active(library) { return library.profiles.find(p => p.id === library.activeId) || library.profiles[0]; }
  function merge(existing, draft) {
    const profile = S.validateProfile(existing), incoming = S.validateProfile(draft);
    for (const [group, config] of Object.entries(S.groups)) {
      if (config.repeat) profile[group].push(...incoming[group]);
      else for (const field of config.fields) if (!profile[group][field.key] && incoming[group][field.key]) profile[group][field.key] = incoming[group][field.key];
    }
    profile._meta.source = incoming._meta.source || profile._meta.source;
    profile._meta.reviewNotes = [...new Set([...profile._meta.reviewNotes, ...incoming._meta.reviewNotes])].slice(0, 30);
    return S.validateProfile(profile);
  }
  function quickEntries(profile) {
    const list = S.entries(profile).filter(e => e.value);
    profile.projects.forEach((p, index) => {
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
  const api = { id, emptyLibrary, validate, load, save, active, merge, quickEntries, attachment };
  root.ApplicationLibrary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

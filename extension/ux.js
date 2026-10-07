(function (root) {
  const S = root.ApplicationSchema;
  function entryKey(entry, profile) {
    const record = S.groups[entry.group].repeat ? profile[entry.group][entry.index] : null;
    const identity = record ? [record.name || record.school || record.organization || '', record.start || record.date || '', record.end || '', record.role || record.relation || ''] : [];
    return JSON.stringify([entry.group, identity, entry.key || entry.path.split('.').at(-1)]);
  }
  function recommend(profile, field) {
    if (!field || field.blocked || S.blocked(field) || field.unsupported) return [];
    const paths = new Set();
    for (const [group, config] of Object.entries(S.groups)) {
      const count = config.repeat ? profile[group].length : 1;
      for (let index = 0; index < count; index++) {
        const guess = S.infer(field, profile, { [group]: index });
        if (guess.path) paths.add(guess.path);
      }
    }
    return S.entries(profile).filter(entry => entry.value && paths.has(entry.path));
  }
  function groups(entries, profile) {
    const result = new Map();
    for (const entry of entries) {
      const repeat = S.groups[entry.group].repeat, key = entry.group + (repeat ? `.${entry.index}` : '');
      if (!result.has(key)) {
        const record = repeat ? profile[entry.group][entry.index] : null;
        result.set(key, { key, title: `${S.groups[entry.group].label}${repeat ? ` ${entry.index + 1} · ${record.name || record.school || record.organization || record.relation || '未命名'}` : ''}`, entries: [] });
      }
      result.get(key).entries.push(entry);
    }
    return [...result.values()];
  }
  function lengthInfo(value, field, mode = 'replace') {
    const count = String(value).length;
    const length = mode === 'cursor' && field ? (field.current || '').length - Math.max(0, (field.selectionEnd || 0) - (field.selectionStart || 0)) + count : count;
    const limit = Number(field?.maxLength) > 0 ? Number(field.maxLength) : 0;
    return { length, limit, exceeded: Boolean(limit && length > limit) };
  }
  const api = { entryKey, recommend, groups, lengthInfo };
  root.ApplicationUX = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);

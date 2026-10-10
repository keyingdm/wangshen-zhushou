(function (root) {
  const S = root.ApplicationSchema;
  function entryKey(entry, profile) {
    return S.entryKey(entry, profile);
  }
  function recommend(profile, field) {
    if (!field || field.blocked || S.blocked(field) || field.unsupported) return [];
    const paths = new Set();
    for (const [group, config] of Object.entries(S.groupsFor(profile))) {
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
      const config = S.groupsFor(profile)[entry.group], repeat = config.repeat, key = entry.group + (repeat ? `.${entry.index}` : '');
      if (!result.has(key)) {
        const record = repeat ? profile[entry.group][entry.index] : null;
        result.set(key, { key, title: `${config.label}${repeat ? ` ${entry.index + 1} · ${record.name || record.school || record.organization || record.relation || record[config.fields[0]?.key] || '未命名'}` : ''}`, entries: [] });
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

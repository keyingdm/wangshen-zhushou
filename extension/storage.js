globalThis.ApplicationStorage = {
  async get(key, fallback) {
    if (globalThis.chrome?.storage?.local) return (await chrome.storage.local.get(key))[key] ?? fallback;
    // Used by the local demo only; production extension always uses chrome.storage.local.
    try { return JSON.parse(localStorage.getItem(`application-demo:${key}`)) ?? fallback; } catch { return fallback; }
  },
  async set(key, value) {
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({ [key]: value });
    else localStorage.setItem(`application-demo:${key}`, JSON.stringify(value));
  },
  async remove(key) {
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.remove(key);
    else localStorage.removeItem(`application-demo:${key}`);
  },
  async clearPanelStates() {
    if (globalThis.chrome?.storage?.local) { const values = await chrome.storage.local.get(null); await chrome.storage.local.remove(Object.keys(values).filter(key => key.startsWith('panelState:'))); }
    else for (const key of Object.keys(localStorage)) if (key.startsWith('application-demo:panelState:')) localStorage.removeItem(key);
  },
  download(name, value) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

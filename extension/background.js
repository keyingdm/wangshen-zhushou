const trustedStorage = () => chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.runtime.onInstalled.addListener(trustedStorage);
chrome.runtime.onStartup.addListener(trustedStorage);
chrome.action.onClicked.addListener(async tab => {
  try {
    if (!tab.id || !/^https?:\/\//.test(tab.url || '')) return chrome.runtime.openOptionsPage();
    const nonce = crypto.randomUUID();
    const bindings = (await chrome.storage.session.get('panelBindings')).panelBindings || {};
    bindings[tab.id] = { nonce, origin: new URL(tab.url).origin };
    await chrome.storage.session.set({ panelBindings: bindings });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['schema.js', 'content.js', 'overlay.js'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: config => ApplicationOverlay.show(config), args: [{ url: chrome.runtime.getURL('panel.html'), tabId: tab.id, nonce }] });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#9a4e36' });
  }
});
chrome.tabs.onRemoved.addListener(async tabId => {
  const bindings = (await chrome.storage.session.get('panelBindings')).panelBindings || {};
  delete bindings[tabId]; await chrome.storage.session.set({ panelBindings: bindings });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'application-panel') return;
  (async () => {
    const panelURL = new URL(chrome.runtime.getURL('panel.html'));
    const senderURL = new URL(sender.url || 'https://invalid/');
    if (sender.id !== chrome.runtime.id || senderURL.origin !== panelURL.origin || !['/panel.html', '/popup.html'].includes(senderURL.pathname)) throw Error('面板来源无效');
    const tabId = Number(message.tabId);
    const binding = (await chrome.storage.session.get('panelBindings')).panelBindings?.[tabId];
    if (!binding || binding.nonce !== message.nonce || senderURL.searchParams.get('nonce') !== binding.nonce || senderURL.searchParams.get('tab') !== String(tabId) || (sender.tab && sender.tab.id !== tabId)) throw Error('面板未绑定当前标签页，请点击工具栏重新打开');
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || new URL(tab.url).origin !== binding.origin) throw Error('已切换网站，请点击工具栏重新打开面板');
    if (!['scan', 'fill', 'undo', 'focused', 'insertFocused'].includes(message.action)) throw Error('不支持的操作');
    const results = await chrome.scripting.executeScript({ target: { tabId }, func: async (action, payload) => {
      try {
        if (!globalThis.ApplicationAgent) throw Error('页面已刷新，请点击工具栏重新打开面板');
        return { ok: true, value: await ApplicationAgent[action](payload) };
      } catch (error) { return { ok: false, error: error.message || '页面拒绝操作' }; }
    }, args: [message.action, message.payload || null] });
    const response = results[0]?.result;
    if (!response?.ok) throw Error(response?.error || '页面未返回结果');
    return response.value;
  })().then(result => respond({ ok: true, result })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});

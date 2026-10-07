(function () {
  if (globalThis.ApplicationOverlay) return;
  let host, frame, toggle;
  function show(config) {
    if (!host?.isConnected) {
      host = document.createElement('div'); host.id = 'application-helper-overlay';
      host.setAttribute('data-application-helper', 'true');
      Object.assign(host.style, { position: 'fixed', inset: '0 0 0 auto', width: '374px', height: '100vh', zIndex: '2147483646', pointerEvents: 'none' });
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = ':host{all:initial}iframe{width:100%;height:100%;border:0;background:white;box-shadow:-4px 0 22px #102e3026;pointer-events:auto}button{position:absolute;left:-36px;top:100px;width:36px;height:78px;background:#126e65;color:#fff;border:0;border-radius:9px 0 0 9px;cursor:pointer;font:13px sans-serif;pointer-events:auto;writing-mode:vertical-rl}';
      frame = document.createElement('iframe'); frame.title = '网申助手悬浮面板'; frame.allow = 'clipboard-write';
      toggle = document.createElement('button'); toggle.textContent = '收起助手';
      toggle.onclick = () => { const folded = host.style.width !== '0px'; host.style.width = folded ? '0px' : '374px'; frame.hidden = folded; toggle.textContent = folded ? '打开助手' : '收起助手'; };
      shadow.append(style, frame, toggle); document.documentElement.append(host);
    }
    host.style.width = '374px'; frame.hidden = false; toggle.textContent = '收起助手';
    frame.src = `${config.url}?tab=${config.tabId}&nonce=${encodeURIComponent(config.nonce)}`;
  }
  globalThis.ApplicationOverlay = { show };
})();

(function () {
  if (globalThis.ApplicationOverlay) return;
  let host, frame, toggle, width = 374;
  const bounded = value => Math.max(280, Math.min(Number(value) || 374, 600, Math.max(280, innerWidth - 48)));
  function resize(value) { width = bounded(value); if (host && !frame.hidden) host.style.width = `${width}px`; return { width }; }
  function collapse() {
    if (!host?.isConnected) return { folded: true };
    host.style.width = '0px'; frame.hidden = true; toggle.textContent = '打开助手';
    toggle.setAttribute('aria-expanded', 'false');
    return { folded: true };
  }
  function close() { host?.remove(); host = frame = toggle = null; return { closed: true }; }
  function show(config) {
    if (!host?.isConnected) {
      host = document.createElement('div'); host.id = 'application-helper-overlay';
      host.setAttribute('data-application-helper', 'true');
      Object.assign(host.style, { position: 'fixed', inset: '0 0 0 auto', width: '374px', height: '100vh', zIndex: '2147483646', pointerEvents: 'none' });
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = ':host{all:initial}iframe{width:100%;height:100%;border:0;background:#f5f8fa;box-shadow:-12px 0 40px #163c3724;pointer-events:auto}button{position:absolute;left:-34px;top:110px;width:34px;height:88px;background:#147d73;color:#fff;border:1px solid #ffffff38;border-right:0;border-radius:12px 0 0 12px;box-shadow:-4px 3px 14px #163c371a;cursor:pointer;font:12px/1.5 "Microsoft YaHei",sans-serif;pointer-events:auto;writing-mode:vertical-rl}button:hover{background:#0c655d}button:focus-visible{outline:3px solid #74d7c7;outline-offset:3px}';
      frame = document.createElement('iframe'); frame.title = '网申助手悬浮面板'; frame.allow = 'clipboard-write';
      toggle = document.createElement('button'); toggle.textContent = '收起助手';
      toggle.onclick = () => { if (!frame.hidden) collapse(); else { host.style.width = `${width}px`; frame.hidden = false; toggle.textContent = '收起助手'; toggle.setAttribute('aria-expanded', 'true'); } };
      shadow.append(style, frame, toggle); document.documentElement.append(host);
    }
    width = bounded(config.width); host.style.width = `${width}px`; frame.hidden = false; toggle.textContent = '收起助手'; toggle.setAttribute('aria-expanded', 'true');
    frame.src = `${config.url}?tab=${config.tabId}&nonce=${encodeURIComponent(config.nonce)}`;
  }
  window.addEventListener('resize', () => resize(width));
  globalThis.ApplicationOverlay = { show, resize, collapse, close };
})();

// Presentation only. The sandbox has no tenant data, forms, API or same-origin privileges.
(() => {
  const ready = () => parent.postMessage({ type: 'p60-designer-ready' }, '*');
  addEventListener('message', event => {
    // The parent can live on any authorised admin host. Window identity, not the asset
    // origin, binds this channel. No secret or HTML crosses it in either direction.
    if (event.source !== parent) return;
    if (event.data?.type === 'p60-designer-handshake') { ready(); return; }
    if (event.data?.type !== 'p60-designer-settings') return;
    for (const [key, value] of Object.entries(event.data.vars || {})) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key) || typeof value !== 'string' || value.length > 250 || /[;{}<>\\]|url\s*\(/i.test(value)) continue;
      document.documentElement.style.setProperty(`--p60s-${key}`, value);
    }
    document.querySelectorAll('[data-designer-font]').forEach(link => link.remove());
    for (const href of [...new Set(Array.isArray(event.data.fonts) ? event.data.fonts : [])].slice(0, 4)) {
      try {
        const url = new URL(href);
        if (url.origin !== 'https://fonts.bunny.net' || url.pathname !== '/css2' || url.username || url.password) continue;
        const link = document.createElement('link');
        link.rel = 'stylesheet'; link.href = url.href; link.dataset.designerFont = '';
        document.head.append(link);
      } catch { /* Unknown font sources are not loaded. */ }
    }
  });
  ready();
})();

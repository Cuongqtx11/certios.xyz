'use strict';
(() => {
  const action = document.getElementById('install');
  const status = document.getElementById('status');
  const hint = document.getElementById('hint');
  let pendingPrompt;
  action.addEventListener('click', () => window.clearTimeout(pendingPrompt));
  function prepareInstall() {
    window.clearTimeout(pendingPrompt);
  try {
    // The manifest stays on this device: first in the fragment, then in the
    // current history entry so the address bar is short and reload still works.
    const fields = new URLSearchParams(window.location.hash.slice(1));
    const previous = window.history.state || {};
    const value = fields.has('manifest') ? fields.get('manifest') : previous.csignManifest;
    if (typeof value !== 'string' || !value || value.length > 16384) throw new Error('manifest');
    const manifest = new URL(value);
    if (manifest.protocol !== 'https:' || !manifest.hostname || manifest.username || manifest.password) {
      throw new Error('manifest');
    }
    const installer = new URL('itms-services://');
    installer.searchParams.set('action', 'download-manifest');
    installer.searchParams.set('url', manifest.href);
    action.href = installer.href;
    action.hidden = false;
    hint.hidden = false;
    status.textContent = 'Ứng dụng đã sẵn sàng.';
    const alreadyOpened = previous.csignManifest === manifest.href && previous.csignPrompted === true;
    try {
      window.history.replaceState({ csignManifest: manifest.href, csignPrompted: true }, '',
        window.location.pathname + window.location.search);
    } catch { /* The visible button still works when browser history is unavailable. */ }
    // One attempt per page entry. Safari may require a touch; the button remains
    // available. Never loop prompts or retry merely because confirmation is slow.
    if (!alreadyOpened) {
      pendingPrompt = window.setTimeout(() => {
        try { window.location.assign(installer.href); } catch { /* Tap Cài đặt. */ }
      }, 250);
    }
  } catch {
    action.removeAttribute('href');
    action.hidden = true;
    hint.hidden = true;
    status.textContent = 'Hãy quay lại CSign và mở lại cài đặt.';
  }
  }
  window.addEventListener('hashchange', prepareInstall);
  prepareInstall();
})();

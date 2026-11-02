'use strict';
(() => {
  const action = document.getElementById('install');
  const status = document.getElementById('status');
  try {
    // Fragment is never transmitted in the HTTPS request or referrer.
    const fields = new URLSearchParams(window.location.hash.slice(1));
    const value = fields.get('manifest');
    if (!value || value.length > 16384) throw new Error('missing manifest');
    const manifest = new URL(value);
    if (manifest.protocol !== 'https:' || !manifest.hostname || manifest.username || manifest.password) {
      throw new Error('HTTPS manifest required');
    }
    const installer = new URL('itms-services://');
    installer.searchParams.set('action', 'download-manifest');
    installer.searchParams.set('url', manifest.href);
    action.href = installer.href;
    action.hidden = false;
    status.textContent = 'Bấm Cài đặt rồi xác nhận thông báo của iPhone. IPA được tải từ CSign đang mở trên máy này.';
  } catch {
    action.removeAttribute('href');
    action.hidden = true;
    status.textContent = 'Liên kết cài đặt thiếu hoặc không hợp lệ. Hãy quay lại CSign và mở lại trang cài.';
  }
  // No automatic navigation, local fetch, app upload or tracking requests.
})();

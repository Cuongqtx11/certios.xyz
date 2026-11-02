'use strict';
(() => {
  const action = document.getElementById('install');
  const status = document.getElementById('status');
  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };
  const show = (id) => {
    const element = document.getElementById(id);
    if (element) element.hidden = false;
  };
  const payloadURL = (value) => {
    try {
      if (!value || value.length > 16384) return null;
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password ? url : null;
    } catch { return null; }
  };
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
    // Provider comes from the actual URL, never from a preferred-route label.
    const certios = manifest.hostname === 'api.certios.xyz' && manifest.pathname === '/api/csign/install/manifest.plist';
    const feather = manifest.hostname === 'api.palera.in' && manifest.pathname === '/genPlist';
    const payload = payloadURL(certios || feather ? manifest.searchParams.get('fetchurl') : fields.get('payload'));
    const local = !certios && !feather && fields.get('route') === '0' && manifest.port &&
      manifest.pathname.endsWith('.plist') && payload && payload.origin === manifest.origin;
    const provider = certios ? 'CERTIOS' : feather ? 'Feather' : local ? 'Local (theo cấu hình CSign)' : 'Manifest HTTPS';
    setText('route-name', 'Tuyến cài: ' + provider);
    setText('page-host', window.location.host || 'CERTIOS');
    setText('manifest-host', manifest.origin);
    setText('manifest-url', manifest.href);
    const loopback = payload && ['127.0.0.1', 'localhost', '[::1]'].includes(payload.hostname);
    setText('payload-host', payload ? payload.host + (loopback ? ' · trên iPhone' : '') : 'Theo nội dung manifest');
    show('route-info');
    show('route-details');
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

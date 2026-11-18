'use strict';
const http = require('http');
const net = require('net');

module.exports = function createIpaLicenseProxy(options = {}) {
  const port = options.port || 8399;
  return function ipaLicenseProxy(req, res) {
    const send = (status, message) => {
      if (res.headersSent) return res.destroy();
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ ok: false, message }));
    };
    res.removeHeader('X-Powered-By');
    const pathname = (req.url || '/').split('?')[0];
    if (!/^\/(ping|activate|verify|udid-start|udid\.mobileconfig|udid-callback|udid-done|udid-poll)$/.test(pathname) || !['GET', 'POST', 'OPTIONS'].includes(req.method)) {
      return send(404, 'Not found');
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      return res.end();
    }
    const getOnly = /^\/(ping|udid-start|udid\.mobileconfig|udid-done|udid-poll)$/.test(pathname);
    if ((req.method === 'GET' && !getOnly) || (req.method === 'POST' && getOnly)) {
      return send(405, 'Method not allowed');
    }
    const length = req.headers['content-length'];
    if (length && (!/^\d+$/.test(length) || Number(length) > 65536)) {
      return send(413, 'Payload too large');
    }
    const peer = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    const loopback = peer === '127.0.0.1' || peer === '::1';
    const claimed = req.headers['cf-connecting-ip'];
    const client = loopback && typeof claimed === 'string' && net.isIP(claimed)
      ? claimed
      : (net.isIP(peer) ? peer : '127.0.0.1');

    const headers = {
      'X-IPA-Client-IP': client,
      'X-Forwarded-Host': req.headers['x-forwarded-host'] || req.headers.host || 'api.certios.xyz',
    };
    for (const name of ['content-type', 'content-length']) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const upstream = http.request(
      { hostname: '127.0.0.1', port, path: '/api/ipa-sync' + pathname + qs, method: req.method, headers },
      (response) => {
        res.statusCode = response.statusCode;
        for (const [name, value] of Object.entries(response.headers)) {
          if (value && !['connection', 'transfer-encoding', 'keep-alive', 'upgrade'].includes(name)) {
            res.setHeader(name, value);
          }
        }
        response.on('error', () => res.destroy());
        response.pipe(res);
      }
    );
    upstream.setTimeout(10000, () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => send(503, 'Dịch vụ kích hoạt tạm thời bận, vui lòng thử lại.'));
    req.on('aborted', () => upstream.destroy());
    let received = 0;
    req.on('data', (part) => {
      received += part.length;
      if (received > 65536) {
        upstream.destroy();
        send(413, 'Payload too large');
      }
    });
    req.pipe(upstream);
  };
};

'use strict';

const express = require('express');

function xml(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function field(query, key, limit) {
    const value = query[key];
    if (typeof value !== 'string' || !value.trim() || value.length > limit ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
        throw new Error('Invalid manifest metadata');
    }
    return value;
}

function isDeviceAddress(host) {
    return host === 'localhost' || host === '[::1]' || host === '127.0.0.1' ||
        /^10\.\d+\.\d+\.\d+$/.test(host) || /^192\.168\.\d+\.\d+$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
}

// Stateless HTTPS manifest provider. Never fetches the IPA or accepts key material.
module.exports = function createCSignManifestRouter() {
    const router = express.Router();
    router.get('/manifest.plist', (req, res) => {
        res.set({ 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' });
        try {
            const identifier = field(req.query, 'bundleid', 255);
            const name = field(req.query, 'name', 256);
            const version = field(req.query, 'version', 64);
            const payload = field(req.query, 'fetchurl', 2048);
            const url = new URL(payload);
            if (!/^[A-Za-z0-9._-]+$/.test(identifier) || !['http:', 'https:'].includes(url.protocol) ||
                !isDeviceAddress(url.hostname) || !url.port || url.username || url.password || url.hash) {
                throw new Error('Invalid device payload');
            }
            const body = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict>
<key>assets</key><array><dict><key>kind</key><string>software-package</string>
<key>url</key><string>${xml(payload)}</string></dict></array>
<key>metadata</key><dict><key>bundle-identifier</key><string>${xml(identifier)}</string>
<key>bundle-version</key><string>${xml(version)}</string><key>kind</key><string>software</string>
<key>title</key><string>${xml(name)}</string></dict></dict></array></dict></plist>`;
            res.status(200).set('Content-Type', 'text/xml; charset=utf-8').send(body);
        } catch {
            res.status(400).json({ error: 'Invalid installation manifest request' });
        }
    });
    return router;
};

'use strict';

// Device-specific public TLS certificates. Only signed PUBLIC CSRs are accepted.
// Signing p12s, passwords, IPAs and device TLS private keys never enter this service.
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const dns = require('dns').promises;

const SUFFIX = 'local.certios.xyz';
const DAY = 86400000;
const CONFIG = process.env.CSIGN_LOCAL_TLS_CONFIG || path.join(os.homedir(), '.config/csign-local-tls/config.json');
const STATE = path.join(path.dirname(CONFIG), 'state');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function read(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function save(file, value) {
    fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
    const temporary = file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, file);
}
function configuration() {
    const value = read(CONFIG, {});
    if (value.enabled !== true || typeof value.cloudflareToken !== 'string' || !value.cloudflareToken.trim()) return null;
    return { ...value, maxOrdersPerWeek: Math.min(40, Math.max(1, Number(value.maxOrdersPerWeek) || 35)) };
}
async function cloudflare(config, resource, method = 'GET', body) {
    const response = await fetch('https://api.cloudflare.com/client/v4/' + resource, {
        method, headers: { Authorization: 'Bearer ' + config.cloudflareToken, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
        const error = new Error('dns_provider');
        error.status = response.status;
        throw error;
    }
    return result.result;
}
async function zone(config) {
    if (config.zoneId) {
        const result = await cloudflare(config, 'zones/' + encodeURIComponent(config.zoneId));
        if (result.name !== 'certios.xyz') throw new Error('dns_zone');
        return result.id;
    }
    const result = await cloudflare(config, 'zones?name=certios.xyz');
    if (result.length !== 1 || result[0].name !== 'certios.xyz') throw new Error('dns_zone');
    return result[0].id;
}
async function ensureLoopback(config, zoneId, host) {
    const records = await cloudflare(config, `zones/${zoneId}/dns_records?name=${host}`);
    if (records.length) {
        // Never replace an existing record with a different purpose.
        if (records.length !== 1 || records[0].type !== 'A' || records[0].content !== '127.0.0.1' || records[0].proxied) {
            throw new Error('dns_conflict');
        }
        return;
    }
    await cloudflare(config, `zones/${zoneId}/dns_records`, 'POST', {
        type: 'A', name: host, content: '127.0.0.1', ttl: 120, proxied: false,
        comment: 'CSign device-specific loopback TLS',
    });
}

function parseCSR(pem) {
    if (typeof pem !== 'string' || pem.length > 8192 ||
        !/^-----BEGIN CERTIFICATE REQUEST-----[\s\S]+-----END CERTIFICATE REQUEST-----\s*$/.test(pem)) throw new Error('csr');
    const forge = require('node-forge');
    const csr = forge.pki.certificationRequestFromPem(pem);
    if (csr.publicKey.n.bitLength() !== 2048 || csr.publicKey.e.toString() !== '65537' || !csr.verify()) throw new Error('csr');
    const publicKey = crypto.createPublicKey(forge.pki.publicKeyToPem(csr.publicKey));
    const publicDER = publicKey.export({ type: 'spki', format: 'der' });
    const host = 'd' + sha256(publicDER).slice(0, 32) + '.' + SUFFIX;
    const requested = require('acme-client').crypto.readCsrDomains(pem);
    // One key deterministically owns one hostname. Arbitrary domains/wildcards,
    // additional SANs and a CSR signed by someone else's key are rejected.
    if (requested.commonName !== host || requested.altNames.length !== 1 || requested.altNames[0] !== host) throw new Error('csr');
    const extensions = csr.getAttribute({ name: 'extensionRequest' })?.extensions || [];
    if (extensions.length !== 1 || extensions[0].name !== 'subjectAltName' ||
        extensions[0].altNames?.length !== 1 || extensions[0].altNames[0].type !== 2) throw new Error('csr');
    return { host, publicDER };
}
function usableCertificate(value, publicDER, host) {
    try {
        const cert = new crypto.X509Certificate(value);
        return cert.checkHost(host, { wildcards: false }) === host &&
            cert.publicKey.export({ type: 'spki', format: 'der' }).equals(publicDER) &&
            Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now() + 14 * DAY;
    } catch { return false; }
}

module.exports = function localTLSRouter() {
    const router = express.Router();
    const running = new Set();
    let active = false;
    const requests = new Map();

    router.use((req, res, next) => {
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        // The local cloudflared connector supplies this header. Do not trust a
        // forwarded header arriving over a non-loopback direct connection.
        const peer = req.socket.remoteAddress || '';
        const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
        req.localTLSClient = sha256(loopback ? String(req.headers['cf-connecting-ip'] || peer) : peer);
        const now = Date.now();
        for (const [key, entry] of requests) if (now - entry.start > 60000) requests.delete(key);
        if (requests.size >= 4096 && !requests.has(req.localTLSClient)) {
            return res.status(429).json({ status: 'busy', retryAfter: 300 });
        }
        const entry = requests.get(req.localTLSClient) || { start: now, count: 0 };
        requests.set(req.localTLSClient, entry);
        if (++entry.count > 30) return res.status(429).json({ status: 'busy', retryAfter: 60 });
        next();
    });

    router.get('/config', (req, res) => {
        try { res.json({ enabled: Boolean(configuration()), suffix: SUFFIX, retryAfter: 3600 }); }
        catch { res.json({ enabled: false, retryAfter: 3600 }); }
    });

    async function issue(config, job, jobFile, publicDER) {
        const acme = require('acme-client');
        let zoneId;
        try {
            zoneId = await zone(config);
            // Clean only TXT records this job owns, including interrupted jobs.
            for (const recordId of job.txtRecords || []) {
                try {
                    const record = await cloudflare(config, `zones/${zoneId}/dns_records/${encodeURIComponent(recordId)}`);
                    if (record.type === 'TXT' && record.name === '_acme-challenge.' + job.host) {
                        await cloudflare(config, `zones/${zoneId}/dns_records/${record.id}`, 'DELETE');
                    }
                } catch (error) { if (error.status !== 404) throw error; }
            }
            job.txtRecords = [];
            save(jobFile, job);
            await ensureLoopback(config, zoneId, job.host);
            const accountFile = path.join(STATE, 'account.pem');
            let accountKey;
            try { accountKey = fs.readFileSync(accountFile); }
            catch (error) {
                if (error.code !== 'ENOENT') throw error;
                accountKey = await acme.crypto.createPrivateRsaKey();
                fs.writeFileSync(accountFile, accountKey, { mode: 0o600, flag: 'wx' });
            }
            const client = new acme.Client({
                directoryUrl: config.acmeDirectory || acme.directory.letsencrypt.production,
                accountKey, backoffAttempts: 8, backoffMin: 3000, backoffMax: 15000,
                ...(config.externalAccountBinding ? { externalAccountBinding: config.externalAccountBinding } : {}),
            });
            const certificate = await client.auto({
                csr: job.csr, termsOfServiceAgreed: true,
                ...(config.email ? { email: config.email } : {}),
                challengePriority: ['dns-01'],
                challengeCreateFn: async (authorization, challenge, value) => {
                    if (authorization.identifier.value !== job.host || challenge.type !== 'dns-01') throw new Error('dns_challenge');
                    const name = '_acme-challenge.' + job.host;
                    const record = await cloudflare(config, `zones/${zoneId}/dns_records`, 'POST', {
                        type: 'TXT', name, content: value, ttl: 120,
                    });
                    job.txtRecords.push(record.id);
                    save(jobFile, job);
                    // DNS propagation runs only in this background worker, never
                    // in an IPA install request or Express's event loop.
                    const resolver = new dns.Resolver({ timeout: 3000, tries: 1 });
                    resolver.setServers(['1.1.1.1', '8.8.8.8']);
                    for (let attempt = 0; attempt < 24; attempt++) {
                        try {
                            const answers = await resolver.resolveTxt(name);
                            if (answers.some(parts => parts.join('') === value)) return;
                        } catch { /* DNS-01 propagation still pending */ }
                        await sleep(5000);
                    }
                    throw new Error('dns_propagation');
                },
                challengeRemoveFn: async () => {
                    for (const recordId of [...job.txtRecords]) {
                        await cloudflare(config, `zones/${zoneId}/dns_records/${recordId}`, 'DELETE');
                        job.txtRecords = job.txtRecords.filter(id => id !== recordId);
                        save(jobFile, job);
                    }
                },
            });
            if (!usableCertificate(certificate, publicDER, job.host)) throw new Error('certificate');
            job.certificate = certificate;
            job.status = 'ready';
            job.retryAt = 0;
            console.log('[CSign Local TLS] Device certificate issued');
        } catch (error) {
            // Do not log raw CA/DNS errors: they may include credential headers.
            job.status = 'retry';
            job.retryAt = Date.now() + 6 * 3600000;
            console.warn('[CSign Local TLS] Issuance deferred; installation fallback remains available');
        } finally {
            job.updatedAt = Date.now();
            try { save(jobFile, job); }
            finally { active = false; running.delete(job.host); }
        }
    }

    router.post('/certificate', express.json({ limit: '12kb', strict: true }), async (req, res) => {
        let config;
        try { config = configuration(); }
        catch { return res.status(503).json({ status: 'unavailable', retryAfter: 3600 }); }
        if (!config) return res.status(503).json({ status: 'unavailable', retryAfter: 3600 });
        let parsed;
        try {
            if (!req.body || Object.keys(req.body).length !== 1 || !('csr' in req.body)) throw new Error('csr');
            parsed = parseCSR(req.body.csr);
        } catch { return res.status(400).json({ status: 'invalid_csr', retryAfter: 86400 }); }
        const { host, publicDER } = parsed;
        const jobFile = path.join(STATE, host + '.json');
        try {
            const job = read(jobFile, { host, csr: req.body.csr, status: 'new', txtRecords: [] });
            if (job.certificate && usableCertificate(job.certificate, publicDER, host)) {
                return res.json({ status: 'ready', hostname: host, certificate: job.certificate });
            }
            if (running.has(host)) return res.status(202).json({ status: 'pending', retryAfter: 5 });
            if (job.retryAt > Date.now()) return res.status(503).json({ status: 'retry', retryAfter: Math.ceil((job.retryAt - Date.now()) / 1000) });
            if (active) return res.status(503).json({ status: 'busy', retryAfter: 60 });
            const now = Date.now();
            const ledgerFile = path.join(STATE, 'orders.json');
            const ledger = read(ledgerFile, []).filter(item => item.at > now - 7 * DAY);
            // Conservative cap reserves capacity for the website's own SSL.
            // An EAB/paid issuer can be configured without changing the app.
            if (ledger.length >= config.maxOrdersPerWeek) {
                const retryAfter = Math.max(3600, Math.ceil((ledger[0].at + 7 * DAY - now) / 1000));
                return res.status(429).json({ status: 'quota', retryAfter });
            }
            const recent = ledger.filter(item => item.client === req.localTLSClient && item.at > now - DAY);
            if (recent.length >= 2 && !recent.some(item => item.host === host)) {
                return res.status(429).json({ status: 'quota', retryAfter: 86400 });
            }
            ledger.push({ at: now, client: req.localTLSClient, host });
            save(ledgerFile, ledger); // Reserve before contacting a CA, including failed orders.
            job.status = 'pending';
            job.updatedAt = now;
            save(jobFile, job);
            running.add(host);
            active = true;
            // The client receives a resumable job response immediately.
            res.status(202).json({ status: 'pending', retryAfter: 5 });
            void issue(config, job, jobFile, publicDER).catch(() => {
                active = false; running.delete(host);
                console.warn('[CSign Local TLS] Worker stopped; retry remains resumable');
            });
        } catch { res.status(503).json({ status: 'unavailable', retryAfter: 3600 }); }
    });
    router.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        res.status(error.type === 'entity.too.large' ? 413 : 400).json({ status: 'invalid_request', retryAfter: 3600 });
    });
    return router;
};

const fs = require('fs');
const os = require('os');
const path = require('path');
const { signCSign } = require('../csign');

const ROOT = path.resolve(__dirname, '../..');
const APPS_JSON_PATH = path.join(ROOT, 'public/apps.json');
const CERTS_DIR = path.join(ROOT, 'public/downloads/certs');
const TEMPLATES_DIR = path.join(ROOT, 'server/templates');

const xml = value => String(value).replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
}[c]));

function manifest(ipaUrl, signed) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict>
<key>assets</key><array><dict><key>kind</key><string>software-package</string>
<key>url</key><string>${xml(ipaUrl)}</string></dict></array>
<key>metadata</key><dict><key>bundle-identifier</key><string>${xml(signed.bundleId)}</string>
<key>bundle-version</key><string>${xml(signed.bundleVersion)}</string>
<key>kind</key><string>software</string><key>title</key><string>CERTIOS CSign Free</string>
</dict></dict></array></dict></plist>`;
}

async function run() {
    const data = JSON.parse(fs.readFileSync(APPS_JSON_PATH, 'utf8'));
    const release = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, 'csign-release.json'), 'utf8'));
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'certios-resign-'));
    const changes = [];
    try {
        for (const entry of data.esign) {
            const timestamp = entry.id.replace(/^esign_/, '');
            if (!/^\d+$/.test(timestamp)) throw new Error(`ID không hợp lệ: ${entry.id}`);
            console.log(`Đang ký ${entry.id}...`);
            const filename = `esign_signed_${timestamp}.ipa`;
            const output = path.join(stage, filename);
            const signed = await signCSign({
                template: path.join(TEMPLATES_DIR, 'CSign_CERTIOS_TEMPLATE.ipa'),
                certificate: path.join(CERTS_DIR, `cert_${timestamp}.p12`),
                provision: path.join(CERTS_DIR, `prov_${timestamp}.mobileprovision`),
                password: 'certios', output, bundleId: `com.certios.${timestamp}`,
                certName: entry.developer || 'Cert'
            });
            const ipaUrl = new URL(entry.ipaUrl);
            ipaUrl.searchParams.set('v', release.sourceCommit.slice(0, 7));
            const plistUrl = new URL(new URL(entry.installUrl).searchParams.get('url'));
            plistUrl.searchParams.set('v', release.sourceCommit.slice(0, 7));
            entry.ipaUrl = ipaUrl.toString();
            entry.installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(plistUrl.toString())}`;
            entry.name = 'CSign Free';
            entry.version = signed.version;
            entry.size = (signed.size / (1024 * 1024)).toFixed(1) + ' MB';
            const plistName = `esign_${timestamp}.plist`;
            fs.writeFileSync(path.join(stage, plistName), manifest(entry.ipaUrl, signed));
            changes.push({ entry: entry.id, filename, plistName, ...signed });
            console.log(`Đã ký ${entry.id}: ${entry.size}, Bundle ID khớp profile.`);
        }
        // Publish only after every certificate has successfully signed the new build.
        for (const change of changes) {
            for (const [name, dir] of [[change.filename, 'esign'], [change.plistName, 'plists']]) {
                const destination = path.join(ROOT, 'public/downloads', dir, name);
                fs.copyFileSync(path.join(stage, name), destination + '.new');
                fs.renameSync(destination + '.new', destination);
            }
        }
        // Preserve unrelated app/config updates made while signing.
        const latest = JSON.parse(fs.readFileSync(APPS_JSON_PATH, 'utf8'));
        const updates = new Map(data.esign.map(entry => [entry.id, entry]));
        latest.esign = latest.esign.map(entry => updates.has(entry.id)
            ? { ...entry, ...Object.fromEntries(['name', 'version', 'size', 'ipaUrl', 'installUrl']
                .map(key => [key, updates.get(entry.id)[key]])) } : entry);
        fs.writeFileSync(APPS_JSON_PATH + '.new', JSON.stringify(latest, null, 2));
        fs.renameSync(APPS_JSON_PATH + '.new', APPS_JSON_PATH);
        fs.writeFileSync(path.join(TEMPLATES_DIR, 'csign-signing-report.json'), JSON.stringify(changes, null, 2) + '\n');
        console.log(`Đã cập nhật toàn bộ ${changes.length} bản CSign Free.`);
    } finally {
        fs.rmSync(stage, { recursive: true, force: true });
    }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });

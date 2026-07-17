const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const https = require('https');
const crypto = require('crypto');
const pLimit = require('p-limit');

const execAsync = util.promisify(exec);
const limit = pLimit(3); // Max 3 concurrent signs

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ESIGN_DIR = path.join(__dirname, '../public/downloads/esign');
const PLISTS_DIR = path.join(__dirname, '../public/downloads/plists');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Ensure directories
[ESIGN_DIR, PLISTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Auto cleanup on startup
(async function cleanupOnStartup() {
    console.log('[API] Cleaning up old temporary files...');
    let changed = false;
    
    if (fs.existsSync(ESIGN_DIR)) {
        const files = fs.readdirSync(ESIGN_DIR);
        for (const file of files) {
            if (file.startsWith('temp_sign_')) {
                fs.unlinkSync(path.join(ESIGN_DIR, file));
                changed = true;
            }
        }
    }
    if (fs.existsSync(PLISTS_DIR)) {
        const files = fs.readdirSync(PLISTS_DIR);
        for (const file of files) {
            if (file.startsWith('temp_sign_')) {
                fs.unlinkSync(path.join(PLISTS_DIR, file));
                changed = true;
            }
        }
    }
    
    if (changed) {
        try {
            await execAsync('git add . && git commit -m "Auto cleanup old temp signs" && git push', { cwd: path.join(__dirname, '..') });
            console.log('[API] Cleanup committed to GitHub.');
        } catch (e) {
            console.error('[API] Git push error during cleanup:', e.message);
        }
    }
})();

// Git Queue to prevent lock conflicts
const gitLimit = pLimit(1);
async function safeGitPush(commitMsg) {
    return gitLimit(async () => {
        try {
            await execAsync(`git add . && git commit -m "${commitMsg}" && git push`, { cwd: path.join(__dirname, '..') });
            return true;
        } catch (e) {
            console.error('[API] Git push error:', e.message);
            return false;
        }
    });
}

// Download helper
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
};

// Rate limiting
const ipLocks = new Map();

function generatePlist(appName, ipaUrl, dest, bundleId) {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>items</key>
    <array>
        <dict>
            <key>assets</key>
            <array>
                <dict>
                    <key>kind</key>
                    <string>software-package</string>
                    <key>url</key>
                    <string>${ipaUrl}</string>
                </dict>
            </array>
            <key>metadata</key>
            <dict>
                <key>bundle-identifier</key>
                <string>${bundleId}</string>
                <key>bundle-version</key>
                <string>1.0</string>
                <key>kind</key>
                <string>software</string>
                <key>title</key>
                <string>${appName}</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>`;
    fs.writeFileSync(dest, plist);
}

app.post('/api/signesign', async (req, res) => {
    const { udid } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!udid || udid.length < 25) {
        return res.status(400).json({ success: false, message: 'UDID không hợp lệ' });
    }

    // Rate limit check
    const now = Date.now();
    if (ipLocks.has(clientIp)) {
        const lockTime = ipLocks.get(clientIp);
        if (now - lockTime < 60000) { // 1 minute per IP
            return res.status(429).json({ success: false, message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau 1 phút.' });
        }
    }
    const timestamp = Date.now();
    const plistName = `temp_sign_${timestamp}.plist`;
    const plistUrl = `https://certios.xyz/downloads/plists/${plistName}`;
    const installUrl = `itms-services://?action=download-manifest&url=${plistUrl}`;

    res.json({ success: true, message: 'Đã nhận yêu cầu ký. Đang tiến hành, vui lòng đợi hệ thống 1 phút...', timestamp, installUrl });

    // Run in background with concurrency limit
    limit(async () => {
        const tmpDir = path.join(__dirname, `tmp_sign_${timestamp}`);
        const zipPath = path.join(tmpDir, 'cert.zip');
        
        try {
            console.log(`[API] Processing sign for UDID: ${udid}`);
            fs.mkdirSync(tmpDir, { recursive: true });

            // 1. Fetch from cuios.shop
            const getCertUrl = 'https://cuios.shop/api/getcert';
            const formData = new URLSearchParams();
            formData.append('udid', udid);

            const fetch = require('node-fetch'); // we need to install node-fetch or use native https
            // We can just use curl to keep it simple since node-fetch is not in package.json
            const curlCmd = `curl -s -X POST -F "udid=${udid}" ${getCertUrl}`;
            const { stdout } = await execAsync(curlCmd);
            const certData = JSON.parse(stdout);

            if (!certData.certFile || !certData.password) {
                throw new Error('Không lấy được thông tin chứng chỉ từ Cuios.shop');
            }

            // 2. Download ZIP
            await downloadFile(certData.certFile, zipPath);

            // 3. Unzip
            await execAsync(`unzip -q "${zipPath}" -d "${tmpDir}"`);

            // 4. Find p12 and mobileprovision
            const p12File = (await execAsync(`find "${tmpDir}" -type f -name "*.p12" -not -path "*/__MACOSX/*" | head -n 1`)).stdout.trim();
            const provFile = (await execAsync(`find "${tmpDir}" -type f -name "*.mobileprovision" -not -path "*/__MACOSX/*" | head -n 1`)).stdout.trim();

            if (!p12File || !provFile) {
                throw new Error('Không tìm thấy file chứng chỉ trong ZIP');
            }

            const certPass = certData.password;

            // 5. Unzip ESign Template
            const esignBase = path.join(TEMPLATES_DIR, 'ESign_CERTIOS_TEMPLATE.ipa');
            if (!fs.existsSync(esignBase)) {
                throw new Error('Thiếu template ESign');
            }

            const tmpEsignDir = path.join(tmpDir, 'esign_extract');
            fs.mkdirSync(tmpEsignDir, { recursive: true });
            await execAsync(`unzip -q "${esignBase}" -d "${tmpEsignDir}"`);

            // 6. Inject cert
            const certAssetDir = path.join(tmpEsignDir, 'Payload/ESign.app/signing-assets/cuios.shop');
            fs.mkdirSync(certAssetDir, { recursive: true });
            fs.copyFileSync(p12File, path.join(certAssetDir, 'cert.p12'));
            fs.copyFileSync(provFile, path.join(certAssetDir, 'cert.mobileprovision'));
            fs.writeFileSync(path.join(certAssetDir, 'cert.txt'), certPass);

            // 7. Repack IPA
            const repackedIpa = path.join(tmpDir, 'esign_raw.ipa');
            await execAsync(`cd "${tmpEsignDir}" && zip -qr "${repackedIpa}" Payload`);

            // 8. Sign with zsign
            const signedIpaName = `temp_sign_${timestamp}.ipa`;
            const signedIpaPath = path.join(ESIGN_DIR, signedIpaName);
            await execAsync(`zsign -k "${p12File}" -p "${certPass}" -m "${provFile}" -b "com.certios.auto.${timestamp}" -o "${signedIpaPath}" -z 9 "${repackedIpa}"`);

            // 9. Generate Plist
            const plistName = `temp_sign_${timestamp}.plist`;
            const plistPath = path.join(PLISTS_DIR, plistName);
            const ipaUrl = `https://certios.xyz/downloads/esign/${signedIpaName}`;
            generatePlist('CERTIOS ESign', ipaUrl, plistPath, `com.certios.auto.${timestamp}`);

            const plistUrl = `https://certios.xyz/downloads/plists/${plistName}`;
            const installUrl = `itms-services://?action=download-manifest&url=${plistUrl}`;

            // 10. Git push
            await safeGitPush(`Auto sign ESign for ${udid}`);

            // Done! Clean up temp dir
            fs.rmSync(tmpDir, { recursive: true, force: true });
            console.log(`[API] Successfully signed for ${udid}. Install URL: ${installUrl}`);

            // 11. Schedule deletion after 5 minutes
            setTimeout(async () => {
                console.log(`[API] Deleting expired files for ${udid}...`);
                try {
                    if (fs.existsSync(signedIpaPath)) fs.unlinkSync(signedIpaPath);
                    if (fs.existsSync(plistPath)) fs.unlinkSync(plistPath);
                    await safeGitPush(`Auto remove expired sign for ${udid}`);
                } catch (e) {
                    console.error('[API] Error deleting expired files:', e.message);
                }
            }, 5 * 60 * 1000); // 5 minutes

        } catch (err) {
            console.error(`[API] Error signing for ${udid}:`, err.message);
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

app.listen(3030, () => {
    console.log('[API] Server listening on port 3030');
});

module.exports = app;

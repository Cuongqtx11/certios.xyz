const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

const execAsync = util.promisify(exec);

// === Custom concurrency limiter (replaces p-limit ESM module) ===
function createLimit(concurrency) {
    let active = 0;
    const queue = [];

    function next() {
        if (queue.length === 0 || active >= concurrency) return;
        active++;
        const { fn, resolve, reject } = queue.shift();
        fn().then(resolve, reject).finally(() => {
            active--;
            next();
        });
    }

    return function limit(fn) {
        return new Promise((resolve, reject) => {
            queue.push({ fn, resolve, reject });
            next();
        });
    };
}

const signLimit = createLimit(3); // Max 3 concurrent signs
const gitLimit = createLimit(1);  // Max 1 git operation at a time

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/downloads', express.static(path.join(__dirname, '../public/downloads')));

const ESIGN_DIR = path.join(__dirname, '../public/downloads/esign');
const PLISTS_DIR = path.join(__dirname, '../public/downloads/plists');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Ensure directories
[ESIGN_DIR, PLISTS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Auto cleanup on startup
(async function cleanupOnStartup() {
    console.log('[API] Cleaning up old temporary files on startup...');
    let cleaned = 0;

    for (const dir of [ESIGN_DIR, PLISTS_DIR]) {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                if (file.startsWith('temp_sign_')) {
                    try {
                        fs.unlinkSync(path.join(dir, file));
                        cleaned++;
                    } catch (e) { /* ignore */ }
                }
            }
        }
    }

    // Also cleanup any leftover tmp_sign_ directories
    const serverDir = __dirname;
    const entries = fs.readdirSync(serverDir);
    for (const entry of entries) {
        if (entry.startsWith('tmp_sign_')) {
            const fullPath = path.join(serverDir, entry);
            try {
                fs.rmSync(fullPath, { recursive: true, force: true });
                cleaned++;
            } catch (e) { /* ignore */ }
        }
    }

    if (cleaned > 0) {
        console.log(`[API] Cleaned ${cleaned} temp files/dirs.`);
        // await safeGitPush('Auto cleanup old temp signs on startup');
    } else {
        console.log('[API] No temp files to clean.');
    }
})();

// Git Queue to prevent lock conflicts
async function safeGitPush(commitMsg) {
    return gitLimit(async () => {
        try {
            await execAsync(`git add . && git commit -m "${commitMsg}" && git push`, {
                cwd: path.join(__dirname, '..'),
                timeout: 60000
            });
            console.log(`[API] Git pushed: ${commitMsg}`);
            return true;
        } catch (e) {
            // "nothing to commit" is not really an error
            if (e.message && e.message.includes('nothing to commit')) {
                console.log('[API] Git: nothing to commit');
                return true;
            }
            console.error('[API] Git push error:', e.message);
            return false;
        }
    });
}

// Download helper with proper redirect following
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(dest);
        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(dest);
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
                return reject(new Error(`Download failed with status ${response.statusCode}`));
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            try { fs.unlinkSync(dest); } catch (_) { }
            reject(err);
        });
    });
}

// Rate limiting by IP
const ipLocks = new Map();
const IP_COOLDOWN = 60000; // 1 minute

// In-progress job tracking for status polling
const jobs = new Map();
const udidJobs = new Map();

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

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// Status polling endpoint
app.get('/api/signesign/status/:jobId', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
        return res.status(404).json({ success: false, message: 'Job không tồn tại hoặc đã hết hạn.' });
    }
    res.json(job);
});

// Main signing endpoint
app.post('/api/signesign', async (req, res) => {
    const { udid } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!udid || udid.length < 10) {
        return res.status(400).json({ success: false, message: 'UDID không hợp lệ' });
    }

    // Sanitize UDID to prevent command injection
    const cleanUdid = udid.replace(/[^a-zA-Z0-9\-]/g, '');
    if (cleanUdid !== udid) {
        return res.status(400).json({ success: false, message: 'UDID chứa ký tự không hợp lệ' });
    }

    const now = Date.now();

    // Check if there is already an ongoing or recently completed job for this UDID
    if (udidJobs.has(cleanUdid)) {
        const existingJobId = udidJobs.get(cleanUdid);
        const existingJob = jobs.get(existingJobId);
        if (existingJob) {
            const timeSinceCreation = now - existingJob.createdAt;
            // If the job is still active/valid (within 5 minutes = 300,000 ms)
            if (timeSinceCreation < 5 * 60 * 1000) {
                console.log(`[API] Reusing existing job ${existingJobId} for UDID: ${cleanUdid}`);
                return res.json({
                    success: true,
                    message: existingJob.status === 'done' ? 'Đã tìm thấy link cài đặt cũ (chưa hết hạn).' : 'Đang tiếp tục quá trình ký trước đó...',
                    jobId: existingJobId,
                    timestamp: now
                });
            } else {
                udidJobs.delete(cleanUdid);
            }
        } else {
            udidJobs.delete(cleanUdid);
        }
    }

    // Rate limit check
    if (!ipLocks.has(clientIp)) {
        ipLocks.set(clientIp, []);
    }
    const timestamps = ipLocks.get(clientIp);
    const validTimestamps = timestamps.filter(t => now - t < IP_COOLDOWN);
    
    if (validTimestamps.length >= 3) {
        const oldest = validTimestamps[0];
        const remaining = Math.ceil((IP_COOLDOWN - (now - oldest)) / 1000);
        return res.status(429).json({
            success: false,
            message: `Bạn đã đạt giới hạn 3 lần/phút. Vui lòng thử lại sau ${remaining} giây.`
        });
    }

    // Set rate limit lock
    validTimestamps.push(now);
    ipLocks.set(clientIp, validTimestamps);

    const timestamp = Date.now();
    const jobId = `${timestamp}_${crypto.randomBytes(4).toString('hex')}`;
    udidJobs.set(cleanUdid, jobId);

    // Create job entry
    jobs.set(jobId, {
        success: true,
        status: 'processing',
        step: 'init',
        message: 'Đã nhận yêu cầu ký. Đang xử lý...',
        installUrl: null,
        progress: 5,
        createdAt: timestamp
    });

    // Respond immediately with job ID for polling
    res.json({
        success: true,
        message: 'Đã nhận yêu cầu ký. Đang tiến hành xử lý...',
        jobId,
        timestamp
    });

    // Run signing process in background with concurrency limit
    signLimit(async () => {
        const tmpDir = path.join(__dirname, `tmp_sign_${timestamp}`);

        try {
            console.log(`[API] Processing sign for UDID: ${cleanUdid}, Job: ${jobId}`);
            fs.mkdirSync(tmpDir, { recursive: true });

            // Update job: Step 1 - Fetch cert info from Cuios.shop
            jobs.set(jobId, { ...jobs.get(jobId), step: 'fetch_cert', message: 'Đang lấy thông tin chứng chỉ từ Cuios.shop...', progress: 15 });

            const curlCmd = `curl -s -X POST -d "udid=${cleanUdid}" "https://cuios.shop/api/getcert"`;
            let certData;
            try {
                const { stdout } = await execAsync(curlCmd, { timeout: 30000 });
                certData = JSON.parse(stdout);
            } catch (e) {
                throw new Error('Không thể kết nối hoặc lấy thông tin từ Cuios.shop. Kiểm tra UDID có đơn hàng hợp lệ.');
            }

            if (!certData || (!certData.certFile && !certData.p12_url)) {
                throw new Error('Không tìm thấy đơn hàng hoặc chứng chỉ cho UDID này trên Cuios.shop.');
            }

            const certFileUrl = certData.certFile || certData.p12_url;
            const certPass = certData.password || certData.p12_password || '';

            if (!certFileUrl) {
                throw new Error('Không lấy được link tải chứng chỉ.');
            }

            // Update job: Step 2 - Download cert
            jobs.set(jobId, { ...jobs.get(jobId), step: 'download_cert', message: 'Đang tải chứng chỉ cá nhân...', progress: 30 });

            const zipPath = path.join(tmpDir, 'cert.zip');
            await downloadFile(certFileUrl, zipPath);

            // Check if it's actually a zip or direct p12
            const fileHeader = fs.readFileSync(zipPath).slice(0, 4);
            const isZip = fileHeader[0] === 0x50 && fileHeader[1] === 0x4B;

            let p12File, provFile;

            if (isZip) {
                // Unzip
                await execAsync(`unzip -o -q "${zipPath}" -d "${tmpDir}"`, { timeout: 30000 });

                // Find p12 and mobileprovision
                p12File = (await execAsync(`find "${tmpDir}" -type f -name "*.p12" -not -path "*/__MACOSX/*" | head -n 1`)).stdout.trim();
                provFile = (await execAsync(`find "${tmpDir}" -type f -name "*.mobileprovision" -not -path "*/__MACOSX/*" | head -n 1`)).stdout.trim();
            } else {
                // Maybe it's a direct .p12 file
                p12File = zipPath;
                // Check if there's a separate mobileprovision URL
                if (certData.provFile || certData.mobileprovision_url) {
                    const provUrl = certData.provFile || certData.mobileprovision_url;
                    provFile = path.join(tmpDir, 'cert.mobileprovision');
                    await downloadFile(provUrl, provFile);
                }
            }

            if (!p12File) {
                throw new Error('Không tìm thấy file chứng chỉ .p12 trong dữ liệu tải về.');
            }

            // Update job: Step 3 - Sign with zsign
            jobs.set(jobId, { ...jobs.get(jobId), step: 'signing', message: 'Đang ký ESign tự động...', progress: 55 });

            // Check template exists
            const esignBase = path.join(TEMPLATES_DIR, 'ESign_CERTIOS_TEMPLATE.ipa');
            if (!fs.existsSync(esignBase)) {
                throw new Error('Thiếu template ESign trên server. Liên hệ admin.');
            }

            // Unpack template
            const tmpEsignDir = path.join(tmpDir, 'esign_extract');
            fs.mkdirSync(tmpEsignDir, { recursive: true });
            await execAsync(`unzip -o -q "${esignBase}" -d "${tmpEsignDir}"`, { timeout: 60000 });

            // Inject cert into ESign app
            const certAssetDir = path.join(tmpEsignDir, 'Payload/ESign.app/signing-assets/cuios.shop');
            fs.mkdirSync(certAssetDir, { recursive: true });
            fs.copyFileSync(p12File, path.join(certAssetDir, 'cert.p12'));
            if (provFile && fs.existsSync(provFile)) {
                fs.copyFileSync(provFile, path.join(certAssetDir, 'cert.mobileprovision'));
            }
            if (certPass) {
                fs.writeFileSync(path.join(certAssetDir, 'cert.txt'), certPass);
            }

            // Repack IPA
            jobs.set(jobId, { ...jobs.get(jobId), message: 'Đang đóng gói IPA...', progress: 65 });
            const repackedIpa = path.join(tmpDir, 'esign_raw.ipa');
            await execAsync(`cd "${tmpEsignDir}" && zip -qr "${repackedIpa}" Payload`, { timeout: 120000 });

            // Sign with zsign
            jobs.set(jobId, { ...jobs.get(jobId), message: 'Đang ký chữ ký số với zsign...', progress: 75 });
            const signedIpaName = `temp_sign_${timestamp}.ipa`;
            const signedIpaPath = path.join(ESIGN_DIR, signedIpaName);

            const bundleId = `com.certios.esign.${timestamp}`;
            let zsignCmd;

            if (provFile && fs.existsSync(provFile)) {
                zsignCmd = `zsign -k "${p12File}" -p "${certPass}" -m "${provFile}" -b "${bundleId}" -o "${signedIpaPath}" -z 9 "${repackedIpa}"`;
            } else {
                // Sign without mobileprovision (may work for some certs)
                zsignCmd = `zsign -k "${p12File}" -p "${certPass}" -b "${bundleId}" -o "${signedIpaPath}" -z 9 "${repackedIpa}"`;
            }

            await execAsync(zsignCmd, { timeout: 180000 });

            if (!fs.existsSync(signedIpaPath)) {
                throw new Error('zsign không tạo được file IPA đã ký.');
            }

            // Generate plist
            jobs.set(jobId, { ...jobs.get(jobId), message: 'Đang tạo link cài đặt...', progress: 85 });
            const plistName = `temp_sign_${timestamp}.plist`;
            const plistPath = path.join(PLISTS_DIR, plistName);
            const ipaUrl = `https://api.p12.vn/downloads/esign/${signedIpaName}`;
            generatePlist('CERTIOS ESign', ipaUrl, plistPath, bundleId);

            // Git push to make files accessible via GitHub Pages
            // jobs.set(jobId, { ...jobs.get(jobId), message: 'Đang đẩy lên server tải...', progress: 90 });
            // await safeGitPush(`Auto sign ESign for ${cleanUdid}`);

            // Generate install URL
            const plistUrl = `https://api.p12.vn/downloads/plists/${plistName}`;
            const installUrl = `itms-services://?action=download-manifest&url=${plistUrl}`;

            // Cleanup temp dir
            fs.rmSync(tmpDir, { recursive: true, force: true });

            // Update job: Done!
            jobs.set(jobId, {
                success: true,
                status: 'done',
                step: 'done',
                message: '🎉 Ký thành công! Nhấn nút bên dưới để cài đặt ESign.',
                installUrl,
                progress: 100,
                createdAt: timestamp,
                doneAt: Date.now(),
                certPassword: certPass || 'Không có mật khẩu'
            });

            console.log(`[API] ✅ Successfully signed for ${cleanUdid}. Job: ${jobId}`);

            // Schedule auto-deletion after 5 minutes
            setTimeout(async () => {
                console.log(`[API] 🗑️ Deleting expired files for job ${jobId}...`);
                try {
                    if (fs.existsSync(signedIpaPath)) fs.unlinkSync(signedIpaPath);
                    if (fs.existsSync(plistPath)) fs.unlinkSync(plistPath);
                    // await safeGitPush(`Auto remove expired sign for ${cleanUdid}`);
                    // Remove job from tracking
                    jobs.delete(jobId);
                    if (udidJobs.get(cleanUdid) === jobId) {
                        udidJobs.delete(cleanUdid);
                    }
                } catch (e) {
                    console.error('[API] Error deleting expired files:', e.message);
                }
            }, 10 * 60 * 1000); // 10 minutes

        } catch (err) {
            console.error(`[API] ❌ Error signing for ${cleanUdid}:`, err.message);
            // Clean up temp dir
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { }

            // Update job with error
            jobs.set(jobId, {
                success: false,
                status: 'error',
                step: 'error',
                message: `Lỗi: ${err.message}`,
                installUrl: null,
                progress: 0,
                createdAt: timestamp
            });

            // Clean up error job after 5 minutes
            setTimeout(() => { 
                jobs.delete(jobId); 
                if (udidJobs.get(cleanUdid) === jobId) {
                    udidJobs.delete(cleanUdid);
                }
            }, 5 * 60 * 1000);
        }
    });
});

// Cleanup expired rate limits every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of ipLocks.entries()) {
        const valid = timestamps.filter(t => now - t < IP_COOLDOWN);
        if (valid.length === 0) {
            ipLocks.delete(ip);
        } else {
            ipLocks.set(ip, valid);
        }
    }
}, 5 * 60 * 1000);

const PORT = 3005;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[API] ✅ Server listening on port ${PORT}`);
    console.log(`[API] Endpoints:`);
    console.log(`  POST /api/signesign - Start signing`);
    console.log(`  GET  /api/signesign/status/:jobId - Poll job status`);
    console.log(`  GET  /api/health - Health check`);
});

module.exports = app;

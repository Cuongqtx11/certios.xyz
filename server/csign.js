const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function signCSign({ template, certificate, provision, password, output, bundleId, certName, udid }) {
    if (!provision || !fs.existsSync(provision)) {
        return Promise.reject(new Error('Thiếu provisioning profile; cần cả .p12 và .mobileprovision để cài CSign.'));
    }
    const args = [path.join(__dirname, 'csign_ipa.py'),
        '--template', template, '--certificate', certificate, '--provision', provision,
        '--output', output, '--bundle-id', bundleId, '--cert-name', certName];
    if (udid) args.push('--udid', udid);
    return new Promise((resolve, reject) => {
        const child = spawn('python3', args);
        let stdout = '', stderr = '';
        child.stdout.on('data', data => { stdout += data; });
        child.stderr.on('data', data => { stderr += data; });
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0) return reject(new Error(stderr.trim() || 'Không thể ký CSign.'));
            try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Kết quả ký CSign không hợp lệ.')); }
        });
        child.stdin.on('error', () => {});
        child.stdin.end(JSON.stringify({ password }));
    });
}

module.exports = { signCSign };

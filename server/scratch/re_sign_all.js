const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APPS_JSON_PATH = path.join(__dirname, '../../public/apps.json');
const CERTS_DIR = path.join(__dirname, '../../public/downloads/certs');
const ESIGN_DIR = path.join(__dirname, '../../public/downloads/esign');
const PLISTS_DIR = path.join(__dirname, '../../public/downloads/plists');
const TEMPLATES_DIR = path.join(__dirname, '../templates');

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

async function run() {
    let appsData = JSON.parse(fs.readFileSync(APPS_JSON_PATH));
    const esignBase = path.join(TEMPLATES_DIR, 'CSign_CERTIOS_TEMPLATE.ipa');

    if (!fs.existsSync(esignBase)) {
        console.log("Template not found:", esignBase);
        return;
    }

    for (let i = 0; i < appsData.esign.length; i++) {
        const entry = appsData.esign[i];
        const timestamp = entry.id.replace('esign_', '');
        console.log(`Processing ${entry.id}...`);

        const p12File = path.join(CERTS_DIR, `cert_${timestamp}.p12`);
        const provFile = path.join(CERTS_DIR, `prov_${timestamp}.mobileprovision`);
        
        if (!fs.existsSync(p12File)) {
            console.log(`Skipping ${entry.id}, p12 not found: ${p12File}`);
            continue;
        }

        const certName = entry.developer;
        const safeCertName = certName.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Cert';

        const tmpEsignDir = path.join(__dirname, 'tmp_esign_' + timestamp);
        fs.mkdirSync(tmpEsignDir, { recursive: true });
        execSync(`unzip -q "${esignBase}" -d "${tmpEsignDir}"`);
        
        const certDir = path.join(tmpEsignDir, 'Payload/CSign.app/signing-assets', safeCertName);
        fs.mkdirSync(certDir, { recursive: true });
        fs.copyFileSync(p12File, path.join(certDir, 'cert.p12'));
        
        if (fs.existsSync(provFile)) {
            fs.copyFileSync(provFile, path.join(certDir, 'cert.mobileprovision'));
        }
        
        fs.writeFileSync(path.join(certDir, 'cert.txt'), 'certios');
        
        const repackedIpa = path.join(__dirname, `esign_raw_${timestamp}.ipa`);
        execSync(`cd "${tmpEsignDir}" && zip -qr "${repackedIpa}" Payload`);
        
        const signedEsignIpa = path.join(ESIGN_DIR, `esign_signed_${timestamp}.ipa`);
        let zsignCmd;
        if (fs.existsSync(provFile)) {
            zsignCmd = `zsign -k "${p12File}" -p "certios" -m "${provFile}" -b "com.certios.${timestamp}" -o "${signedEsignIpa}" -z 9 "${repackedIpa}"`;
        } else {
            zsignCmd = `zsign -k "${p12File}" -p "certios" -b "com.certios.${timestamp}" -o "${signedEsignIpa}" -z 9 "${repackedIpa}"`;
        }
        execSync(zsignCmd);
        
        fs.rmSync(tmpEsignDir, { recursive: true, force: true });
        fs.unlinkSync(repackedIpa);
        
        const plistPath = path.join(PLISTS_DIR, `esign_${timestamp}.plist`);
        const bundleId = `com.certios.${timestamp}`;
        generatePlist('CERTIOS CSign Free', entry.ipaUrl, plistPath, bundleId);
        
        // Update entry
        entry.name = 'CSign Free';
        
        // Update file size
        const sizeMb = (fs.statSync(signedEsignIpa).size / (1024 * 1024)).toFixed(1) + ' MB';
        entry.size = sizeMb;

        console.log(`Finished ${entry.id} -> CSign Free, size: ${sizeMb}`);
    }

    fs.writeFileSync(APPS_JSON_PATH, JSON.stringify(appsData, null, 2));
    console.log("Updated apps.json");
}

run();

const fs = require('fs');
let code = fs.readFileSync('bot.js', 'utf8');

// 1. Update paths
code = code.replace(
    /const CERTS_DIR = [^\n]+\nconst IPAS_DIR = [^\n]+\nconst PLISTS_DIR = [^\n]+\n\n\/\/ Ensure directories exist\n\[[^\]]+\]\.forEach\(dir => \{\n\s*if \(\!fs\.existsSync\(dir\)\) fs\.mkdirSync\(dir, \{ recursive: true \}\);\n\}\);/m,
`const CERTS_DIR = path.join(__dirname, '../public/downloads/certs');
const ESIGN_DIR = path.join(__dirname, '../public/downloads/esign');
const MODS_DIR = path.join(__dirname, '../public/downloads/mods');
const PLISTS_DIR = path.join(__dirname, '../public/downloads/plists');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Ensure directories exist
[CERTS_DIR, ESIGN_DIR, MODS_DIR, PLISTS_DIR, TEMPLATES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});`
);

// 2. Update Upload Chứng Chỉ text handler
code = code.replace(
    /if \(text === '🪪 Upload Chứng Chỉ'\) \{\n\s*userStates\[chatId\] = \{ step: 'WAITING_CERT_NAME' \};\n\s*bot\.sendMessage\(chatId, '[^']+'\);\n\s*return;\n\s*\}/m,
`if (text === '🪪 Upload Chứng Chỉ') {
        userStates[chatId] = { step: 'WAITING_CERT_ZIP' };
        bot.sendMessage(chatId, 'Vui lòng gửi file .zip chứa chứng chỉ (.p12 và .mobileprovision).');
        return;
    }`
);

// 3. Remove WAITING_CERT_NAME block
code = code.replace(
    /if \(state\.step === 'WAITING_CERT_NAME'\) \{\n[\s\S]*?return;\n\s*\}/m,
    ''
);

// 4. Update IPAS_DIR to MODS_DIR in WAITING_IPA
code = code.replace(
    /const rawIpaPath = path\.join\(IPAS_DIR, `raw_\$\{timestamp\}\.ipa`\);/g,
    'const rawIpaPath = path.join(MODS_DIR, `raw_${timestamp}.ipa`);'
);
code = code.replace(
    /const signedIpaPath = path\.join\(IPAS_DIR, `signed_\$\{timestamp\}\.ipa`\);/g,
    'const signedIpaPath = path.join(MODS_DIR, `signed_${timestamp}.ipa`);'
);
code = code.replace(
    /const ipaUrl = `https:\/\/certios\.xyz\/downloads\/ipas\/signed_\$\{timestamp\}\.ipa`;/g,
    'const ipaUrl = `https://certios.xyz/downloads/mods/signed_${timestamp}.ipa`;'
);

// 5. processCertZip: add name extraction, update ESign paths, ESign name
code = code.replace(
    /await updateLogs\('\[ \* \] Đang đổi mật khẩu p12 thành "certios"\.\.\.'\);/,
    `await updateLogs('[ * ] Đang nhận diện tên chứng chỉ...');
        let certName = 'Chứng Chỉ Mới';
        try {
            const subject = execSync(\`openssl pkcs12 -in "\${p12File}" -passin "pass:\${state.certPass}" -nokeys | openssl x509 -noout -subject 2>/dev/null || true\`).toString();
            const match = subject.match(/CN\\s*=\\s*([^,\\n]+)/);
            if (match && match[1]) {
                certName = match[1].trim();
            }
        } catch(e) {}
        state.appName = certName;
        await updateLogs(\`[ + ] Tên chứng chỉ: \${certName}\`);
        
        await updateLogs('[ * ] Đang đổi mật khẩu p12 thành "certios"...');`
);

code = code.replace(
    /const esignBase = path\.join\(__dirname, 'ESign_CERTIOS_TEMPLATE\.ipa'\);/,
    `const esignBase = path.join(TEMPLATES_DIR, 'ESign_CERTIOS_TEMPLATE.ipa');`
);

code = code.replace(
    /const repackedIpa = path\.join\(IPAS_DIR, `esign_raw_\$\{timestamp\}\.ipa`\);/g,
    'const repackedIpa = path.join(ESIGN_DIR, `esign_raw_${timestamp}.ipa`);'
);
code = code.replace(
    /const signedEsignIpa = path\.join\(IPAS_DIR, `esign_signed_\$\{timestamp\}\.ipa`\);/g,
    'const signedEsignIpa = path.join(ESIGN_DIR, `esign_signed_${timestamp}.ipa`);'
);
code = code.replace(
    /const ipaUrl = `https:\/\/certios\.xyz\/downloads\/ipas\/esign_signed_\$\{timestamp\}\.ipa`;/g,
    'const ipaUrl = `https://certios.xyz/downloads/esign/esign_signed_${timestamp}.ipa`;'
);

code = code.replace(
    /name: 'CERTIOS ESign VIP \(' \+ state\.appName \+ '\)',/,
    `name: 'ESign',`
);

fs.writeFileSync('bot.js', code);

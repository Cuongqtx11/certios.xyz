const fs = require('fs');
let code = fs.readFileSync('bot.js', 'utf8');

// Replace text handlers
code = code.replace(
    /if \(state\.step === 'WAITING_CERT_NAME'\) {[\s\S]*?if \(state\.step === 'WAITING_ESIGN_NAME'\) {/m,
`if (state.step === 'WAITING_CERT_NAME') {
        state.appName = text;
        state.step = 'WAITING_CERT_ZIP';
        userStates[chatId] = state;
        bot.sendMessage(chatId, \`Tên chứng chỉ: \${text}\\nBây giờ hãy gửi file .zip chứa chứng chỉ (.p12 và .mobileprovision).\`);
        return;
    }
    
    if (state.step === 'WAITING_CERT_ZIP_PASS') {
        state.certPass = text === 'none' ? '' : text;
        state.step = 'IDLE';
        userStates[chatId] = state;
        processCertZip(chatId, state);
        return;
    }

    if (state.step === 'WAITING_ESIGN_NAME') {`
);

// Replace document handler for certs
code = code.replace(
    /if \(state\.step === 'WAITING_P12' && fileName\.endsWith\('\.p12'\)\) {[\s\S]*?if \(state\.step === 'WAITING_IPA' && fileName\.endsWith\('\.ipa'\)\) {/m,
`if (state.step === 'WAITING_CERT_ZIP' && fileName.endsWith('.zip')) {
        bot.sendMessage(chatId, 'Đang tải file ZIP...');
        const fileLink = await bot.getFileLink(document.file_id);
        const zipPath = path.join(CERTS_DIR, \`cert_\${Date.now()}.zip\`);
        await downloadFile(fileLink, zipPath);
        state.zipPath = zipPath;
        state.step = 'WAITING_CERT_ZIP_PASS';
        userStates[chatId] = state;
        bot.sendMessage(chatId, '✅ Đã tải xong ZIP. Hãy gửi MẬT KHẨU của p12 (Nếu không có, gõ "none").');
        return;
    }

    if (state.step === 'WAITING_IPA' && fileName.endsWith('.ipa')) {`
);

// Replace IPA handler
code = code.replace(
    /if \(state\.step === 'WAITING_IPA' && fileName\.endsWith\('\.ipa'\)\) {[\s\S]*?return;\n    }/m,
`if (state.step === 'WAITING_IPA' && fileName.endsWith('.ipa')) {
        let msg = await bot.sendMessage(chatId, '\`\`\`\\n[ * ] Đang tải IPA...\\n\`\`\`', { parse_mode: 'Markdown' });
        const fileLink = await bot.getFileLink(document.file_id);
        
        const timestamp = Date.now();
        const rawIpaPath = path.join(IPAS_DIR, \`raw_\${timestamp}.ipa\`);
        const signedIpaPath = path.join(IPAS_DIR, \`signed_\${timestamp}.ipa\`);
        const plistPath = path.join(PLISTS_DIR, \`install_\${timestamp}.plist\`);
        
        let logs = ['[ * ] Đang tải IPA...'];
        const updateLogs = async (line) => {
            logs.push(line);
            try { await bot.editMessageText('\`\`\`\\n' + logs.join('\\n') + '\\n\`\`\`', { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }); } catch(e){}
        };

        try {
            await downloadFile(fileLink, rawIpaPath);
            await updateLogs('[ * ] Đã tải xong IPA.');
            await updateLogs('[ * ] Bắt đầu KÝ ỨNG DỤNG (zsign)...');
            
            // Execute zsign
            const cmd = \`zsign -k "\${latestCert.p12}" -p "\${latestCert.pass}" -m "\${latestCert.prov}" -o "\${signedIpaPath}" -z 9 "\${rawIpaPath}"\`;
            execSync(cmd);
            
            // Clean up raw
            fs.unlinkSync(rawIpaPath);
            await updateLogs('[ + ] Ký ứng dụng thành công!');
            
            // Generate Plist
            const ipaUrl = \`https://certios.xyz/downloads/ipas/signed_\${timestamp}.ipa\`;
            generatePlist(state.appName, ipaUrl, plistPath);
            
            // Add to apps.json
            const dateStr = new Date().toLocaleDateString('vi-VN');
            const plistUrl = \`https://certios.xyz/downloads/plists/install_\${timestamp}.plist\`;
            const installUrl = \`itms-services://?action=download-manifest&url=\${plistUrl}\`;
            
            const newEntry = {
                id: \`\${state.appType}_\${timestamp}\`,
                name: state.appName,
                developer: 'CERTIOS Auto',
                status: 'active',
                size: 'Auto',
                version: '1.0',
                date: dateStr,
                icon: 'https://vsacheat.com/img/esign.png',
                installUrl: installUrl
            };
            updateJSON(state.appType, newEntry);
            
            userStates[chatId] = { step: 'IDLE' };
            await updateLogs('[ + ] Đã thêm lên Web!');
            bot.sendMessage(chatId, \`✅ Ký ứng dụng thành công!\\nỨng dụng [\${state.appName}] đã được thêm vào trang Web.\\nCài đặt: \${installUrl}\\nChọn "Push to GitHub" để xuất bản lên web.\`);

        } catch (e) {
            await updateLogs('[ - ] Lỗi xử lý IPA: ' + e.message);
        }
        return;
    }`
);

// Append processCertZip function
code += `

async function processCertZip(chatId, state) {
    let msg = await bot.sendMessage(chatId, '\`\`\`\\n[ * ] Bắt đầu xử lý ZIP...\\n\`\`\`', { parse_mode: 'Markdown' });
    let logs = ['[ * ] Bắt đầu xử lý ZIP...'];
    const updateLogs = async (line) => {
        logs.push(line);
        try { await bot.editMessageText('\`\`\`\\n' + logs.join('\\n') + '\\n\`\`\`', { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }); } catch(e){}
    };

    try {
        const timestamp = Date.now();
        const tmpDir = path.join(CERTS_DIR, \`tmp_zip_\${timestamp}\`);
        fs.mkdirSync(tmpDir, { recursive: true });
        
        await updateLogs('[ * ] Đang giải nén ZIP...');
        execSync(\`unzip -q "\${state.zipPath}" -d "\${tmpDir}"\`);
        
        // Find p12 and mobileprovision
        const p12File = execSync(\`find "\${tmpDir}" -type f -name "*.p12" -not -path "*/__MACOSX/*" | head -n 1\`).toString().trim();
        const provFile = execSync(\`find "\${tmpDir}" -type f -name "*.mobileprovision" -not -path "*/__MACOSX/*" | head -n 1\`).toString().trim();
        
        if (!p12File || !provFile) {
            throw new Error("Không tìm thấy file .p12 hoặc .mobileprovision trong ZIP!");
        }
        
        await updateLogs('[ * ] Đang đổi mật khẩu p12 thành "certios"...');
        const tmpPem = path.join(tmpDir, 'temp.pem');
        const newP12Path = path.join(CERTS_DIR, \`cert_\${timestamp}.p12\`);
        const newProvPath = path.join(CERTS_DIR, \`prov_\${timestamp}.mobileprovision\`);
        
        // Change password
        execSync(\`openssl pkcs12 -in "\${p12File}" -passin "pass:\${state.certPass}" -nodes -out "\${tmpPem}"\`);
        execSync(\`openssl pkcs12 -export -in "\${tmpPem}" -passout "pass:certios" -out "\${newP12Path}"\`);
        
        fs.copyFileSync(provFile, newProvPath);
        
        // Cleanup ZIP and tmpDir
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.unlinkSync(state.zipPath);
        
        latestCert = { p12: newP12Path, prov: newProvPath, pass: 'certios' };
        await updateLogs('[ + ] Mật khẩu đổi thành công!');
        
        const dateStr = new Date().toLocaleDateString('vi-VN');
        
        // Display Cert on Web
        const newCertEntry = {
            id: 'cert_' + timestamp,
            name: state.appName,
            description: 'Tự động ký chứng chỉ',
            status: 'active',
            version: 'Vĩnh viễn',
            date: dateStr,
            icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSiEQCh3W32OqIspAx8-OlEnTiDGXz8eYRMfz15DL4vrw&s=10'
        };
        updateJSON('cert', newCertEntry);
        await updateLogs('[ + ] Đã hiển thị Chứng Chỉ lên web!');
        
        // Auto sign ESign VIP
        await updateLogs('[ * ] Đang Ký ESign VIP...');
        const esignBase = path.join(__dirname, 'ESign_CERTIOS_TEMPLATE.ipa');
        if (fs.existsSync(esignBase)) {
            const tmpEsignDir = path.join(__dirname, 'tmp_esign_' + timestamp);
            fs.mkdirSync(tmpEsignDir, { recursive: true });
            execSync(\`unzip -q "\${esignBase}" -d "\${tmpEsignDir}"\`);
            
            const certDir = path.join(tmpEsignDir, 'Payload/ESign.app/signing-assets/certios.xyz');
            fs.mkdirSync(certDir, { recursive: true });
            fs.copyFileSync(latestCert.p12, path.join(certDir, 'cert.p12'));
            fs.copyFileSync(latestCert.prov, path.join(certDir, 'cert.mobileprovision'));
            fs.writeFileSync(path.join(certDir, 'cert.txt'), latestCert.pass);
            
            const repackedIpa = path.join(IPAS_DIR, \`esign_raw_\${timestamp}.ipa\`);
            execSync(\`cd "\${tmpEsignDir}" && zip -qr "\${repackedIpa}" Payload\`);
            
            const signedEsignIpa = path.join(IPAS_DIR, \`esign_signed_\${timestamp}.ipa\`);
            execSync(\`zsign -k "\${latestCert.p12}" -p "\${latestCert.pass}" -m "\${latestCert.prov}" -o "\${signedEsignIpa}" -z 9 "\${repackedIpa}"\`);
            
            fs.rmSync(tmpEsignDir, { recursive: true, force: true });
            fs.unlinkSync(repackedIpa);
            
            const plistPath = path.join(PLISTS_DIR, \`esign_\${timestamp}.plist\`);
            const ipaUrl = \`https://certios.xyz/downloads/ipas/esign_signed_\${timestamp}.ipa\`;
            generatePlist('CERTIOS ESign', ipaUrl, plistPath);
            
            const plistUrl = \`https://certios.xyz/downloads/plists/esign_\${timestamp}.plist\`;
            const installUrl = \`itms-services://?action=download-manifest&url=\${plistUrl}\`;
            
            const newEsignEntry = {
                id: \`esign_\${timestamp}\`,
                name: 'CERTIOS ESign VIP (' + state.appName + ')',
                developer: 'CERTIOS.XYZ',
                status: 'active',
                size: 'Auto',
                version: 'VIP',
                date: dateStr,
                icon: 'https://vsacheat.com/img/esign.png',
                installUrl: installUrl
            };
            updateJSON('esign', newEsignEntry);
            await updateLogs('[ + ] Ký ESign VIP thành công!');
            bot.sendMessage(chatId, \`✅ Hoàn tất toàn bộ quy trình!\\nLink cài ESign VIP: \${installUrl}\\nĐừng quên chọn "Push to GitHub"\`);
        } else {
            await updateLogs('[ - ] Lỗi: Không tìm thấy ESign_CERTIOS_TEMPLATE.ipa');
        }
    } catch(e) {
        await updateLogs('[ - ] Lỗi: ' + e.message);
    }
}
`;

fs.writeFileSync('bot.js', code);

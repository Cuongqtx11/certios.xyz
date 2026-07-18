const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// Token from the user
const token = '8565117060:AAEHcP73S-K7hvD7HZj4DnCV6-mjKOdWfhM';
const bot = new TelegramBot(token, { 
    polling: {
        interval: 300,
        autoStart: true
    },
    request: {
        agentOptions: {
            keepAlive: true,
            family: 4, localAddress: '192.168.1.21' // Ép dùng IPv4 để tránh lỗi kết nối mạng ENETUNREACH
        }
    }
});

// Bắt lỗi toàn cục để tránh bị crash app
process.on('uncaughtException', (error) => {
    console.log('Uncaught Exception:', error.message || error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection:', reason);
});

bot.on('polling_error', (error) => {
    console.log('Polling error:', error.code || error.message);
});

const APPS_JSON_PATH = path.join(__dirname, '../public/apps.json');
const CERTS_DIR = path.join(__dirname, '../public/downloads/certs');
const ESIGN_DIR = path.join(__dirname, '../public/downloads/esign');
const MODS_DIR = path.join(__dirname, '../public/downloads/mods');
const PLISTS_DIR = path.join(__dirname, '../public/downloads/plists');
const TEMPLATES_DIR = path.join(__dirname, 'templates');

// Ensure directories exist
[CERTS_DIR, ESIGN_DIR, MODS_DIR, PLISTS_DIR, TEMPLATES_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// State management
const userStates = {};
let latestCert = { p12: null, prov: null, pass: '' }; // Quick way to remember latest uploaded cert

console.log('Bot is running...');

const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
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

const ALLOWED_USER = 5654107862;


bot.onText(/\/start/, (msg) => {
    if (msg.from.id !== ALLOWED_USER) return;
    const chatId = msg.chat.id;
    userStates[chatId] = { step: 'IDLE' };
    
    const opts = {
        reply_markup: {
            keyboard: [
                ['🪪 Upload Chứng Chỉ', '📱 Upload ESign'],
                ['🛠 Upload Mods', '🗂 Quản Lý'],
                ['🌐 Push to GitHub', '🔒 Bật/Tắt Tải Cert']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
    bot.sendMessage(chatId, 'Chào mừng đến với hệ thống upload tự động của CERTIOS.XYZ!\nVui lòng chọn một tác vụ bên dưới:', opts);
});

bot.on('message', async (msg) => {
    if (msg.from.id !== ALLOWED_USER) return;
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates[chatId] || { step: 'IDLE' };

    if (text === '🪪 Upload Chứng Chỉ') {
        userStates[chatId] = { step: 'WAITING_CERT_ZIP' };
        bot.sendMessage(chatId, 'Vui lòng gửi file .zip chứa chứng chỉ (.p12 và .mobileprovision).');
        return;
    }
    
    if (text === '📱 Upload ESign') {
        if (!latestCert.p12) return bot.sendMessage(chatId, 'Chưa có chứng chỉ nào trong hệ thống. Vui lòng upload chứng chỉ trước!');
        userStates[chatId] = { step: 'WAITING_ESIGN_NAME' };
        bot.sendMessage(chatId, 'Nhập TÊN hiển thị cho ESign này (vd: ESign Mới Nhất):');
        return;
    }
    
    if (text === '🛠 Upload Mods') {
        userStates[chatId] = { step: 'WAITING_MOD_NAME' };
        bot.sendMessage(chatId, 'Nhập TÊN hiển thị cho Mod này (vd: TikTok Pro):');
        return;
    }
    
    if (text === '🌐 Push to GitHub') {
        bot.sendMessage(chatId, 'Đang push dữ liệu lên GitHub...');
        try {
            execSync('git add . && git commit -m "Auto update apps" && git push', { cwd: path.join(__dirname, '..') });
            bot.sendMessage(chatId, '✅ Push GitHub thành công!');
        } catch (e) {
            bot.sendMessage(chatId, '❌ Push thất bại hoặc không có thay đổi mới.\nLỗi: ' + e.message);
        }
        return;
    }

    if (text === '🔒 Bật/Tắt Tải Cert') {
        let appsData = { config: { certDownloadDisabled: false }, esign: [], cert: [], mods: [] };
        if (fs.existsSync(APPS_JSON_PATH)) {
            appsData = { ...appsData, ...JSON.parse(fs.readFileSync(APPS_JSON_PATH)) };
        }
        
        appsData.config.certDownloadDisabled = !appsData.config.certDownloadDisabled;
        
        fs.writeFileSync(APPS_JSON_PATH, JSON.stringify(appsData, null, 2));
        
        const statusMsg = appsData.config.certDownloadDisabled ? "🔴 ĐÃ KHOÁ tải Cert trên web." : "🟢 ĐÃ MỞ tải Cert trên web.";
        bot.sendMessage(chatId, `Thành công: ${statusMsg}\nĐang push thay đổi lên GitHub...`);
        
        try {
            execSync('git add . && git commit -m "Toggle cert download" && git push', { cwd: path.join(__dirname, '..') });
            bot.sendMessage(chatId, '✅ Đã cập nhật lên Web!');
        } catch (e) {}
        return;
    }

    if (text === '🗂 Quản Lý') {
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Quản lý ESign', callback_data: 'mgr_cat_esign' }],
                    [{ text: '🪪 Quản lý Chứng Chỉ', callback_data: 'mgr_cat_cert' }],
                    [{ text: '🛠 Quản lý Mods', callback_data: 'mgr_cat_mods' }]
                ]
            }
        };
        bot.sendMessage(chatId, 'Chọn chuyên mục bạn muốn quản lý:', opts);
        return;
    }


    // Text inputs for names / passwords
    
    
    if (state.step === 'WAITING_CERT_ZIP_PASS') {
        state.certPass = text === 'none' ? '' : text;
        state.step = 'IDLE';
        userStates[chatId] = state;
        processCertZip(chatId, state);
        return;
    }

    if (state.step === 'WAITING_ESIGN_NAME') {
        state.appName = text;
        state.appType = 'esign';
        state.step = 'WAITING_IPA';
        userStates[chatId] = state;
        bot.sendMessage(chatId, `Tên ESign: ${text}\nBây giờ hãy gửi file .ipa.`);
        return;
    }
    
    
    if (state.step === 'WAITING_RENAME_CERT' && text) {
        const itemId = state.itemId;
        const newName = text;
        
        let appsData = { config: { certDownloadDisabled: false }, esign: [], cert: [], mods: [] };
        if (fs.existsSync(APPS_JSON_PATH)) {
            appsData = { ...appsData, ...JSON.parse(fs.readFileSync(APPS_JSON_PATH)) };
        }
        
        const certItem = appsData.cert.find(i => i.id === itemId);
        if (certItem) {
            certItem.name = newName;
            
            // Also update corresponding esign's developer field
            const timestamp = itemId.split('_')[1];
            const esignId = 'esign_' + timestamp;
            const esignItem = appsData.esign.find(i => i.id === esignId);
            if (esignItem) {
                esignItem.developer = newName;
            }
            
            // If this is the most recently added cert, update latestCert.name in memory so new mods get the new name
            if (appsData.cert.length > 0 && appsData.cert[0].id === itemId && latestCert) {
                latestCert.name = newName;
            }
            
            fs.writeFileSync(APPS_JSON_PATH, JSON.stringify(appsData, null, 2));
            
            bot.sendMessage(chatId, `✅ Đổi tên thành công thành: ${newName}`);
            userStates[chatId] = { step: 'IDLE' };
            
            try {
                execSync('git add . && git commit -m "Auto rename cert" && git push', { cwd: path.join(__dirname, '..') });
            } catch (err) {}
        }
        return;
    }

    if (state.step === 'WAITING_MOD_NAME') {
        state.appName = text;
        state.appType = 'mods';
        state.step = 'WAITING_MOD_DESC';
        userStates[chatId] = state;
        bot.sendMessage(chatId, `Tên Mod: ${text}\nNhập MÔ TẢ ngắn gọn cho Mod này:`);
        return;
    }

    if (state.step === 'WAITING_MOD_DESC') {
        state.appDesc = text;
        state.step = 'WAITING_MOD_ICON';
        userStates[chatId] = state;
        bot.sendMessage(chatId, `Mô tả: ${text}\nNhập LINK ẢNH ICON của Mod (bắt đầu bằng http/https):`);
        return;
    }

    if (state.step === 'WAITING_MOD_ICON') {
        state.appIcon = text;
        state.step = 'WAITING_MOD_IPALINK';
        userStates[chatId] = state;
        bot.sendMessage(chatId, `Icon: ${text}\nNhập LINK TẢI (Link này sẽ được gắn trực tiếp vào nút Nhận trên web):`);
        return;
    }

    if (state.step === 'WAITING_MOD_IPALINK') {
        const downloadLink = text;
        const timestamp = Date.now();
        const dateStr = new Date().toLocaleDateString('vi-VN');
        
        const newEntry = {
            id: `mods_${timestamp}`,
            name: state.appName,
            description: state.appDesc,
            developer: 'Mod',
            status: 'active',
            size: 'N/A',
            version: '1.0',
            date: dateStr,
            icon: state.appIcon,
            installUrl: downloadLink
        };
        updateJSON('mods', newEntry);
        
        userStates[chatId] = { step: 'IDLE' };
        
        try {
            const cp = require('child_process');
            cp.execSync('git add . && git commit -m "Auto add mod link" && git push', { cwd: path.join(__dirname, '..') });
        } catch (err) {}

        bot.sendMessage(chatId, `✅ Đã thêm thành công Mod [${state.appName}] lên Web!\nLink: ${downloadLink}`);
        return;
    }
});

// Handle Document Uploads
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const document = msg.document;
    const fileName = document.file_name;
    const state = userStates[chatId] || { step: 'IDLE' };

    if (state.step === 'WAITING_CERT_ZIP' && fileName.endsWith('.zip')) {
        bot.sendMessage(chatId, 'Đang tải file ZIP...');
        let fileLink;
        try {
            fileLink = await bot.getFileLink(document.file_id);
        } catch (e) {
            bot.sendMessage(chatId, '❌ Lỗi tải file: File quá lớn hoặc lỗi kết nối. Vui lòng thử lại.');
            return;
        }
        const zipPath = path.join(CERTS_DIR, `cert_${Date.now()}.zip`);
        await downloadFile(fileLink, zipPath);
        state.zipPath = zipPath;
        state.step = 'WAITING_CERT_ZIP_PASS';
        userStates[chatId] = state;
        bot.sendMessage(chatId, '✅ Đã tải xong ZIP. Hãy gửi MẬT KHẨU của p12 (Nếu không có, gõ "none").');
        return;
    }

    if (state.step === 'WAITING_IPA' && fileName.endsWith('.ipa')) {
        let msg = await bot.sendMessage(chatId, '```\n[ * ] Đang tải IPA...\n```', { parse_mode: 'Markdown' });
        let fileLink;
        try {
            fileLink = await bot.getFileLink(document.file_id);
        } catch (e) {
            await bot.editMessageText('❌ Lỗi: File quá lớn (Telegram giới hạn 20MB) hoặc mạng lỗi. Hãy dùng chức năng chia nhỏ hoặc lấy link trực tiếp.', { chat_id: chatId, message_id: msg.message_id });
            return;
        }
        
        const timestamp = Date.now();
        const rawIpaPath = path.join(MODS_DIR, `raw_${timestamp}.ipa`);
        const signedIpaPath = path.join(MODS_DIR, `signed_${timestamp}.ipa`);
        const plistPath = path.join(PLISTS_DIR, `install_${timestamp}.plist`);
        
        let logs = ['[ * ] Đang tải IPA...'];
        const updateLogs = async (line) => {
            logs.push(line);
            try { await bot.editMessageText('```\n' + logs.join('\n') + '\n```', { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }); } catch(e){}
        };

        try {
            await downloadFile(fileLink, rawIpaPath);
            await updateLogs('[ * ] Đã tải xong IPA.');
            await updateLogs('[ * ] Bắt đầu KÝ ỨNG DỤNG (zsign)...');
            
            // Execute zsign
            const cmd = `zsign -k "${latestCert.p12}" -p "${latestCert.pass}" -m "${latestCert.prov}" -b "com.certios.${timestamp}" -o "${signedIpaPath}" -z 9 "${rawIpaPath}"`;
            execSync(cmd);
            
            // Clean up raw
            fs.unlinkSync(rawIpaPath);
            await updateLogs('[ + ] Ký ứng dụng thành công!');
            
            // Generate Plist
            const ipaUrl = `https://certios.xyz/downloads/mods/signed_${timestamp}.ipa`;
            const bundleId = `com.certios.${timestamp}`;
            generatePlist(state.appName, ipaUrl, plistPath, bundleId);
            
            // Add to apps.json
            const dateStr = new Date().toLocaleDateString('vi-VN');
            const plistUrl = `https://certios.xyz/downloads/plists/install_${timestamp}.plist`;
            const installUrl = `itms-services://?action=download-manifest&url=${plistUrl}`;
            
            const sizeMb = (fs.statSync(signedIpaPath).size / (1024 * 1024)).toFixed(1) + ' MB';

            const newEntry = {
                id: `${state.appType}_${timestamp}`,
                name: state.appName,
                developer: latestCert.name || 'CERTIOS Auto',
                status: 'active',
                size: sizeMb,
                version: '1.0',
                date: dateStr,
                icon: 'https://vsacheat.com/img/esign.png',
                installUrl: installUrl,
                ipaUrl: ipaUrl
            };
            updateJSON(state.appType, newEntry);
            
            userStates[chatId] = { step: 'IDLE' };
            await updateLogs('[ + ] Đã thêm lên Web!');
            
            try {
                execSync('git add . && git commit -m "Auto update apps" && git push', { cwd: path.join(__dirname, '..') });
                await updateLogs('[ + ] Đã Push lên GitHub thành công!');
            } catch (err) {
                await updateLogs('[ - ] Lỗi Push GitHub: ' + err.message);
            }

            bot.sendMessage(chatId, `✅ Ký ứng dụng thành công!\nỨng dụng [${state.appName}] đã được thêm vào trang Web.\nCài đặt: ${installUrl}`);

        } catch (e) {
            await updateLogs('[ - ] Lỗi xử lý IPA: ' + e.message);
        }
        return;
    }
});

function updateJSON(category, newEntry) {
    let data = { config: { certDownloadDisabled: false }, esign: [], cert: [], mods: [] };
    if (fs.existsSync(APPS_JSON_PATH)) {
        data = { ...data, ...JSON.parse(fs.readFileSync(APPS_JSON_PATH)) };
    }
    
    if (!data[category]) data[category] = [];
    data[category].unshift(newEntry); // Prepend to top
    
    // Keep only top 12
    data[category] = data[category].slice(0, 12);
    
    fs.writeFileSync(APPS_JSON_PATH, JSON.stringify(data, null, 2));
}

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


async function processCertZip(chatId, state) {
    let msg = await bot.sendMessage(chatId, '```\n[ * ] Bắt đầu xử lý ZIP...\n```', { parse_mode: 'Markdown' });
    let logs = ['[ * ] Bắt đầu xử lý ZIP...'];
    const updateLogs = async (line) => {
        logs.push(line);
        try { await bot.editMessageText('```\n' + logs.join('\n') + '\n```', { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }); } catch(e){}
    };

    try {
        const timestamp = Date.now();
        const tmpDir = path.join(CERTS_DIR, `tmp_zip_${timestamp}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        
        await updateLogs('[ * ] Đang giải nén ZIP...');
        execSync(`unzip -q "${state.zipPath}" -d "${tmpDir}"`);
        
        // Find p12 and mobileprovision
        const p12File = execSync(`find "${tmpDir}" -type f -name "*.p12" -not -path "*/__MACOSX/*" | head -n 1`).toString().trim();
        const provFile = execSync(`find "${tmpDir}" -type f -name "*.mobileprovision" -not -path "*/__MACOSX/*" | head -n 1`).toString().trim();
        
        if (!p12File || !provFile) {
            throw new Error("Không tìm thấy file .p12 hoặc .mobileprovision trong ZIP!");
        }
        
        await updateLogs('[ * ] Đang nhận diện tên chứng chỉ...');
        let certName = 'Chứng Chỉ Mới';
        try {
            const subject = execSync(`openssl pkcs12 -legacy -in "${p12File}" -passin "pass:${state.certPass}" -nokeys | openssl x509 -noout -subject 2>/dev/null || true`).toString();
            const match = subject.match(/CN\s*=\s*([^,\n]+)/);
            if (match && match[1]) {
                certName = match[1].trim();
            }
        } catch(e) {}
        state.appName = certName;
        await updateLogs(`[ + ] Tên chứng chỉ: ${certName}`);
        
        await updateLogs('[ * ] Đang đổi mật khẩu p12 thành "certios"...');
        const tmpPem = path.join(tmpDir, 'temp.pem');
        const newP12Path = path.join(CERTS_DIR, `cert_${timestamp}.p12`);
        const newProvPath = path.join(CERTS_DIR, `prov_${timestamp}.mobileprovision`);
        
        // Change password
        execSync(`openssl pkcs12 -legacy -in "${p12File}" -passin "pass:${state.certPass}" -nodes -out "${tmpPem}"`);
        execSync(`openssl pkcs12 -export -in "${tmpPem}" -passout "pass:certios" -out "${newP12Path}"`);
        
        fs.copyFileSync(provFile, newProvPath);
        
        // Cleanup ZIP and tmpDir
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.unlinkSync(state.zipPath);
        
        latestCert = { p12: newP12Path, prov: newProvPath, pass: 'certios', name: certName };
        await updateLogs('[ + ] Mật khẩu đổi thành công!');
        
        const dateStr = new Date().toLocaleDateString('vi-VN');
        
        // Create a ZIP for web download
        const downloadZipPath = path.join(CERTS_DIR, `cert_download_${timestamp}.zip`);
        const passPath = path.join(CERTS_DIR, `pass_${timestamp}.txt`);
        fs.writeFileSync(passPath, 'certios');
        const cp = require('child_process');
        cp.execSync(`zip -j "${downloadZipPath}" "${newP12Path}" "${newProvPath}" "${passPath}"`);
        fs.unlinkSync(passPath);
        
        const certDownloadUrl = `https://certios.xyz/downloads/certs/cert_download_${timestamp}.zip`;
        const sizeMb = (fs.statSync(downloadZipPath).size / 1024).toFixed(1) + ' KB';

        // Display Cert on Web
        const newCertEntry = {
            id: 'cert_' + timestamp,
            name: state.appName,
            description: 'Mật khẩu: certios',
            size: sizeMb,
            status: 'active',
            version: 'Vĩnh viễn',
            date: dateStr,
            icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSiEQCh3W32OqIspAx8-OlEnTiDGXz8eYRMfz15DL4vrw&s=10',
            installUrl: certDownloadUrl
        };
        updateJSON('cert', newCertEntry);
        await updateLogs('[ + ] Đã hiển thị Chứng Chỉ lên web!');
        
        // Auto sign ESign VIP
        await updateLogs('[ * ] Đang Ký ESign VIP...');
        const esignBase = path.join(TEMPLATES_DIR, 'ESign_CERTIOS_TEMPLATE.ipa');
        if (fs.existsSync(esignBase)) {
            const tmpEsignDir = path.join(__dirname, 'tmp_esign_' + timestamp);
            fs.mkdirSync(tmpEsignDir, { recursive: true });
            execSync(`unzip -q "${esignBase}" -d "${tmpEsignDir}"`);
            
            const certDir = path.join(tmpEsignDir, 'Payload/ESign.app/signing-assets/cuios.shop');
            fs.mkdirSync(certDir, { recursive: true });
            fs.copyFileSync(latestCert.p12, path.join(certDir, 'cert.p12'));
            fs.copyFileSync(latestCert.prov, path.join(certDir, 'cert.mobileprovision'));
            fs.writeFileSync(path.join(certDir, 'cert.txt'), latestCert.pass);
            
            const repackedIpa = path.join(ESIGN_DIR, `esign_raw_${timestamp}.ipa`);
            execSync(`cd "${tmpEsignDir}" && zip -qr "${repackedIpa}" Payload`);
            
            const signedEsignIpa = path.join(ESIGN_DIR, `esign_signed_${timestamp}.ipa`);
            execSync(`zsign -k "${latestCert.p12}" -p "${latestCert.pass}" -m "${latestCert.prov}" -b "com.certios.${timestamp}" -o "${signedEsignIpa}" -z 9 "${repackedIpa}"`);
            
            fs.rmSync(tmpEsignDir, { recursive: true, force: true });
            fs.unlinkSync(repackedIpa);
            
            const plistPath = path.join(PLISTS_DIR, `esign_${timestamp}.plist`);
            const ipaUrl = `https://certios.xyz/downloads/esign/esign_signed_${timestamp}.ipa`;
            const bundleId = `com.certios.${timestamp}`;
            generatePlist('CERTIOS ESign', ipaUrl, plistPath, bundleId);
            
            const plistUrl = `https://certios.xyz/downloads/plists/esign_${timestamp}.plist`;
            const installUrl = `itms-services://?action=download-manifest&url=${plistUrl}`;
            
            const sizeMb = (fs.statSync(signedEsignIpa).size / (1024 * 1024)).toFixed(1) + ' MB';

            const newEsignEntry = {
                id: `esign_${timestamp}`,
                name: 'ESign',
                developer: certName,
                status: 'active',
                size: sizeMb,
                version: 'VIP',
                date: dateStr,
                icon: 'https://vsacheat.com/img/esign.png',
                installUrl: installUrl,
                ipaUrl: ipaUrl
            };
            updateJSON('esign', newEsignEntry);
            await updateLogs('[ + ] Ký ESign VIP thành công!');
            
            try {
                execSync('git add . && git commit -m "Auto update apps" && git push', { cwd: path.join(__dirname, '..') });
                await updateLogs('[ + ] Đã Push lên GitHub thành công!');
            } catch (err) {
                await updateLogs('[ - ] Lỗi Push GitHub: ' + err.message);
            }

            bot.sendMessage(chatId, `✅ Hoàn tất toàn bộ quy trình!\nLink cài ESign VIP: ${installUrl}`);
        } else {
            await updateLogs('[ - ] Lỗi: Không tìm thấy ESign_CERTIOS_TEMPLATE.ipa');
        }
    } catch(e) {
        await updateLogs('[ - ] Lỗi: ' + e.message);
    }
}


bot.on('callback_query', async (query) => {
    if (query.from.id !== ALLOWED_USER) return;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    
    if (data.startsWith('mgr_cat_')) {
        const category = data.split('_')[2];
        let appsData = { config: { certDownloadDisabled: false }, esign: [], cert: [], mods: [] };
        if (fs.existsSync(APPS_JSON_PATH)) {
            appsData = { ...appsData, ...JSON.parse(fs.readFileSync(APPS_JSON_PATH)) };
        }
        const items = appsData[category] || [];
        
        if (items.length === 0) {
            bot.editMessageText('Danh sách trống!', { chat_id: chatId, message_id: messageId });
            return;
        }
        
        const inlineKeyboard = items.map(item => {
            return [{ text: item.name, callback_data: `mgr_item_${category}_${item.id}` }];
        });
        
        inlineKeyboard.push([{ text: '🔙 Quay lại', callback_data: 'mgr_back' }]);
        
        bot.editMessageText(`Chọn ứng dụng trong mục ${category} để quản lý:`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: inlineKeyboard }
        });
    }
    
    if (data === 'mgr_back') {
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Quản lý ESign', callback_data: 'mgr_cat_esign' }],
                    [{ text: '🪪 Quản lý Chứng Chỉ', callback_data: 'mgr_cat_cert' }],
                    [{ text: '🛠 Quản lý Mods', callback_data: 'mgr_cat_mods' }]
                ]
            }
        };
        bot.editMessageText('Chọn chuyên mục bạn muốn quản lý:', {
            chat_id: chatId,
            message_id: messageId,
            ...opts
        });
    }
    
    if (data.startsWith('mgr_item_')) {
        const parts = data.split('_');
        const category = parts[2];
        const itemId = parts.slice(3).join('_'); // In case ID has underscores
        
        
        const kb = [];
        kb.push([{ text: '❌ Xoá ứng dụng này', callback_data: `mgr_del_${category}_${itemId}` }]);
        if (category === 'cert') {
            kb.push([{ text: '✏️ Đổi tên hiển thị', callback_data: `mgr_ren_${category}_${itemId}` }]);
        }
        kb.push([{ text: '🔙 Quay lại danh sách', callback_data: `mgr_cat_${category}` }]);

        bot.editMessageText(`Bạn muốn làm gì với ${category === 'cert' ? 'chứng chỉ' : 'ứng dụng'} này?`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: kb
            }
        });

    }
    
    
    if (data.startsWith('mgr_ren_cert_')) {
        const itemId = data.substring('mgr_ren_cert_'.length);
        userStates[chatId] = { step: 'WAITING_RENAME_CERT', itemId: itemId, messageId: messageId };
        bot.editMessageText('Nhập TÊN HIỂN THỊ MỚI cho chứng chỉ này:', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Huỷ', callback_data: `mgr_cat_cert` }]
                ]
            }
        });
    }

    if (data.startsWith('mgr_del_')) {
        const parts = data.split('_');
        const category = parts[2];
        const itemId = parts.slice(3).join('_');
        
        bot.editMessageText(`⚠️ Xác nhận XOÁ vĩnh viễn?`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Có, Xoá Ngay!', callback_data: `mgr_confirm_${category}_${itemId}` }],
                    [{ text: '❌ Huỷ bỏ', callback_data: `mgr_cat_${category}` }]
                ]
            }
        });
    }
    
    if (data.startsWith('mgr_confirm_')) {
        const parts = data.split('_');
        const category = parts[2];
        const itemId = parts.slice(3).join('_');
        
        let appsData = { config: { certDownloadDisabled: false }, esign: [], cert: [], mods: [] };
        if (fs.existsSync(APPS_JSON_PATH)) {
            appsData = { ...appsData, ...JSON.parse(fs.readFileSync(APPS_JSON_PATH)) };
        }
        
        if (appsData[category]) {
            // TASK A: If deleting a cert, also delete the corresponding ESign
            if (category === 'cert') {
                const timestamp = itemId.split('_')[1];
                const esignId = 'esign_' + timestamp;
                const esignItem = appsData.esign.find(i => i.id === esignId);
                if (esignItem) {
                    if (esignItem.ipaUrl) {
                        try {
                            const ipaFilename = esignItem.ipaUrl.split('/').pop();
                            const ipaLocalPath = path.join(__dirname, '../public/downloads/esign', ipaFilename);
                            if (fs.existsSync(ipaLocalPath)) fs.unlinkSync(ipaLocalPath);
                        } catch(e){}
                    }
                    if (esignItem.installUrl) {
                        try {
                            const plistFilename = esignItem.installUrl.split('/').pop();
                            const plistLocalPath = path.join(__dirname, '../public/downloads/plists', plistFilename);
                            if (fs.existsSync(plistLocalPath)) fs.unlinkSync(plistLocalPath);
                        } catch(e){}
                    }
                    appsData.esign = appsData.esign.filter(item => item.id !== esignId);
                }
            }

            // Find item
            const item = appsData[category].find(i => i.id === itemId);
            if (item) {
                // Remove files if ipaUrl exists
                if (item.ipaUrl) {
                    try {
                        const ipaFilename = item.ipaUrl.split('/').pop();
                        const ipaLocalPath = path.join(__dirname, '../public/downloads', category, ipaFilename);
                        if (fs.existsSync(ipaLocalPath)) fs.unlinkSync(ipaLocalPath);
                    } catch(e){}
                }
                if (item.installUrl) {
                    try {
                        const filename = item.installUrl.split('/').pop();
                        if (category === 'cert') {
                            const certLocalPath = path.join(__dirname, '../public/downloads/certs', filename);
                            if (fs.existsSync(certLocalPath)) fs.unlinkSync(certLocalPath);
                        } else {
                            const plistLocalPath = path.join(__dirname, '../public/downloads/plists', filename);
                            if (fs.existsSync(plistLocalPath)) fs.unlinkSync(plistLocalPath);
                        }
                    } catch(e){}
                }
            }
        
            appsData[category] = appsData[category].filter(item => item.id !== itemId);
            fs.writeFileSync(APPS_JSON_PATH, JSON.stringify(appsData, null, 2));
            
            bot.editMessageText(`✅ Đã xoá thành công!`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Trở về', callback_data: `mgr_cat_${category}` }]
                    ]
                }
            });
            
            // Auto commit
            try {
                execSync('git add . && git commit -m "Auto delete app" && git push', { cwd: path.join(__dirname, '..') });
            } catch (e) {}
        }
    }
});

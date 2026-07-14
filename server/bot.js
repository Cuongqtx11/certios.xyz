const TelegramBot = require('node-telegram-bot-api').default || require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

// Token from the user
const token = '8565117060:AAEHcP73S-K7hvD7HZj4DnCV6-mjKOdWfhM';
const bot = new TelegramBot(token, { polling: true });

const APPS_JSON_PATH = path.join(__dirname, '../public/apps.json');
const CERTS_DIR = path.join(__dirname, 'certs');
const IPAS_DIR = path.join(__dirname, '../public/downloads/ipas');
const PLISTS_DIR = path.join(__dirname, '../public/downloads/plists');

// Ensure directories exist
[CERTS_DIR, IPAS_DIR, PLISTS_DIR].forEach(dir => {
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

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    userStates[chatId] = { step: 'IDLE' };
    
    const opts = {
        reply_markup: {
            keyboard: [
                ['🪪 Upload Chứng Chỉ', '📱 Upload ESign'],
                ['🛠 Upload Mods', '🌐 Push to GitHub']
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
    bot.sendMessage(chatId, 'Chào mừng đến với hệ thống upload tự động của CERTIOS.XYZ!\nVui lòng chọn một tác vụ bên dưới:', opts);
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates[chatId] || { step: 'IDLE' };

    if (text === '🪪 Upload Chứng Chỉ') {
        userStates[chatId] = { step: 'WAITING_CERT_NAME' };
        bot.sendMessage(chatId, 'Nhập TÊN hiển thị cho Chứng Chỉ này (vd: Khoá Cực Ngon):');
        return;
    }
    
    if (text === '📱 Upload ESign') {
        if (!latestCert.p12) return bot.sendMessage(chatId, 'Chưa có chứng chỉ nào trong hệ thống. Vui lòng upload chứng chỉ trước!');
        userStates[chatId] = { step: 'WAITING_ESIGN_NAME' };
        bot.sendMessage(chatId, 'Nhập TÊN hiển thị cho ESign này (vd: ESign Mới Nhất):');
        return;
    }
    
    if (text === '🛠 Upload Mods') {
        if (!latestCert.p12) return bot.sendMessage(chatId, 'Chưa có chứng chỉ nào trong hệ thống. Vui lòng upload chứng chỉ trước!');
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

    // Text inputs for names / passwords
    if (state.step === 'WAITING_CERT_NAME') {
        state.appName = text;
        state.step = 'WAITING_P12';
        userStates[chatId] = state;
        bot.sendMessage(chatId, `Tên chứng chỉ: ${text}\nBây giờ hãy gửi file .p12 cho mình.`);
        return;
    }
    
    if (state.step === 'WAITING_P12_PASS') {
        state.certPass = text === 'none' ? '' : text;
        state.step = 'WAITING_PROV';
        userStates[chatId] = state;
        bot.sendMessage(chatId, `Đã ghi nhận mật khẩu.\nTiếp theo, hãy gửi file .mobileprovision cho mình.`);
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
    
    if (state.step === 'WAITING_MOD_NAME') {
        state.appName = text;
        state.appType = 'mods';
        state.step = 'WAITING_IPA';
        userStates[chatId] = state;
        bot.sendMessage(chatId, `Tên Mod: ${text}\nBây giờ hãy gửi file .ipa.`);
        return;
    }
});

// Handle Document Uploads
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const document = msg.document;
    const fileName = document.file_name;
    const state = userStates[chatId] || { step: 'IDLE' };

    if (state.step === 'WAITING_P12' && fileName.endsWith('.p12')) {
        bot.sendMessage(chatId, 'Đang tải p12...');
        const fileLink = await bot.getFileLink(document.file_id);
        const p12Path = path.join(CERTS_DIR, `cert_${Date.now()}.p12`);
        await downloadFile(fileLink, p12Path);
        state.p12Path = p12Path;
        state.step = 'WAITING_P12_PASS';
        userStates[chatId] = state;
        bot.sendMessage(chatId, '✅ Đã tải xong p12. Hãy gửi MẬT KHẨU của p12 (Nếu không có, gõ "none").');
        return;
    }

    if (state.step === 'WAITING_PROV' && fileName.endsWith('.mobileprovision')) {
        bot.sendMessage(chatId, 'Đang tải mobileprovision...');
        const fileLink = await bot.getFileLink(document.file_id);
        const provPath = path.join(CERTS_DIR, `prov_${Date.now()}.mobileprovision`);
        await downloadFile(fileLink, provPath);
        
        // Setup Cert
        latestCert = { p12: state.p12Path, prov: provPath, pass: state.certPass };
        
        // Check validity with zsign
        try {
            const checkCmd = `zsign -C -k "${latestCert.p12}" -p "${latestCert.pass}"`;
            const out = execSync(checkCmd).toString();
            if (out.includes('Expired')) {
                bot.sendMessage(chatId, '⚠️ Chứng chỉ này có vẻ đã hết hạn hoặc không hợp lệ.');
            }
        } catch (e) {
            console.error('Cert check failed', e);
        }

        // Add to apps.json
        const dateStr = new Date().toLocaleDateString('vi-VN');
        const newEntry = {
            id: 'cert_' + Date.now(),
            name: state.appName,
            description: 'Tự động ký chứng chỉ',
            status: 'active',
            version: 'Vĩnh viễn',
            date: dateStr,
            icon: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSiEQCh3W32OqIspAx8-OlEnTiDGXz8eYRMfz15DL4vrw&s=10'
        };
        updateJSON('cert', newEntry);

        userStates[chatId] = { step: 'IDLE' };
        bot.sendMessage(chatId, '✅ Đã lưu Chứng Chỉ thành công! Đã tự động cập nhật lên giao diện.\nLưu ý: Bạn có thể chọn "Push to GitHub" để public.');
        return;
    }

    if (state.step === 'WAITING_IPA' && fileName.endsWith('.ipa')) {
        bot.sendMessage(chatId, 'Đang tải IPA... Vui lòng chờ (tùy dung lượng mạng).');
        const fileLink = await bot.getFileLink(document.file_id);
        
        const timestamp = Date.now();
        const rawIpaPath = path.join(IPAS_DIR, `raw_${timestamp}.ipa`);
        const signedIpaPath = path.join(IPAS_DIR, `signed_${timestamp}.ipa`);
        const plistPath = path.join(PLISTS_DIR, `install_${timestamp}.plist`);
        
        try {
            await downloadFile(fileLink, rawIpaPath);
            bot.sendMessage(chatId, '📥 Đã tải xong IPA. Đang tiến hành KÝ ỨNG DỤNG (zsign)...');
            
            // Execute zsign
            const cmd = `zsign -k "${latestCert.p12}" -p "${latestCert.pass}" -m "${latestCert.prov}" -o "${signedIpaPath}" -z 9 "${rawIpaPath}"`;
            execSync(cmd);
            
            // Clean up raw
            fs.unlinkSync(rawIpaPath);
            
            // Generate Plist
            const ipaUrl = `https://certios.xyz/downloads/ipas/signed_${timestamp}.ipa`;
            generatePlist(state.appName, ipaUrl, plistPath);
            
            // Add to apps.json
            const dateStr = new Date().toLocaleDateString('vi-VN');
            const plistUrl = `https://certios.xyz/downloads/plists/install_${timestamp}.plist`;
            const installUrl = `itms-services://?action=download-manifest&url=${plistUrl}`;
            
            const newEntry = {
                id: `${state.appType}_${timestamp}`,
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
            bot.sendMessage(chatId, `✅ Ký ứng dụng thành công!\nỨng dụng [${state.appName}] đã được thêm vào trang Web.\nChọn "Push to GitHub" để xuất bản lên web.`);

        } catch (e) {
            bot.sendMessage(chatId, '❌ Lỗi xử lý IPA: ' + e.message);
        }
        return;
    }
});

function updateJSON(category, newEntry) {
    let data = { esign: [], cert: [], mods: [] };
    if (fs.existsSync(APPS_JSON_PATH)) {
        data = JSON.parse(fs.readFileSync(APPS_JSON_PATH));
    }
    
    if (!data[category]) data[category] = [];
    data[category].unshift(newEntry); // Prepend to top
    
    // Keep only top 12
    data[category] = data[category].slice(0, 12);
    
    fs.writeFileSync(APPS_JSON_PATH, JSON.stringify(data, null, 2));
}

function generatePlist(appName, ipaUrl, dest) {
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
                <string>com.certios.${Date.now()}</string>
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

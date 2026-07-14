const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, '../bot.js');
let code = fs.readFileSync(botPath, 'utf8');

// 1. Update keyboard
code = code.replace(/keyboard: \[\s*\['🪪 Upload Chứng Chỉ', '📱 Upload ESign'\],\s*\['🛠 Upload Mods', '🌐 Push to GitHub'\]\s*\]/, 
`keyboard: [
                ['🪪 Upload Chứng Chỉ', '📱 Upload ESign'],
                ['🛠 Upload Mods', '🗂 Quản Lý'],
                ['🌐 Push to GitHub']
            ]`);

// 2. Add Quản Lý handler
const pushToGithubRegex = /if \(text === '🌐 Push to GitHub'\) \{[\s\S]*?return;\n    \}/;
const quanLyCode = `
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
`;

code = code.replace(pushToGithubRegex, (match) => {
    return match + '\n' + quanLyCode;
});

// 3. Add callback_query listener at the end of the file
const callbackLogic = `
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;
    
    if (data.startsWith('mgr_cat_')) {
        const category = data.split('_')[2];
        let appsData = { esign: [], cert: [], mods: [] };
        if (fs.existsSync(APPS_JSON_PATH)) {
            appsData = JSON.parse(fs.readFileSync(APPS_JSON_PATH));
        }
        const items = appsData[category] || [];
        
        if (items.length === 0) {
            bot.editMessageText('Danh sách trống!', { chat_id: chatId, message_id: messageId });
            return;
        }
        
        const inlineKeyboard = items.map(item => {
            return [{ text: item.name, callback_data: \`mgr_item_\${category}_\${item.id}\` }];
        });
        
        inlineKeyboard.push([{ text: '🔙 Quay lại', callback_data: 'mgr_back' }]);
        
        bot.editMessageText(\`Chọn ứng dụng trong mục \${category} để quản lý:\`, {
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
        
        bot.editMessageText(\`Bạn muốn làm gì với ứng dụng này?\`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Xoá ứng dụng này', callback_data: \`mgr_del_\${category}_\${itemId}\` }],
                    [{ text: '🔙 Quay lại danh sách', callback_data: \`mgr_cat_\${category}\` }]
                ]
            }
        });
    }
    
    if (data.startsWith('mgr_del_')) {
        const parts = data.split('_');
        const category = parts[2];
        const itemId = parts.slice(3).join('_');
        
        bot.editMessageText(\`⚠️ Xác nhận XOÁ vĩnh viễn?\`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Có, Xoá Ngay!', callback_data: \`mgr_confirm_\${category}_\${itemId}\` }],
                    [{ text: '❌ Huỷ bỏ', callback_data: \`mgr_cat_\${category}\` }]
                ]
            }
        });
    }
    
    if (data.startsWith('mgr_confirm_')) {
        const parts = data.split('_');
        const category = parts[2];
        const itemId = parts.slice(3).join('_');
        
        let appsData = { esign: [], cert: [], mods: [] };
        if (fs.existsSync(APPS_JSON_PATH)) {
            appsData = JSON.parse(fs.readFileSync(APPS_JSON_PATH));
        }
        
        if (appsData[category]) {
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
                        const plistFilename = item.installUrl.split('/').pop();
                        const plistLocalPath = path.join(__dirname, '../public/downloads/plists', plistFilename);
                        if (fs.existsSync(plistLocalPath)) fs.unlinkSync(plistLocalPath);
                    } catch(e){}
                }
            }
        
            appsData[category] = appsData[category].filter(item => item.id !== itemId);
            fs.writeFileSync(APPS_JSON_PATH, JSON.stringify(appsData, null, 2));
            
            bot.editMessageText(\`✅ Đã xoá thành công!\`, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔙 Trở về', callback_data: \`mgr_cat_\${category}\` }]
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
`;

code += '\n' + callbackLogic;
fs.writeFileSync(botPath, code);
console.log("bot.js patched successfully.");

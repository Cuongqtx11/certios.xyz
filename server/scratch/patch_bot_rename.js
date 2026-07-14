const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, '../bot.js');
let code = fs.readFileSync(botPath, 'utf8');

// 1. Add "Đổi tên" button to mgr_item_
const mgrItemRegex = /bot\.editMessageText\(\`Bạn muốn làm gì với ứng dụng này\?\`, \{\s*chat_id: chatId,\s*message_id: messageId,\s*reply_markup: \{\s*inline_keyboard: \[\s*\[\{ text: '❌ Xoá ứng dụng này', callback_data: \`mgr_del_\$\{category\}_\$\{itemId\}\` \}\],\s*\[\{ text: '🔙 Quay lại danh sách', callback_data: \`mgr_cat_\$\{category\}\` \}\]\s*\]\s*\}\s*\}\);/;

const newMgrItem = `
        const kb = [];
        kb.push([{ text: '❌ Xoá ứng dụng này', callback_data: \`mgr_del_\${category}_\${itemId}\` }]);
        if (category === 'cert') {
            kb.push([{ text: '✏️ Đổi tên hiển thị', callback_data: \`mgr_ren_\${category}_\${itemId}\` }]);
        }
        kb.push([{ text: '🔙 Quay lại danh sách', callback_data: \`mgr_cat_\${category}\` }]);

        bot.editMessageText(\`Bạn muốn làm gì với \${category === 'cert' ? 'chứng chỉ' : 'ứng dụng'} này?\`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: kb
            }
        });
`;

code = code.replace(mgrItemRegex, newMgrItem);

// 2. Add callback_query handler for mgr_ren_cert_
const mgrRenHandler = `
    if (data.startsWith('mgr_ren_cert_')) {
        const itemId = data.substring('mgr_ren_cert_'.length);
        userStates[chatId] = { step: 'WAITING_RENAME_CERT', itemId: itemId, messageId: messageId };
        bot.editMessageText('Nhập TÊN HIỂN THỊ MỚI cho chứng chỉ này:', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: '❌ Huỷ', callback_data: \`mgr_cat_cert\` }]
                ]
            }
        });
    }
`;

code = code.replace(/if \(data\.startsWith\('mgr_del_'\)\) \{/, mgrRenHandler + `\n    if (data.startsWith('mgr_del_')) {`);

// 3. Add message handler for WAITING_RENAME_CERT
const renameMsgHandler = `
    if (state.step === 'WAITING_RENAME_CERT' && text) {
        const itemId = state.itemId;
        const newName = text;
        
        let appsData = { esign: [], cert: [], mods: [] };
        if (fs.existsSync(APPS_JSON_PATH)) {
            appsData = JSON.parse(fs.readFileSync(APPS_JSON_PATH));
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
            
            bot.sendMessage(chatId, \`✅ Đổi tên thành công thành: \${newName}\`);
            userStates[chatId] = { step: 'IDLE' };
            
            try {
                execSync('git add . && git commit -m "Auto rename cert" && git push', { cwd: path.join(__dirname, '..') });
            } catch (err) {}
        }
        return;
    }
`;

code = code.replace(/if \(state\.step === 'WAITING_MOD_NAME'\) \{/, renameMsgHandler + `\n    if (state.step === 'WAITING_MOD_NAME') {`);

fs.writeFileSync(botPath, code);
console.log("Patched rename logic");

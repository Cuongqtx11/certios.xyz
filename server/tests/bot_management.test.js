const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const TelegramBot = require('node-telegram-bot-api').default;

const source = fs.readFileSync(path.join(__dirname, '../bot.js'), 'utf8');
const admin = 5654107862;

function harness(data = {}) {
    let apps = { config: {}, cert: [], esign: [], mods: [], ...data };
    const calls = [];
    const pending = [];
    const logs = [];
    let bot;
    const appsPath = path.resolve(__dirname, '../../public/apps.json');
    const files = new Set([appsPath]);

    class TestBot extends TelegramBot {
        constructor(_token, options) {
            super('test-token', {
                ...options,
                polling: { ...options.polling, autoStart: false }
            });
            bot = this;
        }
        on(event, handler) {
            return super.on(event, (...args) => pending.push(Promise.resolve().then(() => handler(...args))));
        }
        async answerCallbackQuery(id) {
            calls.push({ method: 'answer', id });
            if (this.answerError) throw this.answerError;
        }
        async editMessageText(text, options) {
            calls.push({ method: 'edit', text, options });
            if (this.editError) throw this.editError;
        }
        async sendMessage(chatId, text, options) {
            calls.push({ method: 'send', chatId, text, options });
            return { message_id: 1 };
        }
    }
    const fakeFs = {
        existsSync: filename => files.has(filename) || !path.extname(filename),
        mkdirSync: () => { throw new Error('Unexpected directory creation'); },
        readFileSync: filename => {
            assert.equal(filename, appsPath);
            return JSON.stringify(apps);
        },
        writeFileSync: (filename, value) => {
            assert.equal(filename, appsPath);
            apps = JSON.parse(value);
            calls.push({ method: 'write' });
        },
        unlinkSync: filename => {
            assert(files.has(filename));
            files.delete(filename);
            calls.push({ method: 'unlink', filename });
        }
    };
    const context = vm.createContext({
        __dirname: path.resolve(__dirname, '..'),
        Buffer,
        console: { log: (...args) => logs.push(args.join(' ')) },
        process: { on: () => {} },
        require: name => {
            if (name === 'node-telegram-bot-api') return { default: TestBot };
            if (name === 'fs') return fakeFs;
            if (name === 'path') return path;
            if (name === 'https') return {};
            if (name === './csign') return { signCSign: () => { throw new Error('Unexpected signing'); } };
            if (name === 'child_process') return {
                execSync: command => {
                    assert.equal(command, 'git add . && git commit -m "Auto delete app" && git push');
                    calls.push({ method: 'push' });
                }
            };
            throw new Error(`Unexpected require: ${name}`);
        }
    });
    vm.runInContext(source, context, { filename: 'bot.js' });
    async function update(value) {
        bot.processUpdate({ update_id: 1, ...value });
        while (pending.length) await Promise.all(pending.splice(0));
    }
    return {
        bot, calls, logs, files,
        apps: () => apps,
        state: () => vm.runInContext(`userStates[${admin}]`, context),
        message: text => update({ message: { from: { id: admin }, chat: { id: admin }, text } }),
        callback: (data, user = admin) => update({ callback_query: {
            id: 'query-1', from: { id: user }, data,
            message: { chat: { id: admin }, message_id: 42 }
        } })
    };
}

const cert = {
    id: 'cert_123', name: 'Certificate A', description: 'Mật khẩu: certios',
    installUrl: 'https://certios.xyz/downloads/certs/cert_download_123.zip'
};
const esign = {
    id: 'esign_123', name: 'CSign Free', developer: 'Certificate A',
    ipaUrl: 'https://certios.xyz/downloads/esign/esign_signed_123.ipa',
    installUrl: 'itms-services://?action=download-manifest&url=https://certios.xyz/downloads/plists/esign_123.plist'
};
const mod = { id: 'mods_custom_id_123', name: 'Menu', description: 'Example mod' };
const lastView = h => h.calls.filter(c => c.method === 'send' || c.method === 'edit').at(-1);

test('polling explicitly subscribes to Telegram button clicks', () => {
    const h = harness();
    assert.deepEqual(Array.from(h.bot._polling.params.allowed_updates), ['message', 'callback_query']);
});

for (const text of ['🗂 Quản Lý', '🗂️ Quản lý', '  🗂️  QUẢN LÝ  ']) {
    test(`management keyboard accepts ${text}`, async () => {
        const h = harness();
        await h.message(text);
        assert.equal(lastView(h).options.reply_markup.inline_keyboard.length, 3);
    });
}

for (const [category, item] of [['cert', cert], ['esign', esign], ['mods', mod]]) {
    test(`${category}: select category, view item, request deletion and cancel without writing`, async () => {
        const h = harness({ [category]: [item] });
        await h.callback(`mgr_cat_${category}`);
        assert.equal(h.calls[0].method, 'answer');
        const row = lastView(h).options.reply_markup.inline_keyboard[0][0];
        assert.equal(row.callback_data, `mgr_item_${category}_${item.id}`);
        await h.callback(row.callback_data);
        assert(lastView(h).text.includes(item.name));
        await h.callback(`mgr_del_${category}_${item.id}`);
        assert(lastView(h).text.includes(item.name));
        const buttons = lastView(h).options.reply_markup.inline_keyboard;
        assert.equal(buttons[0][0].callback_data, `mgr_confirm_${category}_${item.id}`);
        await h.callback(buttons[1][0].callback_data);
        assert(lastView(h).text.includes(item.name));
        assert.equal(h.calls.filter(c => c.method === 'write' || c.method === 'push').length, 0);
    });
}

test('CSign buttons distinguish certificates with the same app name', async () => {
    const h = harness({ esign: [esign, { ...esign, id: 'esign_456', developer: 'Certificate B' }] });
    await h.callback('mgr_cat_esign');
    const rows = lastView(h).options.reply_markup.inline_keyboard;
    assert(rows[0][0].text.includes('Certificate A'));
    assert(rows[1][0].text.includes('Certificate B'));
});

test('item details include download and installation links', async () => {
    const h = harness({ cert: [cert], esign: [esign] });
    await h.callback('mgr_item_cert_cert_123');
    assert(lastView(h).text.includes(cert.installUrl));
    await h.callback('mgr_item_esign_esign_123');
    assert(lastView(h).text.includes(esign.ipaUrl));
    assert(lastView(h).text.includes(esign.installUrl));
});

test('empty categories keep a working back button', async () => {
    const h = harness();
    await h.callback('mgr_cat_mods');
    assert(lastView(h).text.includes('trống'));
    await h.callback(lastView(h).options.reply_markup.inline_keyboard[0][0].callback_data);
    assert.equal(lastView(h).options.reply_markup.inline_keyboard.length, 3);
});

test('legacy category reply buttons are handled before upload text input', async () => {
    const h = harness({ mods: [mod] });
    await h.message('🛠 Upload Mods');
    await h.message('🛠️ Quản lý Mods');
    assert.equal(h.state().step, 'IDLE');
    assert.equal(lastView(h).options.reply_markup.inline_keyboard[0][0].callback_data, `mgr_item_mods_${mod.id}`);
});

test('cancelling rename clears state and prevents accidental renaming', async () => {
    const h = harness({ cert: [cert] });
    await h.callback('mgr_ren_cert_cert_123');
    assert.equal(h.state().step, 'WAITING_RENAME_CERT');
    await h.callback('mgr_cat_cert');
    await h.message('Do not rename');
    assert.equal(h.state().step, 'IDLE');
    assert.equal(h.apps().cert[0].name, cert.name);
    assert(!h.calls.some(c => c.method === 'write'));
});

test('confirmed certificate deletion removes its ESign and files, and preserves other entries', async () => {
    const h = harness({ cert: [cert, { ...cert, id: 'cert_456' }], esign: [esign], mods: [mod] });
    for (const filename of ['certs/cert_download_123.zip', 'esign/esign_signed_123.ipa', 'plists/esign_123.plist']) {
        h.files.add(path.resolve(__dirname, '../../public/downloads', filename));
    }
    await h.callback('mgr_confirm_cert_cert_123');
    assert.deepEqual(h.apps().cert.map(item => item.id), ['cert_456']);
    assert.equal(h.apps().esign.length, 0);
    assert.equal(h.apps().mods.length, 1);
    assert.equal(h.calls.filter(c => c.method === 'unlink').length, 3);
    assert.equal(h.calls.filter(c => c.method === 'push').length, 1);
    await h.callback('mgr_confirm_cert_cert_123');
    assert.equal(h.calls.filter(c => c.method === 'write').length, 1);
    assert(lastView(h).text.includes('không còn tồn tại'));
});

test('confirmed mod deletion uses the full ID including underscores', async () => {
    const h = harness({ mods: [mod], cert: [cert] });
    await h.callback(`mgr_confirm_mods_${mod.id}`);
    assert.equal(h.apps().mods.length, 0);
    assert.equal(h.apps().cert.length, 1);
    assert.equal(h.calls.filter(c => c.method === 'write').length, 1);
});

test('a stale certificate button cannot delete an orphaned ESign', async () => {
    const h = harness({ esign: [esign] });
    await h.callback('mgr_confirm_cert_cert_123');
    assert.equal(h.apps().esign.length, 1);
    assert(!h.calls.some(c => c.method === 'write' || c.method === 'unlink'));
});

test('repeated clicks ignore Telegram message-is-not-modified errors', async () => {
    const h = harness();
    h.bot.editError = new Error('ETELEGRAM: 400 Bad Request: message is not modified');
    await h.callback('mgr_back');
    assert(!h.calls.some(c => c.method === 'send'));
});

test('an expired acknowledgement still allows the menu to render', async () => {
    const h = harness();
    h.bot.answerError = new Error('query is too old');
    await h.callback('mgr_back');
    assert.equal(lastView(h).method, 'edit');
});

test('unexpected Telegram errors are caught and reported', async () => {
    const h = harness();
    h.bot.editError = new Error('Telegram request failed');
    await h.callback('mgr_back');
    assert.equal(lastView(h).method, 'send');
    assert(lastView(h).text.includes('Không thể xử lý'));
});

test('unauthorized and invalid buttons do not modify data', async () => {
    const h = harness({ cert: [cert] });
    await h.callback('mgr_confirm_cert_cert_123', 123);
    assert.equal(h.calls.length, 0);
    await h.callback('mgr_cat___proto__');
    await h.callback('mgr_confirm_unknown_cert_123');
    assert(!h.calls.some(c => c.method === 'write' || c.method === 'unlink' || c.method === 'push'));
});

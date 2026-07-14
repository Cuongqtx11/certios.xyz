const fs = require('fs');
const path = require('path');

const botPath = path.join(__dirname, '../bot.js');
let code = fs.readFileSync(botPath, 'utf8');

// TASK A: Auto delete ESign when Cert is deleted
code = code.replace(/if \(appsData\[category\]\) \{/, `if (appsData[category]) {
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
`);

// TASK C & D: Cert Name as developer and actual file sizes
code = code.replace(/size: 'Auto',[\s\S]*?developer: 'CERTIOS.XYZ'/g, (match) => {
    // This is for ESign VIP creation inside processCertZip
    return match; // We will replace it manually below because it's too risky with regex
});

fs.writeFileSync(botPath, code);
console.log("Patched deletions");

const https = require('https');
const fs = require('fs');

// Load test accounts
const accounts = JSON.parse(fs.readFileSync('./test-accounts.json', 'utf8'));

const API_BASE = 'api.familytree.io.vn';
const API_PORT = 443;
const tokens = {};
let completed = 0;

console.log(`🔐 Starting login process for ${accounts.length} accounts...\n`);

// Function to login one account
function loginAccount(account, index) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({
            username: account.email,
            password: account.password
        });

        const options = {
            hostname: API_BASE,
            port: API_PORT,
            path: '/api/Account/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    if (res.statusCode === 200) {
                        const response = JSON.parse(data);
                        const token = response.data.accessToken;
                        tokens[index] = {
                            email: account.email,
                            token: token,
                            loginAt: new Date().toISOString()
                        };
                        console.log(`✅ [${completed + 1}/${accounts.length}] ${account.email}`);
                    } else {
                        console.log(`❌ [${completed + 1}/${accounts.length}] ${account.email} - Status: ${res.statusCode}`);
                        tokens[index] = {
                            email: account.email,
                            token: null,
                            error: `Login failed with status ${res.statusCode}`
                        };
                    }
                } catch (err) {
                    console.log(`❌ [${completed + 1}/${accounts.length}] ${account.email} - Parse error: ${err.message}`);
                    tokens[index] = {
                        email: account.email,
                        token: null,
                        error: err.message
                    };
                }
                completed++;
                resolve();
            });
        });

        req.on('error', (err) => {
            console.log(`❌ [${completed + 1}/${accounts.length}] ${account.email} - Request error: ${err.message}`);
            tokens[index] = {
                email: account.email,
                token: null,
                error: err.message
            };
            completed++;
            resolve();
        });

        req.write(postData);
        req.end();
    });
}

// Login all accounts sequentially (to avoid overwhelming server)
async function loginAllAccounts() {
    for (let i = 0; i < accounts.length; i++) {
        await loginAccount(accounts[i], i);
        
        // Progress indicator every 50 accounts
        if ((i + 1) % 50 === 0) {
            console.log(`\n📊 Progress: ${i + 1}/${accounts.length} accounts processed\n`);
        }
        
        // Small delay to avoid overwhelming server
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

// Main execution
loginAllAccounts().then(() => {
    // Count successful logins
    const successCount = Object.values(tokens).filter(t => t.token !== null).length;
    
    console.log('\n' + '='.repeat(60));
    console.log(`🎉 Login process completed!`);
    console.log(`✅ Successful: ${successCount}/${accounts.length}`);
    console.log(`❌ Failed: ${accounts.length - successCount}/${accounts.length}`);
    console.log('='.repeat(60) + '\n');
    
    // Save tokens to file
    const outputData = {
        generatedAt: new Date().toISOString(),
        expiresIn: '30 days',
        successCount: successCount,
        tokens: tokens
    };
    
    fs.writeFileSync('./access-tokens.json', JSON.stringify(outputData, null, 2));
    console.log('💾 Tokens saved to: access-tokens.json\n');
    
    // Summary
    console.log('📝 Summary:');
    console.log(`   - Total accounts: ${accounts.length}`);
    console.log(`   - Successful logins: ${successCount}`);
    console.log(`   - Token file: access-tokens.json`);
    console.log(`   - Valid until: ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()}`);
    console.log('\n✨ You can now use these tokens for load testing!\n');
});

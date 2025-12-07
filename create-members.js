// Script to create members for 100 family trees using Node.js
// Each tree: 1 root member (ancestor) + 99 sons

const fs = require('fs');
const https = require('https');

const API_BASE_URL = 'https://be.dev.familytree.io.vn/api';

// Load data
const familyTrees = JSON.parse(fs.readFileSync('./_FamilyTrees__202512012313.json', 'utf8'));
const accounts = JSON.parse(fs.readFileSync('./test-accounts.json', 'utf8'));

console.log('=== Creating Members for 100 Family Trees ===');
console.log(`Total trees: ${familyTrees.length}\n`);

let successCount = 0;
const failedTrees = [];

// Helper function to make HTTP request
function makeRequest(url, method, headers, body) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: method,
            headers: headers
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve(data);
                    }
                } else {
                    console.error(`  [DEBUG] Request: ${method} ${url}`);
                    console.error(`  [DEBUG] Status: ${res.statusCode}`);
                    console.error(`  [DEBUG] Response: ${data.substring(0, 500)}`);
                    reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// Helper to create multipart form data
function createMultipartBody(data) {
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    let body = '';
    
    for (const [key, value] of Object.entries(data)) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
        body += `${value}\r\n`;
    }
    body += `--${boundary}--\r\n`;
    
    return { body, boundary };
}

// Process each tree
async function processTree(tree, index) {
    console.log(`[${index + 1}/${familyTrees.length}] Processing: ${tree.Name}`);
    
    try {
        // Find the matching account by username from tree owner
        const account = accounts.find(acc => acc.username === tree.Owner);
        
        if (!account) {
            throw new Error(`No account found for owner: ${tree.Owner}`);
        }
        
        // Step 1: Login
        const loginBody = JSON.stringify({
            username: account.email,
            password: account.password
        });
        
        const loginResponse = await makeRequest(
            `${API_BASE_URL}/Account/login`,
            'POST',
            { 'Content-Type': 'application/json', 'Content-Length': loginBody.length },
            loginBody
        );
        
        const token = loginResponse.data.accessToken;
        console.log(`  ✓ Logged in as ${account.email}`);
        
        // Step 2: Create root member
        const rootMemberData = {
            fullname: `Tổ tiên ${index + 1}`,
            gender: '1',
            categoryCode: '1',  // ROOT category
            ftId: tree.Id,
            birthday: '1900-01-01',
            isDeath: 'false'
        };
        
        const { body: rootBody, boundary: rootBoundary } = createMultipartBody(rootMemberData);
        
        const rootResponse = await makeRequest(
            `${API_BASE_URL}/ftmember/${tree.Id}`,
            'POST',
            {
                'Authorization': `Bearer ${token}`,
                'X-Ftid': tree.Id,
                'Content-Type': `multipart/form-data; boundary=${rootBoundary}`,
                'Content-Length': Buffer.byteLength(rootBody)
            },
            rootBody
        );
        
        const rootMemberId = rootResponse.data.id;
        console.log(`  ✓ Created root member: ${rootMemberId}`);
        
        // Step 3: Create partner (wife) for root
        const partnerData = {
            fullname: `Vợ Tổ tiên ${index + 1}`,
            gender: '0',  // Female
            categoryCode: '5002',  // PARTNER (5*1000+2)
            ftId: tree.Id,
            rootId: rootMemberId,
            fromFTMemberId: rootMemberId,
            birthday: '1900-01-01',
            isDeath: 'false'
        };
        
        const { body: partnerBody, boundary: partnerBoundary } = createMultipartBody(partnerData);
        
        const partnerResponse = await makeRequest(
            `${API_BASE_URL}/ftmember/${tree.Id}`,
            'POST',
            {
                'Authorization': `Bearer ${token}`,
                'X-Ftid': tree.Id,
                'Content-Type': `multipart/form-data; boundary=${partnerBoundary}`,
                'Content-Length': Buffer.byteLength(partnerBody)
            },
            partnerBody
        );
        
        const partnerMemberId = partnerResponse.data.id;
        console.log(`  ✓ Created partner member: ${partnerMemberId}`);
        
        // Step 4: Create 99 sons
        let sonsCreated = 0;
        for (let j = 1; j <= 99; j++) {
            const sonData = {
                fullname: `Con trai ${j} - Tree ${index + 1}`,
                gender: '1',
                categoryCode: '5004',  // CHILDREN (5*1000+4)
                ftId: tree.Id,
                rootId: rootMemberId,
                fromFTMemberId: rootMemberId,
                fromFTMemberPartnerId: partnerMemberId,
                birthday: '1950-01-01',
                isDeath: 'false'
            };
            
            const { body: sonBody, boundary: sonBoundary } = createMultipartBody(sonData);
            
            await makeRequest(
                `${API_BASE_URL}/ftmember/${tree.Id}`,
                'POST',
                {
                    'Authorization': `Bearer ${token}`,
                    'X-Ftid': tree.Id,
                    'Content-Type': `multipart/form-data; boundary=${sonBoundary}`,
                    'Content-Length': Buffer.byteLength(sonBody)
                },
                sonBody
            );
            
            sonsCreated++;
            
            if (j % 10 === 0) {
                console.log(`  → Created ${j} sons...`);
            }
        }
        
        console.log(`  ✓ Created ${sonsCreated} sons (Total: ${sonsCreated + 2} members)`);
        successCount++;
        
    } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
        failedTrees.push({
            TreeName: tree.Name,
            TreeId: tree.Id,
            Error: error.message
        });
    }
    
    console.log('');
}

// Main execution
async function main() {
    // Test with only 1 tree first
    for (let i = 10; i < 100; i++) {
        await processTree(familyTrees[i], i);
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Summary
    console.log('=== Summary ===');
    console.log(`Successfully processed: ${successCount}/${familyTrees.length} trees`);
    
    if (failedTrees.length > 0) {
        console.log(`Failed trees: ${failedTrees.length}`);
        failedTrees.forEach(failed => {
            console.log(`  - ${failed.TreeName}: ${failed.Error}`);
        });
    }
    
    console.log('');
    console.log(`Total members created: ${successCount * 101} members (100 trees × 101 members each)`);
}

main().catch(console.error);

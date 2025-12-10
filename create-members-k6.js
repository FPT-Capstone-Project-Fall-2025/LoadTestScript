// K6 script to create members for family trees in parallel
// Each tree: 1 root + 1 partner + 99 children = 101 members

import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

// Load data
const familyTrees = JSON.parse(open('./_FamilyTrees__202512092014.json'));
const accounts = JSON.parse(open('./test-accounts.json'));

// Sort family trees by Owner
familyTrees.sort((a, b) => {
    const numA = parseInt(a.Owner.replace('loadtest', '')) || 0;
    const numB = parseInt(b.Owner.replace('loadtest', '')) || 0;
    return numA - numB;
});

const API_BASE_URL = 'https://api.familytree.io.vn/api';

export const options = {
  scenarios: {
    create_members: {
      executor: 'shared-iterations',
      vus: 10, // 10 parallel virtual users
      iterations: familyTrees.length, // One iteration per tree
      maxDuration: '2h', // Allow up to 2 hours
    },
  },
};

// Helper to create multipart form data
function createMultipartBody(data) {
    const boundary = `----WebKitFormBoundary${Date.now()}${Math.random()}`;
    let body = '';
    
    for (const [key, value] of Object.entries(data)) {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
        body += `${value}\r\n`;
    }
    body += `--${boundary}--\r\n`;
    
    return { body, boundary };
}

export default function() {
    const treeIndex = exec.scenario.iterationInTest;
    const tree = familyTrees[treeIndex];
    
    if (!tree) {
        console.error(`No tree found at index ${treeIndex}`);
        return;
    }
    
    console.log(`\n[${treeIndex + 1}/${familyTrees.length}] Processing: ${tree.Name} (Owner: ${tree.Owner})`);
    
    // Find matching account
    const account = accounts.find(acc => {
        const ownerMatch = tree.Owner.match(/^loadtest(\d+)$/);
        if (!ownerMatch) return false;
        const ownerNum = ownerMatch[1];
        const expectedUsername = 'loadtest' + ownerNum.padStart(4, '0');
        return acc.username === expectedUsername;
    });
    
    if (!account) {
        console.error(`  ✗ No account found for owner: ${tree.Owner}`);
        return;
    }
    
    // Step 1: Login
    const loginPayload = JSON.stringify({
        username: account.email,
        password: account.password
    });
    
    const loginRes = http.post(
        `${API_BASE_URL}/Account/login`,
        loginPayload,
        { headers: { 'Content-Type': 'application/json' }, timeout: '30s' }
    );
    
    if (!check(loginRes, { 'login success': (r) => r.status === 200 })) {
        console.error(`  ✗ Login failed: ${loginRes.status}`);
        return;
    }
    
    const token = loginRes.json('data.accessToken');
    console.log(`  ✓ Logged in as ${account.email}`);
    
    // Step 2: Create root member
    const rootData = {
        fullname: `Tổ tiên ${treeIndex + 1}`,
        gender: '1',
        categoryCode: '1',
        ftId: tree.Id,
        birthday: '1900-01-01',
        isDeath: 'false'
    };
    
    const { body: rootBody, boundary: rootBoundary } = createMultipartBody(rootData);
    
    const rootRes = http.post(
        `${API_BASE_URL}/ftmember/${tree.Id}`,
        rootBody,
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Ftid': tree.Id,
                'Content-Type': `multipart/form-data; boundary=${rootBoundary}`
            },
            timeout: '30s'
        }
    );
    
    if (!check(rootRes, { 'root created': (r) => r.status === 200 })) {
        console.error(`  ✗ Root member creation failed: ${rootRes.status}`);
        console.error(`  Response: ${rootRes.body.substring(0, 200)}`);
        return;
    }
    
    const rootMemberId = rootRes.json('data.id');
    console.log(`  ✓ Created root member: ${rootMemberId}`);
    
    // Step 3: Create partner
    const partnerData = {
        fullname: `Vợ Tổ tiên ${treeIndex + 1}`,
        gender: '0',
        categoryCode: '5002',
        ftId: tree.Id,
        rootId: rootMemberId,
        fromFTMemberId: rootMemberId,
        birthday: '1900-01-01',
        isDeath: 'false'
    };
    
    const { body: partnerBody, boundary: partnerBoundary } = createMultipartBody(partnerData);
    
    const partnerRes = http.post(
        `${API_BASE_URL}/ftmember/${tree.Id}`,
        partnerBody,
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Ftid': tree.Id,
                'Content-Type': `multipart/form-data; boundary=${partnerBoundary}`
            },
            timeout: '30s'
        }
    );
    
    if (!check(partnerRes, { 'partner created': (r) => r.status === 200 })) {
        console.error(`  ✗ Partner creation failed: ${partnerRes.status}`);
        return;
    }
    
    const partnerMemberId = partnerRes.json('data.id');
    console.log(`  ✓ Created partner member: ${partnerMemberId}`);
    
    // Step 4: Create 99 children
    let childrenCreated = 0;
    for (let j = 1; j <= 99; j++) {
        const childData = {
            fullname: `Con trai ${j} - Tree ${treeIndex + 1}`,
            gender: '1',
            categoryCode: '5004',
            ftId: tree.Id,
            rootId: rootMemberId,
            fromFTMemberId: rootMemberId,
            fromFTMemberPartnerId: partnerMemberId,
            birthday: '1950-01-01',
            isDeath: 'false'
        };
        
        const { body: childBody, boundary: childBoundary } = createMultipartBody(childData);
        
        const childRes = http.post(
            `${API_BASE_URL}/ftmember/${tree.Id}`,
            childBody,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Ftid': tree.Id,
                    'Content-Type': `multipart/form-data; boundary=${childBoundary}`
                },
                timeout: '30s'
            }
        );
        
        if (childRes.status === 200) {
            childrenCreated++;
            if (j % 20 === 0) {
                console.log(`  → Created ${j}/99 children...`);
            }
        } else {
            console.error(`  ✗ Child ${j} creation failed: ${childRes.status}`);
        }
    }
    
    console.log(`  ✓ Created ${childrenCreated} children (Total: ${childrenCreated + 2} members)`);
    
    // Small delay to avoid overwhelming the server
    sleep(0.2);
}

export function handleSummary(data) {
    console.log('\n========================================');
    console.log('MEMBER CREATION SUMMARY');
    console.log('========================================');
    console.log(`Total iterations: ${data.metrics.iterations.values.count}`);
    console.log(`Successful logins: ${data.metrics['check{name:login success}']?.values.passes || 0}`);
    console.log(`Root members created: ${data.metrics['check{name:root created}']?.values.passes || 0}`);
    console.log(`Partners created: ${data.metrics['check{name:partner created}']?.values.passes || 0}`);
    console.log(`Failed operations: ${data.metrics.checks.values.fails || 0}`);
    console.log(`Avg duration per tree: ${(data.metrics.iteration_duration.values.avg / 1000).toFixed(2)}s`);
    console.log('========================================\n');
    
    return {
        'stdout': JSON.stringify(data, null, 2),
    };
}

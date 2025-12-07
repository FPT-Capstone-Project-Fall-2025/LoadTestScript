import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Load test accounts and family trees
const accounts = JSON.parse(open('./test-accounts.json'));
const familyTrees = JSON.parse(open('./_FamilyTrees__202512012313.json'));

// Test configuration - Test chỉ member-tree API (login trước)
export const options = {
    setupTimeout: '120s',  // Tăng timeout cho setup function (mặc định 60s)
    scenarios: {
        member_tree_test: {
            executor: 'constant-arrival-rate',  
            rate: 20,                           // 20 requests per second
            timeUnit: '1s',                     
            duration: '3m',                     // 3 phút
            preAllocatedVUs: 50,                
            maxVUs: 200,                         
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<3000', 'p(99)<10000'],  
        http_req_failed: ['rate<0.1'],                      
        errors: ['rate<0.15'],                              
    },
};

// Setup function - Login tất cả 100 accounts TRƯỚC KHI test
export function setup() {
    console.log('🔐 Setup: Logging in 100 accounts...');
    const tokens = {};
    let successCount = 0;
    
    for (let i = 0; i < accounts.length; i++) {
        const loginRes = http.post(
            'https://be.dev.familytree.io.vn/api/Account/login',
            JSON.stringify({
                username: accounts[i].email,
                password: accounts[i].password,
            }),
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: '60s',
            }
        );
        
        if (loginRes.status === 200) {
            try {
                tokens[i] = JSON.parse(loginRes.body).data.accessToken;
                successCount++;
            } catch (e) {
                console.error(`Failed to parse token for ${accounts[i].email}`);
            }
        } else {
            console.error(`Login failed for ${accounts[i].email}: ${loginRes.status}`);
        }
        
        // Progress indicator
        if ((i + 1) % 10 === 0) {
            console.log(`✅ Logged in: ${successCount}/${i + 1} accounts`);
        }
    }
    
    console.log(`🎉 Setup complete: ${successCount}/100 accounts logged in successfully`);
    return { tokens };
}

// Main test - Chỉ test member-tree API với tokens có sẵn
export default function(data) {
    // Pick a random account and corresponding tree
    const index = Math.floor(Math.random() * accounts.length);
    const token = data.tokens[index];
    const tree = familyTrees[index];
    
    // Nếu account này không login được, skip
    if (!token) {
        errorRate.add(1);
        return;
    }

    // Test member-tree API (không cần login nữa)
    const memberTreeRes = http.get(
        `https://be.dev.familytree.io.vn/api/ftmember/member-tree?ftId=${tree.Id}`,
        {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Ftid': tree.Id,
            },
            tags: { name: 'GetMemberTree' },
        }
    );

    const memberTreeSuccess = check(memberTreeRes, {
        'member-tree status is 200': (r) => r.status === 200,
        'member-tree has data': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.data !== undefined && body.data !== null;
            } catch (e) {
                return false;
            }
        },
        'member-tree response time < 2s': (r) => r.timings.duration < 2000,
        'member-tree response time < 5s': (r) => r.timings.duration < 5000,
    });

    if (!memberTreeSuccess) {
        errorRate.add(1);
        console.error(`member-tree failed for tree ${tree.Id}: ${memberTreeRes.status}`);
    } else {
        errorRate.add(0);
        
        // Log response details
        if (Math.random() < 0.02) { // Log 2% of requests
            try {
                const responseData = JSON.parse(memberTreeRes.body);
                const duration = memberTreeRes.timings.duration.toFixed(0);
                const status = memberTreeRes.status;
                const members = responseData.data?.length || 0;
                
                if (duration < 1000) {
                    console.log(`✅ GOOD | ${tree.Name} | ${status} | ${duration}ms | ${members} members`);
                } else if (duration < 3000) {
                    console.log(`⚠️  SLOW | ${tree.Name} | ${status} | ${duration}ms | ${members} members`);
                } else {
                    console.log(`❌ BAD  | ${tree.Name} | ${status} | ${duration}ms | ${members} members`);
                }
            } catch (e) {
                console.log(`Tree: ${tree.Name} | Status: ${memberTreeRes.status} | Duration: ${memberTreeRes.timings.duration.toFixed(0)}ms`);
            }
        }
    }
}

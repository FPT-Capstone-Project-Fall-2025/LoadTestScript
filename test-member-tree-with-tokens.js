import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Load pre-generated tokens and family trees
const tokenData = JSON.parse(open('./access-tokens.json'));
const familyTrees = JSON.parse(open('./_FamilyTrees__202512012313.json'));

// Extract valid tokens
const validTokens = Object.values(tokenData.tokens).filter(t => t.token !== null);

console.log(`✅ Loaded ${validTokens.length} valid tokens (generated at: ${tokenData.generatedAt})`);

// Counter for sequential access
let currentIndex = 0;

// Test configuration - Test member-tree API với tokens có sẵn
export const options = {
    scenarios: {
        member_tree_test: {
            executor: 'constant-arrival-rate',  
            rate: 5,                           // 10 requests per second
            timeUnit: '1s',                     
            duration: '3m',                     // 3 phút
            preAllocatedVUs: 30,               
            maxVUs: 50,                         
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<3000', 'p(99)<10000'],  
        http_req_failed: ['rate<0.1'],                      
        errors: ['rate<0.15'],                              
    },
};

export default function() {
    // Pick token theo thứ tự (không random)
    const index = currentIndex % validTokens.length;
    currentIndex++;
    
    const tokenInfo = validTokens[index];
    
    // Extract username from email (loadtest001@ftm.com → loadtest001)
    const username = tokenInfo.email.split('@')[0];
    
    // Tìm tree tương ứng với username
    const tree = familyTrees.find(t => t.Owner === username);
    
    if (!tree) {
        console.error(`❌ Tree not found for ${tokenInfo.email} (username: ${username})`);
        errorRate.add(1);
        return;
    }
    
    // Test member-tree API với token có sẵn
    const memberTreeRes = http.get(
        `https://be.dev.familytree.io.vn/api/ftmember/member-tree?ftId=${tree.Id}`,
        {
            headers: {
                'Authorization': `Bearer ${tokenInfo.token}`,
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
        'member-tree response time < 1s': (r) => r.timings.duration < 1000,
        'member-tree response time < 2s': (r) => r.timings.duration < 2000,
        'member-tree response time < 5s': (r) => r.timings.duration < 5000,
    });

    if (!memberTreeSuccess) {
        errorRate.add(1);
        if (Math.random() < 0.1) { // Log 10% of errors
            const bodySize = memberTreeRes.body ? (memberTreeRes.body.length / 1024).toFixed(2) : 0;
            
            // Try to extract data count
            let datalistCount = 'N/A';
            try {
                const responseData = JSON.parse(memberTreeRes.body);
                datalistCount = responseData.data?.datalist?.length || 0;
            } catch (e) {
                datalistCount = 'Parse Error';
            }
            
            console.error(`❌ FAIL | ${tokenInfo.email} | ${tree.Name} | Status: ${memberTreeRes.status} | Duration: ${memberTreeRes.timings.duration.toFixed(0)}ms | Size: ${bodySize}KB | Datalist: ${datalistCount} items`);
        }
    } else {
        errorRate.add(0);
        
        // Log success details
        if (Math.random() < 0.02) { // Log 2% of successful requests
            try {
                const responseData = JSON.parse(memberTreeRes.body);
                const duration = memberTreeRes.timings.duration.toFixed(0);
                const status = memberTreeRes.status;
                const bodySize = (memberTreeRes.body.length / 1024).toFixed(2);
                
                // Count data items
                const rootId = responseData.data?.root || 'N/A';
                const datalistCount = responseData.data?.datalist?.length || 0;
                
                const logMsg = `${tokenInfo.email} | Tree: ${tree.Name} | Status: ${status} | Duration: ${duration}ms | Size: ${bodySize}KB | Root: ${rootId} | Datalist: ${datalistCount} items`;
                
  
            } catch (e) {
                // Ignore parse errors in logging
                const bodySize = (memberTreeRes.body.length / 1024).toFixed(2);
                console.log(`⚠️  PARSE ERROR | ${tokenInfo.email} | ${tree.Name} | ${memberTreeRes.status} | ${memberTreeRes.timings.duration.toFixed(0)}ms | ${bodySize}KB`);
            }
        }
    }
}

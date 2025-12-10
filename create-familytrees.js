// Script to login 999 accounts sequentially and create 999 family trees
// Each account will login once and create one family tree

import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

// Load test accounts from JSON
const accounts = JSON.parse(open('./test-accounts.json'));

// Track failed accounts
let failedAccounts = [];

export const options = {
  scenarios: {
    create_trees: {
      executor: 'shared-iterations',
      vus: 10, // Run with 10 parallel virtual users
      iterations: 999, // Total 999 iterations shared among VUs
      maxDuration: '30m', // Allow up to 30 minutes
    },
  },
};

export default function() {
  // Get unique account index using scenario iteration counter
  const accountIndex = exec.scenario.iterationInTest;
  const account = accounts[accountIndex];
  
  console.log(`\n[${accountIndex + 1}/999] Processing account: ${account.email}`);
  
  // Step 1: Login
  const loginPayload = JSON.stringify({
    username: account.email,
    password: account.password
  });
  
  const loginParams = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '30s',
  };
  
  console.log(`  → Logging in...`);
  const loginRes = http.post(
    'https://localhost:5001/api/Account/login',
    loginPayload,
    loginParams
  );
  
  // Check if login successful
  const loginSuccess = check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'login has access token': (r) => r.json('data.accessToken') !== undefined,
  });
  
  if (!loginSuccess) {
    console.error(`  ✗ Login failed: ${loginRes.status}`);
    console.error(`  Response: ${loginRes.body}`);
    failedAccounts.push({ account: account.email, step: 'login', status: loginRes.status });
    return;
  }
  
  console.log(`  ✓ Login successful`);
  const token = loginRes.json('data.accessToken');
  
  // Step 2: Create Family Tree
  const familyTreeName = `Family Tree ${accountIndex + 1} - ${account.username}`;
  const familyTreeDescription = `Gia phả được tạo tự động bởi load test - Account ${account.username}`;
  
  // Create multipart form data - K6 format
  const boundary = '----WebKitFormBoundary' + Date.now();
  const formData = 
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="Name"\r\n\r\n` +
    `${familyTreeName}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="Description"\r\n\r\n` +
    `${familyTreeDescription}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="GPModeCode"\r\n\r\n` +
    `1\r\n` +
    `--${boundary}--\r\n`;
  
  const createTreeParams = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    timeout: '30s',
  };
  
  console.log(`  → Creating family tree: "${familyTreeName}"...`);
  const createTreeRes = http.post(
    'https://localhost:5001/api/FamilyTree',
    formData,
    createTreeParams
  );
  
  // Check if family tree creation successful
  const createSuccess = check(createTreeRes, {
    'create tree status 200': (r) => r.status === 200,
    'create tree has data': (r) => r.json('data') !== undefined && r.json('data') !== null,
  });
  
  if (!createSuccess) {
    console.error(`  ✗ Family tree creation failed: ${createTreeRes.status}`);
    console.error(`  Response: ${createTreeRes.body}`);
    console.error(`  Account: ${account.email}`);
    failedAccounts.push({ account: account.email, step: 'create_tree', status: createTreeRes.status });
    return;
  }
  
  const treeData = createTreeRes.json('data');
  console.log(`  ✓ Family tree created successfully`);
  console.log(`    - Tree ID: ${treeData.id || 'N/A'}`);
  console.log(`    - Tree Name: ${treeData.name || familyTreeName}`);
  
  // Small delay between iterations to avoid overwhelming the server
  sleep(1);
}

export function handleSummary(data) {
  console.log('\n========================================');
  console.log('FAMILY TREE CREATION SUMMARY');
  console.log('========================================');
  console.log(`Total iterations: ${data.metrics.iterations.values.count}`);
  console.log(`Successful logins: ${data.metrics['check{name:login status 200}']?.values.passes || 0}`);
  console.log(`Successful tree creations: ${data.metrics['check{name:create tree status 200}']?.values.passes || 0}`);
  console.log(`Failed operations: ${data.metrics.checks.values.fails || 0}`);
  console.log(`Total duration: ${(data.metrics.iteration_duration.values.avg / 1000).toFixed(2)}s avg per account`);
  
  if (failedAccounts.length > 0) {
    console.log(`\nFailed Accounts (${failedAccounts.length}):`);
    failedAccounts.forEach(f => {
      console.log(`  - ${f.account} (step: ${f.step}, status: ${f.status})`);
    });
  }
  
  console.log('========================================\n');
  
  return {
    'stdout': JSON.stringify(data, null, 2),
  };
}

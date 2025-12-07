// K6 Load Test Script for FTM API
// This script tests login functionality with 100 test accounts

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Load test accounts from JSON
const accounts = JSON.parse(open('./test-accounts.json'));

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '1m', target: 100 },  // Stay at 100 users
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests must complete below 500ms
    'http_req_failed': ['rate<0.01'],   // Error rate must be below 1%
    'errors': ['rate<0.05'],            // Custom error rate below 5%
  },
};

export default function() {
  // Select random account
  const account = accounts[Math.floor(Math.random() * accounts.length)];
  
  // Login request
  const loginPayload = JSON.stringify({
    username: account.email,
    password: account.password
  });
  
  const loginParams = {
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: '30s', // Increase timeout to 30 seconds
  };
  
  const loginRes = http.post(
    'https://be.dev.familytree.io.vn/api/Account/login',
    loginPayload,
    loginParams
  );
  
  // Check if response is valid before accessing JSON
  if (!loginRes || !loginRes.body) {
    console.error(`Request failed for ${account.email}: timeout or network error`);
    errorRate.add(1);
    return;
  }
  
  // Check response
  const loginSuccess = check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'login has status flag': (r) => r.json('status') === true,
    'login has access token': (r) => r.json('data.accessToken') !== undefined,
  });
  
  // Separate check for response time (won't fail the request)
  check(loginRes, {
    'login response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  errorRate.add(!loginSuccess);
  
  if (!loginSuccess) {
    console.error(`Login failed for ${account.email}: ${loginRes.status} - ${loginRes.body}`);
  }
  
  // If login successful, test authenticated endpoint
  if (loginSuccess && loginRes.json('data.accessToken')) {
    const token = loginRes.json('data.accessToken');
    
    // Example: Get user profile (adjust endpoint as needed)
    const profileParams = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };
    
    // Uncomment when you have authenticated endpoints to test
    // const profileRes = http.get(
    //   'https://be.dev.familytree.io.vn/api/Account/profile',
    //   profileParams
    // );
    
    // check(profileRes, {
    //   'profile status 200': (r) => r.status === 200,
    // });
  }
  
  // Think time between requests
  sleep(1);
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options) {
  const indent = options.indent || '';
  const enableColors = options.enableColors !== false;
  
  let summary = '\n' + indent + '✓ Load Test Summary\n';
  summary += indent + '═══════════════════\n\n';
  
  // Request stats
  const httpReqs = data.metrics.http_reqs;
  const httpReqDuration = data.metrics.http_req_duration;
  const httpReqFailed = data.metrics.http_req_failed;
  
  if (httpReqs) {
    summary += indent + `Total Requests: ${httpReqs.values.count}\n`;
    summary += indent + `Requests/sec: ${httpReqs.values.rate.toFixed(2)}\n`;
  }
  
  if (httpReqDuration) {
    summary += indent + `Avg Response Time: ${httpReqDuration.values.avg.toFixed(2)}ms\n`;
    summary += indent + `95th Percentile: ${httpReqDuration.values['p(95)'].toFixed(2)}ms\n`;
    summary += indent + `99th Percentile: ${httpReqDuration.values['p(99)'].toFixed(2)}ms\n`;
  }
  
  if (httpReqFailed) {
    const failRate = (httpReqFailed.values.rate * 100).toFixed(2);
    summary += indent + `Failed Requests: ${failRate}%\n`;
  }
  
  summary += '\n';
  
  return summary;
}

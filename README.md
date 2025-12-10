# LoadTestScript - Load Testing Guide

## 📋 Overview

This is a comprehensive script suite for load testing the Family Tree Management system. The process includes:
1. Creating test accounts
2. Generating access tokens
3. Creating family trees
4. Creating members for each tree
5. Testing API with pre-generated tokens

## 🔧 Prerequisites

- **Database**: PostgreSQL (database `gp_identity_test`)
- **Tools**: 
  - DBeaver or PostgreSQL client
  - Node.js (v14+)
  - K6 load testing tool
- **Dependencies**: 
  ```bash
  npm install k6
  ```

## 📝 Execution Steps

### **Step 1: Create Test Accounts in Database**

**File**: `create-and-activate-accounts.sql`

**Description**: Creates 1000 activated test accounts in the database

**Execution**:
1. Open DBeaver or PostgreSQL client
2. Connect to database `gp_identity_test`
3. Execute the entire SQL script from `create-and-activate-accounts.sql`
4. The script will create:
   - 1000 users with emails: `loadtest0001@ftm.com` → `loadtest1000@ftm.com`
   - Usernames: `loadtest001` → `loadtest1000`
   - Password: Copied from existing user in DB (all accounts share same password)
   - All accounts are activated (`EmailConfirmed = true`, `IsActive = true`)

**Output**:
- ✅ 1000 accounts ready for login
- ✅ File `test-accounts.json` created with format:
  ```json
  [
    {
      "email": "loadtest0001@ftm.com",
      "username": "loadtest0001",
      "password": "String@123"
    }
  ]
  ```

---

### **Step 2: Generate Access Tokens**

**File**: `generate-tokens.js`

**Description**: Login all accounts and retrieve access tokens for subsequent steps

**Execution**:
```bash
node generate-tokens.js
```

**The script will**:
- Read `test-accounts.json` file
- Login each account via API `/api/Account/login`
- Save access tokens to `access-tokens.json`

**Output**:
- ✅ File `access-tokens.json` containing tokens for all accounts:
  ```json
  {
    "generatedAt": "2025-12-10T10:30:00.000Z",
    "tokens": {
      "0": {
        "email": "loadtest0001@ftm.com",
        "token": "eyJhbGciOiJIUzI1NiIs...",
        "loginAt": "2025-12-10T10:30:00.123Z"
      }
    }
  }
  ```

**Note**:
- Tokens have expiration time, regenerate if needed
- Script has 100ms delay between requests to avoid server overload

---

### **Step 3: Create Family Trees**

**File**: `create-familytrees.js`

**Description**: Each account creates 1 family tree (999 trees for 999 accounts)

**Execution**:
```bash
k6 run create-familytrees.js
```

**Configuration**:
- 10 VUs (Virtual Users) running in parallel
- Total 999 iterations (shared-iterations)
- Timeout: 30 minutes

**The script will**:
1. Login account
2. Create family tree via API `/api/FamilyTree`
3. Save created tree information

**Output**:
- ✅ 999 family trees created
- ✅ Each tree named: `Family Tree [N] - loadtestXXXX`
- ✅ Export tree list to JSON file for next step

---

### **Step 4: Create Members for Family Trees**

**File**: `create-members-k6.js`

**Description**: Create members for each family tree (each tree: 1 root + 1 partner + 99 children = 101 members)

**Prerequisites**:
- File `_FamilyTrees__202512092014.json` (or similar) containing family trees list
- File `test-accounts.json`

**Execution**:
```bash
k6 run create-members-k6.js
```

**Configuration**:
- 10 VUs running in parallel
- Each tree creates 101 members (1 root, 1 partner, 99 children)
- Timeout: 2 hours

**The script will**:
1. Login tree owner account
2. Create root member (Ancestor)
3. Create partner (Spouse)
4. Create 99 children

**Output**:
- ✅ Each family tree has complete 101 members
- ✅ Complete family tree structure ready for testing

---

### **Step 5: Load Test API Member Tree**

**File**: `test-member-tree-with-tokens.js`

**Description**: Test performance of API `/api/ftmember/member-tree` with pre-generated tokens

**Prerequisites**:
- File `access-tokens.json` (from step 2)
- File `_FamilyTrees__202512092014.json` (from step 3)

**Execution**:
```bash
k6 run test-member-tree-with-tokens.js
```

**Configuration**:
- **Scenario**: `constant-arrival-rate`
- **Rate**: 100 requests/second
- **Duration**: 1 minute
- **VUs**: 80 preAllocated, max 120

**Thresholds**:
- `p(95) < 3s`: 95% of requests must be < 3 seconds
- `p(99) < 10s`: 99% of requests must be < 10 seconds
- `http_req_failed < 10%`: Error rate < 10%
- `errors < 15%`: Overall error rate < 15%

**Output**:
- ✅ Detailed performance report from K6
- ✅ Metrics: response time, throughput, error rate
- ✅ Detailed logs of success/failed requests

---

## 📊 Generated Files

| File | Created In | Description |
|------|------------|-------------|
| `test-accounts.json` | Step 1 (SQL script) | List of 1000 accounts with email/password |
| `access-tokens.json` | Step 2 | Access tokens for all accounts |
| `_FamilyTrees__YYYYMMDDHHMI.json` | Step 3 | List of created family trees |

## 🎯 Load Test Objectives

1. **Test Concurrent Processing**: Can the API handle 100 req/s?
2. **Measure Response Time**: Response time under high load conditions
3. **Identify Bottlenecks**: Database, API, or network issues
4. **Check Stability**: Does the system crash or have memory leaks?

## 📈 Reading K6 Results

After running the load test, K6 will display:

```
✓ member-tree status is 200
✓ member-tree has data
✓ member-tree response time < 1s
✓ member-tree response time < 2s
✓ member-tree response time < 5s

http_req_duration...........: avg=1.2s   min=200ms  med=1s     max=5s     p(90)=2s    p(95)=2.5s
http_req_failed.............: 2.30%
iterations..................: 6000
```

**Explanation**:
- `http_req_duration`: Response time (avg, min, max, p95, p99)
- `http_req_failed`: Percentage of failed requests
- `iterations`: Number of requests executed

## 🚨 Troubleshooting

### Token Expired Error
**Symptoms**: `401 Unauthorized`  
**Solution**: Re-run `node generate-tokens.js`

### Database Connection Timeout
**Symptoms**: `connection timeout` in SQL  
**Solution**: Check connection string and database server

### K6 Not Running
**Symptoms**: `k6 command not found`  
**Solution**: Install K6: https://k6.io/docs/getting-started/installation/

### API Returns 500
**Symptoms**: `500 Internal Server Error`  
**Solution**: Check API server logs, possibly due to database overload

## 💡 Tips

1. **Execute Steps Sequentially**: Don't skip any steps
2. **Backup Data**: Backup database before running load tests
3. **Monitor Resources**: Track CPU, RAM, Database connections
4. **Start Small**: Begin with small numbers (10-50 VUs) then scale up
5. **Clean Up**: Delete test data after completion

**Happy Load Testing! 🚀**

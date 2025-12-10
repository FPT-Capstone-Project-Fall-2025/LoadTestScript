# LoadTestScript - Hướng dẫn Load Test

## 📋 Tổng quan

Đây là bộ script để thực hiện load test cho hệ thống Family Tree Management. Bộ script bao gồm các bước:
1. Tạo tài khoản test
2. Generate access tokens
3. Tạo family trees
4. Tạo members cho mỗi tree
5. Test API với các tokens đã tạo

## 🔧 Yêu cầu

- **Database**: PostgreSQL (database `gp_identity_test`)
- **Tools**: 
  - DBeaver hoặc PostgreSQL client
  - Node.js (v14+)
  - K6 load testing tool
- **Dependencies**: 
  ```bash
  npm install k6
  ```

## 📝 Thứ tự thực hiện

### **Bước 1: Tạo tài khoản test trong database**

**File**: `create-and-activate-accounts.sql`

**Mô tả**: Tạo 1000 tài khoản test đã được kích hoạt trong database

**Thực hiện**:
1. Mở DBeaver hoặc PostgreSQL client
2. Kết nối đến database `gp_identity_test`
3. Chạy toàn bộ script SQL trong file `create-and-activate-accounts.sql`
4. Script sẽ tạo ra:
   - 1000 users với email: `loadtest0001@ftm.com` → `loadtest1000@ftm.com`
   - Username: `loadtest001` → `loadtest1000`
   - Password: Copy từ user có sẵn trong DB (tất cả cùng password)
   - Tất cả đã được kích hoạt (`EmailConfirmed = true`, `IsActive = true`)

**Kết quả**:
- ✅ 1000 tài khoản đã sẵn sàng để login
- ✅ File `test-accounts.json` được tạo ra với format:
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

### **Bước 2: Generate Access Tokens**

**File**: `generate-tokens.js`

**Mô tả**: Login tất cả accounts và lấy access tokens để sử dụng cho các bước sau

**Thực hiện**:
```bash
node generate-tokens.js
```

**Script sẽ**:
- Đọc file `test-accounts.json`
- Login từng account qua API `/api/Account/login`
- Lưu access tokens vào file `access-tokens.json`

**Kết quả**:
- ✅ File `access-tokens.json` chứa tokens cho tất cả accounts:
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

**Lưu ý**:
- Tokens có thời gian hết hạn, nên generate lại nếu cần
- Script có delay 100ms giữa mỗi request để tránh quá tải server

---

### **Bước 3: Tạo Family Trees**

**File**: `create-familytrees.js`

**Mô tả**: Mỗi account sẽ tạo 1 family tree (999 trees cho 999 accounts)

**Thực hiện**:
```bash
k6 run create-familytrees.js
```

**Cấu hình**:
- 10 VUs (Virtual Users) chạy song song
- Tổng 999 iterations (shared-iterations)
- Timeout: 30 phút

**Script sẽ**:
1. Login account
2. Tạo family tree với API `/api/FamilyTree`
3. Lưu thông tin tree đã tạo

**Kết quả**:
- ✅ 999 family trees được tạo
- ✅ Mỗi tree có tên: `Family Tree [N] - loadtestXXXX`
- ✅ Export danh sách trees ra file JSON để sử dụng bước tiếp theo

---

### **Bước 4: Tạo Members cho Family Trees**

**File**: `create-members-k6.js`

**Mô tả**: Tạo members cho mỗi family tree (mỗi tree: 1 root + 1 partner + 99 children = 101 members)

**Yêu cầu trước**:
- File `_FamilyTrees__202512092014.json` (hoặc tương tự) chứa danh sách family trees
- File `test-accounts.json`

**Thực hiện**:
```bash
k6 run create-members-k6.js
```

**Cấu hình**:
- 10 VUs chạy song song
- Mỗi tree tạo 101 members (1 root, 1 partner, 99 children)
- Timeout: 2 giờ

**Script sẽ**:
1. Login account owner của tree
2. Tạo root member (Tổ tiên)
3. Tạo partner (Vợ/Chồng)
4. Tạo 99 con cái

**Kết quả**:
- ✅ Mỗi family tree có đầy đủ 101 members
- ✅ Cấu trúc gia phả hoàn chỉnh để test

---

### **Bước 5: Load Test API Member Tree**

**File**: `test-member-tree-with-tokens.js`

**Mô tả**: Test performance của API `/api/ftmember/member-tree` với tokens đã tạo sẵn

**Yêu cầu trước**:
- File `access-tokens.json` (từ bước 2)
- File `_FamilyTrees__202512092014.json` (từ bước 3)

**Thực hiện**:
```bash
k6 run test-member-tree-with-tokens.js
```

**Cấu hình**:
- **Scenario**: `constant-arrival-rate`
- **Rate**: 100 requests/giây
- **Duration**: 1 phút
- **VUs**: 80 preAllocated, max 120

**Thresholds**:
- `p(95) < 3s`: 95% requests phải < 3 giây
- `p(99) < 10s`: 99% requests phải < 10 giây
- `http_req_failed < 10%`: Tỷ lệ lỗi < 10%
- `errors < 15%`: Tỷ lệ lỗi tổng thể < 15%

**Kết quả**:
- ✅ Báo cáo hiệu suất chi tiết từ K6
- ✅ Metrics: response time, throughput, error rate
- ✅ Log chi tiết về success/fail requests

---

## 📊 Files được tạo ra

| File | Bước tạo | Mô tả |
|------|----------|-------|
| `test-accounts.json` | Bước 1 (SQL script) | Danh sách 1000 accounts với email/password |
| `access-tokens.json` | Bước 2 | Access tokens cho tất cả accounts |
| `_FamilyTrees__YYYYMMDDHHMI.json` | Bước 3 | Danh sách family trees đã tạo |

## 🎯 Mục đích Load Test

1. **Kiểm tra khả năng xử lý đồng thời**: API có thể xử lý 100 req/s không?
2. **Đo response time**: Thời gian phản hồi trong điều kiện tải cao
3. **Phát hiện bottleneck**: Database, API, hoặc network
4. **Kiểm tra stability**: Hệ thống có bị crash hoặc memory leak không?

## 📈 Đọc kết quả K6

Sau khi chạy load test, K6 sẽ hiển thị:

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

**Giải thích**:
- `http_req_duration`: Thời gian phản hồi (avg, min, max, p95, p99)
- `http_req_failed`: Tỷ lệ request bị lỗi
- `iterations`: Số lượng request đã thực hiện

## 🚨 Troubleshooting

### Lỗi token hết hạn
**Triệu chứng**: `401 Unauthorized`  
**Giải pháp**: Chạy lại `node generate-tokens.js`

### Database connection timeout
**Triệu chứng**: `connection timeout` trong SQL  
**Giải pháp**: Kiểm tra connection string và database server

### K6 không chạy
**Triệu chứng**: `k6 command not found`  
**Giải pháp**: Cài đặt K6: https://k6.io/docs/getting-started/installation/

### API returns 500
**Triệu chứng**: `500 Internal Server Error`  
**Giải pháp**: Kiểm tra logs API server, có thể do database overload

## 💡 Tips

1. **Chạy từng bước tuần tự**: Không bỏ qua bước nào
2. **Backup data**: Backup database trước khi chạy load test
3. **Monitor resources**: Theo dõi CPU, RAM, Database connections
4. **Start small**: Bắt đầu với số lượng nhỏ (10-50 VUs) rồi tăng dần
5. **Clean up**: Xóa test data sau khi hoàn thành

**Chúc bạn load test thành công! 🚀**

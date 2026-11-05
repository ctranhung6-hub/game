# Nông Trại Tri Thức — Bản 21 thời gian thực

Bộ này gồm giao diện Vercel và backend WebSocket chạy riêng. Chỉ tải lên Vercel là CHƯA đủ để chơi online. Không cần Redis ở bản này.

## 1. Tải lên GitHub

Khuyên tạo repository mới để tránh lẫn file cũ. Giải nén ZIP, tải TOÀN BỘ NỘI DUNG bên trong thư mục NongTrai-Ban21 lên gốc repository. Phải nhìn thấy package.json, vercel.json, backend/, public/, lib/, scripts/ ngay ở gốc. Không tải nguyên file ZIP lên GitHub.

Nếu dùng repository cũ: thay toàn bộ mã nguồn ứng dụng bằng bộ này; xóa api/, server.mjs ở gốc, lib/online/, các BAT-DAU cũ và vercel.json/package.json cũ. Không giữ API Redis cũ. Không xóa lịch sử Git.

## 2. Chạy backend trên Render

Tạo New > Web Service, kết nối repository GitHub ở bước 1.

- Runtime: Node.
- Region: Singapore.
- Root Directory: để trống (gốc repo).
- Build Command: npm ci
- Start Command: npm start
- Health Check Path: /health
- Số instance: 1. Không bật tự tăng số instance.
- Chọn dịch vụ luôn hoạt động khi dùng trong lớp. Gói có ngủ khi không dùng chỉ phù hợp thử nghiệm; kiểm tra giá hiển thị trước khi đăng ký.

Thêm biến môi trường:

ALLOWED_ORIGINS=https://TEN-DU-AN.vercel.app
NODE_ENV=production

ALLOWED_ORIGINS là URL giao diện Vercel chính thức, không có dấu / cuối. Nếu chưa biết URL, có thể đặt https://example.invalid tạm thời rồi cập nhật ở bước 4. Không dùng dấu *.

Deploy. Lưu URL backend, ví dụ https://nong-trai-game.onrender.com. Mở URL đó cộng /health, phải thấy {"ok":true,"version":21}.

Lưu phòng sau restart (tùy chọn): gắn persistent disk tại /data rồi đặt DATA_DIR=/data. Máy chủ lưu mỗi 5 giây. Không có disk, restart/redeploy sẽ mất phòng đang chơi. Có disk vẫn có thể mất tối đa khoảng 5 giây dữ liệu gần nhất. Không redeploy giữa tiết chơi. Không chạy đồng thời hai process/replica dùng cùng bộ phòng.

## 3. Triển khai giao diện trên Vercel

Import cùng repository GitHub.

- Framework Preset: Other.
- Root Directory: gốc repository.
- Build Command: npm run build
- Output Directory: dist
- Install Command: npm ci

Thêm Environment Variable cho Production:

GAME_SERVER_URL=https://nong-trai-game.onrender.com

Thay bằng URL backend THẬT ở bước 2. Không thêm /health hoặc /ws; trình build tự chuyển sang wss://.../ws. Giá trị này là địa chỉ công khai, không phải mật khẩu.

Bấm Deploy. Nếu báo Thiếu GAME_SERVER_URL: thêm biến rồi Redeploy. Không chọn Express preset, không đặt Start Command cho Vercel. Vercel chỉ phục vụ dist/ và không chạy backend/server.mjs.

## 4. Nối hai phần

Sao chép URL Production Vercel. Về Render, sửa ALLOWED_ORIGINS bằng chính xác URL đó, ví dụ https://nong-trai-lop7.vercel.app. Lưu và chờ backend khởi động lại.

Nếu có tên miền khác, phân cách bằng dấu phẩy. Preview URL của Vercel không tự được cho phép; dùng link Production ổn định cho học sinh.

Giáo viên: https://TEN-DU-AN.vercel.app/teacher
Học sinh: https://TEN-DU-AN.vercel.app/game

Giáo viên tạo phòng, chọn Sao chép link học sinh để gửi link có mã phòng. Học sinh nhập tên, chọn màu, tham gia. Tối đa 8 nhân vật/phòng.

## 5. Kiểm tra trước giờ học

Mở 1 máy giáo viên và 2 máy học sinh trước, sau đó thử đủ 8 máy. Kiểm tra: chạy cùng lúc; vừa chạy vừa nhặt/thả; hai người tranh quả; chạm làm rơi; nộp sai rồi nộp lại; giáo viên dừng/kết thúc; tắt Wi-Fi ngắn rồi nối lại. Đo trên Wi-Fi thật: kiểm thử localhost không chứng minh độ trễ Internet.

Bản mới đẩy trạng thái 20 lần/giây; mô phỏng đồng hồ trận 30 nhịp/giây; client gửi chuyển động tối đa khoảng 20 lần/giây tùy RTT. Mỗi thao tác được máy chủ xác nhận, dùng mã riêng để tránh nộp điểm hai lần khi gửi lại. Máy học sinh dự đoán chuyển động và nhặt quả; máy chủ vẫn quyết định kết quả. Giảm tải đồ họa (pixel ratio 1.5, bóng 1024) cho tablet.

Nếu chỉ thấy Đang kết nối lại: kiểm tra /health, GAME_SERVER_URL, ALLOWED_ORIGINS và Redeploy sau khi sửa biến Vercel. Nếu phòng biến mất sau deploy: tạo phòng mới hoặc cấu hình persistent disk. Nếu hình ảnh giật nhưng phản hồi mạng nhanh: giảm tải thiết bị/đóng ứng dụng khác. Không có cam kết độ trễ bằng 0.

## Chạy thử trên máy cá nhân

Cài Node.js 22 trở lên. Trong thư mục này chạy npm ci rồi npm start. Mở http://localhost:8080/teacher và http://localhost:8080/game. Backend đọc biến môi trường từ nền tảng hoặc shell; không tự đọc file .env. Muốn thử từ máy LAN, đặt ALLOWED_ORIGINS bằng URL IP LAN đầy đủ và mở đúng URL đó.

Kiểm thử tự động: npm test

## Điểm thay đổi

- Bỏ API polling + Redis lock khỏi đường truyền trận đấu.
- Backend một process giữ trạng thái phòng, xử lý tuần tự, phát snapshot theo từng quyền xem; không lộ đáp án cho học sinh trước lúc công bố.
- Thêm transport WebSocket trực tiếp, reconnect, heartbeat, giới hạn dữ liệu và hàng chờ.
- Giữ luật chơi, 8 màu, mã phòng, nhập JSON, bảng điểm, dự đoán di chuyển và thao tác touch.
- Build Vercel chỉ xuất frontend; không phụ thuộc server.mjs ở gốc.
- Backend và frontend dùng chung repository, nhưng là HAI dịch vụ triển khai.

Tài liệu nền tảng:
https://render.com/docs/web-services
https://render.com/docs/websocket
https://render.com/docs/regions
https://vercel.com/docs/project-configuration/vercel-json

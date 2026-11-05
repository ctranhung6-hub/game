# Kiểm thử bản 21

- npm test: 84/84 bài kiểm thử đạt.
- Build frontend với GAME_SERVER_URL mẫu hợp lệ: đạt; config xuất URL wss tương ứng.
- Kiểm tra cú pháp multiplayer.js và transport.js: đạt.
- Kiểm thử WebSocket thực qua cổng localhost: 1 giáo viên + 8 học sinh; từ chối học sinh thứ 9; chuyển động đồng thời; server tự đẩy trạng thái; reconnect giữ nhân vật; kick; kết thúc và chốt bảng điểm.
- Các bài kiểm thử luật chơi: tranh/nhặt/thả quả, nộp sai rồi thử lại, chống cộng điểm trùng, đồng hồ 60 giây, va chạm, pause, quyền giáo viên và ẩn đáp án.
- Bổ sung font KaTeX 0.16.11 bị thiếu trong gói gốc.

Giới hạn: chưa triển khai lên tài khoản Vercel/Render thật, chưa đo trên Internet hoặc Samsung A9. Không thực hiện được kiểm tra giao diện bằng trình duyệt tự động do môi trường không tải được Chromium. Cần chạy thử thiết bị thật theo README trước khi dùng trong lớp. Số đo localhost không dùng để cam kết độ trễ mạng thực tế.

Lưu ý vận hành: backend một instance; restart có thể mất phòng nếu không gắn disk. Checkpoint 5 giây không phải lưu bền từng thao tác.

# Vận hành Antigravity local station

1. Máy trạm đồng bộ My Drive bằng tài khoản quản trị theo quyết định vận hành hiện tại.
2. Poll `GET /api/ai/jobs/ready`, sau đó lấy từng job bằng `POST /api/ai/jobs/claim` với `x-ai-worker-key`; manifest chỉ là whitelist,
   không chứa Drive ID/link hay CCCD.
3. Đọc `AGENTS.md`, mở đúng ảnh GCN có `fileId`/tên/checksum trong `allowedFiles`, dùng
   `gemini-3.6-flash` với `prompts/certificate-extraction.md` và schema v2.
4. Gửi kết quả duy nhất qua `POST /api/ai/results`, kèm `jobId`, `inputFingerprint`, model/prompt,
   `idempotency-key` mới. Không gọi Gemini từ ứng dụng web.
5. Nếu ảnh mờ/chữ viết tay, trả `MANUAL_REQUIRED`; không retry để suy đoán. Không ghi/sửa bất kỳ
   file Drive hay dữ liệu nghiệp vụ nào.

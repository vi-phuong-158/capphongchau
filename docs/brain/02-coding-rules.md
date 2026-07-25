# 02 — Coding Rules

## Nguyên tắc chung

- Viết ít nhất có thể để giải quyết đúng task. Không tính năng speculative.
- Không abstraction sớm: 3 đoạn lặp vẫn tốt hơn 1 abstraction non.
- Không xử lý lỗi cho kịch bản không thể xảy ra — nhưng validation ở ranh giới tin cậy (input người dùng, response Google API) là bắt buộc, không phải "lười" ở đây.
- Comment WHY, không comment WHAT.
- Không refactor code lân cận nếu không liên quan task.

## Style code

- Ngôn ngữ / runtime: TypeScript strict (không dùng `any`), Next.js App Router.
- Tài liệu và giao tiếp trong dự án bằng tiếng Việt (README, AGENTS.md, PLAN.md đều tiếng Việt).
- Linter / formatter: ESLint (`eslint.config.mjs`) + Prettier đã cấu hình. Chạy `npm run lint` và `npm run format:check` trước khi commit.

## Đặt tên

- Case ID: `PHONGCHAU-{YYYY}-{6 chữ số}`, ví dụ `PHONGCHAU-2026-000001`.
- Enum trạng thái/vai trò dùng `UserRole`, trạng thái hồ sơ cố định (xem `01-architecture.md`) — không dùng chuỗi tùy ý.

## Bảo mật (bắt buộc, không thương lượng)

- Không hardcode secret/API key — dùng biến môi trường (xem danh sách trong `01-architecture.md`).
- Không commit `.env`, token OAuth, ảnh CCCD/GCN thật hoặc fixture chứa dữ liệu thật.
- Không tạo link Drive công khai; Drive luôn ở chế độ `Restricted`; không chia sẻ thư mục gốc cho cán bộ — mọi truy cập đi qua ứng dụng và quyền trong sheet `USERS`.
- Không ghi CCCD đầy đủ, payload QR thô, URL upload session hoặc token vào log. CCCD hiển thị dạng che: `0123••••8901`.
- Chỉ mục tra cứu CCCD dùng HMAC với secret phía server (`DATA_HASH_PEPPER`) — không đưa CCCD đầy đủ vào technical log.
- Mọi API write, xem file nhạy cảm, xác nhận, export và thay đổi quyền phải ghi `AUDIT_LOGS` append-only.
- Không dùng service account cho Google Drive (xem lý do trong `01-architecture.md`).
- Nguyên tắc mặc định từ chối (default deny) và chỉ cấp quyền tối thiểu theo vai trò.
- API lỗi không trả stack trace, token, Drive ID/link hoặc PII đầy đủ.

## Không làm

- Không tự ý thêm database hoặc cloud storage ngoài kiến trúc đã chốt (Supabase PostgreSQL + Google My Drive + Vercel) mà không cập nhật `03-decisions.md`.
- Không xóa dòng/cột/sheet/file dữ liệu đang dùng. Đổi schema phải có migration, cập nhật tài liệu, bảo toàn dữ liệu cũ.
- Không gọi Google Drive/Google Sheets API trực tiếp từ frontend component hoặc business service — luôn qua `DataRepository`/`StorageRepository`; Sheets chỉ dành cho script legacy/ETL.
- Không proxy ảnh gốc qua body của Vercel Function.
- Không triển khai OCR CCCD, đối soát dân cư hoặc tích hợp CSDL đất đai quốc gia ở giai đoạn thử nghiệm này (xem `03-decisions.md` và `00-project-overview.md`). Supabase PostgreSQL đã là kho dữ liệu runtime.

## Test

Vitest (`npm run test`) và Playwright (`npm run test:e2e`) đã chạy được; hiện có 82 unit test. Phạm vi tối thiểu cần đạt (theo `AGENTS.md` §7 và `PLAN.md`):

- Unit: parser QR, chuẩn hóa CCCD/ngày, che/HMAC CCCD, case ID, transition trạng thái, phân quyền, version conflict.
- Integration: refresh token OAuth, Drive folders, Supabase transactions, resumable upload, retry, idempotency, lỗi từng phần. Các script Sheets legacy/ETL kiểm riêng theo phạm vi script.
- E2E: tạo hồ sơ, upload 1 CCCD + nhiều GCN, QR thành công/thất bại, sửa dữ liệu, verify, tìm kiếm, dashboard, export, audit log.
- Test thủ công: Android Chrome, iPhone Safari, Wi-Fi và 4G yếu.
- Chỉ dùng dữ liệu giả/ẩn danh cho test tự động và môi trường Preview — không bao giờ dùng CCCD/GCN thật.

## Git

- Branch từ nhánh chính (`main`), đặt tên rõ: `feat/...`, `fix/...`, `docs/...`.
- Commit message ngắn gọn.
- Không push thẳng `main` nếu chưa được người dùng yêu cầu rõ ràng.
- Không `--force` push trừ khi được yêu cầu rõ ràng.

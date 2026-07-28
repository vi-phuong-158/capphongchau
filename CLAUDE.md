# CLAUDE.md — Hướng dẫn cho Claude Code

> Dành riêng cho **Claude Code**. Codex dùng `AGENTS.md`.
> Dự án: Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu (`land-ocr-180`) — web app thử nghiệm tiếp nhận, kiểm tra hồ sơ đất đai trong đợt chiến dịch 180 ngày.

---

## BẮT BUỘC: Đọc trước khi code

Trước khi bắt đầu bất kỳ task nào, đọc **toàn bộ** `docs/brain/`:

```
docs/brain/00-project-overview.md   — mục tiêu, người dùng, phạm vi
docs/brain/01-architecture.md       — stack, luồng xử lý, CODE GRAPH (bản đồ module)
docs/brain/02-coding-rules.md       — quy tắc code, đặt tên, bảo mật
docs/brain/03-decisions.md          — các quyết định kỹ thuật đã chốt
docs/brain/04-current-tasks.md      — task đang làm, task chờ, task không làm
docs/brain/05-testing-and-deploy.md — lệnh cài đặt, chạy, test, deploy
docs/brain/06-ai-working-log.md     — nhật ký các lần AI sửa code
```

**Đặc biệt đọc Code Graph trong `docs/brain/01-architecture.md`** để hiểu quan hệ phụ thuộc giữa các module — biết "đụng vào file X thì ảnh hưởng những đâu" trước khi sửa, tránh phá vỡ thứ ở xa. Code Graph đã có nội dung đầy đủ và **phải được cập nhật cùng lúc** với mọi thay đổi kiến trúc; Code Graph lỗi thời còn nguy hiểm hơn không có, vì agent sau sẽ tin nó.

Ngoài `docs/brain/`, dự án còn có tài liệu nghiệp vụ chi tiết đã chốt trước:

- [`AGENTS.md`](AGENTS.md) — chỉ dẫn kiến trúc/triển khai đầy đủ nhất (mô hình dữ liệu, API, bảo mật). Khi `docs/brain/` và `AGENTS.md` có chi tiết khác nhau, `AGENTS.md` là nguồn chi tiết hơn — `docs/brain/` là bản tóm tắt/tổng hợp để đọc nhanh.
- [`PLAN.md`](PLAN.md) — kế hoạch triển khai đầy đủ theo mốc M0–M5.
- [`docs/architecture.md`](docs/architecture.md) — kiến trúc thử nghiệm bản rút gọn kèm sơ đồ mermaid.

## Cài đặt nhanh

Lệnh cài đặt, chạy dev, test, build, deploy nằm đầy đủ trong
`docs/brain/05-testing-and-deploy.md`. Đọc file đó để dựng môi trường, đừng đoán lệnh.

Stack đang chạy: Next.js 16 App Router + TypeScript strict + PWA, Supabase PostgreSQL, Google My Drive. Lệnh thường dùng: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.

---

## Sau khi sửa code

**Bắt buộc** thêm một entry vào `docs/brain/06-ai-working-log.md`:

```
## [YYYY-MM-DD] [Tên task]
- **Agent:** Claude Code
- **Thay đổi:** <mô tả ngắn>
- **File đã sửa:** <danh sách file>
- **Lý do:** <vì sao>
- **Kiểm tra:** <cách xác minh hoạt động đúng>
```

## Khi thay đổi kiến trúc / API / cấu trúc / database

Nếu thay đổi: stack/dependency mới · cấu trúc thư mục · endpoint hoặc interface API ·
schema Google Sheets · luồng xử lý chính —

→ **Phải cập nhật** `docs/brain/01-architecture.md` (gồm cả **Code Graph**) **VÀ**
`docs/brain/03-decisions.md`. Nếu thay đổi trùng phạm vi với `AGENTS.md`/`docs/architecture.md`, cập nhật đồng bộ cả hai để tránh tài liệu mâu thuẫn nhau. Code Graph lỗi thời còn nguy hiểm hơn không có, vì agent sau sẽ tin nó.

---

## Quy tắc cứng

1. **Không push thẳng `main`** nếu chưa được người dùng yêu cầu rõ ràng. Tạo nhánh/PR.
2. **Không tự đổi stack** (Next.js/Vercel/Google Sheets/Google My Drive) nếu chưa ghi rõ lý do vào `docs/brain/03-decisions.md` — xem các quyết định đã chốt tại đó trước khi đề xuất thay đổi.
3. **Không thêm tính năng ngoài scope task** — đặc biệt không tự ý thêm OCR, đối soát dân cư, PostgreSQL hay Shared Drive (xem "Không làm lúc này" trong `docs/brain/04-current-tasks.md`).
4. **Không hardcode secret/API key** vào source — dùng biến môi trường.
5. Kiểm tra `docs/brain/04-current-tasks.md` trước khi bắt đầu: task có được phép làm không?
6. **Không lộ PII/token trong log**: không ghi CCCD đầy đủ, payload QR thô, URL upload session hay token vào log (xem `docs/brain/02-coding-rules.md`).

## Nguyên tắc code

- **Suy nghĩ trước khi code:** không giả định; nêu rõ đánh đổi; tìm giải pháp đơn giản nhất.
- **Ưu tiên đơn giản:** viết code tối thiểu; không abstraction sớm; không xử lý lỗi cho kịch
  bản không thể xảy ra (nhưng validation ở ranh giới tin cậy là bắt buộc, không phải "lười" ở đây).
- **Thay đổi phẫu thuật:** chỉ chạm phần cần thiết; không refactor lân cận; theo style hiện tại;
  dọn biến/import thừa do mình tạo.
- **Theo mục tiêu:** biến task thành mục tiêu xác minh được — [Bước làm] → [Cách kiểm tra].

# Roadmap hiện hành

> Đây là kế hoạch duy nhất ở thư mục gốc. Nó chỉ giữ thứ tự ưu tiên và cổng nghiệm thu; chi tiết
> kiến trúc, API, bảo mật và trạng thái task nằm ở các tài liệu nguồn sự thật bên dưới.

## Nguồn sự thật

Đọc theo thứ tự này trước khi sửa code:

1. [`AGENTS.md`](AGENTS.md) — yêu cầu chi tiết bắt buộc cho Codex.
2. [`docs/brain/`](docs/brain/00-project-overview.md) — phạm vi, Code Graph, coding rules, quyết định,
   task hiện hành và log.
3. [`docs/architecture.md`](docs/architecture.md) — kiến trúc rút gọn.
4. [`docs/brain/04-current-tasks.md`](docs/brain/04-current-tasks.md) — việc được phép làm tiếp theo.
5. [`AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`](AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md) — quy trình baseline,
   kiểm thử và bàn giao.

Nếu tài liệu lịch sử khác mã nguồn hoặc các file trên, không làm theo tài liệu lịch sử; ghi nhận mâu
thuẫn và cập nhật nguồn sự thật nếu cần.

## Trạng thái hiện tại

- Runtime dùng Supabase PostgreSQL; Google My Drive chỉ lưu file. Google Sheets chỉ còn phục vụ ETL
  legacy.
- Public Intake V2 đã có wizard 4 bước, upload có tiến độ/hàng đợi, assisted intake và các gác cổng
  tiếp nhận chính thức. Việc chưa hoàn tất xem `docs/brain/04-current-tasks.md`.
- `OFFICER_ASSISTED_INTAKE_ENABLED` là cờ server-side, mặc định `false`, độc lập với
  `ASSISTED_INTAKE_ROLES`; cờ không nằm trong `NEXT_PUBLIC_*` và không thay thế phân quyền.
- Không suy ra trạng thái commit, deploy hoặc migration từ tài liệu cũ. Chỉ `git status`, Git log và
  bằng chứng chạy lệnh trong `CHATGPT_HANDOFF.md` mới xác nhận các trạng thái đó.

## Thứ tự ưu tiên

1. Giữ an toàn dữ liệu, phân quyền, idempotency, version conflict và audit.
2. Hoàn tất các mục bắt buộc trước merge/deploy trong `docs/brain/04-current-tasks.md`.
3. Chỉ thực hiện nâng cấp sau MVP khi có quyết định mới trong `docs/brain/03-decisions.md`.

## Quy tắc cập nhật

Mỗi task phải cập nhật `docs/brain/06-ai-working-log.md` và `CHATGPT_HANDOFF.md`. Nếu đổi kiến trúc,
API hoặc schema, cập nhật đồng bộ Code Graph, decision log và tài liệu chi tiết theo `AGENTS.md`.

Các bản `PLAN-M0-M5`, `PLAN2`, `PLAN_NL`, kế hoạch Claude/Gemini và handoff cũ được lưu tại
[`docs/archive/`](docs/archive/README.md), chỉ dùng để tra cứu lịch sử.

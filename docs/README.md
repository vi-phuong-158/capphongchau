# Bản đồ tài liệu

## Phải đọc khi bắt đầu task

1. [`../AGENTS.md`](../AGENTS.md)
2. [`brain/00-project-overview.md`](brain/00-project-overview.md)
3. [`brain/01-architecture.md`](brain/01-architecture.md)
4. [`brain/02-coding-rules.md`](brain/02-coding-rules.md)
5. [`brain/03-decisions.md`](brain/03-decisions.md)
6. [`brain/04-current-tasks.md`](brain/04-current-tasks.md)
7. [`brain/05-testing-and-deploy.md`](brain/05-testing-and-deploy.md)
8. [`brain/06-ai-working-log.md`](brain/06-ai-working-log.md)

Quy trình trước/sau khi sửa nằm ở [`../AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`](../AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md).
Roadmap duy nhất ở thư mục gốc là [`../PLAN.md`](../PLAN.md).

## Tài liệu tham khảo

- [`architecture.md`](architecture.md): bản kiến trúc rút gọn cho người đọc nhanh.
- [`../evidence/`](../evidence/): bằng chứng, checklist và runbook của các đợt kiểm tra; không phải
  nguồn sự thật thay thế cho `docs/brain/`.
- [`archive/`](archive/README.md): tài liệu lịch sử đã supersede, không dùng để quyết định implementation.
- [`handoffs/`](handoffs): các handoff của những task trước; handoff hiện tại luôn ở
  [`../CHATGPT_HANDOFF.md`](../CHATGPT_HANDOFF.md).

## Một số bất biến dễ đọc nhầm

- Chế độ cán bộ hỗ trợ có kill switch server-side `OFFICER_ASSISTED_INTAKE_ENABLED`, mặc định `false`.
  Nó độc lập với allowlist vai trò và không phải cờ `NEXT_PUBLIC_*`.
- Runtime dùng Supabase PostgreSQL; các kế hoạch cũ nói Google Sheets là lịch sử.
- Trạng thái commit/push/deploy chỉ lấy từ Git và handoff mới nhất, không lấy từ báo cáo cũ.

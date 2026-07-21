# 06 — AI Working Log

> Nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

---

## [2026-07-21] Sửa 3 điểm sau review M0: ghim version, typecheck tests, prettier

- **Agent:** Claude Code
- **Thay đổi:** (1) Ghim toàn bộ dependency trong `package.json` từ `"latest"` sang range `^x.y.z` theo phiên bản đã cài (Next 16.2.10, React 19.2.7, …), đồng bộ `package-lock.json` bằng `npm install --package-lock-only`. (2) Thêm script `typecheck` + `tsconfig.typecheck.json` bao cả `tests/` (tsconfig chính đang exclude `tests`, nên trước đó test không được kiểm kiểu). (3) Chạy `prettier --write .` để `format:check` xanh — trước đó fail trên chính file scaffold (`src/app/page.tsx`, `tsconfig.json`, `tests/*`).
- **File đã sửa:** `package.json`, `package-lock.json`, `tsconfig.typecheck.json` (mới), và reformat prettier trên nhiều file `src/`, `tests/`, `docs/`, `*.md`.
- **Lý do:** Khắc phục các phát hiện khi review 3 task M0 — `"latest"` gây trôi phiên bản (rủi ro tái lập/supply-chain), tests không được typecheck, và quality gate `format:check` đỏ ngay từ đầu.
- **Kiểm tra:** `npm run lint` ✅, `npm run typecheck` ✅ (đã bao tests), `npm test` ✅ 3/3, `npm run format:check` ✅, `npm run build` ✅. Xác nhận `package.json` không còn chuỗi `"latest"`.

## [2026-07-21] Hoàn thành M0 Task 4 — cấu hình môi trường và lỗi API

- **Agent:** Codex
- **Thay đổi:** Thêm `.env.example`, `loadServerEnvironment` dùng Zod và payload lỗi API thống nhất với HTTP status mapping. Validation chỉ báo tên biến lỗi, không chứa giá trị secret.
- **File đã tạo/sửa:** `.env.example`, `src/modules/common/env.ts`, `src/modules/common/api-error.ts`, `tests/env.test.ts`, `tests/api-error.test.ts`, `README.md`, `docs/architecture.md`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành M0 Task 4 và tạo ranh giới cấu hình/lỗi an toàn trước khi M1 tích hợp dịch vụ Google.
- **Kiểm tra:** ESLint, Vitest, TypeScript, Prettier cho file mới và Next.js production build.

---

## [2026-07-21] Hoàn thành M0 Task 3 — khung module và ranh giới repository

- **Agent:** Codex
- **Thay đổi:** Tạo module `auth`, `cases`, `files`, `drive`, `sheets`, `qr`, `users`, `reports`, `audit`, `common`; công bố enum/kiểu domain tối thiểu, hợp đồng `DataRepository` và `StorageRepository`, không tích hợp Google API hoặc thêm luồng nghiệp vụ sớm.
- **File đã tạo/sửa:** `src/modules/**/*`, `tests/domain.test.ts`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành M0 Task 3, định hình biên giới module để các task M1–M4 không gọi trực tiếp Google API từ component hoặc service.
- **Kiểm tra:** ESLint, Vitest, TypeScript và Next.js production build.

---

## Format entry

```
## [YYYY-MM-DD] [Tên task ngắn gọn]
- **Agent:** Claude Code | Codex
- **Thay đổi:** <mô tả ngắn những gì đã làm>
- **File đã sửa:** <danh sách file>
- **Lý do:** <vì sao cần thay đổi>
- **Kiểm tra:** <cách xác minh hoạt động đúng>
```

---

## [2026-07-21] Khởi tạo bộ não dự án (AI project brain)

- **Agent:** Claude Code
- **Thay đổi:** Tạo `CLAUDE.md` mới và `docs/brain/00-06` làm bộ nhớ dùng chung cho AI. `AGENTS.md` hiện có được giữ nguyên nội dung nghiệp vụ chi tiết, chỉ thêm phần trỏ tới `docs/brain/` ở đầu file (hợp nhất, không ghi đè — `AGENTS.md` gốc đã rất chi tiết và chính xác).
- **File đã tạo:** `CLAUDE.md`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/02-coding-rules.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`.
- **File đã sửa:** `AGENTS.md` (thêm header trỏ tới `docs/brain/`).
- **Lý do:** Thiết lập ngữ cảnh và quy tắc dùng chung để mọi AI agent đọc trước khi code, tránh "code mù" khi dự án bắt đầu triển khai mã nguồn (M0 trong `PLAN.md`).
- **Kiểm tra:** Các file tồn tại, nội dung khớp với `README.md`/`AGENTS.md`/`PLAN.md`/`docs/architecture.md` hiện có tại thời điểm khởi tạo (2026-07-21); các mục chưa xác minh được (lệnh cài đặt thật, Code Graph) được đánh dấu `_(cần bổ sung)_` thay vì bịa.

## [2026-07-21] Rà soát kỹ thuật PLAN.md, chốt các điểm hở trước M0

- **Agent:** Claude Code
- **Thay đổi:** Review `PLAN.md` theo yêu cầu người dùng, phát hiện các lỗ hổng kỹ thuật (sinh Case ID có race condition, cơ chế version-conflict/idempotency chưa cụ thể trên Sheets, thiếu thư viện HEIC, bảo mật CSRF dồn hết vào M5, backup không tách khỏi tài khoản gốc, thiếu ghi chú tuân thủ PII) và cập nhật trực tiếp vào tài liệu thay vì chỉ để lại nhận xét.
- **File đã sửa:** `PLAN.md` (§2.1, §2.3, §3, M2, M3.6, M5, §5, thêm §7 Tuân thủ dữ liệu cá nhân), `docs/brain/03-decisions.md` (8 entry quyết định mới, 1 entry đánh dấu "cần chủ dự án xác nhận"), `docs/brain/01-architecture.md` (Stack, Lưu ý kiến trúc), `docs/brain/05-testing-and-deploy.md` (ghi chú backup/SPOF).
- **Lý do:** Các lỗ hổng này ảnh hưởng tính đúng đắn dữ liệu (trùng Case ID) và bảo mật (CSRF, backup) nếu để agent code M0–M5 tự suy diễn mỗi người một kiểu.
- **Kiểm tra:** Đọc lại `PLAN.md` để xác nhận số thứ tự mục (1–8) không bị gãy sau khi chèn §7 mới; đối chiếu `docs/brain/03-decisions.md` với `PLAN.md` để không mâu thuẫn.

## [2026-07-21] Hoàn thành M0 Task 1 — đồng bộ tài liệu kiến trúc

- **Agent:** Codex
- **Thay đổi:** Đồng bộ tài liệu chuẩn theo PLAN đã rà soát: ghi rõ PWA online-only, HEIC/HEIF client-side, bootstrap Drive cùng OAuth client, `REQUEST_LOG` cho idempotency, quy tắc thay/xóa file, batch Sheets, backup tách khỏi Gmail gốc và điều kiện PII trước pilot thật.
- **File đã sửa:** `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành Task 1 M0 và ngăn tài liệu kiến trúc/API/schema mâu thuẫn trước khi khởi tạo mã nguồn.
- **Kiểm tra:** Đối chiếu các điểm kiến trúc mới với `PLAN.md`; chưa có mã nguồn hoặc test tự động ở task tài liệu này.

## [2026-07-21] Hoàn thành M0 Task 2 — khởi tạo Next.js/PWA/test

- **Agent:** Codex
- **Thay đổi:** Tạo Next.js App Router TypeScript strict, Tailwind, PWA manifest và service worker online-only, scaffold ESLint/Prettier/Vitest/Playwright, trang khởi tạo và smoke test.
- **File đã tạo/sửa:** `package.json`, `package-lock.json`, `tsconfig.json`, cấu hình Next/ESLint/Prettier/Vitest/Playwright, `src/app/*`, `src/components/pwa-register.tsx`, `src/lib/app-metadata.ts`, `public/*`, `tests/*`, `docs/brain/00-project-overview.md`, `docs/brain/01-architecture.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành nền tảng kỹ thuật bắt buộc trước khi tạo module nghiệp vụ ở M0 Task 3.
- **Kiểm tra:** Next.js build và TypeScript đạt; Vitest đạt 1/1. Playwright assertion đạt 1/1 nhưng runner dev server không tự dừng trước timeout của môi trường Windows; cần chạy lại ở terminal/CI bình thường.

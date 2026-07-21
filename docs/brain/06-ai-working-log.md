# 06 — AI Working Log

> Nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

---

## [2026-07-21] Xử lý treo khi tải ảnh: timeout, tiếp tục từ chỗ dở, hủy được

- **Agent:** Claude Code
- **Vấn đề:** Lần trước mới sửa **nguyên nhân** của một lần treo cụ thể (thiếu header `Origin`
  nên Google không gắn CORS cho phiên resumable), chưa xử lý **việc bị treo nói chung**. `fetch`
  PUT lên Drive không có timeout, không retry, không hủy được: mạng 4G rớt giữa chừng thì giao
  diện đứng ở "Đang tải…" cho tới khi hệ điều hành đóng socket, `busy` kẹt `true` nên mọi nút bị
  khóa và người dân không có đường thoát. `PLAN.md` §6 và `PLAN_NL.md` §11 đều yêu cầu kiểm thử
  "mất mạng giữa upload, retry" — tức đây là lỗi thật, không phải chuyện phụ.
- **Thay đổi:** Thêm `src/modules/public-intake/resumable-upload.ts`:
  - Mỗi lần thử có timeout riêng (60s) bằng `AbortController`, ghép với tín hiệu hủy của người
    dùng.
  - Thất bại thì hỏi Google đã nhận bao nhiêu byte (`Content-Range: bytes */tổng` → 308 kèm
    header `Range`) rồi **gửi tiếp phần còn thiếu**, không tải lại từ đầu. Tối đa 3 lần thử.
  - Nhận ra trường hợp tệp thực ra đã lên đủ dù lần thử báo lỗi (tránh tải lại thừa).
  - Ném `UploadCancelledError`/`UploadFailedError` để giao diện phân biệt được hủy và lỗi.
  - Thêm `fetchApi` (timeout 20s) cho toàn bộ lệnh gọi API của app — trước đó cũng không có
    timeout nào.
  - Giao diện: hiện phần trăm tiến độ, nút **"Hủy tải ảnh"**, xóa lỗi cũ khi bắt đầu lượt mới,
    và `busy` luôn được trả về `false` trong `finally`.
- **File đã tạo:** `src/modules/public-intake/resumable-upload.ts`, `tests/resumable-upload.test.ts`.
- **File đã sửa:** `src/app/ke-khai/wizard.tsx`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `test` ✅ 46/46, `format:check` ✅, `build` ✅.
  9 test mới cho module upload, gồm: gửi tiếp đúng `Content-Range` khi mới nhận một phần; rớt
  mạng giữa chừng thì hỏi tiến độ rồi gửi nốt phần thiếu; nhận ra tệp đã lên đủ; bỏ cuộc sau số
  lần thử tối đa **thay vì treo**; hủy thì dừng ngay không thử lại; timeout tự kết thúc lần thử.
  Chạy thật trên trình duyệt: tải ảnh 175 KB thành công; bắt đầu tải ảnh **12,7 MB** rồi bấm
  "Hủy tải ảnh" → dừng ngay, hiện "Đã hủy tải ảnh...", **các nút mở khóa lại**; sau đó chọn tệp
  khác tải lại thành công.

---

## [2026-07-21] Cổng kê khai công khai lưu thật vào Google Sheets + Drive

- **Agent:** Claude Code
- **Thay đổi:** Nâng demo `/ke-khai` từ UI-only lên lưu trữ thật. Migration idempotent thêm 7 tab
  `PUBLIC_*`; phiên công khai bằng cookie ký HMAC + CSRF riêng (người dân không có email nên
  không dùng lại `modules/auth/csrf.ts`); 5 API route công khai; upload resumable trực tiếp
  browser → Drive; submit trải nháp JSON thành các dòng chuẩn hóa trong **một** `batchUpdate`.
- **Quyết định thiết kế đáng chú ý:** nháp lưu dạng JSON trong `PUBLIC_SUBMISSIONS.draft_json`,
  chỉ chuẩn hóa ra 5 tab con **khi gửi**. Nháp bị sửa liên tục; nếu chuẩn hóa ngay thì mỗi lần
  lưu phải xóa/ghi lại nhiều dòng ở năm tab, đốt đúng cái quota ghi Sheets vốn là trần thật của
  hệ thống (`PLAN_NL.md` §9.1).
- **File đã tạo:** `scripts/migrate-public-intake.ts`, `src/modules/public-intake/{session,
repository,storage,route-context,validation}.ts`, `src/app/api/public/submissions/**` (5 route),
  `tests/public-intake-validation.test.ts`.
- **File đã sửa:** `src/modules/bootstrap/{schema,index}.ts`, `src/modules/common/env.ts`,
  `src/modules/google/workspace-client.ts`, `src/app/ke-khai/{page,wizard}.tsx`, `.env.example`,
  `package.json`, `tests/env.test.ts`.
- **Hai lỗi phát hiện khi chạy thật, đã sửa:**
  1. **Upload từ trình duyệt bị treo.** Google chỉ gắn CORS header cho phiên resumable nếu header
     `Origin` được gửi **lúc tạo phiên**. Thiếu nó thì PUT từ browser treo vô hạn (không phải lỗi
     CORS rõ ràng nên rất khó đoán). Đã truyền `browserOrigin` lấy từ `new URL(request.url).origin`
     — không lấy từ header `Origin` của client để tránh phản chiếu origin lạ.
  2. **PATCH không validate lại dữ liệu.** Chỉ endpoint tạo mới kiểm số điện thoại; PATCH nhận
     nguyên `draft` nên số điện thoại hỏng ghi thẳng vào Sheets (phát hiện khi một giá trị `002`
     lọt vào kho lúc kiểm thử). Thêm `validation.ts` kiểm ở cả PATCH lẫn submit.
- **Bảo mật đã có:** cookie `HttpOnly`/`SameSite=Strict` trượt 2h–trần 12h; CSRF buộc vào phiên;
  submission_id **chỉ** lấy từ cookie đã ký, không nhận từ URL/body; mã bí mật chỉ lưu HMAC với
  pepper riêng; xác minh parent/MIME/kích thước sau upload và **xóa tệp không đạt**; ngân sách
  byte và số lượng ảnh enforce ở server; không trả Drive ID ra client.
- **Chưa có, bắt buộc trước khi deploy công khai:** Turnstile, Cloudflare rate limiting, kiểm tra
  `ORIGIN_SHARED_SECRET` (`PLAN_NL.md` §10, §10.2). Banner trên `/ke-khai` đang nói rõ điều này.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `test` ✅ 37/37, `format:check` ✅, `build` ✅.
  Migration chạy hai lần: lần đầu tạo 7 tab, lần hai báo "không có tab nào cần thêm" (idempotent).
  Chạy thật đầu-cuối trên trình duyệt: tạo nháp → autosave hiện "Đã lưu" → xác nhận mã bí mật →
  tải 1 ảnh CCCD + 2 ảnh GCN thẳng lên Drive → gửi. Đối chiếu Sheets sau khi gửi:
  `PUBLIC_SUBMISSIONS` `SUBMITTED`, `PUBLIC_CERTIFICATES`/`OWNERS`/`PARCELS`/`LAND_USES` mỗi tab
  1 dòng, `PUBLIC_ASSETS` 0 dòng (đúng, không có tài sản), `PUBLIC_FILES` 3 dòng đều có checksum.
  Xác nhận CSRF chặn: gọi `uploads/initiate` thiếu token trả 403 `ACCESS_DENIED`.
- **Dữ liệu demo còn lại trong Sheets:** 2 dòng `PUBLIC_SUBMISSIONS` (một `DRAFT`, một
  `SUBMITTED`) và 3 ảnh trong `01_INBOX` — dữ liệu giả, xóa được bất cứ lúc nào.

---

## [2026-07-21] Demo cổng kê khai công khai `/ke-khai` (UI-only, không đụng Google)

- **Agent:** Claude Code
- **Thay đổi:** Dựng bản chạy thử cổng kê khai cho người dân — wizard 8 bước phủ đủ 15 trường
  Phụ lục 8, sinh mã tiếp nhận/mã bí mật, sàng lọc trường hợp ngoài phạm vi, xác nhận đã lưu mã
  trước khi cho tải ảnh. Thêm design token vào `globals.css` (nền `#F7F6F3`, mặt trắng, viền
  `#EAEAEA`, nhấn xanh lục, input cao 48px, focus ring rõ, tắt animation khi
  `prefers-reduced-motion`), thay font Arial bằng system stack. Trang chủ tách hai đường đi
  "Người dân" / "Cán bộ".
- **Phạm vi có chủ đích:** **không** gọi Google Sheets/Drive, **không** migration, **không**
  upload thật, **không** API route mới. Dữ liệu chỉ nằm trong state React và mất khi tải lại
  trang. Có banner "BẢN CHẠY THỬ — KHÔNG NHẬP DỮ LIỆU THẬT" trên đầu trang để không ai nhập PII
  thật vào form chưa có lớp bảo vệ nào.
- **File đã tạo:** `src/modules/public-intake/types.ts`, `src/modules/public-intake/reference.ts`,
  `src/modules/public-intake/receipt-code.ts`, `src/app/ke-khai/page.tsx`,
  `src/app/ke-khai/wizard.tsx`, `tests/receipt-code.test.ts`, `.claude/launch.json`.
- **File đã sửa:** `src/app/globals.css`, `src/app/page.tsx`.
- **Lý do:** Chủ dự án yêu cầu có bản demo chạy thử trước, các hạng mục còn tồn đọng note lại
  hoàn thiện sau. Chọn phạm vi UI-only để tránh migration cột trên `CASES`/`CERTIFICATES`/`OWNERS`
  (rủi ro cao, không hoàn tác được) và để không phụ thuộc bảng mã trường 12 hiện chưa có.
- **Nợ kỹ thuật đã ghi rõ trong code:** `reference.ts` có cờ `REFERENCE_IS_PLACEHOLDER` và cảnh
  báo — **toàn bộ danh mục mã là giá trị tạm**, phải thay bằng bảng mã chính thức từ Chi nhánh
  VPĐKĐĐ Phú Thọ/đơn vị thi công trước khi dùng dữ liệu thật (xem `PLAN_NL.md` §5.3 mục V1).
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `test` ✅ 25/25 (thêm 10 test cho mã tiếp nhận: bảng chữ
  không chứa `0/O/1/I/L/U`, năm theo `Asia/Ho_Chi_Minh` — có case 31/12 23:00 UTC phải ra 2027,
  ký tự kiểm tra, 200 mã liên tiếp không trùng), `format:check` ✅, `build` ✅ (`/ke-khai` prerender
  tĩnh). Chạy thật trên trình duyệt: xác nhận render tiếng Việt đúng, chọn "Chưa có GCN" hiện khối
  định tuyến ra một cửa và khóa nút Tiếp tục, thiếu ô đồng ý thì chặn chuyển bước, qua bước 2 sinh
  `PC-KK-2026-2GTT7JG9` (ký tự kiểm tra khớp) và mã bí mật 4 nhóm.

---

## [2026-07-21] Sửa sau review Task 4: fail-fast cấu hình, Zod v4, chuẩn hóa line ending

- **Agent:** Claude Code
- **Thay đổi:** (1) Thêm `src/instrumentation.ts` gọi `loadServerEnvironment()` khi server khởi động — trước đó hàm này không có caller nào nên validation cấu hình chỉ tồn tại trên giấy; guard bỏ qua ở dev và lúc build để `next build` và Playwright vẫn chạy được trên máy chưa dựng `.env`. (2) Đổi `env.ts` sang cú pháp Zod v4 (`z.url()`, `z.email()` thay cho `z.string().url()/.email()` kiểu v3 đã deprecated). (3) Thêm `.gitattributes` (`* text=auto eol=lf`) vì `core.autocrlf=true` trên Windows tạo CRLF trong working tree, làm `format:check` đỏ lại sau **mỗi** lần checkout/merge — file nhị phân (`*.pdf`, `*.docx`, ảnh) đánh dấu `binary` để không bị chuẩn hóa.
- **File đã tạo:** `src/instrumentation.ts`, `tests/instrumentation.test.ts`, `.gitattributes`.
- **File đã sửa:** `src/modules/common/env.ts`, và chuẩn hóa line ending LF trên toàn repo.
- **Lý do:** Khắc phục phát hiện khi review M0 Task 4 — cấu hình sai lẽ ra phải làm hỏng deploy chứ không phải hỏng request đầu tiên chạm Google API giữa lúc cán bộ đang nộp hồ sơ; và gate format phải ổn định thay vì đỏ/xanh theo thao tác git.
- **Kiểm tra:** `lint` ✅, `typecheck` ✅, `test` ✅ 10/10 (thêm 3 test cho các nhánh guard, gồm test chứng minh server production thiếu biến môi trường thì **ném lỗi thật**), `format:check` ✅, `build` ✅. Xác nhận `.next/server/instrumentation.js` được sinh ra (Next đã nhận hook), `git check-attr` trả `eol: lf` cho mã nguồn và `binary: set` cho PDF/DOCX, kích thước hai file nghiệp vụ không đổi (1102991 / 15946 bytes).

---

## [2026-07-21] Hoàn thành M1 Task 7 — cấu hình OAuth và tạo clients

- **Agent:** Codex
- **Thay đổi:** Tạo cấu hình Google Auth Platform với app name `Ho so dat dai Phong Chau`, nhóm người dùng External và email hỗ trợ/liên hệ `anmphongandn@gmail.com`; tạo hai OAuth client: `Phong Chau Web Sign-In` (Web application) và `Phong Chau Drive Sheets Bootstrap` (Desktop app). Web client chỉ có origin `http://localhost:3000` và redirect URI `http://localhost:3000/api/auth/callback/google`.
- **File đã sửa:** `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Tách OAuth đăng nhập web khỏi OAuth offline dùng để bootstrap kho My Drive/Google Sheets, không dùng service account.
- **Kiểm tra:** Google Auth Platform xác nhận tạo thành công cả hai clients. Không download, commit hoặc ghi client secret vào tài liệu/source. OAuth hiện ở trạng thái External/Testing; phải thêm URL Vercel, kiểm tra consent screen và chuyển Production trước dữ liệu thật.

---

## [2026-07-21] Hoàn thành M1 Task 6 — bật Google Drive API và Google Sheets API

- **Agent:** Codex
- **Thay đổi:** Bật hai dịch vụ bắt buộc trong Google Cloud Project `resolute-future-478306-e7`: `drive.googleapis.com` và `sheets.googleapis.com`.
- **File đã sửa:** `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Cho phép bước tiếp theo tạo OAuth clients và bootstrap an toàn My Drive/Google Sheets cho ứng dụng.
- **Kiểm tra:** Trang API/Service Details của từng dịch vụ hiển thị trạng thái `Enabled` và nút `Disable API`.

---

## [2026-07-21] Hoàn thành M1 Task 5 — tạo Google Cloud Project

- **Agent:** Codex
- **Thay đổi:** Tạo Google Cloud Project bằng tài khoản chủ sở hữu đã chốt `anmphongandn@gmail.com`; Project ID `resolute-future-478306-e7`, Project number `192974001854`.
- **File đã sửa:** `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Hoàn thành bước 1 của M1 để chuẩn bị bật Google Drive API, Google Sheets API và tạo OAuth clients. Chưa tạo API key, OAuth client, refresh token hay thay đổi cấu hình ứng dụng.
- **Kiểm tra:** Google Cloud Console hiển thị dashboard của Project ID `resolute-future-478306-e7` dưới đúng tài khoản chủ sở hữu.

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

## [2026-07-21] Hoàn thành mã M1 Task 8 — bootstrap Google và health check

- **Agent:** Codex
- **Thay đổi:** Thêm Google API client chỉ dùng server/CLI, schema bootstrap cho 14 tab Sheets và dữ liệu danh mục, cùng `scripts/bootstrap-google.ts` tạo idempotent cây My Drive, spreadsheet và `SYSTEM_ADMIN` đầu tiên. Thêm `GET /api/health/google` kiểm tra token OAuth, thư mục gốc và schema; khai báo/lưu scope `drive.file` trong Google OAuth consent screen.
- **File đã tạo/sửa:** `src/modules/bootstrap/*`, `src/modules/google/workspace-client.ts`, `scripts/bootstrap-google.ts`, `src/app/api/health/google/route.ts`, `tests/bootstrap-schema.test.ts`, `package.json`, `package-lock.json`, `tsconfig.typecheck.json`, `.gitignore`, `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md`, `docs/brain/05-testing-and-deploy.md`.
- **Lý do:** Hoàn thành phần code của M1 mà không cần tạo thủ công file Drive (không tương thích với `drive.file`) và không đưa secret/refresh token vào source hoặc terminal.
- **Kiểm tra:** `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test`, `npm.cmd run build`, `git diff --check` đều đạt. Chưa chạy bootstrap thật/health live vì OAuth client secret chưa được lưu an toàn trong `.env.local`.

---

## [2026-07-21] Bootstrap CLI tự nạp `.env.local`

- **Agent:** Codex
- **Thay đổi:** Bootstrap CLI dùng `@next/env` để nạp `.env.local` trước khi validation, đồng thời khai báo dependency trực tiếp.
- **File đã sửa:** `scripts/bootstrap-google.ts`, `package.json`, `package-lock.json`, `docs/brain/05-testing-and-deploy.md`.
- **Lý do:** Hướng dẫn vận hành dùng `.env.local`; `tsx` không tự nạp file này như Next.js nếu không có cấu hình rõ ràng.
- **Kiểm tra:** `npm.cmd run format:check`, `npm.cmd run typecheck`, `npm.cmd run test`, `git diff --check` đều đạt.

---

## [2026-07-21] Sửa entrypoint CommonJS cho bootstrap CLI

- **Agent:** Codex
- **Thay đổi:** Thay top-level `await` bằng lời gọi `bootstrap()` có xử lý lỗi rõ ràng, tương thích với output CommonJS của `tsx` trong dự án.
- **File đã sửa:** `scripts/bootstrap-google.ts`.
- **Lý do:** Lần chạy bootstrap thật dừng trước OAuth do `tsx` báo top-level `await` không được hỗ trợ với CommonJS; chưa tạo dữ liệu Google ở lần chạy lỗi.
- **Kiểm tra:** Chạy lại bootstrap sau typecheck.

---

## [2026-07-21] Bootstrap My Drive và Google Sheets thành công

- **Agent:** Codex + chủ dự án xác minh Google OAuth
- **Thay đổi:** Chạy bootstrap thật bằng tài khoản quản trị; tạo hoặc xác nhận cây My Drive, spreadsheet 14 tab, dữ liệu tham chiếu 10 tổ dân phố và dòng `SYSTEM_ADMIN` đầu tiên.
- **File đã tạo cục bộ:** `.bootstrap-state.json`, `.bootstrap-secrets.json` (đều bị Git bỏ qua; không ghi ID/token vào working log).
- **Lý do:** Hoàn tất phần tạo kho dữ liệu thật của M1.
- **Kiểm tra:** Chạy lại `npm.cmd run bootstrap:google` đạt và trả thông báo `Bootstrap hoàn tất`; lần chạy lại dùng state hiện có, không tạo trùng kho dữ liệu.

---

## [2026-07-21] Health check M1 không phụ thuộc cấu hình đăng nhập M2

- **Agent:** Codex
- **Thay đổi:** Tách validation cấu hình kho Google khỏi validation cấu hình server đầy đủ; `GET /api/health/google` chỉ cần OAuth Drive, refresh token, Drive root ID và spreadsheet ID.
- **File đã sửa:** `src/modules/common/env.ts`, `src/app/api/health/google/route.ts`, `tests/env.test.ts`, `docs/brain/01-architecture.md`, `docs/brain/05-testing-and-deploy.md`.
- **Lý do:** Cần xác minh M1 ngay sau bootstrap, trước khi tạo Google Sign-In và các secret của M2.
- **Kiểm tra:** `npm.cmd run format:check`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test` đều đạt (13 tests). Health check thật trả HTTP 200 với `oauth`, `drive`, `sheets`, `schema` đều `ok`.

---

## [2026-07-21] Hoàn thành M2 — Google Sign-In và phân quyền USERS

- **Agent:** Codex
- **Thay đổi:** Thêm Auth.js/Google OAuth (scope đăng nhập tối thiểu, state/PKCE, session JWT cookie
  HttpOnly/SameSite/Secure), `proxy.ts` bảo vệ session ở Edge và authorization Node đọc lại `USERS`
  cho từng page/API. Hoàn thành `/profile`, `/users` cho SYSTEM_ADMIN, `GET/POST/PATCH /api/users`,
  `GET /api/security/csrf`. Token CSRF HMAC gắn email, hạn 10 phút; API write yêu cầu CSRF và
  idempotency key. Repository Users ghi `USERS`, `AUDIT_LOGS`, `REQUEST_LOG` cùng một Sheets
  `batchUpdate`; audit từ chối đăng nhập chỉ lưu hash email.
- **File đã tạo/sửa:** `src/auth*`, `src/proxy.ts`, routes auth/users/CSRF, module `auth`, repository
  Users, trang profile/users, component quản trị, test CSRF, `package.json`/lockfile và tài liệu kiến trúc.
- **Lý do:** Hoàn thành M2 trước khi tạo/upload hồ sơ để email ngoài allowlist không thể truy cập và
  thay đổi quyền có hiệu lực ngay.
- **Kiểm tra:** `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test` (15 tests),
  `npm.cmd run format:check`, `npm.cmd run build` đều đạt.

## [2026-07-21] Sửa tạo bản kê khai bị báo lỗi sau khi backend đã ghi

- **Agent:** Codex
- **Thay đổi:** Bắt buộc UUID `idempotency-key` cho API tạo nháp công khai; sinh ổn định
  submission ID, mã tiếp nhận và mã bí mật bằng HMAC; cache kết quả không chứa secret trong
  `REQUEST_LOG`; batch dòng nháp và request log; gộp retry chồng nhau trong cùng instance. Giao
  diện giữ key theo phiên, tự retry một lần khi lỗi mạng/5xx, bắt rejection và hiển thị hướng dẫn
  khôi phục. Route trả lỗi JSON an toàn, có `maxDuration=30`; client chờ 35 giây.
- **File đã sửa:** `src/app/api/public/submissions/route.ts`, `src/app/ke-khai/wizard.tsx`,
  `src/modules/public-intake/repository.ts`, `src/modules/public-intake/creation-idempotency.ts`,
  `tests/public-submission-create.test.ts`, `AGENTS.md`, `docs/architecture.md`,
  `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`,
  `docs/brain/04-current-tasks.md`, `docs/brain/06-ai-working-log.md`.
- **Lý do:** Lần thử trên điện thoại đã tạo `DRAFT` và thư mục Drive thật nhưng mất response sau
  khoảng 8,4 giây; UI báo thất bại và lần bấm lại có nguy cơ tạo hồ sơ trùng.
- **Kiểm tra:** Test route bao phủ tạo mới, replay sau mất response, hai retry chồng nhau và lỗi
  Google không lộ chi tiết. `typecheck`, lint, 50/50 Vitest, Prettier và `git diff --check` đạt;
  smoke trực tiếp `/ke-khai` trả HTTP 200 và API thiếu idempotency key trả JSON 400 đúng chuẩn.
  Playwright runner cấu hình sẵn không khởi động được server port 3001 vì Next dev port 3000 đang
  giữ khóa `.next`; không dừng server người dùng đang thử để tránh gián đoạn.

## [2026-07-21] Bắt đầu khu vực cán bộ xử lý bản kê khai

- **Agent:** Codex
- **Thay đổi:** Thêm hàng chờ `/submissions`, trang chi tiết bản kê khai và API có allowlist, role,
  CSRF, version và audit cho thao tác nhận xử lý, yêu cầu bổ sung và từ chối. Dữ liệu nhạy cảm bị
  che; không trả Drive ID hoặc link Drive.
- **File đã sửa:** `src/app/submissions/*`, `src/app/api/submissions/*`, `src/components/submission*`,
  `src/modules/public-intake/repository.ts`, `src/modules/submissions/review.ts`, `src/proxy.ts`,
  `src/app/profile/page.tsx`, test và tài liệu kiến trúc liên quan.
- **Lý do:** Cổng công khai đã ghi `PUBLIC_*` nhưng chưa có đường cho cán bộ xem hoặc phân loại hồ sơ.
- **Kiểm tra:** TypeScript, ESLint, Prettier và Vitest được chạy sau thay đổi. Tiếp nhận chính thức,
  preview và migration schema là bước tiếp theo; nút tiếp nhận chưa được mở khi bảng mã trường 12
  còn là placeholder.

## [2026-07-21] Hiện PII đầy đủ trong chi tiết hồ sơ cho cán bộ

- **Agent:** Codex
- **Thay đổi:** Trang chi tiết `/submissions/:id` trả và hiển thị đầy đủ số điện thoại cùng CCCD/số
  định danh sau khi server kiểm tra role cán bộ; danh sách hàng chờ vẫn che PII. Mỗi lượt mở chi
  tiết ghi audit `SUBMISSION_SENSITIVE_DETAIL_VIEWED`.
- **Lý do:** Cán bộ cần đối chiếu trực tiếp số liên hệ và định danh với giấy tờ khi xử lý hồ sơ.
- **Kiểm tra:** API vẫn đặt `cache-control: no-store`, không trả Drive ID/link và chỉ role nghiệp vụ
  mới truy cập được trang/endpoint.

## [2026-07-21] Xem ảnh giấy tờ trong chi tiết hồ sơ

- **Agent:** Codex
- **Thay đổi:** Thêm route ảnh preview có kiểm tra role, tra `PUBLIC_FILES`, lấy thumbnail nội bộ
  từ Google Drive bằng OAuth rồi trả `private, no-store`; UI hiển thị CCCD/GCN trong chi tiết hồ
  sơ. Không trả URL thumbnail hay ảnh gốc cho trình duyệt.
- **Lý do:** Cán bộ cần đối chiếu dữ liệu khai báo với ảnh giấy tờ mà không mở Drive công khai.
- **Kiểm tra:** Mỗi lượt preview ghi `SUBMISSION_FILE_PREVIEW_VIEWED`; typecheck, lint, Vitest và
  Prettier đạt. Thumbnail phụ thuộc Drive tạo được preview cho loại tệp đã tải.

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

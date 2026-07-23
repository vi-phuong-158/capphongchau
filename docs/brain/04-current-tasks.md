# 04 — Current Tasks

> Cập nhật mỗi khi bắt đầu hoặc hoàn thành task. Agent đọc đây để biết được phép làm gì.
>
> **Kế hoạch đang có hiệu lực là [`PLAN2.md`](../../PLAN2.md)** (bản cập nhật 2026-07-22).
> `PLAN.md` (M0–M5) và `PLAN_NL.md` là bối cảnh lịch sử — các mốc M0–M2 đã xong, nhưng thứ tự ưu
> tiên và mục tiêu dữ liệu đã thay đổi. Khi ba tài liệu mâu thuẫn, **`PLAN2.md` thắng**.

---
### ETL status update (2026-07-23)

Schema and data ETL have completed successfully after the Google Sheets backup. Supabase verification found the expected legacy tables and one `LEGACY_SHEETS_IMPORT:*` marker. Do not rerun the import; keep the Sheet read-only during cutover.


## Migration Supabase (2026-07-23)

**Code đã hoàn tất, production chưa cutover.** Runtime repository hồ sơ và `USERS` đã chuyển sang
Supabase PostgreSQL; schema SQL, health endpoint và ETL Sheets→Supabase đã có. Google Drive vẫn lưu file.

Việc quản trị còn phải làm trước deploy:

1. Tạo Supabase project Singapore và áp dụng `supabase/migrations/*`.
2. Đặt `SUPABASE_DATABASE_URL` Supavisor transaction pooler trong Vercel/local.
3. Backup + tạm dừng ghi vào production, chạy ETL dry-run rồi chạy thật một lần.
4. Đối chiếu row count/mẫu hồ sơ, file, user, audit, lookup; kiểm tra `/api/health/database` và
   `/api/health/google`.
5. Deploy, theo dõi lỗi/latency và giữ spreadsheet restricted/read-only trong cửa sổ rollback.
6. Thiết lập backup/PITR và `pg_dump` mã hóa ra nơi độc lập.

Quyết định “giữ Sheets, không PostgreSQL” trong `PLAN2.md` và mục “Đã chốt” bên dưới là lịch sử,
đã bị yêu cầu mới của chủ dự án thay thế.

---

## Thay đổi lớn về mục tiêu (2026-07-22)

**Đích xuất là `Tai lieu/PL3.xlsx` — 49 trường, không phải 15 trường Phụ lục 8.** Mỗi dòng là một
(GCN × thửa × người), giá trị ghi bằng chữ chứ không phải mã. Hệ thống hiện thu trọn vẹn ~11/49.
Xem quyết định cùng ngày trong `03-decisions.md` và bảng đối chiếu đầy đủ ở Phụ lục `PLAN2.md`.

**Quy mô mục tiêu nâng lên 20.000 hồ sơ** (trước là 500). Đã có phương án: **không sharding**, giữ
một spreadsheet và sửa ba chỗ ở tầng truy cập dữ liệu — xem `03-decisions.md`.

**Duyệt hồ sơ sẽ có Gemini đối chiếu** (so lệch hai nguồn, không điền sẵn). Chưa xây.

---

## Đang làm

**Production đã deploy** (2026-07-22): `https://capphongchau.vercel.app`, `/api/health/google`
trả `ok`, `/ke-khai` trả 200 và đúng nội dung. **Chưa có domain thật gắn Cloudflare** — chỉ có URL
Vercel cấp, chủ dự án không sở hữu DNS zone đó. Đang bật tạm
`PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE=true` trên Vercel Production để test trên điện thoại (xác
nhận có tác dụng: `/ke-khai` từ 404 chuyển sang 200 sau khi bật + redeploy).
**⚠️ BẮT BUỘC xóa biến này ngay khi có domain thật gắn Cloudflare** — trong lúc bật, `/ke-khai` và
`/api/public/*` không được Cloudflare WAF/rate limiting bảo vệ (xem `03-decisions.md` và
`06-ai-working-log.md` cùng ngày). Trước dữ liệu thật phải kiểm tra biến này đã bị gỡ khỏi Vercel.

M2 đã hoàn thành và được kiểm tra build.

**Cổng kê khai công khai `/ke-khai` đang chạy bản legacy**: tạo nháp, autosave và upload thật. Code Supabase đã sẵn sàng nhưng production chưa cutover; không deploy repository mới trước khi hoàn thành runbook migration ở trên. Các tab intake ban đầu đã được tạo;
Gói A bổ sung timeline, yêu cầu bổ sung, dữ liệu GCN cũ và chỉ mục HMAC qua migration append-only
bằng `npm run migrate:public-intake` (idempotent, chỉ thêm tab hoặc nối header ở cuối — **không**
đụng cột của `CASES`/`CERTIFICATES`/`OWNERS`). Xem `PLAN2.md` và entry log
[2026-07-21] trong `06-ai-working-log.md`.

**Lớp biên — phần code đã xong (2026-07-22, nhánh `feat/edge-protection`):** Turnstile fail-closed
ở hai hành động `create`/`submit`, và chốt chặn `ORIGIN_SHARED_SECRET` ở `/api/public/*` +
`/ke-khai`. **Phần dashboard chưa làm và AI không làm được:** DNS proxy qua Cloudflare, SSL Full
(strict), Transform Rule gắn header `X-Origin-Auth`, cache rule bypass `/api/*` + `/ke-khai*`,
rate limiting rules, đặt biến môi trường mới trên Vercel, bật Deployment Protection cho Preview.
Chưa xong các mục đó thì chốt chặn ở origin **chưa bảo vệ được gì**.

### Đã làm xong 2026-07-22 (nhánh `fix/image-format-and-support-contacts`)

- Sửa lỗi ảnh JPG từ Zalo bị từ chối oan (`File.type` rỗng hoặc bí danh `image/jpg`).
- Ảnh GCN cũng qua bước chuyển HEIC→JPEG như ảnh CCCD.
- Danh bạ cán bộ hỗ trợ theo tổ dân phố + câu phạm vi áp dụng ở đầu `/ke-khai`.
- Bảng tham chiếu tờ bản đồ cũ → mới (164 dòng) và trường `Parcel.oldWard`.

✅ Đã chạy `npm run migrate:public-intake` trên Google Sheet đang cấu hình ngày 2026-07-22 — thêm
8 tab Gói A và nối `access_version`, `file_summary_json`, `old_ward`. Môi trường Google Sheet khác
vẫn phải chạy migration trước deploy.
Script nay còn nối được cột thiếu vào tab đã tồn tại, không chỉ tạo tab mới.

### Chặn trước khi đưa cổng công khai vào dữ liệu thật

Danh sách đầy đủ kèm ước công ở `PLAN2.md` §2. Còn thật sự chặn:

1. **Thông báo bảo vệ dữ liệu vẫn là placeholder** (`wizard.tsx`) và server tự ghi
   `consentAccepted = true` không kiểm (`submissions/route.ts:230`).
2. **Lớp biên:** `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` đang **BẬT** trên production; chưa có
   security headers; chưa có domain thật sau Cloudflare.
3. **Tổ chức trong tra cứu GCN đã có chưa khớp được** — hiện chỉ khớp cá nhân bằng HMAC(CCCD); 280
   dòng tổ chức trong kho (mã dạng `N/A-<mst>`) chưa có đường khớp bằng mã số thuế.

✅ **Đã sửa trong phiên 2026-07-23** (từng là mục 1/3/5 của danh sách này, xem `03-decisions.md` và
`06-ai-working-log.md` cùng ngày):

- Khôi phục hồ sơ bằng mã tiếp nhận + mã bí mật (`/tra-cuu`, session v2, khóa tạm 5 lần sai).
- Lỗ định danh Hộ gia đình/Tổ chức bỏ qua CCCD — `requiresCitizenId`/`isOrganisationOwner` sửa lại.
- Quy tắc kiểm diện tích từ chối chính dữ liệu PL3 mẫu — thêm dung sai 0,5 m².
- Danh mục trường 12/13 sai theo PL3; giới hạn 3 dòng mục đích/thửa; thu "Người sử dụng hiện tại"
  (cột O, P) cho ca chủ đã mất; tra cứu GCN đã có theo CCCD-đơn + bắt buộc QR;
  `VietnameseDateInput` cho ngày sinh/ngày cấp GCN.
- **Chưa chạy `npm run migrate:public-intake` sau các thay đổi này ở môi trường khác** — nhớ chạy
  trước deploy môi trường mới (cột `access_version`, `file_summary_json`, 5 cột `PUBLIC_OWNERS`,
  8 tab Gói A).

### Chờ cơ quan trả lời — AI không làm thay được

- **Danh mục `Loại đất` / `Nguồn gốc` / `Hình thức` / `Thời hạn`.** Câu quan trọng nhất: giá trị
  _"Nhận chuyển nhượng đất được Công nhận QSDĐ như giao đất có thu tiền sử dụng đất"_ là **một mục
  trong danh mục** hay **ghép hai ý**? Đáp án quyết định biểu mẫu có một ô chọn hay hai. Bộ câu hỏi
  đã soạn sẵn ở `PLAN2.md` §9.
- **Trường 21 và 22 của PL3 là gì** (số thứ tự nhảy từ 20 sang 23), và cột O, P không đánh số có
  thuộc bộ 49 không.
- **Có bảng tham chiếu số THỬA cũ→mới không?** Bảng hiện có chỉ quy đổi số _tờ_ (trường 19); trường
  20 chưa có nguồn nào.
- **Định nghĩa phân nhóm A/B/C/E** (KH 247/KH-UBND ngày 30/6/2026) — ảnh hưởng schema báo cáo.
- **Tỷ lệ GCN cấp cho hộ gia đình** ở Phong Châu (đếm trên ~30 GCN thật) — quyết định có chặn được
  hộ gia đình gửi hồ sơ hay không; nếu HGĐ chiếm đa số thì quy tắc chặn làm cổng vô dụng.
- **Tỷ lệ GCN nhiều thửa** — đếm cùng lần trên ~30 GCN thật.
- **Xác minh tầng dịch vụ Gemini** (bật thanh toán, điều khoản không dùng dữ liệu huấn luyện) trước
  tấm ảnh thật đầu tiên.

### Đã chốt — đừng đề xuất lại

- **[SUPERSEDED 2026-07-23] Kho dữ liệu:** trước đây giữ Google Sheets + Drive; hiện dữ liệu cấu trúc chuyển sang Supabase, Drive vẫn giữ file. Ghi chú kỹ thuật: mã nguồn
  **không hỗ trợ Shared Drive** (không có `supportsAllDrives` ở bất kỳ lời gọi Drive API nào) —
  muốn chuyển sau này phải sửa toàn bộ lời gọi, không chỉ đổi folder ID.
- **Nhân sự duyệt:** chủ dự án xác nhận có đủ. Không cần phân tích lại năng lực duyệt.
- **10 tổ dân phố** trong `NEIGHBORHOOD_HINTS` là đúng — danh bạ chỉ có 8 đầu mối vì một cán bộ phụ
  trách nhiều tổ. **Không rút xuống 8.**
- **[SUPERSEDED 2026-07-23]** Quyết định không dùng PostgreSQL đã bị chủ dự án thay thế bằng Supabase.
- **Danh mục trường 12 và 13** đã lấy từ dropdown PL3 — xem `03-decisions.md`.

---

## Chờ làm (backlog)

Theo thứ tự mốc trong `PLAN.md`:

### M0: Chuẩn hóa và khởi tạo (hoàn thành)

- **Mô tả:** Đã hoàn thành bốn task: đồng bộ tài liệu, scaffold Next.js/PWA/lint/test, khung module và `.env.example` cùng validation biến môi trường/định dạng lỗi API.
- **Liên quan:** toàn bộ repo.
- **Ưu tiên:** Hoàn thành.

### M1: Google Cloud, My Drive và Sheets

- **Mô tả:** Tạo Google Cloud Project, bật Drive/Sheets API, tạo OAuth client, viết bootstrap CLI (tạo cây thư mục Drive, spreadsheet, seed dữ liệu danh mục), thêm health check.
- **Liên quan:** module `drive`, `sheets`.
- **Ưu tiên:** Cao.

### M2: Đăng nhập và phân quyền

- **Mô tả:** Hoàn thành Google Sign-In qua Auth.js, session cookie an toàn, state/PKCE, CSRF HMAC,
  `USERS` allowlist/role ở Node, proxy Edge chặn session, profile và trang SYSTEM_ADMIN. `USERS`,
  `AUDIT_LOGS`, `REQUEST_LOG` được ghi cùng batch; từ chối đăng nhập được audit bằng email băm.
- **Liên quan:** module `auth`, `users`, `audit`.
- **Ưu tiên:** Cao.

### M3: Tiếp nhận hồ sơ, QR và upload

- **Mô tả:** Form mobile-first tạo hồ sơ, upload cặp CCCD cho từng cá nhân (tối đa 10 người) + 1–10 GCN, đọc QR client-side, resumable upload, lưu nháp, chuyển trạng thái DRAFT → UPLOADED.
- **Liên quan:** module `cases`, `files`, `qr`.
- **Ưu tiên:** Trung bình (phụ thuộc M0–M2).

### M4: Kiểm tra, tra cứu, dashboard và xuất

- **Mô tả:** Màn hình chi tiết hồ sơ, thao tác Lưu tạm/Yêu cầu bổ sung/Xác nhận, tìm kiếm, dashboard theo tổ dân phố, xuất CSV.
- **Liên quan:** module `cases`, `reports`.
- **Ưu tiên:** Trung bình.

### M5: Bảo mật, triển khai và thí điểm

- **Mô tả:** Rate limit, security headers, kiểm tra log không lộ dữ liệu nhạy cảm, backup Drive/Sheets tách khỏi Gmail gốc, deploy Preview → Production, thí điểm tuần tự 20 → 100 → 500 hồ sơ, viết runbook. CSRF/session an toàn phải hoàn thành từ M2.
- **Liên quan:** toàn hệ thống.
- **Ưu tiên:** Thấp cho đến khi M0–M4 ổn định.

---

## Không làm lúc này

- **OCR ảnh CCCD — vẫn cấm.** Ảnh CCCD không được gửi đi đâu; QR đã đọc chính xác tuyệt đối ngay
  trên máy người dân, gửi thêm sang bên thứ ba là tăng phơi nhiễm PII mà không được gì.
  _(Ngoại lệ đã chốt 2026-07-22: **ảnh GCN** được gửi Gemini để **đối chiếu** với bản người dân
  khai — xem `03-decisions.md`. Không sinh mã trường 12, không tự ghi vào hồ sơ chính thức.)_
- Google Cloud Vision — không dùng; đã chọn Gemini.
- Vercel Blob, Shared Drive, service account — ngoài kiến trúc Supabase PostgreSQL + My Drive + Vercel hiện tại.
- Đối soát dân cư tự động — cần thẩm quyền pháp lý riêng, chưa có kênh kỹ thuật chính thức.
- Cung cấp dữ liệu công khai hoặc link Drive công khai — vi phạm nguyên tắc bảo mật của dự án.

---

## Đã hoàn thành gần đây

- [2026-07-22] Phần code của lớp biên: chốt chặn `ORIGIN_SHARED_SECRET` chống gọi thẳng
  `*.vercel.app`, Turnstile fail-closed ở `create`/`submit`, token đã dùng chỉ mở đường replay
  idempotency. 82 test xanh. Phần cấu hình Cloudflare/Vercel còn chờ chủ dự án.
- [2026-07-21] Sửa lỗi tạo bản kê khai trên mạng yếu: request tạo nháp dùng idempotency key HMAC
  ổn định, `PUBLIC_SUBMISSIONS` + `REQUEST_LOG` ghi cùng batch, retry trả lại đúng mã/phiên, lỗi
  Google trả JSON an toàn và giao diện bắt lỗi mạng thay vì bị kẹt.
- [2026-07-21] Hoàn thành M1 Task 5: tạo Google Cloud Project dưới tài khoản `anmphongandn@gmail.com`; Project ID: `resolute-future-478306-e7`. Chưa bật API, chưa tạo OAuth client hoặc secret.
- [2026-07-21] Hoàn thành M1 Task 6: bật `drive.googleapis.com` và `sheets.googleapis.com` trong Project ID `resolute-future-478306-e7`. Chưa tạo OAuth client, API key hoặc secret.
- [2026-07-21] Hoàn thành M1 Task 7: cấu hình Google Auth Platform ở chế độ External/Testing và tạo OAuth client Web + Desktop bootstrap. Chỉ đăng ký URL local; URL Vercel và chuyển Production còn chờ deploy/rà soát trước pilot dữ liệu thật.
- [2026-07-21] Hoàn thành phần mã M1 Task 8: thêm Google API client phía server/CLI, bootstrap idempotent tạo cây My Drive + spreadsheet 14 tab + danh mục/`SYSTEM_ADMIN`, endpoint `GET /api/health/google` và test schema. Đã khai báo/lưu scope OAuth `drive.file`. Chưa chạy bootstrap trên My Drive thật vì không đưa OAuth client secret vào source hay terminal; cần cấu hình `.env.local` an toàn trước.
- [2026-07-21] Hoàn thành bootstrap thật bằng tài khoản `anmphongandn@gmail.com`: OAuth `drive.file` thành công, cây My Drive và spreadsheet 14 tab đã được tạo; ID và refresh token chỉ nằm trong các tệp cục bộ bị Git bỏ qua. Chưa đưa các giá trị này vào cấu hình Vercel.
- [2026-07-21] Hoàn thành M1: `GET /api/health/google` trả HTTP 200 với OAuth, Drive, Sheets và schema đều `ok` sau khi cấu hình ID/refresh token cục bộ. M2 là hạng mục tiếp theo.
- [2026-07-21] Hoàn thành M0 Task 2: tạo Next.js App Router + TypeScript strict, PWA online-only, Tailwind, ESLint/Prettier, Vitest và Playwright; build/typecheck/unit test đạt.
- [2026-07-21] Hoàn thành M0 Task 3: tạo khung module domain, repository và hợp đồng dữ liệu; `DataRepository`/`StorageRepository` tách khỏi service/frontend.
- [2026-07-21] Hoàn thành M0 Task 4: thêm `.env.example`, validation server không lộ secret và payload lỗi API thống nhất.
- [2026-07-21] Hoàn thành M0 Task 1: đồng bộ `AGENTS.md`, `README.md`, `docs/architecture.md` và tài liệu brain theo PLAN đã rà soát (online-only, HEIC/HEIF, `drive.file` bootstrap, idempotency, an toàn thay/xóa file, backup và PII).
- [2026-07-21] Hoàn tất tài liệu kiến trúc và kế hoạch: `README.md`, `AGENTS.md`, `PLAN.md`, `docs/architecture.md`.
- [2026-07-21] Khởi tạo bộ não dự án AI dùng chung: `CLAUDE.md`, `docs/brain/00-06` (merge với `AGENTS.md` hiện có, không ghi đè).

- [2026-07-23] PR #1: code sửa import ngày sinh, backfill append-only, staff action atomic và reset idempotent đã hoàn tất; còn dry-run/backup/apply Google Sheet và xác nhận Preview.

# 03 — Technical Decisions

> Ghi lại quyết định kỹ thuật quan trọng để agent sau không "phát minh lại" hoặc đảo ngược
> mà không biết lý do. Mỗi entry: quyết định gì, vì sao, đánh đổi gì.
> Các quyết định dưới đây được trích từ `AGENTS.md`, `PLAN.md`, `docs/architecture.md` (đã chốt trước khi bộ brain này được tạo).

---

## [2026-07-21] Google My Drive cá nhân thay vì Shared Drive tổ chức

- **Quyết định:** Lưu ảnh gốc/preview trong Google My Drive cá nhân của tài khoản `anmphongandn@gmail.com`, không dùng Google Workspace Shared Drive hay service account.
- **Lý do:** Triển khai nhanh cho bản thử nghiệm; service account không thể sở hữu file trong My Drive cá nhân nên bắt buộc dùng OAuth offline của một tài khoản người dùng thật.
- **Đánh đổi:** Đây là ngoại lệ có chủ đích, không phải kiến trúc vận hành lâu dài — phụ thuộc vào một tài khoản cá nhân, giới hạn quy mô ~500 hồ sơ, cần migration riêng khi mở rộng (xem mục "Nâng cấp" dưới).
- **Người quyết định:** Chủ dự án (ghi trong tài liệu gốc trước khi có AI brain).

## [2026-07-21] Google Sheets thay vì PostgreSQL

- **Quyết định:** Dùng Google Sheets làm kho dữ liệu có cấu trúc duy nhất (các tab `CASES`, `CERTIFICATES`, `OWNERS`, `FILES`, v.v.), không dùng PostgreSQL hay DB khác ở bản thử nghiệm.
- **Lý do:** Giảm hạ tầng cần vận hành, dễ audit thủ công, phù hợp quy mô ≤500 hồ sơ.
- **Đánh đổi:** Không có transaction thật — phải tự cài idempotency key, version field và optimistic concurrency (`409 VERSION_CONFLICT`) ở tầng ứng dụng; không cập nhật theo từng ô mà phải batch read/write.
- **Người quyết định:** Chủ dự án.

## [2026-07-21] Vercel (region `sin1`) thay vì backend đặt tại Việt Nam

- **Quyết định:** Frontend và API cùng chạy trên Vercel, ưu tiên region Singapore (`sin1`).
- **Lý do:** Triển khai nhanh cho bản thử nghiệm, không cần tự quản lý server.
- **Đánh đổi:** Ảnh gốc không được đi qua body của Vercel Function (giới hạn kích thước/thời gian) — phải dùng resumable upload trực tiếp browser → Drive.
- **Người quyết định:** Chủ dự án.

## [2026-07-21] Chưa triển khai OCR (CCCD/GCN)

- **Quyết định:** Chỉ đọc QR CCCD client-side bằng `@zxing/browser`; nhập tay thông tin GCN. Chưa dùng Google Cloud Vision hay bất kỳ OCR nào.
- **Lý do:** Giảm phạm vi và chi phí cho bản thử nghiệm; QR đã đủ gợi ý phần lớn dữ liệu CCCD.
- **Đánh đổi:** Thông tin GCN phải nhập tay hoàn toàn, tăng thời gian tác nghiệp của cán bộ.
- **Người quyết định:** Chủ dự án.

## [2026-07-21] Chỉ một ảnh CCCD mặt trước (không lưu mặt sau)

- **Quyết định:** Mỗi hồ sơ chỉ lưu đúng một ảnh CCCD mặt trước; không thu thập/lưu mặt sau.
- **Lý do:** Giảm thu thập dữ liệu cá nhân nhạy cảm không cần thiết cho mục tiêu thử nghiệm.
- **Đánh đổi:** Không có dữ liệu mặt sau CCCD nếu sau này cần đối chiếu thêm.
- **Người quyết định:** Chủ dự án.

---

## [2026-07-21] Sinh Case ID an toàn: lấy số thứ tự từ kết quả append, không đọc-rồi-cộng

- **Quyết định:** Số thứ tự trong Case ID (`PHONGCHAU-{YYYY}-{6 chữ số}`) phải lấy từ `updatedRange` do chính lệnh `values.append` vào `ID_RESERVATIONS` trả về, không được đọc "số dòng hiện có" bằng một lệnh riêng rồi cộng 1.
- **Lý do:** Google Sheets không có transaction; đọc-rồi-ghi tách rời có race condition khi hai cán bộ tạo hồ sơ cùng lúc → trùng Case ID.
- **Đánh đổi:** Không có, đây là cách làm đúng duy nhất với ràng buộc "không dùng DB thật" đã chốt trước đó.
- **Người quyết định:** Claude (rà soát kỹ thuật `PLAN.md`, 2026-07-21) — xem chi tiết trong `PLAN.md` §3.

## [2026-07-21] Idempotency key lưu riêng, version conflict chấp nhận race nhỏ

- **Quyết định:** `idempotency_key` lưu trong sheet riêng kèm kết quả đã cache (TTL ≥24h), không kiểm tra bằng cách đọc lại bản ghi nghiệp vụ. Cơ chế `version` + `409 VERSION_CONFLICT` chấp nhận có cửa sổ race nhỏ giữa đọc và ghi (không tự dựng lock) vì quy mô pilot ≤500 hồ sơ.
- **Lý do:** Google Sheets không có transaction thật; dựng lock riêng cho quy mô nhỏ là over-engineering.
- **Đánh đổi:** Có xác suất rất nhỏ hai request ghi đồng thời cùng vượt qua kiểm tra version — chấp nhận được ở quy mô hiện tại, phải xem lại nếu tăng quy mô/đồng thời.
- **Người quyết định:** Claude (rà soát kỹ thuật `PLAN.md`, 2026-07-21) — xem chi tiết trong `PLAN.md` §3.

## [2026-07-21] Bảo mật nền (CSRF/secure cookie/OAuth state) chuyển từ M5 lên M2

- **Quyết định:** Secure cookie, OAuth state/PKCE và CSRF token cho API write triển khai ngay ở M2 (đăng nhập/phân quyền), không dồn đến M5.
- **Lý do:** Auth thiếu CSRF là lỗ hổng ngay từ khi có đăng nhập thật, kể cả trên môi trường Preview với dữ liệu giả.
- **Đánh đổi:** M2 nặng hơn một chút; M5 chỉ còn rate limit, security headers và kiểm tra lại.
- **Người quyết định:** Claude (rà soát kỹ thuật `PLAN.md`, 2026-07-21).

## [2026-07-21] Thêm thư viện chuyển đổi HEIC/HEIF client-side vào stack

- **Quyết định:** Dùng `heic2any` hoặc `libheif-js` (WASM) để chuyển HEIC/HEIF sang JPEG trên thiết bị trước khi upload.
- **Lý do:** Trình duyệt (kể cả Safari) không tự giải mã HEIC trong canvas/`<img>` — đây là dependency thật bị thiếu trong danh sách stack ban đầu.
- **Đánh đổi:** Thêm một dependency client-side; cần đánh giá kích thước bundle khi chọn thư viện cụ thể ở M0/M3.
- **Người quyết định:** Claude (rà soát kỹ thuật `PLAN.md`, 2026-07-21).

## [2026-07-21] Bootstrap thư mục Drive phải dùng cùng OAuth client với production

- **Quyết định:** Cây thư mục gốc trên My Drive bắt buộc được tạo bởi bootstrap CLI chạy với cùng OAuth client dùng ở production, không tạo thủ công qua Drive UI.
- **Lý do:** Scope `drive.file` chỉ cho phép app thấy file/thư mục do chính OAuth client của nó tạo ra — tạo thủ công sẽ khiến app không có quyền ghi vào thư mục đó dù đã gán đúng `folder_id`.
- **Đánh đổi:** Không có — đây là ràng buộc bắt buộc của scope `drive.file`, không phải lựa chọn.
- **Người quyết định:** Claude (rà soát kỹ thuật `PLAN.md`, 2026-07-21).

## [2026-07-21] Khai báo `drive.file` trong OAuth consent screen và dùng nó cho bootstrap Sheets

- **Quyết định:** OAuth consent screen của Google Cloud khai báo scope `https://www.googleapis.com/auth/drive.file`; bootstrap CLI sử dụng cùng refresh token OAuth để tạo cả cây Drive lẫn Google Spreadsheet.
- **Lý do:** `drive.file` là scope hẹp phù hợp cho pilot: ứng dụng chỉ quản lý file mà chính OAuth client tạo hoặc được người dùng mở bằng app. Scope này cũng đủ cho thao tác Sheets đối với spreadsheet do app tạo, nên không cần xin thêm quyền Drive rộng hoặc service account.
- **Đánh đổi:** OAuth app hiện còn ở `External/Testing`; refresh token có thể hết hạn. Phải thêm URI Vercel đúng môi trường và chuyển `In production` trước khi nhập dữ liệu thật.
- **Người quyết định:** Chủ dự án cho phép tiếp tục cấu hình Google Cloud; Codex triển khai ngày 2026-07-21.

## [2026-07-21] Semantics xóa/thay file: soft-delete cho GCN, CCCD chỉ được thay không được xóa trắng

- **Quyết định:** `DELETE /api/cases/:caseId/files/:fileId` chỉ áp dụng cho ảnh GCN và là soft-delete (đổi trạng thái `FILES` sang `DELETED`, không hard-delete khỏi Drive). CCCD không có endpoint xóa — chỉ có luồng "thay": upload ảnh mới và xác minh thành công trước, rồi mới chuyển ảnh cũ sang `REPLACED`.
- **Lý do:** Nguyên tắc "không xóa dữ liệu" đã chốt trong `AGENTS.md`; và case không được phép rơi vào trạng thái "không có CCCD" giữa chừng thao tác thay ảnh.
- **Đánh đổi:** Không có.
- **Người quyết định:** Claude (rà soát kỹ thuật `PLAN.md`, 2026-07-21).

## [2026-07-21] Case ID dùng múi giờ Asia/Ho_Chi_Minh, PWA online-only

- **Quyết định:** Năm (`YYYY`) trong Case ID luôn tính theo `Asia/Ho_Chi_Minh` (UTC+7), không dùng giờ UTC mặc định của Vercel. PWA hoạt động online-only ở bản thử nghiệm — không cam kết soạn nháp/upload khi mất mạng, phải báo lỗi rõ ràng khi mất kết nối giữa chừng.
- **Lý do:** Tránh sai năm quanh thời điểm giao thừa; làm rõ kỳ vọng offline để không ai ngộ nhận PWA nghĩa là hoạt động offline đầy đủ.
- **Đánh đổi:** Không có.
- **Người quyết định:** Claude (rà soát kỹ thuật `PLAN.md`, 2026-07-21).

## [2026-07-21 — cần chủ dự án xác nhận] Tuân thủ dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP)

- **Quyết định:** Chưa chốt — cần làm rõ trước khi thí điểm dữ liệu thật (mốc 100 hồ sơ ở M5): cơ sở pháp lý thu thập CCCD, thời hạn lưu trữ, quy trình xử lý khi người dân yêu cầu xóa/sửa dữ liệu cá nhân.
- **Lý do:** Hệ thống thu thập PII (CCCD, họ tên, ngày sinh, địa chỉ) thuộc phạm vi Nghị định 13/2023/NĐ-CP; "không tạo giá trị pháp lý" không miễn trừ nghĩa vụ bảo vệ dữ liệu cá nhân.
- **Đánh đổi:** _(chưa xác định — phụ thuộc quyết định của chủ dự án/cơ quan)_
- **Người quyết định:** _(cần chủ dự án xác nhận — xem `PLAN.md` §7)_

---

## [2026-07-21] Kiểm tra allowlist/role ở Node, không tin role trong JWT

- **Quyết định:** Auth.js chặn session bằng cookie JWT ở Edge `proxy.ts`; tất cả page/API có dữ liệu
  gọi `requireActiveUser()` ở Node để đọc lại `USERS`, kiểm tra `active` và role.
- **Lý do:** Google Sheets client là Node-only; quan trọng hơn, role/active trong JWT có thể cũ sau khi
  SYSTEM_ADMIN vừa khóa tài khoản.
- **Đánh đổi:** Thêm một lượt đọc Sheets cho request bảo vệ. Pilot ≤500 hồ sơ chấp nhận chi phí này để
  đổi lấy hiệu lực thu hồi quyền ngay.
- **Người quyết định:** Codex, khi triển khai M2.

## [2026-07-21] Mở cổng kê khai công khai cho người dân (đảo phạm vi `AGENTS.md` §2)

- **Quyết định:** Thêm bề mặt công khai `/ke-khai` để người dân tự kê khai và nộp ảnh giấy tờ
  **không cần tài khoản**; cán bộ chỉ duyệt. Dữ liệu người dân nằm ở nhóm sheet `PUBLIC_*` tách
  khỏi hồ sơ chính thức; cán bộ chấp nhận mới sinh `CASE` ở trạng thái `UPLOADED`.
- **Lý do:** Chủ dự án yêu cầu; phù hợp nhiệm vụ 6, 8 và 16 trong Phụ lục 1 của Kế hoạch chiến
  dịch 180 ngày (tổ chức kê khai, hướng dẫn người dân kê khai, và người sử dụng đất phối hợp kê
  khai). Thẩm quyền thu thập đã được phê duyệt trong khuôn khổ chiến dịch.
- **Đánh đổi:** `AGENTS.md` §2 trước đây xếp "cung cấp dữ liệu cho người dân" ngoài phạm vi và
  toàn hệ thống giả định mọi truy cập đều đã đăng nhập. Mở bề mặt ẩn danh kéo theo cả một lớp bảo
  vệ mới (Turnstile, WAF, CSRF cho phiên không có email, mã bí mật HMAC) và làm quota ghi Google
  Sheets thành trần thật của hệ thống.
- **Người quyết định:** Chủ dự án (2026-07-21). Chi tiết kỹ thuật ở `PLAN_NL.md`.

## [2026-07-21] Cloudflare đứng trước Vercel cho lớp biên

- **Quyết định:** Domain đi qua Cloudflare ở chế độ proxy; Cloudflare lo WAF, rate limiting và
  Turnstile. Ứng dụng **không** tự đếm request theo IP và **không** thêm store (Redis/KV).
- **Lý do:** Rate limiting của Vercel WAF là tính năng gói trả phí; dùng Cloudflare gom cả ba lớp
  về một nơi và giữ nguyên quy tắc không đổi stack. Các bộ đếm còn lại (số lần nhập sai mã, số
  session upload) là theo submission, tần suất thấp, nằm ngay trên dòng `PUBLIC_SUBMISSIONS`.
- **Đánh đổi:** Sinh ra một yêu cầu bắt buộc mới — URL `*.vercel.app` luôn truy cập trực tiếp
  được, nên origin phải từ chối mọi request tới `/api/public/*` và `/ke-khai` thiếu header bí mật
  `ORIGIN_SHARED_SECRET`. Bỏ qua bước này thì cả lớp biên vô nghĩa. Kèm theo: đọc IP thật ở
  `CF-Connecting-IP` (chỉ tin sau khi kiểm tra secret), và cache rule bypass cho `/api/*` +
  `/ke-khai*` để không cache nhầm trang chứa PII.
- **Người quyết định:** Chủ dự án (2026-07-21).

## [2026-07-21] Mục tiêu dữ liệu là 15 trường Phụ lục 8, không phải 50

- **Quyết định:** Hệ thống thu đủ **15 trường** của `Tai lieu/Phụ lục 8.docx` và dừng ở đó. Kích
  hoạt `PARCELS`, `ASSETS` và thêm `LAND_USES` ngay ở v1.
- **Lý do:** Ghi chú cuối Phụ lục 8 nói rõ bộ đầy đủ 50 trường (Phụ lục 02 Hướng dẫn kỹ thuật của
  Cục Quản lý đất đai) do **Chi nhánh VPĐK/đơn vị thi công** lưu giữ và nhập liệu chính thức —
  không phải việc của cấp xã. `AGENTS.md` §8 ghi "bộ 15 rồi 50 nhóm trường" dễ gây hiểu nhầm là
  xã phải tiến tới 50.
- **Đánh đổi:** `AGENTS.md` §4.1/§8 trước đây xếp `PARCELS`/`ASSETS` là tab tạo sẵn chưa dùng. Đưa
  vào v1 làm biểu mẫu dài hơn đáng kể; bù lại nếu chỉ thu ảnh + vài trường định danh thì dữ liệu
  cấu trúc gần như bằng không và phải xin dân khai lại lần hai.
- **Người quyết định:** Chủ dự án (2026-07-21), sau rà soát của Claude đối chiếu Phụ lục 8 gốc.

## [2026-07-21 — CHƯA CHỐT] Bảng mã cho trường 12 Phụ lục 8

- **Quyết định:** Chưa có. Danh mục loại đất / nguồn gốc / hình thức / thời hạn **không tồn tại
  trong bất kỳ tài liệu nào của dự án** — Phụ lục 8 chỉ nêu tên trường, Kế hoạch chiến dịch không
  có bảng mã. Phải xin bản chính thức từ Chi nhánh VPĐKĐĐ Phú Thọ hoặc đơn vị thi công.
- **Lý do quan trọng:** Đây là rủi ro dữ liệu lớn nhất của dự án. Sai mã thì toàn bộ hồ sơ đã thu
  phải nhập lại, và lỗi **không lộ ra khi chạy thử** — code chạy đúng, form hiển thị đẹp, dữ liệu
  sai. **Tuyệt đối không để AI tự sinh danh sách mã.**
- **Hiện trạng:** `src/modules/public-intake/reference.ts` chứa giá trị **tạm** cho bản demo, đánh
  dấu bằng cờ `REFERENCE_IS_PLACEHOLDER` và cảnh báo ở đầu file.
- **Người quyết định:** _(cần chủ dự án lấy tài liệu — xem `PLAN_NL.md` §5.3 mục V1)_

## [2026-07-21 — CHƯA CHỐT] Phân nhóm hồ sơ A/B/C/E của chiến dịch

- **Quyết định:** Chưa có. Phụ lục 1 của Kế hoạch chiến dịch tổ chức nhiệm vụ 3–7 theo "các nhóm
  A, B, C, E", nhưng định nghĩa nằm ở `Kế hoạch số 247/KH-UBND ngày 30/6/2026 của UBND tỉnh` —
  không có trong repo. Hệ thống hiện chỉ biết Loại 4/Loại 5 của Phụ lục 8, là **hệ phân loại
  khác**.
- **Cần trả lời:** hồ sơ người dân kê khai qua cổng thuộc nhóm nào (nhiều khả năng Nhóm C), và
  báo cáo tiến độ có tính theo A/B/C/E không. Nếu có thì phải thêm cột phân nhóm **ngay từ
  migration đầu**, vì thêm cột sau khi đã có dữ liệu thật đắt hơn nhiều.
- **Người quyết định:** _(cần chủ dự án — xem `PLAN_NL.md` §5.3 mục V2)_

## Hướng nâng cấp đã lường trước (không phải quyết định "làm ngay")

Ghi lại để agent không tự ý triển khai sớm, nhưng biết kiến trúc đã chừa chỗ:

- Migration sang Google Workspace Shared Drive: sao chép file, cập nhật `drive_file_id`, giữ nguyên `file_id`/`case_id`, đối chiếu checksum/audit theo lô.
- OCR Google Vision: lưu raw OCR JSON, parser versioning, queue, retry — sheet `OCR_FIELDS` đã tạo sẵn nhưng chưa dùng.
- Dữ liệu thửa đất/tài sản: sheet `PARCELS`, `ASSETS` đã tạo sẵn nhưng chưa dùng.
- Chuyển Google Sheets → PostgreSQL khi quy mô/đồng thời vượt khả năng vận hành an toàn.
- Đối soát dân cư hoặc kết nối CSDL đất đai quốc gia — chỉ khi có thẩm quyền pháp lý và kênh kỹ thuật chính thức (role `POPULATION_MATCH_OFFICER` đã giữ chỗ).

---

## Template cho entry mới

```
## [YYYY-MM-DD] Tiêu đề quyết định

- **Quyết định:** <mô tả>
- **Lý do:** <vì sao chọn hướng này>
- **Đánh đổi:** <cái gì bị đánh đổi>
- **Người quyết định:** <user / Claude / Codex>
```

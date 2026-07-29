# 03 — Technical Decisions

> Ghi lại quyết định kỹ thuật quan trọng để agent sau không "phát minh lại" hoặc đảo ngược
> mà không biết lý do. Mỗi entry: quyết định gì, vì sao, đánh đổi gì.
> Các quyết định dưới đây được trích từ `AGENTS.md`, `PLAN.md`, `docs/architecture.md` (đã chốt trước khi bộ brain này được tạo).
>
> Trạng thái hiện hành: Supabase PostgreSQL đã là kho runtime sau cutover 2026-07-24; các entry
> cũ mô tả Google Sheets runtime/cửa sổ chờ cutover là lịch sử, không phải hướng dẫn triển khai mới.

## [2026-07-29] Hiển thị điều kiện chặn tiếp nhận cho cán bộ

- **Quyết định:** Giữ nguyên toàn bộ `completionChecks` ở server; khi còn lỗi `BLOCKING`, route
  `POST /api/submissions/:submissionId/accept` trả thêm `error.details.issues[]` gồm `code`,
  `label`, `message`. Màn hình chi tiết hồ sơ hiển thị danh sách này ngay dưới thông báo lỗi.
- **Lý do:** Thông báo chung “Hồ sơ chưa đủ điều kiện tiếp nhận chính thức” làm cán bộ không biết
  trường nào cần hoàn thiện, dù kiểm tra server đã có nhãn và hướng dẫn cụ thể.
- **Bảo mật:** Chỉ route nội bộ sau `requireActiveUser`/CSRF nhận chi tiết; payload chỉ có mã và câu
  hướng dẫn cố định, không có CCCD, họ tên, Drive ID/link, token hoặc dữ liệu tệp.
- **Đánh đổi:** Không tự sửa hoặc nới validation; cán bộ vẫn phải hoàn thiện dữ liệu rồi bấm lại với
  cùng khóa idempotency trong phiên nếu cần tiếp tục saga.

## [2026-07-29] Tra cứu bằng số phát hành Giấy chứng nhận, không lộ dữ liệu hồ sơ

- **Quyết định:** Màn hình tra cứu công khai cho chọn QR CCCD hoặc `Số phát hành GCN` + `Ngày cấp
  GCN`. Khi tra số, chuẩn hóa bỏ mọi khoảng trắng/dấu gạch và viết hoa trước so sánh; repository
  tìm `public_certificates` của hồ sơ active, `certificates` chính thức và bản cuối `VERIFIED` của
  `existing_certificates`. Kết quả chỉ có `found`, `IN_PROCESSING`/`OFFICIALLY_RECEIVED` và hướng
  dẫn cố định — không trả số GCN, ID, họ tên, CCCD, điện thoại, địa chỉ hoặc ảnh. QR CCCD vẫn decode
  trên thiết bị, nhưng response cũng chuyển về DTO tối thiểu này.
- **Chống dò:** Turnstile vẫn bắt buộc cho route không phiên. Repository lấy advisory lock theo HMAC
  nguồn gọi, đếm tối đa 8 audit thành công trong 10 phút và ghi audit cùng transaction. Audit chỉ
  giữ HMAC nguồn/fingerprint của cặp số-ngày; không giữ số GCN thô. Wizard dùng route session+CSRF
  riêng để kiểm trùng nền khi nhập đủ hai trường; nó loại trừ bản nháp hiện tại và chỉ cảnh báo, không
  chặn. `REJECTED`/`EXPIRED` không được coi là active.
- **Không migration:** `public_certificates.issue_number/issue_date`, `certificates.issue_number/
  issue_date` và `existing_certificates.issue_number/issue_date` đã đáp ứng; không thêm bảng/cột.
- **Đánh đổi:** Rate-limit bền vững cần một aggregate query vào `audit_logs` thay vì cache tiến trình;
  lưu lượng pilot nhỏ nên chấp nhận, không tạo thêm nơi lưu dữ liệu.

## [2026-07-29] Review PR #6 vòng hai — ba quyết định về an toàn dữ liệu

**1. Câu hỏi trước khi xóa tệp Drive là "có AI đang trỏ vào nó không", không phải "hồ sơ đang gọi
có trỏ vào nó không".**
`isDriveFileAdopted` trước đây lọc `submission_id = <hồ sơ đang gọi>`. Phần lớn nhánh gọi
`discardIfOrphan` truyền thẳng `body.driveFileId` — dữ liệu client chưa qua `verifyUploadedFile`.
Một ID trỏ sang hồ sơ khác khi đó thỏa "chưa ai nhận" và bị xóa: mất bằng chứng của một hộ dân
không liên quan. Nay truy vấn hỏi toàn bảng, **và** `discardIfOrphan` chỉ xóa khi Drive xác nhận
tệp nằm trong `record.driveFolderId`. Hai điều kiện thu phạm vi xóa về đúng những gì hộ dân đang
gọi tự tải lên. Đánh đổi: thêm một lần gọi Drive trên đường lỗi (hiếm) — chấp nhận được, vì hướng
sai còn lại là mất dữ liệu vĩnh viễn. Khai thác thực tế trước đây khó vì Drive ID không bao giờ
được trả ra cổng công khai và không đoán được; sửa vì hàng rào không nên chỉ dựa vào điều đó.

**2. Không dùng `force row level security` cho bảng số đo.**
`force` áp RLS lên cả chủ sở hữu bảng; bảng không có policy nào nên với role không mang BYPASSRLS
thì mọi insert trả 0 dòng. Cả hai chỗ gọi `appendUploadAttempt` đều nuốt lỗi có chủ đích (số đo
không được làm hỏng một lượt tải đã thành công), nên hỏng kiểu đó **không phát ra tín hiệu nào** —
đúng cái bảng dùng để nghiệm thu ngưỡng hiệu năng và để mở cờ chuẩn hóa ảnh. Dùng `enable` +
`revoke` như 8 bảng còn lại: đúng mô hình đe dọa (chặn anon/authenticated) và không lệch mẫu. Kèm
theo, nuốt lỗi giờ đi qua `reportUploadMetricFailure` — ghi log **một lần** mỗi tiến trình và chỉ
ghi mã lỗi Postgres, không ghi `error.message` (thông báo Postgres có thể nhắc lại giá trị dòng
vừa insert).

**3. PATCH nháp: giữ kiểm version tuyệt đối ở máy chủ, thêm tự phục hồi ở client.**
Kiểm khớp tuyệt đối là đúng và được giữ nguyên. Nhưng nguyên nhân 409 thường gặp nhất không phải
hai thiết bị cùng sửa mà là một PATCH đã ghi xong rồi response rơi mất trên mạng yếu — lần thử lại
gửi version cũ và bị từ chối, người dân kẹt kèm thông báo sai sự thật ("đang mở ở thiết bị khác").
Client lấy lại snapshot rồi thử lại — nhưng **chỉ khi phân biệt được** đó là lần ghi của chính
mình bị mất response, chứ không phải thiết bị khác đã sửa. Căn cứ là `hasLocalChanges` của snapshot
vừa lấy về (so sánh sâu bản gộp local-đè-server với chính bản server):

- `false` → gộp xong không khác gì server → server **đã có** đúng thứ ta định ghi → chỉ mất
  response → thử lại vô hại;
- `true` → server đang giữ nội dung ta chưa từng thấy → không phân biệt được → coi như xung đột
  thật, **không** thử lại, để 409 nổi lên và người dân đọc đúng thông báo.

Bản sửa đầu tiên của vòng này **thiếu điều kiện đó** và luôn thử lại: vì lần thử lại dùng version
vừa fetch nên nó LUÔN thành công, kể cả khi 409 đến từ một thiết bị khác — tức là ghi đè mất dữ
liệu của thiết bị kia trong im lặng. Ghi lại đây vì đó đúng là loại lỗi mà "tự phục hồi cho tiện"
hay tạo ra.

Điều kiện bắt buộc đi kèm: payload gửi đi và payload đem so sánh phải là **cùng một object** (đã
qua `withCertificateMetadata`). So bản chưa gắn metadata với snapshot đã có sẽ luôn ra "khác nhau"
và nhánh tự phục hồi không bao giờ chạy.

Hạn chế còn lại, chấp nhận có ý thức: sau khi báo xung đột, `adoptServerDraft` đã cập nhật
`serverVersion`, nên nếu người dân bấm lưu lần nữa thì lần đó **sẽ** ghi đè. Đây là hành động có ý
thức sau khi đã được cảnh báo, khác hẳn với ghi đè tự động. Muốn chặn hẳn thì phải có giao diện
hợp nhất thay đổi — ngoài phạm vi vòng này.

Không chọn phương án idempotency key cho PATCH vì `request_log.kind` có CHECK constraint, thêm kind
mới là phải thêm migration — chi phí lớn hơn giá trị ở bước này.

**4. CCCD vào chỉ mục tra cứu với `kind = 'PENDING'`, bất kể ai gõ vào ô đó và ở lần gửi nào.**
Từ V2, CCCD là **tùy chọn** với người dân. Trước quyết định này, `pendingIdentityHmacs` chỉ được
ghi ở `submit` khi `status === "SUBMITTED"`, nên hai nhóm nằm ngoài chỉ mục vĩnh viễn: người dân
điền CCCD ở lần **gửi bổ sung**, và cán bộ điền hộ lúc hoàn thiện/tiếp nhận. Đó đúng là hai nhóm
mà V2 sinh ra nhiều nhất, nên phát hiện trùng hồ sơ gần như không còn tác dụng với luồng mới.

Chốt: ghi ở cả `SUBMITTED` lẫn `RESUBMITTED`, và ghi ở cả ba đường của cán bộ
(`commitStaffDraftEdit`, `commitWorkingPayload`, `commitOfficialAmendment`). Dùng `kind = 'PENDING'`
y như người dân tự khai — chỉ mục trả lời "có hồ sơ nào đang gắn với CCCD này", không phải "ai đã
gõ số đó vào". Không thêm `kind` mới vì sẽ phải đổi CHECK constraint trên `public_lookup_index` và
rà lại mọi chỗ đọc, đổi lấy một thông tin chưa ai cần. Insert đã có `on conflict do nothing` nên
ghi lặp là vô hại.

Phân lớp giữ nguyên: **repository không bao giờ đọc biến môi trường**. Route tính HMAC từ
`DATA_HASH_PEPPER` rồi truyền xuống, đúng như `submit` đã làm từ trước. Có test khẳng định
`repository.ts` không chứa `DATA_HASH_PEPPER` lẫn `identityHmac(`.

## [2026-07-29] Đóng 2 BLOCKER và 5 HIGH của review PR #6

- Upload complete tra `REQUEST_LOG` trước validation lượt mới; replay trả summary cũ và cleanup
  luôn xác minh `isDriveFileAdopted` trước khi xóa.
- Assisted submit có endpoint staff riêng: allowlist vai trò + staff auth + CSRF, không Turnstile;
  self-service giữ public session + public CSRF + Turnstile.
- PATCH dùng exact version ở route và SQL CAS. Official acceptance chặn consent thiếu, identity
  chưa xác nhận và `QR_OVERRIDE_PENDING_REVIEW`; không backfill consent.
- Consent audit create cùng transaction với submission/request log. Timeline public sanitize lúc
  ghi và qua serializer allowlist lúc đọc.
- Migration `202607290001` force RLS, revoke `anon`/`authenticated` cho telemetry, không policy.

## [2026-07-28] Consent create phải được khai báo trong request và xác minh phía server

- **Quyết định:** Cả `POST /api/public/submissions` và
  `POST /api/staff/assisted-submissions` bắt buộc body có `consent.accepted === true`. Server kiểm
  tra trước khi tạo submission, tự gán `CONSENT_NOTICE_VERSION`, rồi truyền literal
  `consentAccepted: true` vào service dùng chung. Assisted flow còn lưu danh tính/thời điểm cán bộ
  và audit metadata consent. Quyết định này **thay thế riêng phần chấp nhận rủi ro consent** ngày
  2026-07-24; hai rủi ro edge guard và tra cứu tổ chức trong entry cũ vẫn giữ nguyên.
- **Lý do:** Trạng thái checkbox UI không phải hàng rào server. Việc service tự đặt consent true
  cho request chỉ có phone vừa tạo bằng chứng sai, vừa khiến `adoptServerDraft()` có thể ghi đè
  state local. Contract rõ ràng cho phép route từ chối request thiếu consent trước Drive/database.
- **Đồng bộ draft:** Sau CREATE, client hợp nhất snapshot server theo vị trí để nhận owner/parcel/
  land-use ID do server sinh, nhưng giữ phone, consent và dữ liệu vừa nhập. Server version từ GET
  trở thành version cho PATCH kế tiếp; recovery không trộn draft local rỗng.
- **Kiểm tra bắt buộc:** Request public/assisted thiếu consent bị 400 và không tạo/audit; helper
  adoption phải khóa ID, dữ liệu local và version; rehearsal tối thiểu phải gửi thành công.

## [2026-07-28] Public Intake V2 — tách điều kiện gửi của người dân khỏi điều kiện tiếp nhận chính thức

- **Quyết định:** Cổng công khai chỉ còn bắt buộc **số điện thoại + đồng ý + tên chủ sử dụng + ảnh
  CCCD hai mặt + ít nhất một ảnh GCN**. Toàn bộ dữ liệu PL3 còn lại thành **tùy chọn**: trống thì
  qua, đã nhập thì phải đúng định dạng. Ba tầng kiểm tra có tên rõ ràng:
  - `validateDraftStructure` — chỉ hình dạng, dùng ở PATCH lưu nháp;
  - `validateCitizenSubmitDraft` — MỨC A, điều kiện để **người dân bấm gửi**;
  - `completionChecks` — MỨC C, điều kiện để **cán bộ tiếp nhận chính thức**.
- **Lý do:** Cán bộ trực tiếp đi thu hồ sơ báo lại rằng bảy bước với hàng chục ô bắt buộc theo PL3
  khiến hộ dân bỏ dở giữa chừng. Mục tiêu thật của cổng công khai là **thu được CCCD + ảnh GCN +
  tên chủ đang sử dụng**; phần còn lại cán bộ đọc trên chính ảnh đó và hoàn thiện ở
  `working_payload`.
- **Đánh đổi và rủi ro đã xử lý:** Nới MỨC A mà giữ nguyên MỨC C sẽ để hồ sơ chỉ có tên + ảnh đi
  thẳng vào hồ sơ chính thức. Trước V2 `completionChecks` **yếu hơn hẳn** cổng công khai — không
  chặn `oldWard` trống, thiếu vai trò trên GCN, thiếu ngày sinh/giới tính/địa chỉ, thiếu địa chỉ
  trên GCN, thiếu nguồn gốc/hình thức/thời hạn, và thiếu toàn bộ ảnh chỉ là WARNING. Hiện trạng đó
  được khóa lại bằng test trước khi sửa (`tests/public-intake-v2-characterization.test.ts`, commit
  `1cc7d93`) rồi đảo ngược **trong cùng release**. Ai định nới `completionChecks` về sau phải đọc
  lại đoạn này trước.
- **Hai lỗi phát hiện khi tách, đã sửa cùng lúc:**
  - Route submit tạo HMAC tra cứu cho **mọi** owner cá nhân, kể cả khi CCCD rỗng. Vô hại khi CCCD
    còn bắt buộc, nhưng khi cho phép để trống thì mọi hồ sơ không nhập CCCD dùng chung một khóa
    tra cứu. `citizenIdsForLookup` chỉ băm chuỗi khớp 12 số.
  - Diện tích kiểu Việt (`29,16`) bị `Number()` trả `NaN` ở máy chủ trong khi client dùng
    `parseVietnameseDecimal` và chấp nhận — hồ sơ hợp lệ bị từ chối với thông báo khó hiểu. Cả hai
    tầng nay dùng chung `parseVietnameseDecimal`.
- **Người quyết định:** Chủ dự án (đầu bài `CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md` §2.1),
  thi công bởi Claude Opus 5.

## [2026-07-28] Ký hiệu loại đất: một ô chữ tự do thay cho danh mục 45 mục đích

- **Quyết định:** Bước thửa đất của cổng công khai chỉ còn **một ô** "Ký hiệu loại đất ghi trên
  GCN". Chuỗi người dân gõ lưu nguyên vào `purposeFreeText` kèm `purposeCode = GHI_THEO_BIA`. Bỏ
  khỏi cổng công khai: ô chọn 45 mục đích, nguồn gốc, hình thức, thời hạn.
- **Lý do:** GCN đất nông nghiệp chỉ in **ký hiệu** (`LUC`, `LUK`, `BHK`) hoặc chữ dân dã ("màu",
  "vườn"), không in tên pháp lý. Bắt hộ dân tự tra ra "đất chuyên trồng lúa" là bắt họ làm việc của
  cán bộ, và kết quả hay gặp là chọn bừa một mã sai — dữ liệu sai im lặng còn tệ hơn ô trống.
- **Đánh đổi:** Mô hình dữ liệu **không đổi** — `landUses` vẫn là mảng, PL3 export vẫn chạy như cũ,
  cán bộ vẫn tách được nhiều mục đích ở `working_payload`. Chuẩn hóa chỉ trim + viết hoa **mã ngắn
  thuần chữ cái ≤ 5 ký tự**; chuỗi tiếng Việt giữ nguyên vì viết hoa cả câu là bóp méo thứ người
  dân ghi trên bìa. Xóa hết chữ thì `purposeCode` về rỗng — giữ mã "ghi theo bìa" mà không có nội
  dung là tạo dữ liệu giả. `completionChecks` chặn `CAN_DOI_CHIEU` và chặn `GHI_THEO_BIA` không có
  chữ, nên cán bộ vẫn buộc phải chốt loại đất trước khi tiếp nhận chính thức.

## [2026-07-28] Bỏ bước tài sản và bước loại đất khỏi cổng công khai, GIỮ NGUYÊN schema

- **Quyết định:** `STEPS` từ 7 xuống 4. Bước "Tài sản" và bước "Loại đất" biến mất khỏi giao diện
  công khai. **Không** xóa `Asset`, không đổi bảng, không migration phá dữ liệu. `draft.assets`
  round-trip nguyên vẹn; nháp cũ có tài sản không bị mất khi lưu lại.
- **Lý do:** Tài sản gắn liền với đất không phải mục tiêu của đợt cao điểm 180 ngày; các tổ chức
  tín dụng sẽ cần nhưng bổ sung sau. Ẩn khỏi giao diện là thay đổi một chiều, rẻ và đảo ngược được;
  xóa schema thì không.
- **Đánh đổi:** Không dùng feature flag giữ hai luồng UI song song như kế hoạch gợi ý — hai luồng
  là hai thứ phải bảo trì và test. Cần khôi phục thì thêm lại khối JSX, dữ liệu vẫn còn nguyên.

## [2026-07-28] Bỏ cổng nhập lại mã bí mật trước khi tải ảnh GCN

- **Quyết định:** Không còn bắt người dân gõ lại 4 ký tự cuối của mã bí mật trước khi tải ảnh Giấy
  chứng nhận.
- **Lý do:** Ảnh GCN chuyển lên **bước 2**, nên cổng đó rơi vào ngay đầu luồng và chặn đúng công
  đoạn quan trọng nhất. Phiên công khai đang hợp lệ đã là bằng chứng truy cập; bắt xác nhận lại chỉ
  để tải ảnh là rào cản không đổi lấy được gì về bảo mật.
- **Đánh đổi:** Mất một nhắc nhở "hãy lưu mã bí mật". Bù lại: thẻ mã bí mật vẫn hiển thị nổi bật
  suốt luồng, và màn hình thành công mới hiển thị mã tiếp nhận cỡ lớn kèm nút sao chép. Bản thân mã
  bí mật vẫn giữ nguyên vai trò khôi phục/tra cứu, không nới lỏng chỗ nào khác.

## [2026-07-28] Chuẩn hóa ảnh trên thiết bị — mặc định TẮT cho tới khi có số đo thật

- **Quyết định:** Thêm `image-normalization.client.ts` (CCCD 2400px, GCN 3000px, JPEG q0.88) sau cờ
  `NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED`, **mặc định `false`**.
- **Lý do bật:** Góp ý số một của cán bộ là "up ảnh lâu quá". Điện thoại chụp 12–50MP, ba ảnh GCN
  là 30–60 MiB qua 4G; cùng tờ giấy ở cạnh dài 3000px chỉ còn vài MiB mà chữ vẫn đọc được.
- **Lý do mặc định tắt:** Phiên thi công không có Google Drive thật, Supabase thật và thiết bị 4G
  nên **không đo được** thời gian truyền, và unit test **không chứng minh được** chữ trên GCN còn
  đọc được. Theo §0.2 mục 12 của đầu bài, không tuyên bố tăng tốc khi chưa có số đo trước/sau. Bộ
  kiểm chất lượng bắt buộc trước khi bật nằm ở `evidence/PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md`.
- **Hai điểm dễ hỏng đã xử lý:** `imageOrientation: "from-image"` khi giải mã — thiếu nó thì ảnh
  chụp dọc mang cờ EXIF xoay sẽ ra ảnh nằm ngang sau khi vẽ lại canvas, cán bộ phải tự xoay từng
  tờ. Và tên tệp tải lên đặt lại thành `cccd.jpg`/`gcn.jpg` — máy chủ ghép tên client gửi lên vào
  tên tệp trong Drive, mà tên do máy ảnh hoặc người dân đặt hay mang số CCCD và tên người.
- **Đánh đổi thuật ngữ:** Thư mục Drive vẫn tên `01_INBOX/{id}/originals`. Sau khi bật cờ, tệp
  trong đó là **bản tiếp nhận vận hành**, không còn chắc chắn là byte gốc từ máy ảnh. Không đổi tên
  thư mục vì sẽ phá đường dẫn hiện hữu và các bước FILES_MOVED của saga.

## [2026-07-28] Tiến độ tải lên đi qua XMLHttpRequest, và chỉ được tăng

- **Quyết định:** Tách `ResumablePutTransport`. PUT dữ liệu đi qua XHR để có `upload.onprogress`;
  initiate, hỏi tiến độ và complete vẫn dùng `fetch`. Tiến độ báo ra ngoài **đơn điệu tăng**.
- **Lý do:** `fetch` không có sự kiện tiến độ tải lên — với ảnh 12 MiB trên 4G, người dân nhìn "0%"
  suốt nửa phút rồi thẳng lên 100%, không phân biệt được "đang chạy chậm" với "đã treo".
- **Vì sao phải đơn điệu tăng:** Sau một lần đứt mạng, Google có thể báo đã nhận **ít hơn** số byte
  XHR vừa đếm — byte rời thiết bị không có nghĩa là đã tới nơi. Thanh phần trăm tụt lại bị người
  dân đọc là "hỏng, phải làm lại" rồi bấm hủy. Cùng lý do, transport `fetch` **không** báo 100% khi
  request kết thúc: một phản hồi 308 "mới nhận 400/1000" sẽ hiện 100% rồi tụt về 40%.
- **Đánh đổi:** Thêm một lớp trừu tượng. Bù lại test dùng transport giả, không cần mạng, và hợp
  đồng resumable (Content-Range, 308, resume từ offset) được khóa lại bằng test.

## [2026-07-28] Hàng đợi tải ảnh: hai luồng, và một ảnh hỏng không kéo theo ảnh nào

- **Quyết định:** Ảnh GCN tải tối đa **2 luồng** song song, hạ về 1 khi `saveData` hoặc mạng 2g.
  Mỗi ảnh là một việc độc lập có phần trăm, nút hủy và thông báo lỗi riêng.
- **Lý do:** Trước V2 vòng lặp tuần tự và `break` ngay khi một ảnh hỏng — chọn 3 ảnh mà ảnh thứ 2
  lỗi là mất luôn ảnh thứ 3 dù nó chưa hề được thử. Nhưng bắn cả 3 cùng lúc cũng sai: các luồng
  giành băng thông của nhau nên không ảnh nào xong sớm, và ba bitmap lớn cùng lúc đủ để trình duyệt
  kill tab trên máy yếu.
- **Đánh đổi:** `navigator.connection` không có trên Safari nên **không** được phụ thuộc vào nó —
  thiếu thông tin thì dùng mặc định 2. Chuẩn hóa ảnh chạy trong từng việc chứ không dựng sẵn cả
  loạt, đúng vì lý do bộ nhớ ở trên.
- **Hệ quả:** `busy` thôi làm cờ "đóng băng cả màn hình" cho luồng tải ảnh. Người dân điền được các
  ô khác và chọn thêm ảnh trong lúc ảnh đang lên. `busy` chỉ còn cho thao tác ngắn thật sự khóa màn
  hình: tạo bản kê khai, lưu nháp, xóa ảnh.

## [2026-07-28] Lưu TÊN cán bộ tại thời điểm nhận, không join sang `public.users`

- **Quyết định:** Thêm cột `public_submissions.claimed_by_display_name`, ghi lúc
  CLAIM/FORCE_CLAIM/TRANSFER, xóa lúc RELEASE và lúc người dân gửi lại hồ sơ.
- **Lý do không join:** Tên hiển thị đổi được (đổi họ tên, sửa chính tả) — dòng thời gian phải ghi
  tên **lúc đó**, giống mọi bản ghi hành chính khác. Và cán bộ nghỉ việc thì bản ghi `users` có thể
  bị vô hiệu hóa, join sẽ trả rỗng và lịch sử hồ sơ mất dấu người từng xử lý.
- **TRANSFER tra tên người nhận từ danh bạ máy chủ**, không nhận tên từ client — nhận từ client là
  để bất kỳ ai cũng gán được một cái tên tùy ý vào dòng thời gian hồ sơ.
- **Cổng công khai CHỈ trả `displayName`, không bao giờ trả email.** Email công vụ đưa ra ngoài là
  địa chỉ thật có thể bị thu thập để gửi thư rác hoặc lừa đảo nhân danh phường. Hồ sơ cũ chưa có
  tên trả `null` kèm cờ `hasAssignedOfficer` để giao diện hiển thị "Đã phân công cán bộ".
- **Đánh đổi:** Một cột trùng lặp dữ liệu với `users.display_name`. Chấp nhận, vì đây là bản ghi
  lịch sử chứ không phải tham chiếu.

## [2026-07-28] Chế độ cán bộ hỗ trợ kê khai dùng lại NGUYÊN wizard công khai

- **Quyết định:** `/ke-khai-ho` render chính `IntakeWizard` với prop `assisted`. Không app native,
  không bản wizard song song. Máy chủ gắn `intake_channel = OFFICER_ASSISTED` cùng email/tên/thời
  điểm lấy từ phiên đăng nhập.
- **Lý do:** Góp ý "Làm phần mềm được ko để anh em đi làm cho dân". Hai bản mã cho cùng một biểu
  mẫu là hai bản sẽ lệch nhau ngay ở lần sửa đầu tiên — và bản cán bộ ít người dùng hơn nên sẽ là
  bản mục ruỗng trước.
- **Bất biến bảo mật:** Client **không** gửi được `channel` hay `assistedBy`. Cổng công khai gán
  cứng `SELF_SERVICE` và không đọc hai trường đó từ body. Ràng buộc CHECK ở tầng cơ sở dữ liệu bắt
  buộc `OFFICER_ASSISTED` phải có đủ email, tên và thời điểm — thiếu nó thì một lỗi lập trình có
  thể ghi nhãn mà bỏ trống người thực hiện, và hồ sơ đó vĩnh viễn không truy được về ai.
- **Vì sao không Turnstile ở route cán bộ:** đã có phiên đăng nhập và CSRF, hai thứ đó mạnh hơn hẳn
  một bài kiểm tra bot. Bắt cán bộ giải captcha ở mỗi hộ dân là phí thời gian tại cơ sở.
- **Ba lớp chặn, không lớp nào đủ một mình:** proxy Edge (`/ke-khai-ho/:path*`,
  `/api/staff/:path*`) → `requireActiveUser` tại trang → `requireActiveUser` + CSRF tại route. JWT
  cũ còn hạn sau khi quản trị viên khóa tài khoản, nên Edge thấy "có session" là chưa đủ.
- **Đánh đổi:** `/ke-khai-ho` chỉ khác `/ke-khai` một gạch nối; đặt sai matcher là mở toang đường
  tạo hồ sơ mang nhãn cán bộ. `tests/public-surface-guard.test.ts` khóa cả hai chiều.

## [2026-07-28] Lưu nháp một lần cho mỗi lô thay đổi (`flushDraft` single-flight)

- **Quyết định:** Bản nháp có cờ "bẩn"; `flushDraft()` bỏ qua hoàn toàn nếu nháp không đổi từ lần
  lưu trước, và gộp các lời gọi chồng nhau vào cùng một request đang bay.
- **Lý do:** Trước V2 mỗi lần tải ảnh CCCD đều PATCH nháp trước — chọn mặt trước rồi mặt sau là hai
  lần ghi, dù giữa hai lần đó người dân không sửa gì. Trên mạng yếu đó là hai vòng round-trip thừa
  ngay trước công đoạn chậm nhất.
- **Đánh đổi đã xử lý:** Cờ chỉ hạ khi máy chủ đã nhận — hạ khi lưu hỏng là mất dữ liệu im lặng ở
  lần sau. Thứ tự và nhãn ảnh GCN cũng đánh dấu bẩn, vì chúng nằm trong
  `draft.certificateFileMetadata`.

## [2026-07-25] Khoảng trống version migration `202607250001` và `202607250006`

- **Quyết định:** Nhánh `feat/antigravity-assisted-review` cấp version `202607250002` đến
  `202607250008` cho các migration Phase 3-9, bỏ qua `202607250001` và `202607250006`.
- **Lý do:** `202607250001` từng bị một file `create_pl3_export_view.sql` chiếm — file đó **untracked**
  trong git (không thuộc commit nào của Antigravity hay của review này), tạo VIEW `pl3_export_view`
  không nơi nào trong `src/` dùng, gây va chạm version với kế hoạch gốc. Đã **xóa** ngày 2026-07-25
  sau khi xác nhận với chủ dự án (không phải việc đang dở của ai) — `202607250001` giờ **lại tự do**,
  dùng được cho migration kế tiếp. `202607250006` vẫn giữ chỗ cho Phase 12 (đổi tên file gốc `-1/-2`
  → `-01/-02` trên Drive) — Phase 12 mới đổi quy ước sinh tên mới (`file-naming.ts`), CHƯA viết
  migration đổi tên các file cũ đã có trên Drive, nên số này chưa cấp.
- **Đánh đổi:** `tests/migration-versions.test.ts` chỉ kiểm tính duy nhất, không kiểm liên tục —
  khoảng trống không làm hỏng gì. Agent sau dùng `202607250001` bình thường cho migration tiếp theo;
  chỉ tránh `202607250006` cho tới khi thật sự làm Phase 12.
- **Người quyết định:** Claude Sonnet 5 (ghi lại theo yêu cầu review 2026-07-25); xác nhận xóa file
  va chạm do chủ dự án đồng ý cùng ngày.

## [2026-07-25] Đồng bộ snapshot chính thức và khóa tạo thư mục Drive xuyên lambda

- **Quyết định:** `commitOfficialAmendment` cập nhật `draft_json` và cả
  `official_payload_json`/`official_payload_at`/`official_payload_by` trong cùng câu `UPDATE`, trước
  khi đồng bộ các bảng chính thức trong transaction hiện hữu. Vì vậy snapshot mà
  `effectivePayload()` ưu tiên luôn là đúng bản vừa được điều chỉnh, cùng metadata người thực hiện
  và thời điểm. `PublicIntakeStorage.findOrCreateFolder` tiếp tục dùng `Map` chỉ để cache, nhưng mọi
  cache miss mở một transaction PostgreSQL riêng, lấy `pg_advisory_xact_lock` theo
  `DRIVE_FOLDER:{parentId}:{name}`, rồi mới list/create thư mục trên Drive.
- **Lý do:** Trước đó bảng chuẩn hóa chính thức đã được `syncOfficialRecord` cập nhật nhưng snapshot
  JSON vẫn cũ, khiến đọc theo `effectivePayload()` sai. Cùng lúc, `Map` không chia sẻ giữa các Vercel
  lambda nên hai request cache miss cùng tên có thể cùng tạo thư mục Drive.
- **Đánh đổi:** Khóa folder giữ một transaction ngắn trong khi gọi Drive, nên không được gọi hàm từ
  một `database.begin` bên ngoài (pool runtime `max: 1` sẽ tự deadlock). Đổi lại, cả process/lambda
  dùng chung Postgres được tuần tự hóa và không cần migration hay bảng lock mới.
- **Kiểm chứng:** rehearsal integration kiểm snapshot mới sau official amendment; unit test kiểm
  `findOrCreateFolder` lấy advisory lock trước mọi Drive list/create.
- **Người quyết định:** Codex, theo yêu cầu vá hai rủi ro production đang mở của chủ dự án.

## [2026-07-25] MỞ tiếp nhận chính thức — `OFFICIAL_ACCEPTANCE_ENABLED = true`

- **Quyết định:** Chủ dự án quyết định mở tiếp nhận chính thức để bắt đầu thu hồ sơ thật. Cờ
  `OFFICIAL_ACCEPTANCE_ENABLED` trong `src/modules/submissions/acceptance.ts` đảo từ `false` sang
  `true`, và nút "Tiếp nhận chính thức" trong `submission-detail.tsx` được nối vào route thật
  (trước đó nút bị `disabled` cứng, không có `onClick`, nên đảo cờ không thôi thì cán bộ vẫn không
  bấm được).
- **Điều kiện gác cổng — đã đóng toàn bộ:**
  1. **Diễn tập staging 3 kịch bản saga** — PASS 6/6 trên Postgres thử nghiệm (2026-07-24, entry
     ngay dưới đây).
  2. **Danh mục trường 12/13** — đã chốt từ dropdown PL3 (2026-07-22/2026-07-23). Dòng "chờ danh
     mục trường 12 chính thức" trong `04-current-tasks.md` là tài liệu lỗi thời, nay đã gỡ.
  3. **Thông báo bảo vệ dữ liệu · `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` · khớp tổ chức trong tra
     cứu GCN** — chủ dự án chấp nhận rủi ro có ghi nhận (2026-07-24).
  4. **Điều khoản xử lý dữ liệu Gemini/Antigravity** — chủ dự án quyết định thực hiện (Q5 dưới).
- **Hai lỗi chặn phải vá CÙNG LƯỢT, không thể để lại sau:**
  - **`refreshCanonicalProjection` xóa sai thứ tự khóa ngoại** (`repository.ts`). Xóa
    `public_parcels` **trước** `public_land_uses`, mà FK `public_land_uses.parcel_id →
public_parcels(parcel_id)` không cascade, không deferrable → `foreign_key_violation`. Lần gửi
    đầu không lộ vì bảng con còn rỗng (delete là no-op); lỗi chỉ nổ từ lần làm mới **thứ hai** —
    tức mọi lần cán bộ sửa hồ sơ đã gửi và mọi lần người dân gửi bổ sung đều HTTP 500. Đã đảo lại
    thứ tự: con trước cha.
  - **Bước `RECORDS_WRITTEN` không ghi thửa đất và mục đích sử dụng** (`acceptance-saga.ts`). Saga
    chỉ ghi `cases`/`owners`/`certificates`/`files`. Sau khi "tiếp nhận chính thức" xong, dữ liệu
    thửa vẫn chỉ nằm trong `draft_json` — cùng cột mà cán bộ và người dân đều ghi đè được, tức hồ
    sơ chính thức **không có bản chốt bất biến**. Đã ghi bổ sung vào `public.parcels` và
    `public.assets` (bảng `data_json jsonb` gắn `case_id`, **đã có sẵn** trong schema
    `202607230001` — không cần migration mới), ID tất định `ACC:{submissionId}:{id}` +
    `on conflict do nothing` để giữ tính idempotent của saga.
- **Vì sao mở được ngay mà rủi ro thấp:** chưa có hồ sơ thật nào trong hệ thống (Q6) — thu hồ sơ
  thật bắt đầu sau 2026-07-25. Hai lỗi trên chưa từng gây thiệt hại, nhưng sẽ nổ ngay từ hồ sơ thật
  đầu tiên nếu mở cờ mà không vá.
- **Đánh đổi:** mở trước khi có bộ E2E cho luồng cán bộ, và trước khi có chức năng "điều chỉnh hồ sơ
  chính thức" (Q2). Chấp nhận vì công tắc dừng khẩn vẫn còn: đảo `OFFICIAL_ACCEPTANCE_ENABLED` về
  `false` thì hồ sơ đang dở nằm lại `ACCEPTING`, retry cùng `idempotency-key` sẽ đi tiếp từ
  checkpoint khi mở lại — không mất dữ liệu, không hồ sơ nào kẹt vĩnh viễn.
- **Kiểm chứng:** `tests/submission-acceptance.test.ts` giữ trip-wire **hai chiều** (giờ khẳng định
  `true`) — đóng lại phải là quyết định có ghi chép, không phải một lần sửa lướt qua. Hai kịch bản
  tích hợp mới trong `tests/staging-rehearsal-acceptance-saga.integration.test.ts`: "Kịch bản 1b"
  (GCN nhiều thửa nhiều mục đích → `public.parcels`/`public.assets` đủ dòng, replay không nhân đôi)
  và "Kịch bản 1c" (làm mới hình chiếu hai lần liên tiếp không vi phạm khóa ngoại).

## [2026-07-25] Trả lời 7 câu hỏi treo của review kiến trúc

Bảy câu hỏi nêu ở `REVIEW_CLAUDE_OPUS.md` §10. Chủ dự án trả lời 2026-07-25.

- **Q1 — Cán bộ có được sửa số định danh của chủ đã `QR_CONFIRMED` không? → ĐƯỢC, sửa toàn trường.**
  - **Lý do:** QR đọc nhầm, hoặc bìa GCN ghi khác thẻ CCCD, thì hồ sơ bế tắc không có đường đi tiếp.
    Cán bộ là người quyết định cuối cùng.
  - **Đã làm:** `isOwnerIdentityLocked` đổi tên thành `isOwnerIdentityQrConfirmed` và **hạ cấp từ
    khóa cứng xuống cảnh báo**. `PATCH /api/submissions/:id` không còn trả 400 khi chạm trường định
    danh của chủ `QR_CONFIRMED`; các ô nhập trong giao diện không còn `disabled`.
  - **Đổi lại:** mỗi lần ghi đè để lại dấu vết riêng trong `audit_logs`
    (`identityOverride: "true"` + `identityOverrideOwnerCount`), và giao diện hiện cảnh báo màu hổ
    phách "đọc từ chip CCCD, chỉ sửa khi đối chiếu thấy sai thật". Đi ngược lại dữ liệu chip đáng
    tin hơn mắt người thì phải tra lại được.

- **Q2 — Hồ sơ đã hoàn thành xử lý rồi phát hiện sai thì sửa thế nào? → Cho cán bộ chỉnh sửa; cán
  bộ là người quyết định cuối cùng. ĐÃ THI CÔNG.**
  - **Cách giải: đồng bộ lại dữ liệu chính thức trong CÙNG transaction với lần sửa.** Không tách
    thành hai bước, không có cửa sổ thời gian nào mà `draft_json` và bảng chính thức khác nhau.
  - **`syncOfficialRecord`** (`src/modules/submissions/official-record.ts`) — một hàm duy nhất định
    nghĩa "dữ liệu chính thức trông như thế nào", **dùng chung** bởi saga tiếp nhận (lần ghi đầu) và
    `commitOfficialAmendment` (ghi lại sau khi sửa). Nếu để hai đường tự viết SQL riêng thì sớm muộn
    chúng lệch nhau, và lúc đó hồ sơ chính thức sẽ khác nhau tùy nó đi qua đường nào.
  - Ngữ nghĩa là **đồng bộ**, không phải chèn thêm: bản ghi còn trong bản kê khai thì upsert; bản
    ghi đã bị xóa khỏi bản kê khai thì **xóa khỏi bảng chính thức**. Cán bộ xóa một thửa thì thửa
    đó biến mất khỏi hồ sơ chính thức, không để lại dòng mồ côi.
  - **Điều chỉnh là hành động cố ý, không phải sửa nhầm:** nút riêng "Điều chỉnh hồ sơ chính thức"
    (màu cam, chỉ hiện khi `ACCEPTED`), **bắt buộc lý do ≥ 10 ký tự**, và `PATCH` từ chối nếu chế độ
    suy ra từ yêu cầu không khớp trạng thái thật của hồ sơ.
  - **Dấu vết đối soát:** audit `OFFICIAL_RECORD_AMENDED` ghi lý do + danh sách trường đã đổi (cũ →
    mới, CCCD đã che) + `officialCaseId` + số lượng chủ/thửa/tài sản sau khi đồng bộ. Cộng một mốc
    trên dòng thời gian người dân nhìn thấy.
  - **Đã đóng luôn lỗ hổng P0-4:** nhánh `|| isAdministrator` ở `PATCH` trước đây cho quản trị viên
    sửa hồ sơ ở **bất kỳ trạng thái nào**, kể cả `ACCEPTED`, mà **không** đồng bộ bảng chính thức và
    **không** cần lý do. Đó chính là đường làm dữ liệu lệch nhau vĩnh viễn. Nhánh đó đã bị gỡ.
  - **Bất biến được giữ:** mã hồ sơ chính thức **không đổi** (điều chỉnh là sửa nội dung, không phải
    tiếp nhận lại), ảnh trên Drive không bị đụng, không sinh `case` thứ hai. Điều kiện
    `status = 'ACCEPTED'` nằm trong chính câu UPDATE chứ không chỉ kiểm ở route — hồ sơ có thể đổi
    trạng thái giữa lúc route đọc và lúc ghi.
  - **An toàn khóa ngoại:** bốn bảng chính thức (`certificates`/`owners`/`parcels`/`assets`) chỉ
    tham chiếu `cases(case_id)`, **không tham chiếu lẫn nhau**, và `files.owner_id` là text không có
    ràng buộc — nên thứ tự xóa giữa chúng không quan trọng. Khác hẳn cặp
    `public_land_uses → public_parcels` phía bản kê khai, nơi thứ tự là bắt buộc.
  - **Chưa đóng:** vẫn chưa có bản chụp trạng thái chính thức TRƯỚC mỗi lần điều chỉnh, nên không
    khôi phục lại được giá trị cũ ngoài những gì audit đã ghi. Đủ dùng vì audit lưu cặp cũ → mới cho
    từng trường; nếu sau này cần khôi phục nguyên trạng thì thêm `official_payload` snapshot.

- **Q3 — Thửa có hơn 3 mục đích sử dụng? → Tạm giữ ở 3 mục đích.**
  - Giữ nguyên `MAX_LAND_USES_PER_PARCEL = 3`. Đúng với biểu mẫu PL3 (chỉ có ba bộ cột 25–29 /
    30–34 / 35–39). Không thay đổi code.
  - **Hạn chế đã biết, chưa đóng:** người dân có thửa >3 mục đích hiện **không nộp được** hồ sơ
    (`validation.ts` chặn cứng lúc khai). Ca đó phải ra phường làm trực tiếp. Nếu tần suất thực tế
    cao thì mở lại câu hỏi này với cơ quan.

- **Q4 — Trường 21, 22 và hai cột O, P? → Bỏ trường 21/22; VẪN thu cột O, P.**
  - **Lý do:** nguồn dữ liệu hiện dùng là loại đưa vào sử dụng ngay nên bỏ được trường 21/22; nhưng
    khâu **thu thập** vẫn phải có O, P vì nhiều trường hợp chủ trên GCN đã mất.
  - **KHÔNG cần sửa code — hiện trạng đã đúng y như vậy.** `PL3_COLUMNS` trong `pl3-export.ts` nhảy
    thẳng từ trường 20 sang 23 (không có 21/22), và có đúng hai cột `field: null` là "Tên người sử
    dụng hiện tại" / "Số định danh người sử dụng hiện tại". Nhóm này đã được thu qua
    `hasDistinctCurrentUser` + `currentUserName`/`currentUserCitizenId`/`currentUserAddress` +
    `changeReason` từ quyết định [2026-07-23] "Thu Người sử dụng đất hiện tại".
  - Câu hỏi treo trong `04-current-tasks.md` nay đã đóng.

- **Q5 — Điều khoản xử lý dữ liệu Gemini/Antigravity? → Cứ cho thực hiện.**
  - Chủ dự án quyết định tiến hành. Gỡ bỏ tư cách "điều kiện chặn cứng" của mục này.
  - **Ràng buộc kỹ thuật KHÔNG đổi, vẫn là bất biến:** **ảnh CCCD tuyệt đối không gửi sang mô
    hình.** Job chỉ chứa file `documentType = 'CERTIFICATE'`, và đó là ràng buộc ở khâu đóng gói
    (ảnh CCCD không được sao chép ra khỏi Drive) chứ không phải quy ước trông vào Agent nhớ.

- **Q6 — Có bao nhiêu hồ sơ thật? → Chưa có hồ sơ thật nào; thu hồ sơ thật bắt đầu sau 2026-07-25.**
  - Đây là lý do mở cờ ngay bây giờ là an toàn: hai lỗi P0 vá cùng lượt chưa kịp gây thiệt hại.
  - **Hệ quả cho ưu tiên:** giới hạn 2.000 dòng của xuất PL3 và `repository.list()` quét toàn bảng
    (P0-3(b)(d), P1-8) **chưa cấp bách** — nhưng phải sửa trước khi vượt 2.000 hồ sơ, nếu không báo
    cáo sẽ âm thầm thiếu dữ liệu mà không ai biết.

- **Q7 — Đảo `OFFICIAL_ACCEPTANCE_ENABLED`? → ĐẢO SANG `true`.** Đã thực hiện — xem entry ngay trên.

## [2026-07-24 — Diễn tập staging] Saga tiếp nhận chính thức chạy thật, PASS 6/6, vá 1 bug thật

- **Quyết định:** Viết `tests/staging-rehearsal-acceptance-saga.integration.test.ts` — gọi trực
  tiếp `runOfficialAcceptance` (không mock hàm này), áp đúng 2 file migration production lên một
  Postgres Supabase **thử nghiệm** (project riêng, khác hẳn production — khác region: test ở
  `ap-northeast-2`, production ở `ap-southeast-1`), chỉ giả lập (mock) tầng Google Drive vì thứ cần
  kiểm chứng là hành vi Postgres (advisory lock, transaction, `ON CONFLICT`, tên cột), không phải
  chính Drive API. Đã chạy thật và **PASS 6/6**:
  1. Ngắt giữa chừng `FILES_MOVED` (di chuyển được 1/3 file) → retry cùng idempotency key → file đã
     chuyển không bị chuyển lại, file lỗi retry đúng 1 lần thành công, đúng 1 case/3 file được ghi.
  2. Hồ sơ đang có saga dở dang, request khác dùng key khác → `AcceptanceInProgressError`, không
     sinh saga/case thứ hai. Bổ sung: hai request tiếp nhận thật sự cùng lúc (`Promise.allSettled`)
     trên hồ sơ mới toanh — race thật của Postgres quyết định lỗi là `ACCEPTANCE_IN_PROGRESS` hay
     `VERSION_CONFLICT` tùy thời điểm, nhưng bất biến cốt lõi luôn đúng: không bao giờ có 2 case.
  3. Bấm lại sau `COMPLETED` (còn/đã hết `request_log`) → trả đúng kết quả cache, không tăng
     version, không audit/timeline trùng; dùng lại key cũ với payload khác → `IDEMPOTENCY_CONFLICT`.
- **Bug thật phát hiện qua rehearsal (không phải qua test mock):** Supavisor transaction-mode
  pooler (`prepare: false`) đôi khi trả cột `jsonb` (`moved_files`, `response_json`) về dạng
  **chuỗi JSON thô** thay vì object đã parse — cùng hiện tượng `decodeSubmissionDraft`
  (`repository.ts`) đã phải xử lý phòng thủ cho `draft_json` từ trước, nhưng `acceptance-saga.ts`
  chưa có phòng thủ tương tự. Hậu quả nếu không vá: `moved_files` bị spread theo ký tự
  (`{...'{"a":"b"}'}` → object có key `"0","1","2"...`), và replay idempotent (`response_json`) trả
  thẳng ra một **chuỗi** thay vì `AcceptanceResult` — client thật sẽ nhận `officialCaseId: undefined`
  khi bấm lại nút tiếp nhận sau khi mạng đã ổn.
- **Đã vá:** thêm `parseJsonbMaybeString`/`mapSagaRow` trong `acceptance-saga.ts`, áp dụng ở mọi nơi
  đọc `moved_files` (mọi `SagaRow` trả về từ SQL) và `response_json` (cache hit ở Bước 0).
- **Lý do đây là bằng chứng đủ mạnh:** khác với `tests/staging-rehearsal-scenarios.test.ts` (bị
  đánh giá KHÔNG ĐẠT trong lần thử trước — chỉ mock JS thuần, không chạm code saga thật), lần này
  toàn bộ SQL chạy trên Postgres thật, dùng đúng connection string kiểu Supavisor production, và
  chính rehearsal này đã tự phát hiện ra một bug mà không mock nào bắt được — chứng minh giá trị
  của việc yêu cầu Postgres thật thay vì mock.
- **Đánh đổi:** Script cần một Postgres thử nghiệm riêng (không dùng chung với production); có
  khóa cứng tự chặn nếu `ACCEPTANCE_SAGA_TEST_DATABASE_URL` trùng `SUPABASE_DATABASE_URL`. Không
  chạy trong `npm test` mặc định trừ khi đặt biến môi trường (tự skip an toàn).
- **File:** `tests/staging-rehearsal-acceptance-saga.integration.test.ts` (mới),
  `src/modules/submissions/acceptance-saga.ts` (vá bug jsonb).
- **Người quyết định:** Chủ dự án (cung cấp Supabase project thử nghiệm để chạy thật, 2026-07-24);
  Claude Code viết script, chạy, chẩn đoán và vá bug.

## [2026-07-24] Đổi tên file gốc trên Drive lúc tiếp nhận: chỉ đổi tên ảnh, không ghép PDF

- **Quyết định:** Khi saga tiếp nhận chính thức chạy tới bước `FILES_MOVED`
  (`acceptance-saga.ts`), hệ thống đổi tên các file ảnh gốc ngay trên Drive theo quy ước
  `[Số phát hành GCN]-GCN[-STT].ext` / `[Số phát hành]-GT[-STT].ext` (STT chỉ xuất hiện khi ≥2 file
  cùng nhóm; nhóm GT gộp chung cả CCCD mặt trước lẫn mặt sau, không phân biệt theo người).
  **Không** ghép nhiều ảnh thành 1 file PDF — file trên Drive vẫn là ảnh gốc (`.jpg`/`.png`/`.heic`),
  cán bộ tự convert sang PDF thủ công sau nếu cần.
- **Vì sao:** Ghép ảnh độ phân giải cao thành PDF trên Vercel serverless function dễ tràn bộ nhớ
  (giới hạn RAM runtime); chỉ đổi tên là thao tác Drive API rẻ và an toàn. Đây cũng là quyết định
  của chủ dự án khi được hỏi lựa chọn giữa 2 phương án.
- **Ràng buộc quan trọng:** Cột 49 (`scannedFileNames` trong `pl3-export.ts`) trước đây hardcode
  literal `"{issueNumber}-GCN.pdf; {issueNumber}-GT.pdf"` — hoàn toàn không khớp với tên file ảnh
  thật (khác đuôi, không có STT, không đúng số lượng file). Đã tách logic đặt tên thành một hàm
  thuần duy nhất `buildOriginalFileNames` (`src/modules/public-intake/file-naming.ts`), dùng chung
  giữa bước đổi tên thật trên Drive và cột 49 PL3 — để hai nơi không thể lệch tên nhau nữa. STT
  tính theo thứ tự `created_at, file_id` (khớp `repository.listFiles`/`refreshFileSummaries`), nên
  saga (dùng `listFiles`) và PL3 export (dùng `record.fileSummaries`, cùng thứ tự) luôn ra cùng STT.
- **Đánh giá lại:** Nếu sau này cần ghép PDF thật (đúng mẫu `Tai lieu/PL3.xlsx` gốc), phải làm ở một
  bước riêng ngoài saga (ví dụ background job hoặc thao tác thủ công), không ghép trong request path
  của tiếp nhận chính thức.
- **Người quyết định:** Chủ dự án (2026-07-24).

## [2026-07-24] Chấp nhận rủi ro: bỏ qua 3/4 điều kiện gác cổng saga tiếp nhận

- **Quyết định:** Chủ dự án chấp nhận **bỏ qua, không sửa** 3 trong 4 điều kiện gác cổng trước khi
  đảo `OFFICIAL_ACCEPTANCE_ENABLED = true` (xem `04-current-tasks.md` mục "Chặn trước khi đưa cổng
  công khai vào dữ liệu thật"):
  1. **Lớp biên (Cloudflare/domain thật):** Giữ nguyên chạy trên `capphongchau.vercel.app`, không
     mua domain riêng + cấu hình Cloudflare. Giữ `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE=true` trên
     production.
  2. **Thông báo bảo vệ dữ liệu cá nhân:** Giữ nguyên chữ placeholder ở `/ke-khai` (`wizard.tsx`);
     server tiếp tục ghi `consentVersion` bằng `CONSENT_NOTICE_VERSION` cấu hình sẵn, không xác
     minh người dân thật sự đã đọc/tick đồng ý (`src/app/api/public/submissions/route.ts`).
  3. **Tra cứu tổ chức trong GCN đã có:** Không làm khớp mã số thuế cho khoảng 280 dòng tổ chức
     trong kho GCN cũ (mã dạng `N/A-<mst>`); tra cứu `/tra-cuu` và luồng "không cần nộp lại" tiếp
     tục chỉ khớp cá nhân qua HMAC(CCCD).
     Điều kiện còn lại **KHÔNG được bỏ qua**: diễn tập staging 3 kịch bản của saga (mục 1 cùng danh
     sách) — đây là điều kiện chặn duy nhất còn lại trước khi mở `OFFICIAL_ACCEPTANCE_ENABLED`.
- **Lý do:** Quy mô thử nghiệm nhỏ (một phường Phong Châu, tối đa 500 hồ sơ) và có thời hạn (đợt
  chiến dịch 180 ngày, không lặp lại/không mở rộng sau đó) — chi phí làm đủ cả 3 mục không tương
  xứng lợi ích trong phạm vi và thời gian này.
- **Rủi ro chấp nhận (không phải "đã sửa" — vẫn tồn tại trong hệ thống)::**
  1. Không WAF/rate limit ở edge (xác nhận: code hiện không có bất kỳ giới hạn tốc độ nào ở tầng
     ứng dụng, `RATE_LIMITED` chỉ là mã lỗi định nghĩa sẵn, chưa nơi nào ném ra) → rủi ro **vận
     hành** (nghẽn/chậm đúng lúc cao điểm nếu bị bot quét hoặc spam), không phải rủi ro lộ dữ liệu
     vì CSRF/role/Turnstile vẫn nguyên vẹn. Giảm nhẹ bằng Turnstile (vẫn bật, độc lập domain) và
     công tắc khẩn `PUBLIC_INTAKE_MODE=PAUSED` (đổi env, không cần deploy lại) khi phát hiện bất
     thường.
  2. Ghi nhận đồng ý thu thập CCCD/PII mà không có bằng chứng phía server rằng người dân đã thật
     sự đọc/tick — rủi ro tuân thủ/pháp lý nếu phát sinh tranh chấp về thu thập dữ liệu cá nhân.
  3. Hồ sơ tổ chức tra cứu "đã có GCN chưa" có thể trả sai/thiếu do không khớp được mã số thuế —
     cán bộ phải tự đối chiếu thủ công cho nhóm tổ chức, hệ thống không cảnh báo được cho nhóm này.
- **Đánh giá lại:** Bắt buộc đánh giá lại cả 3 mục nếu dự án mở rộng khỏi phạm vi thử nghiệm hiện
  tại (quá 500 hồ sơ, quá một phường, tiếp tục vận hành sau đợt 180 ngày, hoặc dùng cho phường
  khác) — quyết định này CHỈ áp dụng cho phạm vi thử nghiệm đã nêu.
- **Người quyết định:** Chủ dự án (2026-07-24).

## [2026-07-24 — SỬA KHẨN] Tách hard-stop saga khỏi `REFERENCE_IS_PLACEHOLDER` thành cờ riêng

- **Phát hiện:** Sau khi nối `runOfficialAcceptance` vào `accept/route.ts` (entry ngay dưới), gate
  duy nhất còn lại chặn saga chạy thật là `if (REFERENCE_IS_PLACEHOLDER)`. Nhưng cờ này đã bị đảo
  thành `false` từ quyết định [2026-07-23] "Xây export PL3 ngay, dùng nhãn danh mục sẵn có trong
  code" — một quyết định **hoàn toàn không liên quan** tới việc mở saga, chỉ nói nhãn dùng để xuất
  PL3 đã chốt. Bản gốc của route có một `return fail(...)` cứng, vô điều kiện, độc lập với
  `REFERENCE_IS_PLACEHOLDER` — đó mới là hard-stop thật ("Saga tiếp nhận chưa được mở cho dữ liệu
  thật", nhắc tới ở `PLAN2.md` §6.3 là `accept/route.ts:101`). Khi thay khối đó bằng lời gọi saga
  thật (theo chỉ dẫn fix lỗ hổng kiểm toán), hard-stop cứng bị gỡ trong khi tưởng `REFERENCE_IS_PLACEHOLDER`
  vẫn đang khóa — thực tế nó đã tắt từ một hôm trước. Kết quả: route có thể chạy saga thật cho bất
  kỳ ai có role `REVIEW_OFFICER`/`WARD_ADMIN`/`SYSTEM_ADMIN` + CSRF hợp lệ, bất kể 4 điều kiện gác
  cổng (diễn tập staging, thông báo bảo vệ dữ liệu, lớp biên, khớp tổ chức) đã xong hay chưa. Đây
  chính là rủi ro `PLAN2.md:410` cảnh báo trước (dùng chung một cờ cho hai mục đích, dễ bị đảo mà
  không ai để ý), chỉ khác kịch bản: cờ bị đảo vì lý do export, không phải bị xóa dòng code.
- **Quyết định:** Thêm `OFFICIAL_ACCEPTANCE_ENABLED` (mặc định `false`) trong
  `src/modules/submissions/acceptance.ts`, độc lập hoàn toàn với `REFERENCE_IS_PLACEHOLDER`. Route
  kiểm cả hai cờ trước khi gọi saga. Thêm test trip-wire
  `tests/submission-acceptance.test.ts` khẳng định cờ là `false`, buộc ai muốn mở saga phải sửa
  test có chủ đích (không thể vô tình đảo cờ qua một quyết định không liên quan).
- **Lý do:** Không được để một cờ phục vụ hai câu hỏi khác nhau ("nhãn xuất đã chốt chưa" và "đã đủ
  an toàn ghi dữ liệu thật chưa") — quyết định đúng cho câu hỏi này có thể vô tình sai cho câu hỏi
  kia.
- **File:** `src/modules/submissions/acceptance.ts`, `src/app/api/submissions/[submissionId]/accept/route.ts`,
  `tests/submission-acceptance.test.ts`, `AGENTS.md`, `docs/brain/04-current-tasks.md`.
- **Người phát hiện:** Claude Code, khi được hỏi giải thích "trường 12" và rà lại toàn bộ điều kiện
  khóa route trước khi trả lời.

## [2026-07-24] Thiết kế hạ tầng Saga Tiếp nhận chính thức & Khắc phục lỗ hổng kiểm toán

- **Quyết định:**
  1. Cấp mã hồ sơ chính thức theo năm qua bảng `case_counters` SQL nguyên tử (`case_counters.last_sequence`), loại bỏ phụ thuộc Google Sheets `updatedRange`. Nếu Saga bị bỏ dở giữa chừng, lỗ hổng trong dãy số được chấp nhận (không tái sử dụng số cũ).
  2. Bảng `public_acceptance_sagas` chốt checkpoint theo các mốc `accept_step`. Thao tác Drive (`CASE_FOLDER_READY`, `FILES_MOVED`) chạy **ngoài DB transaction** để tránh deadlock do pool kết nối `max: 1`.
  3. Mọi bản ghi ở bước `RECORDS_WRITTEN` sinh primary key theo quy luật cố định (deterministic, ví dụ `ACC:${submissionId}:${id}`), cấm `randomUUID()` để retry `ON CONFLICT DO NOTHING` không sinh dữ liệu trùng.
  4. Mã hồ sơ `official_case_id` chỉ được ghi vào `public_submissions` ở bước cuối `COMPLETED`.
  5. Các bảng chiếu chuẩn hóa `public_certificates`, `public_owners`, `public_parcels`, `public_land_uses`, `public_assets` được tự động làm mới (refresh projection) khi người dân gửi lại `RESUBMITTED` hoặc cán bộ sửa draft.
- **Lý do:** Đảm bảo hệ thống đạt tiêu chuẩn Definition of Done (không tạo case/file trùng khi retry), chịu lỗi đứt mạng giữa chừng và hoàn toàn an toàn trong môi trường serverless Vercel + Supabase connection pool `max: 1`.
- **File:** `supabase/migrations/202607240001_official_acceptance.sql`, `acceptance-saga.ts`, `accept/route.ts`, `repository.ts`, `storage.ts`, `workspace-client.ts`.

## [2026-07-24] Chuẩn hóa `draft_json` legacy bị lưu hai lần

- **Quyết định:** Dữ liệu `jsonb` dạng chuỗi nhưng nội dung là object nháp được chuẩn hóa một lần bằng migration/script có audit, tăng `version` và không chỉnh từng trường PII. Repository giải mã tương thích chuỗi JSON khi đọc trong thời gian chuyển đổi; UI chỉ nhận nháp có mảng `owners`.
- **Lý do:** Ba nháp legacy còn bị bọc hai lần khiến PostgreSQL trả string thay vì object; upload CCCD sau quét QR không tìm được `owners` và bị chặn dù nội dung bên trong hoàn chỉnh.
- **An toàn/đánh đổi:** Chỉ chuyển string JSON hợp lệ sang object JSON, không tạo/suy diễn chủ sử dụng; script mặc định chỉ đọc và cần `--apply` để ghi. Mỗi bản ghi được audit `PUBLIC_SUBMISSION_DRAFT_JSON_NORMALIZED`.
- **File:** `supabase/migrations/202607240002_normalize_legacy_public_draft_json.sql`, `scripts/normalize-legacy-public-drafts.ts`, `repository.ts`, `wizard.tsx` và test hồi quy.

## [2026-07-24] Phục hồi cutover Supabase: identity sequence và nháp legacy

- **Quyết định:** Sau ETL, luôn đồng bộ sequence của `public_submissions.legacy_row_index` với giá trị lớn nhất đã chèn trong cùng transaction. Dùng migration idempotent cùng script `repair:public-submissions -- --apply` để phục hồi production đã cutover trước khi có quy tắc này. Nháp JSON legacy thiếu mảng `owners` được bổ sung một chủ sử dụng trống, tăng `version` và ghi audit; không suy diễn hoặc tự điền dữ liệu cá nhân.
- **Lý do:** ETL đã chèn `legacy_row_index` từ số dòng Google Sheets. PostgreSQL không tự cập nhật sequence cho giá trị được chèn tường minh, làm các bản nháp tạo mới va chạm unique key. Một nháp legacy thiếu `owners` khiến endpoint upload gọi `.find()` trên `undefined` và trả 500 trước khi gọi Google Drive.
- **An toàn/đánh đổi:** Chỉ sửa object `draft_json` thiếu hẳn hoặc sai kiểu `owners`, giữ nguyên các trường còn lại và có `AUDIT_LOGS`. Endpoint upload chặn shape bất thường bằng `409 INVALID_STATE`; người dân cần tải lại trang sau khi nháp được phục hồi. Không trả Drive ID, token hoặc dữ liệu nhận dạng trong lỗi/log.
- **File:** `supabase/migrations/202607240001_repair_public_submission_identity_and_drafts.sql`, `scripts/repair-public-submissions.ts`, `scripts/migrate-sheets-to-supabase.ts`, hai route upload CCCD và test hồi quy.

## [2026-07-24] Cho phép cán bộ sửa trực tiếp `draft_json` — đảo một phần quyết định [2026-07-21]

- **Quyết định:** Thêm `PATCH /api/submissions/:submissionId` cho cán bộ (`REVIEW_OFFICER` /
  `WARD_ADMIN` / `SYSTEM_ADMIN`) sửa trực tiếp một số trường trong `draft_json` của hồ sơ đang
  `UNDER_REVIEW` và do chính họ nhận xử lý (hoặc admin), thay vì bắt buộc `[Yêu cầu bổ sung]` cho
  mọi lỗi. Đây là **đảo một phần** quyết định [2026-07-21] "Hàng chờ cán bộ đọc từ
  PUBLIC_SUBMISSIONS, không chuyển dữ liệu sớm" (mục _"claim, yêu cầu bổ sung và từ chối... không
  sửa `draft_json` gốc"_) — chỉ đảo cho thao tác sửa field hẹp, không đảo phần "không chuyển dữ
  liệu sớm sang CASES".
- **Phạm vi trường được sửa:** thông tin Giấy chứng nhận (`certificate.issueNumber/issueDate/
registryNumber`) và thông tin cá nhân của từng chủ sử dụng (`fullName`, `identityNumber`,
  `dateOfBirth`, `gender`, `residenceAddress`, `roleOnCertificate`). Không có trường "tổ dân phố"
  riêng trong schema — bao gồm trong `residenceAddress` (địa chỉ tự do).
- **Khóa cứng theo QR:** nếu chủ sử dụng có `identityStatus === "QR_CONFIRMED"` (đã đọc từ chip
  CCCD thật), 5 trường định danh (`fullName`, `identityNumber`, `dateOfBirth`, `gender`,
  `residenceAddress`) bị khóa — server trả `VALIDATION_FAILED` nếu payload đụng vào, bất kể UI có
  khóa hay không. Chỉ `roleOnCertificate` và owner nhập tay (`MANUAL`/chưa xác nhận) được sửa đầy
  đủ. Quy tắc khóa nằm ở một hàm thuần `isOwnerIdentityLocked()`
  (`src/modules/submissions/review.ts`), dùng chung giữa route và UI để không lệch nhau.
- **An toàn ghi:** `PATCH` bắt buộc `version` + `x-csrf-token` + `idempotency-key`, đi qua
  `commitStaffDraftEdit()` mới (cùng khuôn với `commitStaffAction`): advisory lock theo
  idempotency key, update `draft_json` có điều kiện `version` (không ghi đè full record, không đụng
  các trường khác của `draft_json` do autosave/upload ghi), audit + timeline + `request_log` trong
  cùng transaction.
- **Audit trước/sau:** mỗi trường đổi được ghi vào `audit_logs.metadata` dạng
  `"path": "trước → sau"`. Riêng `identityNumber` (CCCD) bị che còn 4 số cuối
  (`maskIdentityNumber()`) trước khi ghi audit — theo quy tắc cứng #6 CLAUDE.md "không ghi CCCD đầy
  đủ vào log", áp dụng cả cho audit trail nội bộ. Các trường khác (họ tên/ngày sinh/địa chỉ) ghi
  đầy đủ vì cán bộ xem hồ sơ này đã thấy nguyên văn ở màn hình chi tiết.
- **Lý do:** Cán bộ thấy lỗi gõ phím nhỏ (sai một chữ, sai ngày cấp, sai địa chỉ) và muốn sửa giúp
  người dân thay vì bắt trả lại hồ sơ qua `[Yêu cầu bổ sung]` — chậm và gây phiền cho dân. Dữ liệu
  QR đọc từ chip là chính xác tuyệt đối và đã qua xác thực bằng thẻ thật, nên không có lý do chính
  đáng để cán bộ sửa — khóa cứng ở đây thay vì chỉ dựa vào UI.
- **Đánh đổi:** Thêm một đường ghi `draft_json` ngoài luồng autosave của người dân, tăng bề mặt cần
  audit. Chấp nhận vì phạm vi hẹp (chỉ field liệt kê ở trên, chỉ khi `UNDER_REVIEW`) và có audit
  trail đầy đủ để truy vết ai sửa gì.
- **File:** `src/app/api/submissions/[submissionId]/route.ts` (PATCH),
  `src/modules/public-intake/repository.ts` (`commitStaffDraftEdit`),
  `src/modules/submissions/review.ts` (`mayStaffEdit`, `isOwnerIdentityLocked`),
  `src/modules/public-intake/validation.ts` (export `CITIZEN_ID_PATTERN`/`ORGANISATION_ID_PATTERN`/
  `isValidDate` để tái dùng), `src/components/submission-detail.tsx` (nút + modal chỉnh sửa).
- **Người quyết định:** Chủ dự án (2026-07-24, "vẫn làm, nhưng ghi decision + audit before/after
  chặt"); Claude Code thiết kế khóa QR + audit masked.

## [2026-07-23] Supabase PostgreSQL thay Google Sheets cho toàn bộ dữ liệu cấu trúc

- **Quyết định:** Supabase PostgreSQL tại Singapore là kho dữ liệu cấu trúc duy nhất. Google My Drive
  tiếp tục lưu ảnh/file export; không chuyển storage trong cùng đợt. Runtime không đọc/ghi Google
  Sheets. Sheet cũ chỉ được đọc bởi ETL một lần và các script legacy.
- **Kết nối:** Vercel dùng URI Supavisor transaction pooler port `6543`, `prepare: false`, tối đa một
  connection mỗi instance. Không dùng Supabase Data API/Auth ở client, không có biến
  `NEXT_PUBLIC_SUPABASE_*`; RLS bật nhưng không cấp policy/quyền cho `anon`/`authenticated`.
- **Tính đúng đắn:** `request_log` có primary key, cùng idempotency key được tuần tự hóa bằng advisory
  transaction lock. Mutation nghiệp vụ, audit, timeline/index và kết quả idempotency nằm trong cùng
  PostgreSQL transaction. Version update nguyên tử; unique/check/foreign-key constraint thay các
  kiểm tra race-prone của Sheets.
- **Migration:** `scripts/migrate-sheets-to-supabase.ts` đọc toàn bộ nguồn trước, nhập trong một
  transaction, giữ `legacy_row_index` cho cookie v2, dựng chỉ mục GCN từ bảng owner và ghi marker
  chống chạy lặp. Không chạy ETL khi production còn ghi; phải backup/freeze/đối chiếu rồi mới cutover.
- **Hệ quả:** `existing-certificates-index.json` không còn là nguồn tra cứu runtime; dữ liệu
  `EXISTING_*` trong Supabase là nguồn thật. File có thể được giữ tạm vì lịch sử/import tooling nhưng
  không được nối lại vào request path.
- **Đánh đổi:** Loại bỏ quota/cell limit và cửa sổ race của Sheets, nhưng phát sinh vận hành database,
  database password, pooling và backup/PITR. PostgreSQL và Drive vẫn không có distributed transaction;
  saga/checkpoint cho thao tác di chuyển file vẫn bắt buộc.
- **Thay thế:** Quyết định “Google Sheets thay vì PostgreSQL” ngày 2026-07-21 và các dòng tương ứng
  trong `PLAN.md`/`PLAN2.md` không còn hiệu lực.
- **Người quyết định:** Chủ dự án (yêu cầu đổi sang Supabase) + Codex (thiết kế/triển khai).

## [2026-07-23] Tra cứu GCN đã có: chuyển sang cache JSON committed + thêm nguồn Phụ lục 3

- **Quyết định:** `PublicIntakeRepository.findExistingCertificates()` không còn gọi Google Sheets.
  Thay bằng đọc `src/modules/public-intake/existing-certificates-index.json` — file **committed
  vào repo**, sinh bởi `python scripts/import_existing_certificates.py --emit-json` từ đúng hai
  bảng `EXISTING_CERTIFICATES`/`EXISTING_CERTIFICATE_OWNERS` (chỉ giữ chứng nhận `VERIFIED`). Logic
  tra cứu thuần nằm ở `workflow.lookupExistingCertificates(index, citizenIdHmac)`. Sheets vẫn là
  **nguồn sự thật** — cán bộ vẫn xem/đối chiếu được trong hai bảng đó như cũ; JSON chỉ là cache dẫn
  xuất, sinh lại được bất cứ lúc nào. `PUBLIC_LOOKUP_INDEX` từ nay **chỉ còn chứa `kind: PENDING`**
  — không còn ghi bucket `"kind": "EXISTING"` (script vẫn tính `buckets`/`indexAppends` để giữ
  nguyên test và báo cáo cũ, chỉ không ghi Sheets nữa qua `append_bucket_values` — hàm này cùng
  `a1_column` đã bị xóa vì hết người gọi). Các dòng `"kind": "EXISTING"` cũ trong Sheets (từ lần
  import 23/7) cứ để nguyên, vô hại, không ai đọc nữa.
- **Ngoại lệ có chủ ý với quy ước "dữ liệu công dân không vào git":** `Tai lieu/` và `reports/` bị
  `.gitignore` đúng vì chứa dữ liệu công dân (tên, CCCD gốc, địa chỉ...). File JSON committed lần
  này **chỉ chứa HMAC(CCCD) — không đảo ngược được nếu không có `DATA_HASH_PEPPER` — và số GCN thật
  (không tên, không CCCD gốc)**, tức nhạy cảm hơn dữ liệu tĩnh khác đã committed (`map-sheet-
reference.ts`) nhưng nhẹ hơn nhiều so với nguồn thô. Đã hỏi rõ trước khi làm: người dùng **chọn
  commit thẳng vào repo** để tốc độ tối đa, biết rõ đánh đổi (repo hiện tại là private, nhưng dữ
  liệu này vào git thì nằm trong lịch sử vĩnh viễn, khác Sheets có ACL riêng). Nếu sau này repo đổi
  sang public hoặc chính sách đổi, phải dời file này ra khỏi git (ví dụ đọc từ Drive + cache bộ nhớ
  server) trước khi đổi visibility.
- **Nguồn dữ liệu Phụ lục 3 mới:** thêm `read_source_pl3()` đọc mẫu "Phụ lục 3, Biểu mẫu số 02"
  (đối soát CSDL quốc gia dân cư — layout cột khác hẳn `read_source()` cũ: `min_row=7`, cột
  `issue_number=3, issue_date=4, registry_number=5, full_name=8, citizen_id=12`). Chọn qua cờ
  `--format {legacy,pl3}` **bắt buộc tường minh**, không tự đoán theo tên file (đọc lệch cột là gán
  sai CCCD↔GCN của người thật). Dòng chủ là tổ chức (không có CCCD cá nhân) bị invalid như file cũ —
  mô hình khớp của app chỉ theo CCCD, không có khóa cho tổ chức, không xây thêm ở đây.
- **Chính sách dữ liệu:** bổ sung thêm, **không thay thế** dữ liệu từ file `11-11-2025.xlsx` đã
  nạp — quyết định của chủ dự án. Cơ chế `--backfill` (vốn có, để chạy lại CÙNG một file sau khi đổi
  khóa khớp) được nới ra để dùng được cho NGUỒN KHÁC hẳn: bỏ điều kiện "tệp nguồn này phải có một
  lần import thường COMPLETED trước đó" trong `run_backfill()`, vì an toàn thật nằm ở
  `backfill_rows()` diff với Sheets hiện tại (chỉ append phần thiếu/khác theo `existing_record_id`/
  cặp `(citizen_hash, existing_record_id)`), không nằm ở lịch sử của riêng tệp đó.
  Dry-run thử với file Phụ lục 3 (5.041 dòng): 3.684 hợp lệ, 2.406 chứng nhận mới sẽ được thêm,
  3.542 owner mới — chưa `--apply` (cần xác nhận riêng trước khi ghi Sheets thật).
- **Đánh đổi:** thêm bước thủ công sau mỗi đợt import mới: chạy `--backfill --apply` (hoặc import
  thường nếu là lần đầu) rồi `--emit-json`, xem `git diff`, commit — cập nhật dữ liệu tĩnh giờ cần
  một lượt deploy, không chỉ "chạy script xong là xong" như trước.
- **Người quyết định:** Chủ dự án (nguồn bổ sung không thay thế; commit JSON vào repo) + Claude Code
  (thiết kế cache/tách hàm thuần, nới điều kiện `--backfill`).

## [2026-07-23] Tra cứu "đã nộp GCN chưa" ở trang chủ — không phiên, vẫn che số GCN

- **Quyết định:** Thêm `POST /api/public/certificate-lookup` + `src/components/certificate-lookup.tsx`
  cho người dân tự tra cứu ngay ở trang chủ, không cần bắt đầu kê khai hay có phiên nào. Ảnh CCCD
  giải mã QR hoàn toàn cục bộ (`citizen-id-qr.client.ts`, canvas + ZXing), không rời trình duyệt;
  chỉ số định danh + họ tên (không phải ảnh) được gửi lên để đối chiếu, và server không lưu lại gì
  ngoài một dòng audit (`matchCount`, không CCCD/HMAC). Giao diện **không có ô nhập tay số CCCD** —
  chỉ có ô chọn/chụp ảnh, giữ đúng lớp chống dò đã chốt cho tra cứu GCN đã có
  ("bắt buộc QR_CONFIRMED", xem entry 2026-07-23 "Khóa tra 'hồ sơ đã có'..."). Kết quả **vẫn che số
  GCN** (`••••1234` + ngày cấp), theo đúng quyết định che số đã chốt cùng ngày — không đổi thành
  hiện đầy đủ dù người dùng đề xuất, vì tính năng này còn mở hơn tính năng cũ: không có phiên/CSRF
  nào ràng buộc người tra cứu đúng là chủ CCCD, nên ai cầm được một ảnh QR (kể cả không phải của
  mình — ảnh cũ, ảnh nhặt được) cũng tra được.
- **Lý do:** Người dân muốn kiểm tra nhanh xem đã nộp GCN chưa mà không phải bắt đầu cả luồng kê
  khai. Vì đây là bề mặt công khai **không gắn phiên** (rộng hơn `existing-records/check` vốn nằm
  sau session/CSRF/idempotency), giữ nguyên hai lớp phòng vệ đã có (chỉ nhận QR đã giải mã, che số
  GCN) là bắt buộc, không phải tùy chọn.
- **Đánh đổi:** Không dùng rate-limiter tự viết trong app — dựa vào Cloudflare edge + Turnstile
  (action `lookup`, cùng cơ chế `create`/`submit`/`recover`) làm lớp chống dò/chống bot duy nhất,
  đúng stack đã chọn (không tự thêm hạ tầng mới). Route không đòi `idempotency-key` vì đây là thao
  tác đọc, lặp lại vô hại (khác các route ghi PUBLIC_SUBMISSIONS).
- **Người quyết định:** Chủ dự án (đề xuất tính năng) + Claude Code (giữ nguyên mức che số sau khi
  hỏi lại, vì đây là quyết định bảo mật đã chốt trước và diện lộ ở đây rộng hơn).

## [2026-07-23] Làm lại biểu mẫu người dân (PLAN2 §5): a11y, số Việt, loại đất tìm kiếm, quản lý ảnh

- **Quyết định:** Hoàn thiện các mục §5 "Biểu mẫu người dân":
  - **Số thập phân kiểu Việt** (`parseVietnameseDecimal` trong `vietnamese-number.ts`): chấp nhận
    `123,5` · `123.5` · `1 234,5` · `1.234,5`. Chỉ dùng cho **kiểm tra số học** (diện tích > 0,
    tổng loại đất ≤ diện tích thửa); chuỗi gốc người dân gõ vẫn giữ nguyên khi xuất (PL3 mẫu ghi
    dấu phẩy).
  - **Ô loại đất có tìm kiếm** (`SearchableSelect`): gõ vài chữ (không dấu vẫn khớp) thay cho
    `<select>` 45 dòng. Thêm hai lối thoát ngoài danh mục: `GHI_THEO_BIA` (ô chữ tự do, xuất PL3
    ghi thẳng chữ đó) và `CAN_DOI_CHIEU` (xuất để trống + cảnh báo cho cán bộ). Lưu ở
    `LandUse.purposeFreeText`.
  - **Accessibility:** `Field` sinh `id`, gắn `htmlFor`, tiêm `aria-describedby`/`name` vào ô con;
    `Select`/`VietnameseDateInput`/`SearchableSelect` nhận `id`/`aria-describedby`. Sai validate thì
    tự đưa con trỏ tới ô lỗi đầu tiên. (Trước đây toàn repo không có một `htmlFor` nào.)
  - **Quản lý ảnh:** cả ảnh CCCD lẫn ảnh GCN có **xem trước** (`FilePreview` lấy byte qua API
    `private, no-store`). Ảnh GCN thêm **xóa mềm** (endpoint `DELETE .../files/[fileId]` →
    `markFileDeleted`, chỉ áp cho `CERTIFICATE`), **thay**, **sắp xếp**, **gắn nhãn trang**. Nút
    **"Đọc lại QR"** dùng lại hai ảnh CCCD đã có, không bắt chụp ảnh thứ ba (thay quyết định
    [2026-07-22] "chụp một kiểu").
  - **Trang kiểm tra cuối** hiển thị **đầy đủ** nội dung từng khối + nút "Sửa" nhảy về đúng bước.
- **Đánh đổi / còn hở:**
  - Thứ tự + nhãn trang ảnh GCN lưu trong `draft_json.certificateFileMetadata` để theo hồ sơ khi
    đổi thiết bị; `sessionStorage` chỉ làm bản đệm trước lần lưu bước. Không thêm cột
    `PUBLIC_FILES`: trạng thái/Drive ID vẫn lấy từ file đã xác minh, metadata nháp chỉ tham chiếu
    `file_id`. Nhãn tối đa 120 ký tự và được validate ở server.
  - Thay ảnh GCN dùng cùng cơ chế an toàn với CCCD: upload/xác minh ảnh mới rồi mới chuyển ảnh cũ
    sang `REPLACED`; xóa mềm yêu cầu CSRF + idempotency key và replay trạng thái `DELETED` an toàn.
  - `GHI_THEO_BIA`/`CAN_DOI_CHIEU` chảy vào export qua `draft_json` (nguồn thật của export); tab
    phẳng `PUBLIC_LAND_USES` vẫn chỉ ghi `purpose_code`, chữ tự do không xuống tab phẳng.
  - **§5.1 (kiểm tra hồ sơ đã có theo CCCD) KHÔNG nằm trong đợt này** — là tính năng tra cứu
    server-side có rào riêng ("chưa sửa thì đừng bật"), làm tách sau.
- **Người quyết định:** Chủ dự án (2026-07-23, "làm trọn cả §5"); Claude Code triển khai.

## [2026-07-23] Xây export PL3 ngay, dùng nhãn danh mục sẵn có trong code

- **Quyết định:** Xây luồng xuất PL3 (49 trường) **ngay**, dịch mã→chữ **chỉ** bằng `label` của các
  danh mục đã có trong `reference.ts`/`types.ts` (`LAND_PURPOSE_OPTIONS`, `LAND_ORIGIN_OPTIONS`,
  `LAND_USE_FORM_OPTIONS`, `LAND_USE_TERM_OPTIONS`, `ASSET_TYPE_OPTIONS`, `CERTIFICATE_ROLE_OPTIONS`,
  `OWNER_TYPE_LABELS`, `CHANGE_REASON_OPTIONS`). Mã không có trong danh mục **ghi nguyên văn kèm
  cảnh báo**, không tự dịch, không đoán.
- **Lý do:** PLAN2 §7 trước đó hoãn export tới khi "có danh mục chính thức". Chủ dự án chốt
  (2026-07-23) rằng các nhãn đã build trong code chính là nhãn dùng để xuất — gỡ rào này. Các danh
  mục 12/13 đã lấy từ dropdown PL3; loại đất theo Thông tư 08/2024. `label` chính là chuỗi phải ghi
  ra (đã ghi rõ trong comment `reference.ts`/`types.ts`).
- **Cấu trúc (xác nhận từ ảnh render `PL3.xlsx`):** cột A = STT chạy; B..AX = 49 cột dữ liệu (gồm
  O, P không đánh số); **mỗi dòng = một (GCN × thửa × người)**; trường 49 = `{số phát hành}-GCN.pdf;
-GT.pdf`. Sheet `PL3` = hồ sơ `ACCEPTED`; sheet `Ton dong` = hồ sơ đang xử lý (PLAN2 §7 "còn lại
  xuất riêng thành danh sách tồn đọng").
- **Đánh đổi / còn hở:** nhóm nhà ở/chung cư (41–48) và trường 20 chưa có nguồn → để trống đúng
  hiện trạng. Nếu sau này cơ quan gửi danh mục khác nhãn hiện tại thì chỉ cần sửa `label` trong
  `reference.ts`, không phải sửa mã hồ sơ (mã ổn định, tách khỏi nhãn). Câu (a)/(b) §9 (nguồn gốc
  ghép hai ý, loại đất theo TT08 hay danh mục tỉnh) vẫn treo — nhãn hiện tại là bản dùng tạm được
  chủ dự án chấp thuận.
- **Người quyết định:** Chủ dự án (2026-07-23, "cứ dùng những nhãn đấy đi"); Claude Code triển khai.

## [2026-07-23] Sửa import GCN cũ, batch staff action và reset mã bí mật

- **Quyết định:** Import/tra cứu GCN cũ chỉ dựa vào CCCD HMAC; ngày sinh không được lưu trong `EXISTING_*` và không loại dòng import. Backfill dùng cùng ID xác định, append-only và reader lấy bản ghi cuối cùng. Các action cán bộ cùng audit/timeline/yêu cầu bổ sung/`REQUEST_LOG` dùng một Sheets batch; reset mã sinh ổn định theo idempotency key nhưng không lưu secret rõ.
- **Lý do:** Kho cũ có nhiều ngày sinh chỉ ghi năm; code cũ đã bỏ 108 dòng chỉ vì trường này. Ghi status trước yêu cầu bổ sung có thể làm hồ sơ kẹt, còn full-row access update có thể ghi đè autosave/upload.
- **Đánh đổi:** Không dựng lock/transaction ngoài Sheets; retry đúng key an toàn trong mô hình pilot. `QR_CONFIRMED` vẫn chỉ là rào UI theo quyết định chủ dự án, không được mô tả là chống giả mạo API.
- **Người quyết định:** Chủ dự án (2026-07-23).

## [2026-07-23] Khóa tra "hồ sơ đã có" = CCCD, BỎ ngày sinh; tra nhanh bắt buộc QR

- **Quyết định:** Luồng "kiểm tra hồ sơ đã có" (PL3 §5.1) dùng **CCCD** làm khóa khớp, **không**
  đưa ngày sinh vào khóa, và ô tra nhanh **chỉ mở khi có QR CCCD hợp lệ** trong phiên.
- **Căn cứ — soi kho thật `24.7.2026_PhuongPhongChau (đã có dữ liệu).xlsx` (5.041 dòng):**
  - CCCD phủ **99% cá nhân** (3.492 phân biệt); số phát hành GCN chỉ 90% và định dạng bẩn
    (`AĐ 266864`) → CCCD là khóa, GCN chỉ là lối phụ cho 218 dòng thiếu CCCD.
  - **87% ngày sinh chỉ ghi mỗi năm** (`1989`); phần còn lại định dạng Mỹ `mm/dd/yyyy`. Khóa
    `CCCD+tên+ngày sinh` mà Codex dựng sẽ **trượt ~87%** vì app gửi ngày sinh đầy đủ.
  - Chủ dự án chốt phương án chống dò: **bắt buộc quét QR** (đang cầm thẻ thật) thay cho việc cho gõ
    tay CCCD.
- **Hệ quả code (ĐÃ làm 2026-07-23):** khớp rút về **chỉ HMAC của CCCD** — gỡ `identityMatchHmac`
  khỏi cả hai điều kiện khớp trong `repository.ts` (`findExistingCertificates`,
  `hasPendingIdentityMatch`) và bỏ hàm `identityMatchHmac`/`normalizeIdentityName` khỏi
  `workflow.ts`; `identity_hashes` của script import Python bỏ ngày sinh.
  `hasCompleteExistingRecordLookupIdentity` giờ chỉ nhận `QR_CONFIRMED` (gỡ luôn nút gõ-tay ở
  wizard). Tổ chức (280 dòng) khớp bằng MST (kho ghi `N/A-<mst>`) — **chưa làm**. Vì khóa chỉ còn
  CCCD nên không còn phụ thuộc chuẩn hóa tên Python↔TS; nếu sau này đưa tên vào lại thì mới cần
  vector test chung (`.upper()` vs `toLocaleUpperCase("vi-VN")`).
- **Đánh đổi:** khóa CCCD-đơn không có ngày sinh làm lớp phụ → dựa vào QR + rate-limit + audit để
  chống dò; ai QR không lên thì đi đường nộp thường. Chấp nhận vì kho quá thiếu ngày sinh để dùng.
- **Người quyết định:** Chủ dự án (2026-07-23).

## [2026-07-23] Thu "Người sử dụng đất hiện tại" (PL3 cột O, P + trường 14, 15) cho ca chủ đã mất

- **Quyết định:** Biểu mẫu thu thêm khối **Người sử dụng đất hiện tại** khi người đứng tên trên GCN
  không còn là người sử dụng thực tế (đã mất / thừa kế / tặng cho / chuyển nhượng): Tên (O),
  CCCD (P), Địa chỉ thường trú 2 cấp (14), Lý do thay đổi (15). Khi bật, **miễn ảnh CCCD + QR + các
  trường định danh của người trên GCN** (không thể quét thẻ người đã mất); đổi lại bắt khai đủ khối
  này bằng **chữ**, không yêu cầu ảnh CCCD người thừa kế (chốt phương án "miễn ảnh, chỉ khai chữ").
- **Lý do:** Nguồn "đã có dữ liệu" bỏ cột O/P vì đưa vào dùng ngay, nhưng khi **thu thập** phải có vì
  nhiều trường hợp chủ đã mất. Không xử lý thì đúng những ca này bị chặn ngay ở bước ảnh CCCD.
- **Đánh đổi / còn hở:** tick "chủ đã mất" là một lối bỏ qua ảnh CCCD — chống lạm dụng bằng: bắt CCCD
  người sử dụng hiện tại + lý do, và cán bộ đối chiếu giấy tờ thừa kế/sang tên khi duyệt. Chưa thu
  ảnh CCCD người thừa kế (để đợt sau nếu cần định danh chặt hơn).
- **File:** `types.ts` (`Owner` + 5 trường), `reference.ts` (`CHANGE_REASON_OPTIONS`),
  `validation.ts`, `wizard.tsx`, `schema.ts` (nối 5 cột `PUBLIC_OWNERS`), `repository.ts`.
- **Cần chạy lại `migrate:public-intake`** trước deploy — thêm 5 cột vào `PUBLIC_OWNERS`.
- **Người quyết định:** Chủ dự án (2026-07-23).

## [2026-07-22] `PL3.xlsx` là đích xuất cuối cùng — 49 trường, đảo quyết định "dừng ở 15 trường"

- **Quyết định:** Đầu ra cuối cùng của hệ thống là `Tai lieu/PL3.xlsx` — **49 trường** (đánh số
  1–49, thiếu 21 và 22), **không phải** 15 trường của Phụ lục 8. Đảo quyết định [2026-07-21]
  "Mục tiêu dữ liệu là 15 trường Phụ lục 8, không phải 50".
- **Ba khác biệt then chốt so với Phụ lục 8:**
  1. **Đơn vị mỗi dòng là (GCN × thửa × người)**, không phải mỗi hồ sơ. Dòng 9 và 10 của file mẫu
     là cùng GCN `AE 475527`, cùng thửa tờ 06 số 03-1, nhưng tách hai dòng cho chồng và vợ — dữ
     liệu GCN và thửa bị lặp lại theo từng người.
  2. Giá trị ghi **bằng chữ** (`Đất ở tại đô thị`, `Lâu dài`), không phải mã (`ODT`,
     `SU_DUNG_ON_DINH_LAU_DAI`). Cần bảng ánh xạ mã→chữ **được cơ quan duyệt**, tuyệt đối không để
     AI tự dịch nhãn.
  3. Tối đa **3** dòng mục đích sử dụng mỗi thửa (Loại đất 1/2/3). Hệ thống hiện không giới hạn.
- **Mã ĐVHC cấp xã đã biết: `07954`** (trường 1) — trước đây ghi là "chưa có".
- **Lý do:** Chủ dự án cung cấp và xác nhận PL3 là biểu mẫu phải nộp. Lý do cũ ("bộ 50 trường do
  Chi nhánh VPĐK/đơn vị thi công lưu giữ, không phải việc của cấp xã") không còn đúng.
- **Đánh đổi:** Hệ thống hiện thu được ~11/49 trường trọn vẹn. Thiếu hẳn nhóm nhà ở/chung cư
  (trường 40–48), nhóm người sử dụng hiện tại (cột O, P và trường 14, 15), trường 20 và trường 49.
  Biểu mẫu người dân sẽ dài thêm đáng kể — cần cân nhắc trường nào để cán bộ điền khi duyệt thay vì
  bắt người dân khai.
- **Bảng đối chiếu đầy đủ 49 trường → nguồn dữ liệu:** xem Phụ lục của `PLAN2.md`.
- **Người quyết định:** Chủ dự án (2026-07-22).

## [2026-07-22] Danh mục trường 12 và 13 đã chốt — lấy từ dropdown của chính PL3

- **Quyết định:** Hai danh mục sau là **chính thức**, lấy từ ràng buộc dữ liệu (data validation)
  nhúng trong `PL3.xlsx`:
  - **Trường 12 — Pháp nhân trên GCN:** `Cá nhân` · `Hộ gia đình` · `Vợ chồng` · `Đồng sử dụng` ·
    `Cộng đồng dân cư` · `Tổ chức`
  - **Trường 13 — Vai trò pháp nhân trên GCN:** `Cá nhân` · `Chủ hộ` · `Chồng` · `Vợ` ·
    `Người đại diện` · `Thành viên`
- **Lý do:** Gỡ được mục "chưa chốt nội hàm trường 7 vai trò pháp nhân" treo từ đầu dự án trong
  `04-current-tasks.md`. Đây là nguồn chính thức chứ không phải suy đoán.
- **Hệ thống hiện SAI cả hai:** `OWNER_TYPES` thiếu `Đồng sử dụng` và `Cộng đồng dân cư`;
  `CERTIFICATE_ROLE_OPTIONS` (`CHU_SU_DUNG`/`DONG_SU_DUNG`/`DAI_DIEN_HO`/`DAI_DIEN_TO_CHUC`)
  **không trùng giá trị nào**. Cấu trúc hai trường thì đúng, chỉ giá trị sai — sửa danh mục là đủ,
  không phải đổi mô hình.
- **Vẫn CHƯA chốt:** danh mục `Loại đất`, `Nguồn gốc sử dụng`, `Hình thức sử dụng`,
  `Thời hạn sử dụng`. Riêng **Nguồn gốc** có giá trị dạng câu ghép trong PL3 mẫu — _"Nhận chuyển
  nhượng đất được Công nhận QSDĐ như giao đất có thu tiền sử dụng đất"_ — là **hai** khái niệm ghép
  lại, mà danh mục 7 mã phẳng hiện tại chỉ chọn được một. Chưa biết đây là một mục trong danh mục
  hay phải tách thành hai trường; câu hỏi đã soạn gửi cán bộ chuyên trách (xem `PLAN2.md` §9).
- **Người quyết định:** Nguồn là PL3 do cơ quan ban hành; Claude Code trích xuất và đối chiếu.

## [SUPERSEDED 2026-07-23] Không sharding — giữ một spreadsheet, sửa ba chỗ ở tầng truy cập

- **Quyết định lịch sử:** Bỏ phương án chia 10 spreadsheet theo tổ dân phố kèm `CONTROL_PLANE` trung tâm.
  Giữ **một** spreadsheet, thay vào đó sửa ba chỗ trong tầng truy cập dữ liệu.
- **Đã thay thế:** Ngày 2026-07-23, Supabase PostgreSQL thay Google Sheets làm kho dữ liệu runtime.
  Các phân tích quota bên dưới chỉ giữ để giải thích vì sao phương án Sheets đã bị loại.
- **Lý do — sharding không giải bài toán thật:**
  - Quota Google Sheets tính theo **project** và theo **người dùng trong project**, không theo
    spreadsheet. Cả 10 shard đều được ghi bằng một refresh token OAuth duy nhất, nên chia kho nhân
    được **0 lần** thông lượng.
  - Giới hạn 10 triệu ô cũng không phải ràng buộc: 20.000 hồ sơ vẫn thoải mái kể cả không chia.
  - Đổi lại, sharding sinh ra một lớp lỗi nhất quán mới: `CONTROL_PLANE` và 10 shard không có
    transaction giữa chúng, hỏng giữa chừng là index mồ côi hoặc hồ sơ tra không ra.
- **Ba chỗ sửa thay thế:**
  1. **Lưu số dòng vào cookie phiên đã ký**, đọc đúng dải `A{dòng}:S{dòng}` thay vì đọc toàn bảng.
     `repository.ts` hiện đọc **cả** `PUBLIC_SUBMISSIONS!A2:S` mỗi request — kéo về ~8 MB ở quy mô
     2.000 hồ sơ chỉ để lấy một dòng. Payload giảm ~500 lần. An toàn vì bảng chỉ append nên số dòng
     bất biến, cookie có HMAC, và số dòng giả sẽ đọc ra `submission_id` không khớp phiên.
  2. **Autosave chỉ khi đổi bước** + `localStorage` giữ phần đang gõ. Giảm ~10 lần ghi/hồ sơ.
  3. **Gộp audit vào cùng batch** với lệnh ghi trạng thái. Giảm ~6 lần ghi/hồ sơ.
- **Kết quả tính toán:** ~22–31 → ~15–20 lần ghi mỗi hồ sơ; năng lực ~90 → **~135 hồ sơ/giờ**,
  tức ~21.600 hồ sơ trong 20 ngày làm việc. Đạt mục tiêu 20.000 với một spreadsheet.
- **Đánh đổi:** Vẫn phải chạy spike đo tải thật để xác nhận, nhưng là **sau** khi sửa và để xác
  nhận, không phải để quyết kiến trúc. Nếu spike vẫn trượt thì mới xét PostgreSQL + object storage.
- **Quan trọng — quota ĐỌC cũng 60/phút/người dùng** và trước đây bị bỏ sót hoàn toàn trong mọi
  tính toán. Mỗi autosave là 1 đọc + 1 ghi; đọc chạm trần **trước** ghi.
- **Người quyết định:** Claude Code (rà soát kỹ thuật kế hoạch 20.000 hồ sơ), chủ dự án chấp thuận.

## [2026-07-22] Tra tờ bản đồ phải dùng khóa gồm TỶ LỆ, và không bao giờ đoán

- **Quyết định:** Bảng tham chiếu tờ bản đồ cũ → mới (`map-sheet-reference.ts`, 164 dòng) tra theo
  khóa **(đơn vị cũ, số tờ, tỷ lệ)**, không phải (đơn vị cũ, số tờ). Gặp mập mờ hoặc không tìm
  thấy thì trả `AMBIGUOUS` / `NOT_FOUND` để cán bộ xử lý, **tuyệt đối không tự chọn** một ứng viên.
- **Lý do:** Phường Phong Châu cũ (mã 07945) có **hai bộ bản đồ đánh số độc lập, đều bắt đầu từ 1**.
  Tờ 7 tỷ lệ 1/500 ra tờ **150**; tờ 7 tỷ lệ 1/1000 ra tờ **156**. GCN thường không ghi tỷ lệ. Nếu
  tra chỉ bằng số tờ, hệ thống sẽ âm thầm chọn bừa một trong hai — sai tờ bản đồ là sai vị trí thửa
  đất, và lỗi này không hiện ra ở bất kỳ đâu.
- **Quy tắc quy đổi:** Xã Phú Hộ (07954) tờ 1–84 giữ nguyên số · Xã Hà Thạch (07963) tờ 1–59 thành
  85–143 · Phường Phong Châu cũ (07945) 21 tờ thành 144–164.
- **Kèm theo một trường mới bắt buộc:** `Parcel.oldWard`. Ba đơn vị cũ đều đánh số tờ từ 1 nên
  không biết đơn vị cũ thì "tờ 5" có ba đáp án (5, 89, hoặc 148). Có lựa chọn `KHONG_RO` làm lối
  thoát — bắt buộc chọn một mục chứ không cho để trống, để phân biệt "chưa xác định" với "chưa ai
  đụng tới".
- **Đánh đổi:** Chỉ lấp được **trường 19** của PL3. **Trường 20** ("Số thứ tự thửa trên bản đồ địa
  chính") không có nguồn — bảng này chỉ quy đổi số _tờ_, không quy đổi số _thửa_. Cần hỏi cơ quan
  xem có bảng tham chiếu số thửa không, nếu không thì 20.000 hồ sơ phải tra tay trường này.
- **GCN theo bản đồ giấy** (khoảng năm 2000) tra không thấy → `NOT_FOUND` → tự động rơi vào danh
  sách cán bộ đối chiếu thủ công, đúng như chủ dự án yêu cầu.
- **Người quyết định:** Claude Code, theo yêu cầu quy đổi số tờ của chủ dự án (2026-07-22).

## [2026-07-22] Dùng Gemini đọc ảnh GCN để **đối chiếu** với bản người dân khai (đảo quyết định "chưa triển khai OCR")

- **Quyết định:** Sau khi người dân bấm gửi, server gọi Gemini API đọc ảnh GCN và **so từng trường**
  với bản người dân tự khai. Trường nào hai nguồn khớp thì đánh dấu "2 nguồn khớp" và hạ ưu tiên
  duyệt; trường nào lệch thì đẩy lên đầu hàng chờ, hiện cạnh nhau giá trị hai bên kèm vùng ảnh
  tương ứng. Đây là đảo quyết định [2026-07-21] "Chưa triển khai OCR (CCCD/GCN)" và mục "Không làm
  lúc này" trong `04-current-tasks.md`.
- **Lý do:** Nút thắt thật của quy mô 20.000 hồ sơ là năng lực duyệt của cán bộ, không phải quota
  Google Sheets. Đối chiếu hai nguồn độc lập vừa giảm thời gian duyệt mỗi hồ sơ (ước tính ~5 phút
  xuống ~2 phút), vừa cho độ tin cậy cao hơn **cả hai** nguồn riêng lẻ ở những trường trùng khớp.
- **Ranh giới cứng (phải giữ bằng code, không bằng quy trình):**
  - **Chỉ gửi ảnh GCN, không gửi ảnh CCCD.** CCCD đã có QR đọc chính xác tuyệt đối trên máy người
    dân; gửi thêm sang bên thứ ba là tăng phơi nhiễm PII mà không được gì.
  - Gửi bản preview đã hạ kích thước, không gửi ảnh gốc — tránh chạm timeout Vercel Function và
    giảm token.
  - **Không sinh mã trường 12.** Loại đất/nguồn gốc/hình thức/thời hạn chỉ được trích **nguyên văn
    đoạn chữ** trên bìa để cán bộ đọc; bảng mã chưa được VPĐKĐĐ phê duyệt (xem entry "CHƯA CHỐT"
    bên dưới), để mô hình sinh mã vào danh mục chưa chốt là đúng cái bẫy "code chạy đúng, form hiển
    thị đẹp, dữ liệu sai".
  - Mô hình phải trả `null` thay vì đoán; kết quả **không bao giờ tự ghi** vào hồ sơ chính thức —
    chỉ thao tác xác nhận của cán bộ mới ghi.
  - Lưu nguyên văn JSON kết quả kèm version model/prompt vào tab `OCR_FIELDS` (đã có sẵn trong
    schema), append không ghi đè, để truy được hồ sơ nào đọc bằng bản nào.
  - Cache theo `sha256Checksum` mà `verifyUploadedFile` đã lấy sẵn — một ảnh không gọi Gemini lần hai.
- **Đánh đổi:** Thêm phụ thuộc bên thứ ba và một đường chuyển dữ liệu cá nhân **ra nước ngoài**,
  làm nghĩa vụ theo Nghị định 13/2023/NĐ-CP nặng thêm chứ không nhẹ đi. Rủi ro vận hành lớn nhất là
  _automation bias_: ô đã điền sẵn khiến người duyệt bấm qua ô sai nhiều hơn so với khi tự gõ — đó
  là lý do thiết kế chọn "so lệch" thay vì "điền sẵn".
- **Điều kiện chặn trước ảnh thật đầu tiên:**
  1. Xác minh tài khoản Gemini đã bật thanh toán và điều khoản hiện hành **không** dùng dữ liệu để
     huấn luyện (tầng miễn phí có dùng).
  2. Thông báo bảo vệ dữ liệu cá nhân phải được soạn nguyên văn, nêu cả việc chuyển dữ liệu ra nước
     ngoài — hiện vẫn là placeholder trong `wizard.tsx`.
- **Người quyết định:** Chủ dự án (2026-07-22); Claude Code thiết kế luồng đối chiếu.

## [2026-07-22] Chuẩn hóa loại ảnh theo bí danh và phần mở rộng, giữ chốt chặn ở Drive

- **Quyết định:** Loại ảnh do trình duyệt khai (`File.type`) được quy về tên chuẩn trong
  `modules/public-intake/image-format.ts` trước khi kiểm: bí danh `image/jpg`/`image/pjpeg` quy về
  `image/jpeg`, và khi trình duyệt khai rỗng thì suy từ phần mở rộng tệp. Thuộc tính `accept` của ô
  chọn tệp có cả phần mở rộng lẫn MIME.
- **Lý do:** Ảnh nhận qua Zalo/Messenger — chiếm phần lớn ảnh người dân có sẵn trong máy — thường
  về với `File.type` rỗng hoặc bí danh không chuẩn, dù nội dung vẫn là JPEG hợp lệ. Bản cũ từ chối
  thẳng những tệp này với thông báo "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc HEIC", khiến người dân
  bế tắc với một tệp hoàn toàn đúng định dạng. `accept` chỉ có MIME còn làm nhiều trình quản lý tệp
  Android làm mờ chính ảnh cần chọn.
- **Vì sao không làm yếu kiểm soát:** Giá trị chuẩn hóa chỉ là **lời khai** gửi kèm lúc tạo phiên
  tải lên. Ranh giới tin cậy thật vẫn là `verifyUploadedFile`, đọc `mimeType` do chính Google Drive
  nhận dạng **từ nội dung tệp** sau khi tải xong — tệp PDF đổi đuôi thành `.jpg` vẫn bị chặn và xóa
  tại đó. Ảnh GCN nay cũng đi qua bước chuyển HEIC→JPEG như ảnh CCCD, nên Drive chỉ còn phải nhận
  dạng các định dạng nó luôn nhận đúng.
- **Đánh đổi:** Không có. Kiểm soát giữ nguyên độ chặt, chỉ bỏ đi phần từ chối oan.
- **Người quyết định:** Claude Code, theo lỗi người dùng thật báo ngày 2026-07-22.

## [2026-07-22] Cờ tạm mở chốt chặn Cloudflare để test trên `*.vercel.app` khi chưa có domain thật

- **Quyết định:** Thêm `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` — biến môi trường mặc định không đặt
  (chốt chặn vẫn bắt buộc); chỉ khi đặt đúng chuỗi `"true"` thì `trustedEdgeRequired()` trả `false`
  và `/ke-khai` + `/api/public/*` mở cho mọi request gọi thẳng, kể cả không có header
  `X-Origin-Auth`.
- **Lý do:** Deploy production đầu tiên (2026-07-22) không có domain thật đứng sau Cloudflare —
  chỉ có `*.vercel.app` do Vercel cấp, chủ dự án không sở hữu DNS zone đó nên không thể trỏ
  Cloudflare vào được. Chốt chặn dựng ở lượt trước (xem entry lớp biên 2026-07-22) đúng như thiết
  kế sẽ chặn luôn cả chủ dự án tự test trên điện thoại. Cần một lối thoát tường minh, không phải
  gỡ bỏ chốt chặn.
- **Đánh đổi:** Trong lúc bật, `/ke-khai` và `/api/public/*` không còn được Cloudflare WAF/rate
  limiting/Turnstile-bypass-check bảo vệ ở lớp origin — đúng thứ hàng rào này sinh ra để ngăn. Chấp
  nhận được vì Turnstile (kiểm ở tầng ứng dụng) vẫn hoạt động độc lập, và mục đích chỉ là chủ dự án
  tự test, không phải mở cho công chúng.
- **Bắt buộc:** Xóa biến này khỏi Vercel ngay khi có domain thật gắn Cloudflare. Không để sót qua
  giai đoạn pilot dữ liệu thật.
- **Người quyết định:** Chủ dự án (2026-07-22, xác nhận qua lựa chọn "mở khóa tạm thời để test");
  Claude Code triển khai.

## [2026-07-21] Hàng chờ cán bộ đọc từ PUBLIC_SUBMISSIONS, không chuyển dữ liệu sớm

- **Quyết định:** Trang `/submissions` chỉ đọc và phân loại khu vực chờ `PUBLIC_*`; thao tác claim,
  yêu cầu bổ sung và từ chối thay đổi trạng thái bản kê khai nhưng không sửa `draft_json` gốc.
- **Lý do:** Giữ ranh giới dữ liệu chưa kiểm chứng với `CASES`, đồng thời cho phép cán bộ xử lý
  trước khi bảng mã trường 12 chính thức sẵn sàng.
- **Đánh đổi:** Tiếp nhận thành `CASE` và xem ảnh preview chỉ được bật sau migration file preview,
  schema chính thức và health check danh mục; không biến nút UI thành một "duyệt" pháp lý sớm.

---

## [2026-07-21] Google My Drive cá nhân thay vì Shared Drive tổ chức

- **Quyết định:** Lưu ảnh gốc/preview trong Google My Drive cá nhân của tài khoản `anmphongandn@gmail.com`, không dùng Google Workspace Shared Drive hay service account.
- **Lý do:** Triển khai nhanh cho bản thử nghiệm; service account không thể sở hữu file trong My Drive cá nhân nên bắt buộc dùng OAuth offline của một tài khoản người dùng thật.
- **Đánh đổi:** Đây là ngoại lệ có chủ đích, không phải kiến trúc vận hành lâu dài — phụ thuộc vào một tài khoản cá nhân, giới hạn quy mô ~500 hồ sơ, cần migration riêng khi mở rộng (xem mục "Nâng cấp" dưới).
- **Người quyết định:** Chủ dự án (ghi trong tài liệu gốc trước khi có AI brain).

## [2026-07-21, SUPERSEDED 2026-07-23] Google Sheets thay vì PostgreSQL

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

## [2026-07-21] Thu cặp ảnh CCCD cho từng cá nhân và đọc QR từ ảnh tải lên

- **Quyết định:** Mỗi cá nhân có một cặp CCCD mặt trước/mặt sau, tối đa mười cá nhân mỗi bản kê khai. Sau đồng ý và tạo nháp, người kê khai tải ảnh ngay tại bước đầu; QR được đọc hoàn toàn trên thiết bị từ các ảnh này, không mở luồng quét camera hoặc OCR riêng.
- **Lý do:** Mặt sau thẻ căn cước đời mới có QR; thu đủ cặp giúp cán bộ đối chiếu mà giảm nhập lại họ tên, CCCD, ngày sinh, giới tính và thường trú.
- **Đánh đổi:** Thu thập thêm dữ liệu nhạy cảm, cần cặp ảnh và xác nhận người dùng trước khi tiếp tục. QR không đọc được thì các trường nhận dạng bắt buộc phải nhập tay.
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
- **Hiện trạng:** bản demo dùng mã loại đất quốc gia tại Mục A, Phụ lục II Thông tư
  08/2024/TT-BTNMT. Các mã nguồn gốc/hình thức/thời hạn là mã chuẩn hóa nội bộ và vẫn phải map với
  danh mục trao đổi dữ liệu của VPĐKĐĐ trước khi vận hành chính thức.
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

## [2026-07-21] Retry tạo bản kê khai dùng định danh và mã HMAC ổn định

- **Quyết định:** `POST /api/public/submissions` bắt buộc UUID v4 `idempotency-key`; server
  namespace key trong `REQUEST_LOG`, dùng HMAC với secret/pepper phía server để suy ra ổn định
  `submission_id`, mã tiếp nhận và mã bí mật. `PUBLIC_SUBMISSIONS` và `REQUEST_LOG` được append
  cùng một Sheets batch; mã bí mật rõ không được lưu. Client giữ key trong `sessionStorage`, tự
  retry một lần và dùng lại key khi người dùng bấm lại. Request chồng nhau trong cùng instance
  dùng chung một tác vụ đang chạy.
- **Lý do:** Trên mạng 5G/tunnel, backend có thể đã ghi Drive/Sheets nhưng response không về tới
  điện thoại. Nếu mỗi retry sinh mã mới, người dân bị kẹt không nhận được mã và hệ thống tạo hồ
  sơ trùng.
- **Đánh đổi:** Tạo nháp cần thêm một lượt đọc `REQUEST_LOG` và metadata Sheets trước batch. Route
  được cấp tối đa 30 giây, client chờ 35 giây. Google Sheets không có unique constraint nên vẫn
  còn cửa sổ race rất nhỏ nếu cùng key đồng thời đi vào nhiều serverless instance; định danh HMAC
  ổn định và khóa trong-instance giảm hậu quả, cần đánh giá lại khi vượt quy mô pilot.
- **Người quyết định:** Codex, theo yêu cầu sửa lỗi của chủ dự án.

## Hướng nâng cấp đã lường trước (không phải quyết định "làm ngay")

Ghi lại để agent không tự ý triển khai sớm, nhưng biết kiến trúc đã chừa chỗ:

- Migration sang Google Workspace Shared Drive: sao chép file, cập nhật `drive_file_id`, giữ nguyên `file_id`/`case_id`, đối chiếu checksum/audit theo lô.
- OCR Google Vision: lưu raw OCR JSON, parser versioning, queue, retry — sheet `OCR_FIELDS` đã tạo sẵn nhưng chưa dùng.
- Dữ liệu thửa đất/tài sản: sheet `PARCELS`, `ASSETS` đã tạo sẵn nhưng chưa dùng.
- Chuyển Google Sheets → PostgreSQL khi quy mô/đồng thời vượt khả năng vận hành an toàn.
- Đối soát dân cư hoặc kết nối CSDL đất đai quốc gia — chỉ khi có thẩm quyền pháp lý và kênh kỹ thuật chính thức (role `POPULATION_MATCH_OFFICER` đã giữ chỗ).

---

## [2026-07-21] Saga tiếp nhận chính thức có checkpoint và khóa an toàn

- **Quyết định:** Tiếp nhận từ `PUBLIC_SUBMISSIONS` sang các tab hồ sơ chính thức dùng trạng thái
  `ACCEPTING` và checkpoint `accept_step`: `ID_RESERVED` → `CASE_FOLDER_READY` → `FILES_MOVED` →
  `RECORDS_WRITTEN` → `COMPLETED`. Điểm vào API đã có CSRF, role, version và idempotency key,
  nhưng bị khóa khi `REFERENCE_IS_PLACEHOLDER=true`.
- **Lý do:** Google Sheets và Drive không có giao dịch phân tán. Nếu request lỗi giữa các bước,
  retry phải tiếp tục tại checkpoint thay vì sinh mã hồ sơ, thư mục hoặc bản ghi chính thức trùng.
  Không được ghi dữ liệu thật bằng danh mục mã trường 12 tạm.
- **Đánh đổi:** Nút tiếp nhận chính thức chưa mở trong khi chờ danh mục mã được cơ quan phê duyệt
  và migration schema chuẩn hóa có backup. Cán bộ vẫn xem ảnh, đối chiếu và yêu cầu bổ sung được.
- **Người quyết định:** Codex, theo yêu cầu triển khai quy trình tiếp nhận của chủ dự án.

## [2026-07-22] `DESIGN.md` là nguồn thiết kế; áp theo mốc, không đổi cây route

- **Quyết định:** `DESIGN.md` (phong cách Cherry Gold Civic Glass) là nguồn chỉ dẫn giao diện của
  dự án. Áp dụng theo mốc như chính §18 của nó đề ra, bắt đầu bằng "M0 — Nền tảng thiết kế"
  (tokens, typography, button/input/card, responsive). **Không** đổi cây route sang `/app/...` và
  `/public/...` như §3 mô tả.
- **Lý do:** Token là thứ đổi một chỗ mà toàn bộ màn hình hiện có hưởng theo, nên làm trước là
  hiệu quả nhất. Ngược lại, cây route trong §3 khác hoàn toàn route đang chạy (`/ke-khai`,
  `/submissions`, `/api/public/*`) — đổi sẽ phá hợp đồng API, phá matcher của `proxy.ts` và phá cả
  cấu hình Cloudflare sắp đặt theo đường dẫn. `DESIGN.md` §7 cũng tự ràng buộc "không thay đổi
  schema/API/quy tắc nghiệp vụ chỉ để thuận tiện cho giao diện".
- **Đánh đổi:** Tài liệu thiết kế và cây route thực tế lệch nhau; ai đọc §3 phải biết đó là đích
  dài hạn chứ không phải hiện trạng. Đổi lại giữ được hệ thống đang chạy.
- **Người quyết định:** Chủ dự án (2026-07-22) giao áp `DESIGN.md`; Claude Code chọn phạm vi theo mốc.

## [2026-07-22] Quét QR chủ động bằng chụp một kiểu, không mở luồng video

> **ĐÃ THAY THẾ (2026-07-23, PLAN2 §5):** không còn chụp thêm ảnh thứ ba chỉ để quét QR. Nút
> **"Đọc lại QR từ ảnh đã tải"** dùng lại đúng hai ảnh CCCD người dân đã nộp (ảnh vừa chọn còn
> trong bộ nhớ; ảnh khôi phục sau khi tải lại trang lấy byte qua API `private, no-store` rồi giải
> mã trên thiết bị). Xem entry cùng ngày bên dưới.

- **Quyết định:** Khối thông tin từng chủ sử dụng có nút "Quét QR căn cước" mở camera **chụp một
  kiểu** (`<input type="file" capture="environment">`), giải mã tại chỗ rồi tự điền. **Không** mở
  luồng video quét liên tục kiểu app ngân hàng. Ảnh chụp ở bước này không được tải lên, chỉ tồn
  tại trong bộ nhớ trình duyệt đủ lâu để đọc mã.
- **Lý do:** Chủ dự án muốn thao tác quét chủ động, tiện hơn là phải tải ảnh rồi chờ đọc ngầm.
  Chụp một kiểu đạt được điều đó mà vẫn nằm trong quyết định [2026-07-21] "đọc QR từ ảnh, không mở
  luồng quét camera hoặc OCR riêng" — nên đây là làm rõ phạm vi, không phải đảo quyết định cũ.
  Không tải ảnh lên giữ đúng nguyên tắc thu thập tối thiểu: hệ thống đã có cặp ảnh CCCD nộp riêng,
  không cần thêm bản sao thứ ba của giấy tờ tùy thân.
- **Đánh đổi:** Người dân chụp thêm một kiểu ngoài hai mặt CCCD phải nộp. Đổi lại luồng quét không
  phụ thuộc kết quả tải ảnh, chạy được cả trên máy tính, và không cần xin quyền camera thường trực.
- **Người quyết định:** Chủ dự án (2026-07-22), Claude Code triển khai.

## [2026-07-22] Token Turnstile đã dùng chỉ mở đường replay, không mở đường tạo mới

- **Quyết định:** `POST /api/public/submissions` phân biệt hai kiểu Turnstile trượt. Token giả →
  từ chối thẳng. Token đã dùng (`timeout-or-duplicate`) → cho request đi tiếp nhưng **chỉ** tới
  nhánh trả lại kết quả cũ theo idempotency key; nếu không có bản nháp cũ thì từ chối
  (`StaleChallengeError`), tuyệt đối không tạo bản kê khai mới.
- **Lý do:** Token Turnstile dùng một lần, còn luồng tạo nháp cố ý retry cùng idempotency key trên
  mạng yếu (quyết định 2026-07-21). Nếu chặn thẳng token trùng thì chính lần retry cứu người dân
  khỏi mất mã lại bị 403 — hỏng đúng bản sửa lỗi trước đó. Nếu ngược lại cho token trùng đi tự do
  thì một token giải một lần dùng được mãi.
- **Đánh đổi:** Thêm một nhánh trạng thái trong route tạo nháp. Đổi lại giữ được cả hai tính chất:
  chống bot ở lần tạo thật, và retry không sinh hồ sơ trùng.
- **Người quyết định:** Claude Code, khi triển khai lớp biên (Phase A).

## [2026-07-22] Chốt chặn lớp biên đặt ở route, không đặt ở middleware

- **Quyết định:** Kiểm `ORIGIN_SHARED_SECRET` tại ba điểm trong Node runtime —
  `resolvePublicRequest`, route tạo nháp, và trang `/ke-khai` — thay vì mở rộng matcher của
  `src/proxy.ts`.
- **Lý do:** `PLAN_NL` §10.1 cảnh báo sửa matcher là thay đổi rủi ro hai chiều (đá nhầm người dân
  về trang đăng nhập, hoặc mở nhầm route cán bộ). Ngoài ra Edge runtime không có `timingSafeEqual`
  của Node. Next.js cũng bắt buộc `matcher` là literal tĩnh nên không tách hằng số dùng chung được.
- **Đánh đổi:** Route công khai mới có thể quên gắn chốt chặn. Bù lại bằng
  `tests/public-surface-guard.test.ts`: test tự liệt kê mọi `route.ts` dưới `src/app/api/public`
  và đỏ nếu file nào không đi qua chốt chặn.
- **Người quyết định:** Claude Code, khi triển khai lớp biên (Phase A).

## [2026-07-22] Gói A dùng mã tiếp nhận + mã bí mật và cho quản trị viên cấp lại mã

- **Quyết định:** Người dân tra cứu/tiếp tục bằng đúng hai mã; sai 5 lần khóa 15 phút. Cookie v2
  mang định vị dòng và `access_version`. Chỉ `WARD_ADMIN`/`SYSTEM_ADMIN` được cấp lại mã sau khi
  đối chiếu trực tiếp giấy tờ; cấp lại làm mất hiệu lực mọi phiên cũ.
- **Lý do:** Phiên trình duyệt 2 giờ không đủ cho kê khai thực tế, nhưng tra cứu chỉ bằng CCCD/số
  điện thoại tạo nguy cơ dò dữ liệu. `access_version` giải quyết thu hồi phiên mà không lưu mã rõ.
- **Đánh đổi:** Người dân phải giữ hai mã; trường hợp mất mã cần đến phường xác minh trực tiếp.
- **Người quyết định:** Chủ dự án và Codex, theo các quyết định đã chốt trong Gói A.

## [2026-07-23 — ĐÃ SỬA, xem entry đầu file] Đối chiếu GCN cũ bằng thông tin định danh, không buộc tải ảnh CCCD

> ⚠️ **Entry này đã lỗi thời một phần.** Cùng ngày 2026-07-23, khóa khớp mô tả dưới đây (CCCD + họ
> tên + ngày sinh) bị **thay bằng khóa CCCD-đơn**, và điều kiện "đã xác nhận/nhập đầy đủ" bị thay
> bằng **bắt buộc `QR_CONFIRMED`**. Lý do và chi tiết code nằm ở entry đầu tiên của file này ("Khóa
> tra 'hồ sơ đã có' = CCCD, BỎ ngày sinh; tra nhanh bắt buộc QR"). Giữ lại entry này vì phần còn lại
> (bỏ yêu cầu ảnh CCCD trước khi tra cứu, che số GCN, cảnh báo hồ sơ đang xử lý, `NO_ACTION_REQUIRED`)
> vẫn đúng.

- **Quyết định:** Bỏ điều kiện phải tải đủ ảnh CCCD mặt trước và mặt sau trước khi kiểm tra, liên
  kết GCN đã có hoặc kết thúc theo diện không cần nộp lại. ~~Ba thao tác chỉ chạy khi CCCD 12 số, họ
  tên và ngày sinh đã được người dân xác nhận/nhập đầy đủ; đối chiếu vẫn dùng HMAC của cả ba
  trường~~ (thay bằng khóa CCCD-đơn + bắt buộc QR, xem cảnh báo trên) và chỉ trả số GCN đã che +
  ngày cấp. Hồ sơ đang xử lý chỉ cảnh báo, không tự liên kết. Nếu toàn bộ GCN đã có thì kết thúc
  `NO_ACTION_REQUIRED`; nếu có GCN mới thì mỗi phiếu kê khai đúng một GCN, 1–10 ảnh là các trang của
  GCN đó.
- **Lý do:** Khi kiểm thử thực tế, người dân đã tải đủ hai ảnh nhưng vẫn bị chặn tra cứu. Ảnh CCCD
  phục vụ QR và là tài liệu bắt buộc khi nộp GCN mới, không phải bằng chứng cần thiết để tìm trong
  dữ liệu đã chuẩn hóa.
- **Đánh đổi:** Không dùng cặp ảnh làm rào cản phụ cho tra cứu. Bù lại, hệ thống vẫn đòi phiên công
  khai, CSRF, khóa idempotency, và không lộ số GCN đầy đủ; rate limit/WAF ở lớp biên vẫn phải được
  cấu hình trước khi mở công khai.
- **Người quyết định:** Chủ dự án (2026-07-23).

## [2026-07-22] Bỏ lần chụp QR riêng; dùng ảnh CCCD mặt sau đã nộp

- **Quyết định:** Quyết định "Quét QR chủ động bằng chụp một kiểu" ở trên được thay thế. Hai ô tải
  CCCD mặt trước/mặt sau được đưa lên đầu phần cá nhân; ảnh mặt sau vừa lưu hồ sơ vừa đọc QR trên
  thiết bị, không có lần chụp thứ ba.
- **Lý do:** Người dân không phải tải/chụp CCCD hai lần và luồng trên điện thoại ngắn hơn.
- **Đánh đổi:** QR chỉ được đọc sau khi người dùng chọn ảnh mặt sau, nhưng vẫn có nhập tay dự phòng.
- **Người quyết định:** Chủ dự án.

## [2026-07-22 — THAY THẾ bởi `VietnameseDateInput` 2026-07-23] Ngày cấp GCN cho phép gõ trực tiếp

- **Quyết định (lịch sử):** Ô ngày cấp nhận `ngày/tháng/năm` gõ tự do một ô, kiểm tra ngày thật rồi
  chuẩn hóa về ISO để lưu.
- **Thay thế:** Xem entry `VietnameseDateInput` bên dưới — ba ô số riêng Ngày/Tháng/Năm, dùng chung
  cho cả ngày sinh và ngày cấp GCN, chặn thêm khoảng năm hợp lý và ngày tương lai.
- **Người quyết định:** Chủ dự án.

## [2026-07-23] `VietnameseDateInput` — ba ô số Ngày/Tháng/Năm, năm cấp GCN từ 1987

- **Quyết định:** Thay `<input type=date>` (ngày sinh) và ô gõ tự do một chuỗi (ngày cấp GCN, xem
  entry lịch sử trên) bằng một component dùng chung: ba ô số riêng Ngày/Tháng/Năm, bàn phím số,
  không mở lịch. Năm sinh cho phép từ **1900**; năm cấp GCN cho phép từ **1987**. Cả hai chặn ngày
  không tồn tại (31/2, năm nhuận) và không cho ngày trong tương lai.
- **Lý do:** Gõ tự do dễ sai định dạng — PL3 mẫu có `9/10/1017` (năm 1017, lỗi gõ của 2017) lọt vào
  file mẫu chính thức. Lịch gốc (`type=date`) trên điện thoại bắt cuộn ngược hàng chục năm cho ngày
  sinh, rất khó dùng. Ba ô số lấy được cả tốc độ bàn phím số lẫn chuẩn hóa `YYYY-MM-DD`.
- **Đánh đổi:** Không có — cùng logic thuần (`vietnamese-date.ts`) dùng cho cả hai ô, có test riêng
  cho phần khó (ngày không tồn tại, năm nhuận, chặn tương lai, khoảng năm).
- **Người quyết định:** Chủ dự án (2026-07-23, chốt mốc năm 1987 cho GCN).

## [2026-07-24] Xóa cache JSON tra cứu GCN — Postgres đọc trực tiếp, không cần cache tĩnh nữa

- **Quyết định:** Migration Supabase (entry "Supabase PostgreSQL thay Google Sheets...") đổi
  `findExistingCertificates` sang truy vấn `public.public_lookup_index`/`public.existing_certificates`
  trực tiếp — cache JSON committed (`existing-certificates-index.json`, dựng theo entry "Tra cứu GCN
  đã có: chuyển sang cache JSON committed...") không còn được đọc ở đâu nữa. Xóa file JSON, hàm
  `lookupExistingCertificates`/kiểu `ExistingCertificatesIndex` trong `workflow.ts`, và chế độ
  `--emit-json`/`compute_index`/`build_index_json` trong `scripts/import_existing_certificates.py` —
  toàn bộ đường cache đã trở thành code chết sau khi runtime chuyển sang Postgres.
- **Lý do:** Cache JSON là giải pháp né việc Sheets không có index thật; Postgres có index
  (`existing_certificates_latest_idx`, `public_lookup_index_hmac_idx`) nên không còn lý do giữ một
  tầng cache tĩnh song song — giữ lại chỉ gây lệch dữ liệu (cache không tự cập nhật khi Sheets/Postgres
  đổi) mà không ai đọc.
- **Đánh đổi:** Không còn cách tra cứu GCN đã có mà không cần kết nối Postgres (trước đây cache JSON
  cho phép chạy hoàn toàn offline/không cần DB). Chấp nhận vì runtime vốn đã phụ thuộc Postgres cho
  mọi thao tác khác kể từ migration Supabase.
- **Ghi chú:** entry "Bỏ điều kiện bắt buộc ngày cấp GCN khi nạp dữ liệu Phụ lục 3" (2026-07-23,
  nới `INVALID_ISSUE_DATE` để không loại 665 dòng GCN thật thiếu ngày cấp) bị thất lạc khỏi file này
  trong lúc soạn migration Supabase — thay đổi code vẫn còn nguyên trong `import_existing_certificates.py`
  (issue_date cho phép rỗng), chỉ mục ghi chú bị mất theo.
- **Người quyết định:** Claude Code (dọn code chết theo yêu cầu chủ dự án sau khi review commit
  migration Supabase).

## [2026-07-26] Antigravity local station tạo AI draft GCN, cán bộ duyệt cuối

- **Quyết định:** Không gọi Gemini từ web app. Antigravity trên máy quản trị dùng
  `gemini-3.6-flash` để đọc đúng file `CERTIFICATE` trong manifest/checksum và trả JSON v2 có bằng
  chứng. Web app chỉ nhận kết quả qua worker API, kiểm schema/model/prompt/input fingerprint rồi
  cho cán bộ nạp trường `CLEAR` đang trống vào working payload.
- **Lý do:** Tận dụng khả năng đọc chữ đánh máy của Gemini nhưng giữ dữ liệu chính thức, kết luận
  nghiệp vụ và thao tác duyệt hoàn toàn cho cán bộ. CCCD vẫn chỉ đọc QR tại thiết bị.
- **Đánh đổi:** Tài khoản quản trị đồng bộ Drive có quyền rộng; `agent/AGENTS.md`/manifest chỉ giới
  hạn quy trình, không thể coi là chặn CCCD tuyệt đối. Giao diện luôn hiện `ADMIN_BROAD_ACCESS`.
- **CCCD/địa chỉ:** Địa chỉ là một trường duy nhất và sửa tự do. Sửa họ tên/CCCD/ngày sinh/giới tính
  sau QR cần lý do, giữ dấu vết QR và chuyển `QR_OVERRIDE_PENDING_REVIEW`; lookup tự động chỉ dùng
  `QR_CONFIRMED`.
- **Người quyết định:** Chủ dự án.

## [2026-07-26] Gia cố station AI sau review PR #5

- **Quyết định:** Result AI chỉ được nhập khi job đang `PROCESSING`, đúng `workerInstanceId` đã claim
  và lease chưa hết hạn. Claim bắt buộc idempotency key; lease hết hạn được reclaim nguyên tử có audit.
  Server revalidate manifest bằng join `public_files` trước claim và result. Job cũ/manifest sai được
  migration `202607260002` đưa `STALE`, có audit; thêm FK `ai_extraction_job_files.file_id` →
  `public_files.file_id` ở trạng thái `NOT VALID` để không phá dữ liệu lịch sử.
- **Bảo vệ dữ liệu:** Trước persist, server quét mọi chuỗi trong payload AI. Chuỗi giống CCCD 12 số bị
  từ chối fail-closed nên không thể đi vào `raw_json` hay `normalized_json`; kể cả số khác trùng mẫu thì
  cán bộ nhập/đối chiếu thủ công.
- **Lý do:** Đóng các đường bypass claim/lease, rollback STALE, replay sai kết quả và rò PII mà SOL nêu
  trong PR #5; vẫn giữ nguyên nguyên tắc AI chỉ tạo nháp, cán bộ duyệt mới thay đổi hồ sơ.

## [2026-07-26] Hoàn thiện idempotency STALE và truy nguyên evidence AI

- **Quyết định:** Khi claim/result phát hiện manifest hoặc input đã lỗi thời, transaction ghi đồng thời
  trạng thái `STALE`, audit và `REQUEST_LOG` có outcome `STALE`; retry cùng key trả nguyên `409`, không
  đọc lại job terminal. Mọi trường `CLEAR` phải có evidence và `evidence.fileId` phải thuộc manifest GCN
  đã revalidate; sai/thiếu evidence bị `BLOCKED` và kết quả cũ cũng không thể nạp vào working payload.
- **Lý do:** Bảo toàn idempotency đầy đủ và tính truy nguyên của từng giá trị AI trước khi cán bộ nạp nháp.

## Template cho entry mới

```
## [YYYY-MM-DD] Tiêu đề quyết định

- **Quyết định:** <mô tả>
- **Lý do:** <vì sao chọn hướng này>
- **Đánh đổi:** <cái gì bị đánh đổi>
- **Người quyết định:** <user / Claude / Codex>
```

## [2026-07-28] Quyền lập hồ sơ hộ dân hẹp hơn quyền đọc hàng đợi

`ASSISTED_INTAKE_ROLES` = `INTAKE_OFFICER`, `WARD_ADMIN`, `SYSTEM_ADMIN` — **không** dùng lại
`SUBMISSION_READ_ROLES`.

Quyền đọc hàng đợi và quyền tạo dữ liệu mới mang dấu vết "cán bộ đã nhập hộ" là hai chuyện khác
nhau: hồ sơ do cán bộ nhập được coi là đáng tin hơn hồ sơ hộ dân tự khai, nên quyền tạo nó phải
hẹp hơn quyền xem.

`REVIEW_OFFICER` bị loại có chủ đích. Vai trò đó thẩm định hồ sơ; cho cùng một người vừa nhập vừa
duyệt là bỏ mất chốt kiểm tra chéo duy nhất trong quy trình.

Giả định: `INTAKE_OFFICER` là cán bộ tiếp nhận tại bộ phận một cửa. Mã nguồn không mô tả nghiệp vụ
chi tiết hơn; nếu phường chốt khác, sửa đúng hằng số đó — trang và API đọc từ một chỗ.

## [2026-07-28] Tên tệp trong kho do máy chủ đặt, không nhận từ client

`uploads/initiate` trước đây ghép `body.fileName` vào tên tệp trên Drive và `public_files.file_name`.
Tên do máy ảnh sinh hay do người dân đặt thường mang số CCCD, họ tên, ngày giờ.

Trình duyệt của app đã gửi tên trung tính từ Phase 3, nhưng đó là biện pháp phía client. Ranh giới
tin cậy nằm ở route: ai gọi thẳng endpoint bằng `curl` cũng gửi được tên tùy ý. Nay máy chủ tự đặt
`{documentType}-{timestamp}-{8 ký tự ngẫu nhiên}.{đuôi theo mimeType đã kiểm}`; chỉ phần mở rộng
đã qua `canonicalImageMimeType` mới được dùng lại. Tên chính thức lúc tiếp nhận
(`buildOriginalFileNames`) không đổi.

## [2026-07-28] Dọn tệp mồ côi nghiêng về giữ lại, không nghiêng về xóa

`discardIfOrphan` trong complete route hỏi `repository.isDriveFileAdopted` trước khi xóa, và
`.catch(() => true)` — hỏi không được thì mặc định coi như **đã nhận**, tức là không xóa.

Đánh đổi không đối xứng: để sót một tệp thừa thì `scripts/audit-orphan-public-files.ts` dọn được và
chỉ mất ít dung lượng; xóa nhầm một tệp cơ sở dữ liệu đã nhận là hồ sơ trỏ vào Drive ID không còn
tồn tại, ảnh giấy tờ mất vĩnh viễn, và không ai phát hiện cho tới lúc cán bộ mở ra đối chiếu.

`isDriveFileAdopted` đọc mọi trạng thái kể cả `REPLACED`/`DELETED`: tệp đã bị thay vẫn là tệp từng
được nhận.

## [2026-07-28] Bảng số đo tải ảnh không có ô văn bản tự do nào

`public.public_upload_attempts` chỉ chứa số, enum và `submission_id`. Không có cột nào có thể chứa
tên tệp, CCCD, họ tên, điện thoại, user agent thô, Drive ID, URL upload hay IP — và
`clientUploadTelemetrySchema` là `strict()` với mọi trường thuộc danh mục đóng.

Lý do là hình dạng của rủi ro chứ không phải mức độ: một ô tự do trong bảng thống kê là chỗ dữ liệu
cá nhân lọt vào mà không ai nghĩ tới lúc rà soát, và một khi đã ghi thì không gỡ ra được.
`classifyPlatform` quy user agent về đúng bốn nhãn ngay tại chỗ, không bao giờ lưu chuỗi gốc — user
agent đầy đủ là dấu vân tay nhận dạng được thiết bị.

Số đo là best-effort ở cả hai đường ghi: metric hỏng không được làm hỏng lượt tải ảnh.
`uploadSizeBytes` cố ý lấy từ Drive đã xác minh, không tin số client gửi.

## [2026-07-28] Chế độ cán bộ hỗ trợ không có feature flag

Cờ phía client không bao giờ là hàng rào bảo mật — ai cũng đặt được biến trong bundle đã tải về.
Hàng rào thật là ba lớp máy chủ: proxy Edge, `requireActiveUser(ASSISTED_INTAKE_ROLES)` ở trang và
ở API, cộng CSRF. Thêm một cờ server chỉ tạo ảo giác về lớp bảo vệ thứ tư mà không thêm gì thật;
muốn tắt chế độ này thì thu hồi vai trò.

## [2026-07-28] Kill switch server-side cho chế độ cán bộ hỗ trợ, tách khỏi ASSISTED_INTAKE_ROLES

`OFFICER_ASSISTED_INTAKE_ENABLED` (mặc định `false`) là lớp thứ hai, độc lập với
`ASSISTED_INTAKE_ROLES`. Vai trò trả lời "ai được dùng"; cờ trả lời "tính năng có mở hay không" —
cả hai đều bắt buộc, kiểm theo đúng thứ tự vai trò trước rồi mới tới cờ (giữ nguyên 401/403 khi
người không đủ quyền gọi vào lúc cờ đang tắt, thay vì lộ ra một 503 không phân biệt được).

Đọc ở `loadPublicIntakeEnvironment()` (transform chuỗi `"true"` → `true`, mọi giá trị khác kể cả
thiếu biến → `false`), dùng ở cả `route.ts` (503 SERVICE_UNAVAILABLE khi tắt) và `page.tsx` (màn
hình "Chế độ chưa được bật"). Đây là cờ **server-side thuần túy** — không có biến `NEXT_PUBLIC_`
tương ứng, vì cờ client không bao giờ là hàng rào bảo mật (ai cũng đọc được bundle đã tải về).

## [2026-07-28] `receiptCode` không dùng được làm nhãn cho dữ liệu test — dùng số điện thoại

`deriveReceiptCode` sinh mã bằng HMAC từ `PUBLIC_SESSION_SECRET` + idempotency key ngẫu nhiên;
client không đặt được tiền tố. `scripts/cleanup-e2e-preview-data.ts` và tài liệu E2E vì vậy dùng
một số điện thoại dựng cố định (`E2E_TEST_PHONE`, mặc định `0912345678`) làm nhãn nhận diện dữ
liệu test thay cho "receipt prefix" — cùng mục đích, khác cơ chế.

## [2026-07-28] Script dọn dữ liệu E2E dò bảng con động, không liệt kê cứng tên bảng

`public_submissions` có khoảng 16 bảng con tham chiếu `submission_id`, phần lớn không có
`on delete cascade`. `cleanup-e2e-preview-data.ts` dò `information_schema.columns` để tìm mọi bảng
có cột `submission_id` rồi xóa theo kiểu thử-và-thử-lại (bảng nào xóa được thì xóa, còn vướng thì
để lại lượt sau) thay vì liệt kê cứng tên bảng — một migration sau này thêm bảng con mới sẽ tự
được script nhận ra, không cần sửa script.

## [2026-07-28] Đăng nhập E2E bằng mã hóa JWT trực tiếp, không tự động hóa Google OAuth

`tests/e2e/auth-helpers.ts` dùng `@auth/core/jwt`.`encode()` với `AUTH_SECRET` thật của preview để
tạo thẳng cookie phiên hợp lệ, thay vì Playwright tự động hóa màn hình chọn tài khoản Google (thuộc
domain `accounts.google.com`, ngoài tầm kiểm soát của test, và không nên lưu mật khẩu tài khoản
test thật trong CI). Cookie vẫn đi qua `requireActiveUser` thật ở server — không phải mock, không
làm yếu điều đang được kiểm.

## [2026-07-28] Logic tính toán của 2 script Phase 5 tách sang module thuần, test được không cần DB

`report-upload-performance.ts` → `upload-performance-stats.ts` (percentile, gộp nhóm, tỷ lệ nén).
`audit-orphan-public-files.ts` → `orphan-audit-support.ts` (phân tích tham số dòng lệnh, token xác
nhận). Không có Postgres/Drive thật trong môi trường CI hiện tại; tách phần thuần ra là cách duy
nhất kiểm được logic dễ sai nhất (percentile lệch, gộp nhầm nhóm, tính tỷ lệ nén trên mẫu thiếu số
đo) mà không cần hạ tầng đó. Phần chạm DB/Drive trong hai script gốc không đổi hành vi.

# Kế hoạch xây dựng cổng kê khai đất đai công khai

> Bản sửa sau rà soát kỹ thuật (Claude, 2026-07-21). Các mục đánh dấu **[CHẶN]** phải
> được xử lý xong trước khi viết code; **[CHỜ CHỦ DỰ ÁN]** cần người quyết định, không
> phải agent tự chốt.

---

## 0. Nguyên tắc cốt lõi và hạng mục chặn

### 0.1. Nguyên tắc không đổi

- **Người dân kê khai và tải giấy tờ mà không cần tài khoản.** Không bắt đăng nhập, không bắt
  đăng ký, không bắt xác thực định danh điện tử ở v1.
- **Cán bộ chỉ duyệt.** Cán bộ không nhập hộ, không sửa bản khai gốc của người dân.
- Đây là hai ràng buộc thiết kế, mọi phương án bên dưới phải phục vụ chúng.

### 0.2. [CHẶN] Hạng mục phải chốt trước khi code

| #      | Hạng mục                                                                  | Vì sao chặn                                                                                                                                                                                                                                                                                                                                                                                                                           | Ai quyết                                               |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| ~~B1~~ | ~~Cơ sở pháp lý thu thập PII từ công dân ẩn danh~~                        | **Đã gỡ (2026-07-21):** chủ dự án xác nhận việc thu thập nằm đúng thẩm quyền đã được phê duyệt trong khuôn khổ chiến dịch 180 ngày. **Vẫn phải ghi nguyên văn** cơ sở pháp lý, thời hạn lưu trữ và quy trình xóa/sửa vào `03-decisions.md` + thông báo bảo vệ dữ liệu hiển thị cho người dân (§10) — xác nhận miệng không thay thế được văn bản hiển thị trên cổng                                                                    | Chủ dự án đã xác nhận                                  |
| ~~B2~~ | ~~Gói Vercel / WAF~~                                                      | **Đã gỡ (2026-07-21):** dùng **Cloudflare** đứng trước Vercel cho toàn bộ lớp biên — WAF, rate limiting, Turnstile cùng một nhà. Xem §10.2                                                                                                                                                                                                                                                                                            | Chủ dự án đã chốt                                      |
| ~~B3~~ | ~~Kho lưu trạng thái rate limit~~                                         | **Đã gỡ (2026-07-21) — nhờ B2, không phải nhờ dung lượng.** B3 là câu hỏi "đếm request mỗi IP ở đâu", không liên quan tới kho lưu trữ. Cloudflare đếm ở edge nên ứng dụng **không cần thêm store**, giữ nguyên quy tắc không đổi stack. Các bộ đếm còn lại là **theo submission** (số lần nhập sai mã, số session upload) — nằm ngay trên dòng `PUBLIC_SUBMISSIONS` đang ghi, tần suất thấp, **không được** vì chúng mà thêm Redis/KV | Chủ dự án đã chốt                                      |
| B4     | Kích hoạt `PARCELS`/`ASSETS` và 9 trường Phụ lục 8 còn thiếu              | `AGENTS.md` §8 xếp đây vào "Nâng cấp **sau** thử nghiệm"; kế hoạch này kéo lên v1. Chi tiết và khuyến nghị ở §5.3                                                                                                                                                                                                                                                                                                                     | **Hướng đã rõ, còn 5 việc phải gỡ — §5.3 "Còn vướng"** |
| B4a    | **Xin bảng mã trường 12 từ Chi nhánh VPĐKĐĐ Phú Thọ / đơn vị thi công**   | Không có trong tài liệu hiện có. Chặn P4/P5. AI **không được** tự sinh danh mục                                                                                                                                                                                                                                                                                                                                                       | **[CHỜ CHỦ DỰ ÁN]**                                    |
| B4b    | **Định nghĩa phân nhóm A/B/C/E** (KH 247/KH-UBND ngày 30/6/2026 của tỉnh) | Chiến dịch tổ chức nhiệm vụ theo A/B/C/E; hệ thống chỉ biết Loại 4/5. Ảnh hưởng schema và dashboard báo cáo                                                                                                                                                                                                                                                                                                                           | **[CHỜ CHỦ DỰ ÁN]**                                    |
| ~~B5~~ | ~~Cam kết vận hành gọi điện~~                                             | **Đã gỡ (2026-07-21):** cán bộ gọi điện cho người dân. Tham số vận hành ở §4.5                                                                                                                                                                                                                                                                                                                                                        | Chủ dự án đã chốt                                      |
| ~~B6~~ | ~~Ngân sách dung lượng Drive~~                                            | **Đã gỡ (2026-07-21):** tài khoản dùng gói 5 TB, không còn giới hạn 15 GB. Xem §6.1 — vẫn giữ downscale và ngân sách byte, nhưng vì lý do khác                                                                                                                                                                                                                                                                                        | Chủ dự án đã xác nhận                                  |

> Chỉ còn **B4**, và nó đã có khuyến nghị cụ thể ở §5.3 — chốt xong là bắt đầu code được.

### 0.3. Thay đổi phạm vi so với tài liệu đã chốt

Kế hoạch này **đảo ngược** hai điều đã ghi trong tài liệu gốc. Phải ghi entry quyết định vào
`docs/brain/03-decisions.md` và đồng bộ `AGENTS.md` + `PLAN.md` **trước khi code**, không phải
sau (xem §13):

1. `AGENTS.md` §2 ghi "Cung cấp dữ liệu cho người dân" là **ngoài phạm vi**; toàn hệ thống được
   định nghĩa chỉ dành cho cán bộ đã đăng nhập. Nay mở một bề mặt công khai không xác thực.
2. `AGENTS.md` §4.1 ghi `PARCELS`/`ASSETS` là tab tạo sẵn **chưa đưa vào quy trình**; `AGENTS.md`
   §8 xếp bộ trường thửa đất/tài sản vào nâng cấp sau pilot. Nay đưa vào v1.

---

## 1. Tóm tắt giải pháp

- Trang `/ke-khai`: người dân nhập dữ liệu và tải hồ sơ, **không cần tài khoản**.
- Một lần kê khai tương ứng một GCN, có thể gồm nhiều chủ sử dụng, thửa đất, mục đích sử dụng
  và tài sản.
- Người dân lưu nháp, nhận mã tiếp nhận `PC-KK-{NĂM}-{8 KÝ TỰ}` và mã bí mật 16 ký tự hiển thị
  một lần.
- Dữ liệu nằm trong khu vực chờ riêng (`PUBLIC_*`). Cán bộ chấp nhận mới tạo `CASE` chính thức
  ở trạng thái `UPLOADED` — đây là bước tiếp nhận, **chưa phải xác minh pháp lý**.
- V1 chỉ hỗ trợ trường hợp đã có GCN; chưa hỗ trợ Loại 5 hoặc nhiều GCN trong một lần kê khai —
  và **phải phát hiện, định tuyến** các trường hợp này ra quầy một cửa, không im lặng nhận bừa
  (§5.5).

---

## 2. Trình tự triển khai

**Không xây cổng công khai trước M3.** M3 (cán bộ tiếp nhận, QR, upload) và cổng công khai dùng
gần như cùng một bộ máy: initiate/complete resumable upload, đọc QR client-side, chuyển HEIC,
tạo preview, xác minh checksum/MIME/parent. Làm cổng công khai trước sẽ sinh **hai bản cài đặt
upload và hai đường xác minh file** — đúng chỗ lỗi bảo mật hay nằm.

Thứ tự bắt buộc:

1. **M3** — luồng cán bộ, xây các module dùng chung ngay từ đầu:
   - `modules/uploads` — initiate/complete resumable session, xác minh sau upload, cách ly file
     hỏng. Không biết gì về "case" hay "submission", chỉ nhận `targetFolderId` + ràng buộc.
   - `modules/media` — HEIC→JPEG, downscale, sinh preview, ở client.
   - `modules/qr` — đã có khung, giữ nguyên hợp đồng.
2. **M3.5 (kế hoạch này)** — cổng công khai đặt lên trên các module đó. Không được viết đường
   upload thứ hai.
3. M4 (kiểm tra, tra cứu, dashboard) hưởng lợi từ cả hai nguồn hồ sơ.

Nếu chủ dự án muốn làm song song thì vẫn phải chốt trước rằng ba module trên là dùng chung, và
M3 là bên định nghĩa hợp đồng.

---

## 3. Thiết kế giao diện

- **Design token nằm trong repo**, không phụ thuộc skill được cài ở máy nào. Tạo
  `src/app/tokens.css` (hoặc tương đương) là nguồn duy nhất cho màu, cỡ chữ, spacing, radius.
  Skill chỉ dùng lúc thiết kế; token thì sống cùng code.
  - Tham chiếu phong cách: skill `minimalist-ui` của
    [skill-viphuong](https://github.com/vi-phuong-158/skill-viphuong.git) trong Codex. **Trong
    Claude Code tên skill tương ứng là `minimalist-skill`** — không có skill tên `minimalist-ui`
    trong môi trường Claude.
- Chỉ một hệ thống thiết kế. Không trộn brutalist, Awwwards, GSAP, glassmorphism.
- Phong cách: dịch vụ công tối giản, nền `#F7F6F3`, mặt nhập liệu trắng, chữ than đậm, viền
  `#EAEAEA`, một màu nhấn xanh lục đậm kế thừa giao diện hiện tại.
- Font: **phải xác minh phủ tiếng Việt trước khi chốt Geist**. `next/font` cần nạp subset
  `vietnamese`; nếu thiếu, dấu rơi về font fallback và trang trông vỡ. Test bằng chuỗi
  `ệ ỹ ằ ẵ ợ ữ ẩ ộ`. Không đạt thì đổi font, không chấp nhận fallback.
- Cỡ chữ nội dung tối thiểu 16px, line-height rộng.
- Input cao tối thiểu 48px, nhãn luôn nằm trên trường, hướng dẫn bên dưới, lỗi ngay tại trường,
  focus ring rõ, đạt WCAG AA.
- Bo góc thống nhất: input/nút 6–8px, khối nội dung 12px. Không gradient, không bóng nặng, không
  nút pill lớn, không emoji.
- Mobile một cột. Desktop form bên trái, bảng tóm tắt/sticky progress bên phải. Không biến biểu
  mẫu thành lưới bento.
- Chuyển bước chỉ dùng opacity/transform 150–200ms; tắt hoàn toàn khi `prefers-reduced-motion`.
- Trạng thái lưu hiển thị rõ: "Đang lưu", "Đã lưu", "Chưa thể lưu", "Mất kết nối". Không dùng
  toast cho lỗi cần người dân xử lý.
- Trang chủ có hai đường đi rõ ràng: "Kê khai hồ sơ" và "Cán bộ đăng nhập". Không để người dân
  nhầm trang đăng nhập là bắt buộc.
- **Lối thoát hiện diện ở mọi bước:** khối "Không tự làm được? Mang giấy tờ đến UBND phường
  Phong Châu" kèm địa chỉ và giờ làm việc. Với dịch vụ công đây là thành phần bắt buộc, không
  phải tùy chọn.
- Playwright visual QA tại 320px, 390px, 768px, 1440px; **thêm kiểm tra font scaling 200%** (người
  cao tuổi) và assertion "không bao giờ có scroll ngang". Kiểm tra tương phản, focus, bàn phím,
  lỗi trường, không tràn chữ.

---

## 4. Biểu mẫu và luồng nghiệp vụ

### 4.1. Wizard

Thông báo dữ liệu và liên hệ → thông tin GCN → chủ sử dụng → thửa đất → loại đất → tài sản →
tải giấy tờ → kiểm tra và xác nhận.

- Thu đủ Phụ lục 8: mã đơn vị hành chính tự gán, số/ngày/số vào sổ GCN, chủ sử dụng và định danh,
  vai trò trên GCN, mã/số tờ/số thửa, địa chỉ hai cấp, diện tích, loại đất, nguồn gốc, hình thức,
  thời hạn, tài sản.
- Thu thêm **số điện thoại bắt buộc** để cán bộ liên hệ. v1 không gửi SMS/email tự động — liên hệ
  là gọi điện thủ công (xem B5).
- Cho phép 1-n chủ sử dụng, 1-n thửa, 1-n dòng sử dụng đất trên mỗi thửa, 0-n tài sản.

### 4.2. Trạng thái công khai

Enum đầy đủ, không có trạng thái ngầm:

```text
DRAFT → SUBMITTED → UNDER_REVIEW → ACCEPTING → ACCEPTED
                          ├→ NEEDS_SUPPLEMENT → RESUBMITTED → UNDER_REVIEW
                          └→ REJECTED
DRAFT | NEEDS_SUPPLEMENT → EXPIRED
```

Quy tắc bắt buộc:

- `ACCEPTING` là trạng thái thật, có trong enum, không phải cờ phụ. Chỉ saga chấp nhận đặt được.
- **Mọi write khác bị từ chối khi state = `ACCEPTING`** (kể cả `request-supplement`, `reject`,
  PATCH của người dân) — trả `INVALID_STATE`.
- Vào `ACCEPTING` phải là **compare-and-set trên `version`**: đọc version N → ghi
  `state=ACCEPTING` với điều kiện version vẫn là N. Đây là hàng rào duy nhất chống hai cán bộ
  cùng accept, hoặc accept đụng request-supplement.
- `EXPIRED` do **job thủ công/cron của `SYSTEM_ADMIN`** đặt, chỉ áp dụng cho `DRAFT` và
  `NEEDS_SUPPLEMENT` quá hạn. Submission `EXPIRED` **không accept được**; muốn xử lý phải mở lại
  về `NEEDS_SUPPLEMENT` (có audit).
- Sau khi gửi, bản khai bị khóa. Chỉ mở lại khi cán bộ yêu cầu bổ sung. `RESUBMITTED` khóa lại
  ngay.
- `claim` chuyển `SUBMITTED → UNDER_REVIEW` và gán cán bộ:
  - Bắt buộc claim trước khi `accept`/`reject`/`request-supplement`.
  - Cán bộ khác muốn thao tác phải claim lại (ghi audit chuyển giao); `WARD_ADMIN`/`SYSTEM_ADMIN`
    được cưỡng chế claim.
  - Claim tự hết hiệu lực sau 24 giờ không thao tác, submission quay về `SUBMITTED`.
- Cán bộ **không sửa bản khai gốc**. Sau khi tiếp nhận, hiệu chỉnh thực hiện trong `CASE` và ghi
  audit.

### 4.3. Truy cập lại

- Người dân nhập mã tiếp nhận + mã bí mật để xem trạng thái hoặc bổ sung.
- Server cấp cookie `HttpOnly`, `Secure`, `SameSite=Strict`, **sliding 2 giờ, trần tuyệt đối 12
  giờ**. Lý do đổi: 2 giờ cứng quá ngắn cho một biểu mẫu dài kèm upload 11 ảnh trên 4G yếu — hết
  hạn giữa chừng là mất công người dân. Hết hạn phải hiện trạng thái rõ "Phiên đã hết hạn, nhập
  lại mã", không im lặng mất dữ liệu.
- Không đưa PII hoặc secret vào URL, kể cả query string.

### 4.4. Chống mất hồ sơ do mất mã

Mã bí mật chỉ hiện một lần và v1 không có email/SMS: đóng tab là mất trắng.

- **Bắt xác nhận đã lưu mã trước khi cho upload file đầu tiên**: hiển thị mã, yêu cầu nhập lại
  nhóm ký tự cuối. Chưa xác nhận thì chưa mở bước tải giấy tờ.
- Cung cấp nút tải mã về dạng ảnh/văn bản và hướng dẫn chụp màn hình.
- Trang xác nhận nói rõ: mất mã thì phải đến UBND phường, không có cách khôi phục trực tuyến.

### 4.5. Kênh liên hệ — cán bộ gọi điện (B5 đã chốt)

v1 không gửi SMS/email tự động. Số điện thoại thu ở §4.1 dùng để **cán bộ gọi trực tiếp**. Đây là
mắt xích duy nhất khép kín vòng bổ sung hồ sơ, nên phải có tham số vận hành cụ thể chứ không chỉ
"cán bộ gọi".

Tham số **đề xuất** — sửa nếu phường có quy định khác:

- Sau khi cán bộ bấm `request-supplement`: gọi trong **01 ngày làm việc**.
- Gọi tối đa **03 lần** trong 05 ngày làm việc, mỗi lần cách nhau ít nhất nửa ngày.
- Không liên lạc được sau 03 lần: ghi nhận vào hồ sơ, giữ nguyên `NEEDS_SUPPLEMENT` tới hạn
  `EXPIRED`.
- Người gọi là **cán bộ đang claim hồ sơ** (§4.2) — claim vừa là khóa kỹ thuật vừa là phân công
  trách nhiệm liên hệ, không tách hai thứ này.

Yêu cầu kỹ thuật kéo theo:

- Màn hình chi tiết hồ sơ có nút hiện số điện thoại đầy đủ (mặc định che `09••••••89`), **mỗi lần
  hiện ghi audit** — số điện thoại là PII như CCCD (§10).
- Ghi nhận lượt gọi: thêm hành động `CONTACT_ATTEMPTED` vào audit kèm kết quả
  (`ĐÃ_LIÊN_LẠC | KHÔNG_NGHE_MÁY | SAI_SỐ`). Không có trường này thì không ai biết đã gọi mấy lần.
- Hàng chờ cán bộ hiển thị **số ngày ở trạng thái `NEEDS_SUPPLEMENT`** và số lần đã gọi, sắp xếp
  được theo cột đó — nếu không thì hồ sơ chờ bổ sung sẽ chìm dưới đáy danh sách.

---

## 5. Dữ liệu

### 5.1. Bảng mới

Migration idempotent tạo `PUBLIC_SUBMISSIONS`, `PUBLIC_CERTIFICATES`, `PUBLIC_OWNERS`,
`PUBLIC_PARCELS`, `PUBLIC_LAND_USES`, `PUBLIC_ASSETS`, `PUBLIC_FILES`.

Tách `PUBLIC_*` khỏi sheet chính thức là đúng: dữ liệu chưa kiểm chứng không nằm chung hồ sơ
chính thức, thời hạn lưu trữ khác nhau, và nó thực thi được nguyên tắc "cán bộ không sửa bản
khai gốc".

`PUBLIC_SUBMISSIONS` lưu: trạng thái, điện thoại, `version`, HMAC mã bí mật, số lần truy cập sai,
thời điểm khóa, phiên bản thông báo dữ liệu, thời điểm đồng ý, hạn lưu trữ, `official_case_id`,
`drive_folder_id`, **`accept_step`** (checkpoint saga, §8), cán bộ đang claim và thời điểm claim.

### 5.2. [CHẶN] Migration cột trên tab đang có

Mở rộng `CASES`, `CERTIFICATES`, `OWNERS`, `PARCELS`, `ASSETS` và thêm `LAND_USES`. Không xóa cột
hoặc dữ liệu cũ. Tạo tab mới thì dễ; **mở rộng tab đang có mới là phần rủi ro**:

- Cột mới **chỉ được append vào cuối**, tuyệt đối không chèn giữa — code đọc theo chỉ số cột sẽ
  hỏng dữ liệu âm thầm.
- `GET /api/health/google` phải so **cả thứ tự header**, không chỉ sự tồn tại của tên cột.
- Code phải chịu được cột chưa có (deploy code trước migration hoặc ngược lại đều không được vỡ).
- Backup/export toàn bộ Sheets **trước** migration, và verify bản backup đọc được.
- Thêm `source_submission_id` vào `CASES` để từ hồ sơ chính thức tra ngược về bản khai gốc.

### 5.3. [B4] Bộ trường Phụ lục 8 — hiện trạng, khoảng trống và khuyến nghị

Nguồn: `Tai lieu/Phụ lục 8.docx` — **"Bảng trường thông tin dữ liệu bắt buộc (checklist kiểm tra
nhanh cấp xã)"**, gồm đúng **15 trường**.

> **Đính chính phạm vi:** ghi chú cuối Phụ lục nói rõ bản đầy đủ **50 trường** theo Phụ lục 02
> Hướng dẫn kỹ thuật của Cục Quản lý đất đai là do **Chi nhánh VPĐK/đơn vị thi công** lưu giữ và
> nhập liệu chính thức — **không phải việc của cấp xã**. `AGENTS.md` §8 đang ghi "bộ 15 rồi 50
> nhóm trường nghiệp vụ" khiến người đọc tưởng hệ thống này phải tiến tới 50. Phải sửa lại: mục
> tiêu của hệ thống là **15 trường, dừng ở đó**.

Bảng này là **checklist để cán bộ xác nhận**, không phải biểu mẫu thiết kế cho người dân. Vì vậy
B4 không phải câu hỏi "thu bao nhiêu trường" mà là **"ai điền trường nào"**.

#### Hiện trạng

Hệ thống đang phủ 6/15 trường. `PARCELS` và `ASSETS` trong `src/modules/bootstrap/schema.ts` mới
chỉ có `id + case_id + timestamps` — vỏ rỗng.

| #   | Trường                                   | Yêu cầu              | Hiện có               | Ai điền (đề xuất)                            |
| --- | ---------------------------------------- | -------------------- | --------------------- | -------------------------------------------- |
| 1   | Mã đơn vị hành chính cấp xã              | Bắt buộc             | ✗                     | **Hệ thống** (hằng số Phong Châu)            |
| 2   | Số phát hành GCN                         | Bắt buộc             | ✅                    | Người dân                                    |
| 3   | Ngày cấp GCN                             | Bắt buộc             | ✅                    | Người dân                                    |
| 4   | Số vào sổ GCN                            | Bắt buộc             | ✅                    | Người dân                                    |
| 5   | Tên chủ sử dụng/tổ chức                  | Bắt buộc             | ⚠️ thiếu loại chủ thể | Người dân                                    |
| 6   | CCCD/số định danh tổ chức                | Bắt buộc             | ⚠️ chỉ cá nhân        | Người dân (QR gợi ý)                         |
| 7   | Pháp nhân và vai trò trên GCN            | Bắt buộc             | ✗                     | Người dân, cán bộ xác nhận                   |
| 8   | Mã định danh thửa đất                    | **Nếu có**           | ✗                     | **Cán bộ** (dân không có)                    |
| 9   | Số tờ bản đồ, số thứ tự thửa             | **Tuỳ trường hợp**   | ✗                     | Người dân, cho phép trống                    |
| 10  | Địa chỉ thửa đất (02 cấp)                | Bắt buộc             | ✗                     | Người dân                                    |
| 11  | Diện tích thửa đất                       | Bắt buộc             | ✗                     | Người dân                                    |
| 12  | Loại đất, nguồn gốc, hình thức, thời hạn | Bắt buộc             | ✗                     | Người dân khai, **cán bộ bắt buộc xác nhận** |
| 13  | Tài sản gắn liền với đất                 | **Nếu có**           | ✗                     | Người dân                                    |
| 14  | Tên file PDF theo số phát hành           | Bắt buộc             | ✗                     | **Hệ thống** (§6.4)                          |
| 15  | Phân loại Loại 4/Loại 5                  | Bắt buộc khi định vị | ✗                     | **Hệ thống** (v1 = Loại 4 hằng số)           |

#### Khuyến nghị

**Làm đủ 15 trường ở v1**, với phân công như cột cuối. Lý do: gần như toàn bộ đều **đọc thẳng
được trên bìa GCN**, nên người dân trả lời được; và nếu v1 chỉ thu ảnh + vài trường định danh thì
dữ liệu cấu trúc gần như bằng không, không phục vụ được mục tiêu xây CSDL của chiến dịch — sau đó
phải quay lại xin dân khai lại.

Bốn ràng buộc kèm theo:

1. **Trường 12 là trường duy nhất người dân dễ sai.** "Nguồn gốc sử dụng" (Nhà nước giao có thu
   tiền / công nhận QSDĐ / thuê...) và "hình thức sử dụng" là thuật ngữ chuyên ngành, in chữ nhỏ
   trên GCN. Xử lý: người dân **chọn từ danh sách** (không gõ tự do), kèm ảnh minh họa chỉ chỗ
   trên bìa GCN; và cán bộ **bắt buộc tick xác nhận trường 12** trước khi accept — không cho
   accept nếu chưa xác nhận.
2. **Danh mục mã cho trường 12 phải lấy từ văn bản gốc**, không để AI tự nghĩ ra. Nguồn: chính
   Phụ lục/Thông tư hiện hành. Seed vào `REFERENCE_DATA` với `category` riêng
   (`LAND_PURPOSE`, `LAND_ORIGIN`, `LAND_USE_FORM`, `LAND_USE_TERM`).
3. **`owner_type` là bắt buộc, không phải tùy chọn** — trường 5 và 6 nói rõ "tổ chức", trường 7
   nói "pháp nhân và vai trò". Giá trị: `CA_NHAN | HO_GIA_DINH | VO_CHONG | TO_CHUC`. CCCD không
   bắt buộc với `TO_CHUC` (dùng số định danh tổ chức) và `HO_GIA_DINH` (dùng người đại diện).
4. **Trường 15 trong v1 luôn là "Loại 4 — đã có GCN".** Hồ sơ Loại 5 bị định tuyến ra quầy một
   cửa ngay từ bước đầu (§5.5). Không cần UI cho Loại 5.

#### Sửa so với bản trước kế hoạch này

- **Diện tích theo từng dòng loại đất: hạ từ bắt buộc xuống tùy chọn.** Phụ lục 8 trường 11 chỉ
  yêu cầu **diện tích thửa**. Yêu cầu tách diện tích theo từng mục đích là chặt hơn quy định và
  làm form dài thêm không cần thiết. Vẫn giữ validation "tổng ≤ diện tích thửa" nhưng chỉ áp dụng
  khi người dân có nhập.
- **Số tờ/số thửa cho phép trống là đúng quy định**, không phải nới lỏng: Phụ lục ghi nguyên văn
  "tuỳ trường hợp xác định được trên bản đồ".

#### Quan hệ dữ liệu

1-n chủ / 1-n thửa / 1-n dòng loại đất trên mỗi thửa / 0-n tài sản. Chủ sử dụng gắn vào **GCN**
kèm trường `vai_tro` (trường 7), **không** gắn theo từng thửa. Trường hợp mỗi thửa một tỷ lệ sở
hữu khác nhau: định tuyến ra quầy một cửa.

#### Còn vướng — 5 việc phải gỡ trước khi dựng biểu mẫu

Đã rà cả `Tai lieu/Phụ lục 8.docx` và `Tai lieu/UB - KH chiến dịch 180 ngày...pdf`. Năm việc dưới
đây **không tài liệu nào đang có trả lời được**:

**V1. [CHẶN P4/P5] Danh mục mã của trường 12 không tồn tại trong tài liệu hiện có.**
Phụ lục 8 chỉ ghi tên trường "Loại đất, nguồn gốc, hình thức, thời hạn sử dụng", không kèm bảng
mã. Kế hoạch chiến dịch cũng không có. Nguồn thật là Luật Đất đai 2024 và thông tư về hồ sơ địa
chính — **phải xin bản danh mục chính thức từ Chi nhánh VPĐKĐĐ Phú Thọ hoặc đơn vị thi công**
(họ giữ Phụ lục 02 đầy đủ 50 trường nên chắc chắn có bảng mã).
→ Không có danh mục thì không dựng được select box, mà đây lại là trường bắt buộc.
**Tuyệt đối không để AI tự sinh danh sách mã** — đây là rủi ro dữ liệu lớn nhất của cả dự án:
sai mã thì toàn bộ hồ sơ đã thu phải nhập lại, và lỗi này không lộ ra khi test.

**V2. Phân nhóm A/B/C/E chưa được mô hình hóa, định nghĩa nằm ở tài liệu ta không có.**
Phụ lục 1 của kế hoạch chiến dịch tổ chức nhiệm vụ 3–7 theo **"các nhóm A, B, C, E"** (nhiệm vụ
3: phân loại; 4: Nhóm A; 5: Nhóm B; 6: Nhóm C; 7: Nhóm E). Hệ thống hiện chỉ biết Loại 4/Loại 5
của Phụ lục 8 — **hai hệ phân loại khác nhau**. Định nghĩa A/B/C/E nằm ở `Kế hoạch số
247/KH-UBND ngày 30/6/2026 của UBND tỉnh`, không có trong repo.
Cần trả lời: hồ sơ người dân kê khai qua cổng thuộc nhóm nào (nhiều khả năng **Nhóm C** — nhiệm
vụ 6 "Tổ chức kê khai, đăng ký đất đai; xác minh nguồn gốc"), và **báo cáo tiến độ chiến dịch có
tính theo A/B/C/E không**. Nếu có mà hệ thống không lưu trường phân nhóm thì dashboard không dùng
được để báo cáo lên trên — phải thêm ngay từ migration, không chắp vá sau.

**V3. Nội hàm trường 7 "Pháp nhân và vai trò pháp nhân trên GCN" chưa rõ.**
Tôi ánh xạ thành `owner_type` + `vai_tro`, nhưng đó là **suy đoán từ tên trường**. "Vai trò pháp
nhân" nhận những giá trị nào (chủ sử dụng / đồng sử dụng / người đại diện hộ / ...)? Cần người am
hiểu nghiệp vụ xác nhận. AI đoán sai ở đây thì cả cột dữ liệu vô nghĩa.

**V4. Trường 10 "địa chỉ 02 cấp" xung đột với địa chỉ in trên GCN cũ.**
Sau sáp nhập 2025, địa chỉ hai cấp là tỉnh/xã. Nhưng GCN cấp trước đó in địa chỉ **ba cấp với
địa danh cũ**. Người dân nhìn bìa GCN sẽ gõ theo địa danh cũ.
→ Đề xuất: lưu **cả hai trường** — `dia_chi_tren_gcn` (nguyên văn như in trên bìa, người dân
nhập) và `dia_chi_hai_cap` (chuẩn hóa mới, cán bộ chuẩn hóa khi duyệt). Chỉ lưu một thì mất khả
năng đối chiếu ngược với bìa gốc. **Kế hoạch trước chỉ có một trường — đây là thiếu sót thật.**

**V5. Chưa biết tỷ lệ GCN nhiều thửa ở Phong Châu.**
UI thửa lặp lại (1-n) tốn đáng kể công sức và là phần dễ sinh lỗi nhất của biểu mẫu. Nếu phần lớn
GCN chỉ có một thửa thì nên tối ưu cho một thửa, "thêm thửa" là đường phụ ẩn bớt.
→ Đếm trên ~30 GCN thật trước khi chốt thiết kế bước 4 của wizard. Việc này gộp chung với việc
đối chiếu 15 trường ở P4.

#### Tin tốt cho migration

`PARCELS` và `ASSETS` hiện **rỗng** (chỉ có header, chưa có dòng nào), nên thêm cột vào hai tab
này gần như không rủi ro. Phần rủi ro của P1 chỉ còn ở `CASES`, `CERTIFICATES`, `OWNERS` — ba tab
đã có dữ liệu thật từ M1/M2.

### 5.4. Mã tiếp nhận và mã bí mật

- Mã tiếp nhận `PC-KK-{NĂM}-{8 KÝ TỰ}`:
  - `NĂM` tính theo `Asia/Ho_Chi_Minh` — cùng quy tắc với Case ID
    (`docs/brain/03-decisions.md`), không dùng UTC của Vercel.
  - 8 ký tự **ngẫu nhiên**, không tuần tự. Tuần tự làm lộ tổng số hồ sơ và cho phép dò.
  - Bảng chữ Crockford base32, **bỏ ký tự dễ nhầm** (`0/O`, `1/I/L`) vì mã sẽ được đọc qua điện
    thoại. Thêm một ký tự kiểm tra.
- Mã bí mật 80 bit ngẫu nhiên, hiển thị theo nhóm dễ nhập, **chỉ lưu HMAC**:
  - HMAC-SHA256 + pepper phía server là đủ (80 bit ngẫu nhiên không có rủi ro từ điển, không cần
    KDF chậm). So sánh constant-time.
  - Pepper là **biến môi trường riêng** `PUBLIC_ACCESS_CODE_PEPPER`, không dùng chung
    `DATA_HASH_PEPPER`. Ghi vào runbook: xoay pepper sẽ vô hiệu **toàn bộ** mã bí mật đang lưu
    hành — chỉ làm khi có quy trình cấp lại.
- Khóa truy cập: **Cloudflare đã chặn dò mã theo IP ở edge** (10 req/10 phút trên
  `/api/public/submissions/access`, §10.2), nên bộ đếm trong ứng dụng chỉ còn là lớp phòng thủ
  thứ hai — **nới thành 10 lần sai / khóa 15 phút, đếm theo submission**.
  - Đếm theo submission là chấp nhận được **chỉ vì** có Cloudflare ở trước; nếu vì lý do nào đó
    bỏ Cloudflare thì phải xem lại, vì khi đó người biết mã tiếp nhận có thể khóa chính chủ ra
    ngoài.
  - Bộ đếm nằm ngay trên dòng `PUBLIC_SUBMISSIONS` đang ghi. **Không thêm store riêng cho việc
    này.**

### 5.5. Định tuyến trường hợp ngoài phạm vi v1

Hỏi sớm ở bước đầu: số lượng GCN, số thửa trên GCN, có thuộc Loại 5 không. Nếu ngoài phạm vi thì
hiện đường "mang hồ sơ đến bộ phận một cửa" và **không cho tạo nháp**. Không có bước này, người
dân sẽ nhồi hai GCN vào một lần kê khai và dữ liệu hỏng âm thầm.

### 5.6. Ánh xạ tổ dân phố

`CASES.neighborhood_code` là khóa phân vùng của folder Drive `02_CASES/{TDP_CODE}/{CASE_ID}` và
của toàn bộ dashboard. Người dân thường không biết mã tổ dân phố của mình.

- Form công khai: địa chỉ hai cấp dạng văn bản + một select tổ dân phố **gợi ý, không bắt buộc**.
- **Cán bộ chọn tổ dân phố tại bước accept, bắt buộc, không có giá trị mặc định.** Đây là dữ liệu
  cán bộ chịu trách nhiệm, không phải dữ liệu người dân khai.

---

## 6. Tệp hồ sơ và upload

### 6.1. Dung lượng Drive — không còn là ràng buộc

Tài khoản dùng gói **5 TB** (Google One), không phải 15 GB miễn phí. Ở mức 500 hồ sơ × 11 ảnh,
dung lượng không còn là giới hạn dù giữ ảnh gốc đầy đủ.

Hệ quả — **ràng buộc thật đổi từ dung lượng sang thời gian upload và quota API**:

- Vẫn **downscale ở client**, nhưng vì mạng chứ không vì kho: một ảnh 25 MB trên 4G yếu mất vài
  phút và dễ đứt giữa chừng. Mục tiêu **cạnh dài 3000px, ~12 MB/file** — nới so với 8 MB của bản
  trước vì chất lượng lưu trữ nay đáng giá hơn dung lượng. Giữ `MAX_UPLOAD_MB=30` làm trần cứng.
- Vẫn giữ **ngân sách byte cho mỗi submission enforce ở server** tại `uploads/initiate` (đề xuất
  150 MB tổng), nhưng lý do là **chống lạm dụng trên endpoint ẩn danh**, không phải tiết kiệm kho.
  Vượt thì từ chối, không phụ thuộc client.
- `GET /api/health/google` vẫn đọc `about.get(storageQuota)` — hạ xuống mức cảnh báo thông thường,
  không còn là hạng mục chặn.
- **Cần xác nhận một lần:** gói 5 TB thuộc đúng tài khoản sở hữu Drive/Sheets
  (`anmphongandn@gmail.com`), không phải một tài khoản khác của cùng người dùng.
- Runbook bỏ mục "Drive sắp đầy", giữ mục dọn `01_INBOX` của submission `REJECTED`/`EXPIRED` theo
  quy trình lưu trữ đã duyệt.

### 6.2. Quy tắc file

- Người dân tải **đúng một CCCD mặt trước** và 1–10 ảnh GCN — giữ nguyên quyết định đã có.
- Chấp nhận JPEG, PNG, WebP, HEIC/HEIF.
- Giữ file gốc (sau downscale client-side). Preview JPEG ≤2,5 MB do trình duyệt tạo.
- Drive: `01_INBOX/{submission_internal_id}/originals | previews | package`. Dùng ID nội bộ, không
  dùng mã tiếp nhận, để mã tiếp nhận có thể cấp lại mà không đụng cấu trúc file.
- Tất cả file upload **trực tiếp lên Drive** bằng resumable upload. Backend chỉ tạo phiên và xác
  minh. Ảnh gốc không đi qua body của Vercel Function.

### 6.3. [CHẶN] Bảo vệ phiên upload ẩn danh

Backend tạo session bằng OAuth token của admin rồi giao URL cho một browser **không xác thực**.
Ai giữ URL đó đều ghi được vào Drive của admin.

- Giới hạn số session `initiate` mỗi submission (11 file + tối đa 10 lần retry), đếm ở server.
- Session sống ngắn nhất có thể; coi URL là bí mật, không log, không đưa vào audit.
- Xác minh sau upload: thư mục cha, **MIME sniff từ bytes** (không tin `Content-Type` khai báo),
  kích thước so với khai báo, checksum.
- **File không đạt xác minh phải bị xóa hoặc chuyển sang folder cách ly ngay** — kế hoạch cũ
  không nói file hỏng đi đâu, hệ quả là Drive admin tích rác không kiểm soát.
- `submit` phải **xác minh lại từng file với Drive**, không tin dòng `PUBLIC_FILES` (đã có mã lỗi
  `UPLOAD_INCOMPLETE`).

### 6.4. Tạo PDF — chuyển sang server, tại bước accept

Đổi so với bản trước. Lý do:

- Giải mã HEIC bằng WASM + canvas + encode JPEG + ghép PDF cho tới 11 ảnh 12 MP sẽ vượt ngân sách
  bộ nhớ tab trên Android tầm trung và bị iOS Safari kill. Mỗi ảnh HEIC mất vài giây → cả phút
  blocking. Đây là yêu cầu rủi ro nhất về phía client trong kế hoạch cũ.
- PDF `{SO_PHAT_HANH_DA_CHUAN_HOA}.pdf` là **sản phẩm lưu trữ của cán bộ**, không phải thứ người
  dân cần. Số phát hành do người dân gõ còn có thể sai; tại bước accept cán bộ mới có số đúng.

Quyết định:

- **Sinh PDF phía server tại bước accept, ghép từ ảnh preview (≤2,5 MB/ảnh)**, thứ tự: ảnh GCN
  trước, CCCD sau. Preview đủ nhỏ để không vi phạm ràng buộc "ảnh gốc không đi qua body Vercel
  Function".
- Tên file lấy từ số phát hành **đã được cán bộ xác nhận**, không phải số người dân khai.
- Nếu vẫn muốn giữ PDF phía client (ví dụ để người dân tự lưu), nó phải là **tùy chọn, best-effort,
  và tuyệt đối không chặn nút Gửi**.
- **Dependency mới:** cần một thư viện PDF phía server (`pdf-lib` hoặc tương đương) — phải ghi
  quyết định vào `03-decisions.md` theo quy tắc cứng số 2 của `CLAUDE.md`. Chọn thư viện
  **nhúng thẳng JPEG preview, không decode/re-encode ảnh** — như vậy server không cần `sharp`,
  `canvas` hay bất kỳ native binary nào, chạy được trong Vercel Function và không phình bundle.

### 6.5. HEIC và chụp ảnh

- Ưu tiên luồng **chụp bằng camera trong app** (ra JPEG thẳng) để phần lớn người dùng không chạm
  vào HEIC.
- Khi buộc phải chuyển HEIC: xử lý **từng ảnh một**, chạy trong worker, giải phóng
  canvas/objectURL giữa các ảnh, hiển thị tiến độ. Không giữ nhiều bitmap đã decode cùng lúc.

### 6.6. QR CCCD

Đọc tại thiết bị; chỉ gửi trường đã tách và hash sau khi người dân xác nhận; không gửi payload QR
thô. Giữ nguyên quy ước module `qr` của M3.

---

## 7. Saga chấp nhận hồ sơ

### 7.1. [CHẶN] Checkpoint, không chỉ idempotency key

`idempotency-key` chống **request lặp**, không chống **fail giữa chừng rồi retry**.
`ID_RESERVATIONS` là append-only và số thứ tự lấy từ `updatedRange` của chính lệnh `append`
(`docs/brain/03-decisions.md`) — retry mà reserve lại sẽ **đốt một Case ID và tạo folder Drive thứ
hai**.

Saga phải ghi checkpoint xuống `PUBLIC_SUBMISSIONS.accept_step` **trước** mỗi bước không hoàn tác
được:

| Bước | Hành động                                                      | Checkpoint trước khi sang bước sau                                   |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1    | CAS `version` → `state=ACCEPTING`                              | `accept_step=CLAIMED`                                                |
| 2    | Reserve Case ID                                                | **Ghi `official_case_id` ngay**, `accept_step=ID_RESERVED`           |
| 3    | Tạo folder `02_CASES/{TDP}/{CASE_ID}/`                         | Ghi `drive_folder_id`, `accept_step=FOLDER_READY`                    |
| 4    | Move từng file                                                 | Cập nhật cờ trên từng dòng `PUBLIC_FILES`, `accept_step=FILES_MOVED` |
| 5    | Sinh PDF từ preview (§6.4)                                     | `accept_step=PACKAGE_READY`                                          |
| 6    | **Một** `spreadsheets.batchUpdate` cho toàn bộ dòng chính thức | `accept_step=DATA_WRITTEN`                                           |
| 7    | `state=ACCEPTED`, audit, search index                          | `accept_step=DONE`                                                   |

Quy tắc re-entrant:

- Retry **luôn đọc `accept_step` và tiếp tục từ đó**, không bao giờ chạy lại từ bước 1.
- Move file dùng `files.update` với `addParents/removeParents`; "đã có parent đích" là **thành
  công**, không phải lỗi.
- Tạo folder theo kiểu lookup-then-create trong parent, và ID được ghi xuống trước khi tạo con.
- Toàn bộ dòng chính thức đi trong **một** `batchUpdate`; ID của các dòng sinh **tất định từ
  `case_id`** để retry phát hiện được trùng bằng cách đọc theo khóa, không append mù.
- **Giữ nguyên `file_id` nội bộ** khi chuyển sang `FILES`; chỉ `drive_file_id`/parent thay đổi —
  đúng nguyên tắc `file_id` bất biến đã có trong `AGENTS.md` §3.3.
- Cache `REQUEST_LOG` hết hạn sau 24 giờ; sau đó tính đúng đắn phụ thuộc **checkpoint**, không
  phụ thuộc key. Đây là lý do checkpoint quan trọng hơn key.

### 7.2. [CHẶN] Giới hạn thời gian chạy Function

Move tới 11 file + nhiều lệnh Sheets trong một request rất dễ vượt `maxDuration` của Vercel
Function (mặc định 10s; trần tùy gói). Hết giờ giữa chừng → submission kẹt `ACCEPTING` vĩnh viễn.

- Đặt `maxDuration` tường minh cho route accept và đo thời gian thực tế với hồ sơ 11 ảnh.
- Nếu không đủ: chia saga thành các bước gọi lặp lại (client hoặc cron gọi tiếp cho tới `DONE`).
- Định nghĩa: ai retry, tối đa mấy lần, sau bao lâu thì cảnh báo, và một đường **resume thủ công
  cho `SYSTEM_ADMIN`**.
- Cảnh báo khi có submission ở `ACCEPTING` quá 10 phút.

### 7.3. Không có undo

Accept nhầm **không hoàn tác được**. Khắc phục bằng ghi chú + audit trên `CASE`, không xóa dòng,
không trả submission về trạng thái cũ. Ghi rõ vào runbook và vào `03-decisions.md`.

---

## 8. API và phân quyền

### 8.1. API công khai

```text
GET    /api/public/security/csrf
POST   /api/public/submissions
POST   /api/public/submissions/access
GET    /api/public/submissions/current
PATCH  /api/public/submissions/current
POST   /api/public/submissions/current/uploads/initiate
POST   /api/public/submissions/current/uploads/complete
DELETE /api/public/submissions/current/files/:fileId
POST   /api/public/submissions/current/submit
```

`current` suy ra từ cookie phiên, không bao giờ nhận ID trong URL.

### 8.2. API cán bộ

```text
GET  /api/submissions
GET  /api/submissions/:submissionId
POST /api/submissions/:submissionId/claim
POST /api/submissions/:submissionId/request-supplement
POST /api/submissions/:submissionId/accept
POST /api/submissions/:submissionId/reject
GET  /api/submissions/:submissionId/files/:fileId     — xem preview, audit bắt buộc mỗi lượt
POST /api/submissions/:submissionId/accept/resume     — chỉ SYSTEM_ADMIN, tiếp tục saga kẹt
```

### 8.3. Phân quyền — viết theo hướng cấp quyền dương

Nguyên tắc mặc định từ chối nghĩa là **liệt kê role được phép cho từng endpoint**, không phải ghi
"role X không được xem Y".

| Endpoint                                           | Role được phép                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/submissions`, `GET /api/submissions/:id` | `INTAKE_OFFICER`, `REVIEW_OFFICER`, `WARD_ADMIN`, `SYSTEM_ADMIN` |
| `claim`, `request-supplement`                      | như trên                                                         |
| `accept`, `reject`                                 | `REVIEW_OFFICER`, `WARD_ADMIN`, `SYSTEM_ADMIN`                   |
| `GET .../files/:fileId`                            | như hàng đầu, **mỗi lượt xem ghi audit**                         |
| `accept/resume`                                    | `SYSTEM_ADMIN`                                                   |

- `REPORT_VIEWER`: **không có quyền nào** trên `/api/submissions*`.
- `AUDITOR`: đọc `AUDIT_LOGS`; **không** đọc PII của submission, **không** xem file.
- `POPULATION_MATCH_OFFICER`: không có quyền nào (giữ chỗ cho nâng cấp, ghi rõ để agent sau không
  tưởng là sót).

### 8.4. Yêu cầu chung

Mọi API write cần `request_id`, `idempotency-key`, CSRF, và `version` khi cập nhật.

Mã lỗi bổ sung: `BOT_VERIFICATION_FAILED`, `RATE_LIMITED`, `INVALID_ACCESS_CODE`,
`SUBMISSION_LOCKED`, `INVALID_STATE`, `UPLOAD_INCOMPLETE`, `QUOTA_EXCEEDED`, `SIZE_BUDGET_EXCEEDED`.

**Optimistic concurrency cho autosave:** PATCH liên tục trên mạng yếu sẽ sinh `409` giả. Chỉ dùng
`version` để phát hiện **thiết bị thứ hai**; trong cùng phiên thì last-write-wins theo từng
section của wizard. Không để người dân thấy "Chưa thể lưu" vì lý do kỹ thuật không liên quan đến
họ.

---

## 9. Giới hạn hạ tầng dùng chung

### 9.1. [CHẶN] Sheets write quota

Mọi request đều đi qua **cùng một refresh token** của `anmphongandn@gmail.com`. Theo hạn mức mặc
định của Sheets API (~60 write/phút/user), cổng công khai **và** ứng dụng cán bộ chia nhau một
bucket. Autosave nháp là ghi liên tục; vài chục người dân kê khai đồng thời sẽ làm cán bộ bị `429`
khi đang xử lý hồ sơ.

- Autosave có **debounce sàn**: chỉ ghi khi dirty, tối thiểu 10–15 giây/lần/submission, và ghi khi
  chuyển bước.
- Gộp **mọi write của một request** vào một `batchUpdate` (bản ghi chính + `AUDIT_LOGS` +
  `SEARCH_INDEX` + `REQUEST_LOG`).
- Định nghĩa hành vi khi chạm quota: backoff có jitter, trạng thái "Chưa thể lưu" ở UI, **không
  mất dữ liệu đã nhập trong bộ nhớ trang**.
- Đo thực tế số write/phút của một phiên kê khai đầy đủ trước khi mở dữ liệu thật.

> Lưu ý: tách `PUBLIC_*` sang spreadsheet riêng **không** giải quyết quota (quota theo user, không
> theo file). Nó chỉ giúp blast radius, retention và export. Đừng nhầm hai việc.

### 9.2. Tổng kết ngân sách

| Tài nguyên       | Trần                                                                          | Ngưỡng cảnh báo    | Cơ chế enforce                                          |
| ---------------- | ----------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------- |
| **Sheets write** | **~60/phút/user, dùng chung public + cán bộ — đây là trần thật của hệ thống** | đo trước pilot     | debounce + gộp batchUpdate                              |
| Drive            | 5 TB — không còn là ràng buộc                                                 | 80% (thông thường) | health check                                            |
| File             | 12 MB hiệu dụng, 30 MB trần cứng                                              | —                  | server enforce ở `initiate`                             |
| Submission       | 11 file, ~150 MB tổng (chống lạm dụng)                                        | —                  | server enforce ở `initiate`                             |
| Function         | `maxDuration` tường minh                                                      | ACCEPTING >10 phút | saga checkpoint + resume                                |
| Rate limit       | 120 req/10 phút/IP trên `/api/public/*`, siết hơn ở `access` và tạo nháp      | —                  | Cloudflare edge (§10.2) — ứng dụng không tự đếm theo IP |

---

## 10. Bảo mật và vận hành

- **Turnstile bắt buộc** khi tạo nháp, truy cập lại và gửi chính thức. Server kiểm tra Siteverify,
  hostname/action, timeout; **fail-closed** — không xác minh được thì từ chối. Token phải mới cho
  từng hành động, buộc vào đúng submission/action. Tham khảo
  [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
- **Rate limiting và WAF do Cloudflare đảm nhiệm ở edge** — xem §10.2. Ứng dụng không tự đếm
  request theo IP.
- `POST /api/public/submissions/access` phải rate limit độc lập với Turnstile, và trả **phản hồi
  cùng nội dung, cùng thời gian** dù mã có tồn tại hay không.
- Biến môi trường mới: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`,
  `PUBLIC_SESSION_SECRET`, `PUBLIC_ACCESS_CODE_PEPPER`, `ORIGIN_SHARED_SECRET` (§10.2). Cập nhật
  CSP cho `challenges.cloudflare.com`.
- **Audit** mọi lượt xem file, truy cập lại, yêu cầu bổ sung, chấp nhận, từ chối, chuyển claim.
  Không ghi CCCD, điện thoại, Drive ID, upload URL.
  - IP: ghi **HMAC(IP + salt theo ngày)** thay vì bỏ hẳn — không có dấu vết nào thì không điều tra
    được lạm dụng lặp lại. Và nói thẳng trong tài liệu: **log của Vercel vẫn chứa IP thô**; cam
    kết "không ghi IP" chỉ áp cho sheet audit của mình, đừng để ai hiểu nhầm là IP biến mất.
- **Số điện thoại là PII**: che trong danh sách, log, thông báo và export như CCCD
  (`09••••••89`), chỉ hiện đầy đủ khi cán bộ mở hồ sơ (có audit).
- Thông báo bảo vệ dữ liệu và thời hạn lưu trữ do chủ dự án cung cấp, lưu theo phiên bản; mỗi
  submission ghi phiên bản và thời điểm đồng ý.
- Chưa hard-delete tự động ở v1; hệ thống lập danh sách đến hạn để `SYSTEM_ADMIN` xử lý theo quy
  trình được phê duyệt.
- Backup/export Sheets **trước** migration; health check kiểm tra toàn bộ tab/cột mới **và thứ tự
  header**.
- Runbook bổ sung: saga kẹt `ACCEPTING`, chạm quota Sheets, xoay `PUBLIC_ACCESS_CODE_PEPPER`,
  người dân mất mã bí mật.

### 10.1. Điểm tích hợp với code M2 đang có

Ba việc nhỏ nhưng bỏ sót là hỏng, vì code hiện tại được viết với giả định "mọi thứ đều cần đăng
nhập":

- **`src/proxy.ts`** đang chặn session ở Edge. Toàn bộ `/ke-khai` và `/api/public/*` phải được
  **loại khỏi matcher**, nếu không người dân bị đá về trang đăng nhập. Đây là thay đổi có rủi ro
  hai chiều — sửa matcher sai còn có thể **mở nhầm** route cán bộ. Phải có test cho cả hai chiều.
- **CSRF công khai không dùng lại được `src/modules/auth/csrf.ts`**: hàm hiện tại ký theo `email`
  của người đăng nhập, mà người dân thì không có email. Cần biến thể ký theo **định danh phiên
  công khai** (giá trị trong cookie), dùng `PUBLIC_SESSION_SECRET` riêng. Không sửa hàm cũ, viết
  hàm mới cạnh nó để đường cán bộ không bị ảnh hưởng.
- **Bảo vệ môi trường Preview:** deployment Preview của Vercel có URL công khai. Khi cổng kê khai
  lên Preview, người lạ có thể gửi hồ sơ **thật** vào đó. Bật Deployment Protection cho Preview
  trước khi merge nhánh public đầu tiên, không phải trước khi lên Production.

### 10.2. Cloudflare đứng trước Vercel

Quyết định (B2): domain đi qua Cloudflare ở chế độ proxy, Cloudflare lo WAF + rate limiting +
Turnstile. Lợi ích phụ: gỡ luôn B3, ứng dụng không cần store đếm request nên **không phải thêm
stack**.

**[CHẶN] Chặn đường đi vòng qua Cloudflare.** Đây là yêu cầu bắt buộc, bỏ qua thì toàn bộ lớp
biên trở nên vô nghĩa: URL `*.vercel.app` của deployment **luôn truy cập trực tiếp được**, kẻ tấn
công chỉ cần gọi thẳng vào đó là bỏ qua sạch WAF và rate limit.

- Cloudflare thêm một header bí mật (ví dụ `X-Origin-Auth`) vào mọi request chuyển tiếp.
- Origin **từ chối mọi request tới `/api/public/*` và `/ke-khai` không có header đó**, kiểm tra
  constant-time. Biến môi trường mới: `ORIGIN_SHARED_SECRET`.
- Có test cho đúng kịch bản này: gọi thẳng URL `*.vercel.app` phải bị từ chối.

**IP thật của client.** Sau Cloudflare, IP trong `x-forwarded-for` là của Cloudflare, không phải
của người dùng. IP thật nằm ở `CF-Connecting-IP`.

- Audit HMAC(IP + salt theo ngày) ở §10 phải đọc `CF-Connecting-IP`.
- **Chỉ tin header này khi request đã qua kiểm tra `ORIGIN_SHARED_SECRET`** — nếu không, ai cũng
  tự khai IP tùy ý và bộ đếm/audit thành vô giá trị.

**Cache.** Cloudflare không được cache trang kê khai hay API — một trang nháp bị cache là **lộ PII
sang người khác**.

- Cache rule: bypass toàn bộ `/api/*` và `/ke-khai*`.
- Bảo đảm response có `Set-Cookie` không bao giờ được cache.
- Không bật "Cache Everything" hay Automatic Platform Optimization cho domain này.

**Rate limiting rules** (thay cho cấu hình Vercel WAF ở bản trước):

| Đường dẫn                                 | Giới hạn đề xuất       | Ghi chú                                          |
| ----------------------------------------- | ---------------------- | ------------------------------------------------ |
| `/api/public/*`                           | 120 req / 10 phút / IP | chạy chế độ Log trước, quan sát rồi mới bật chặn |
| `/api/public/submissions/access`          | 10 req / 10 phút / IP  | siết hơn hẳn: đây là bề mặt dò mã                |
| `/api/public/submissions` (POST tạo nháp) | 5 req / giờ / IP       | chống tạo nháp rác hàng loạt                     |

- **Kiểm tra tier trước khi thiết kế chi tiết:** số lượng rate limiting rule và các trường dùng
  được (đặc biệt **JA3/JA4 fingerprint thuộc nhóm tính năng trả phí**) khác nhau theo gói
  Cloudflare. Bản trước ghi "theo IP và JA4" theo mô hình Vercel — nếu gói hiện tại không có JA4
  thì **chỉ dùng IP**, đừng viết rule dựa trên trường không tồn tại.
- Cân nhắc giới hạn theo quốc gia cho `/api/public/*`: đây là dịch vụ cấp phường, chặn traffic
  ngoài Việt Nam là biện pháp rẻ và hiệu quả. Cần chấp nhận đánh đổi với người dân đang ở nước
  ngoài kê khai hộ gia đình.

**Cấu hình bắt buộc khác:**

- SSL/TLS ở chế độ **Full (strict)**. Chế độ Flexible sẽ gây vòng lặp chuyển hướng với Vercel.
- Giới hạn body request của Cloudflare **không ảnh hưởng ảnh hồ sơ**, vì ảnh đi thẳng
  browser → Google Drive, không qua Cloudflare lẫn Vercel (§6.2). Ghi rõ điều này để người sau
  không tưởng phải nâng gói vì lý do đó.
- Turnstile vẫn giữ nguyên vai trò ở ba hành động tại §10; Cloudflare Managed Challenge ở tầng WAF
  là lớp bổ sung, **không thay thế** Turnstile.

---

## 11. Kiểm thử và nghiệm thu

- **Unit:** validation 15 trường Phụ lục 8 theo bảng §5.3; `owner_type` và CCCD tùy chọn cho tổ
  chức/hộ; **tổng diện tích dòng loại đất ≤ diện tích thửa khi có nhập** (tùy chọn, không bắt
  buộc); số tờ/số thửa trống hợp lệ; **không accept được nếu cán bộ chưa xác nhận trường 12**;
  mã danh mục trường 12 khớp `REFERENCE_DATA`; sinh mã tiếp nhận (ngẫu
  nhiên, không ký tự nhầm lẫn, đúng năm `Asia/Ho_Chi_Minh`); HMAC mã bí mật và so sánh
  constant-time; CSRF công khai; **toàn bộ transition trạng thái kể cả `ACCEPTING` và `EXPIRED`**;
  phân quyền theo bảng §8.3; che PII gồm cả số điện thoại.
- **Integration:** migration chạy lặp; **migration cột mới không làm lệch dữ liệu tab cũ**;
  Turnstile pass/fail/replay/timeout/fail-closed; lưu và truy cập nháp; idempotency; Drive
  resumable upload; checksum và MIME sniff; **file hỏng bị cách ly**; ngân sách byte bị từ chối
  đúng; **saga accept phục hồi từ từng `accept_step`** (giả lập lỗi ở mỗi bước); retry không sinh
  Case ID thứ hai, folder thứ hai hay dòng Sheets trùng.
- **E2E:** người dân tạo nháp → xác nhận đã lưu mã → tải CCCD/GCN → gửi → cán bộ claim → yêu cầu
  bổ sung → người dân quay lại **trên thiết bị khác** → gửi lại → cán bộ chấp nhận → **chỉ một
  `CASE UPLOADED` được tạo**, có `source_submission_id`, có PDF trong `package`.
- **Security:** không liệt kê được submission công khai; mã sai không tiết lộ hồ sơ có tồn tại
  (cùng nội dung, cùng thời gian); không tải được CCCD thứ hai; MIME giả bị từ chối; không có
  Drive link công khai; không lộ PII/token trong log hoặc thông báo lỗi; session upload không xuất
  hiện ở bất kỳ log nào.
  - **Gọi thẳng URL `*.vercel.app` (bỏ qua Cloudflare) phải bị từ chối** ở `/api/public/*` và
    `/ke-khai` — test bắt buộc, đây là điểm mà cả lớp biên sụp nếu sai (§10.2).
  - Giả mạo `CF-Connecting-IP` khi không có `ORIGIN_SHARED_SECRET` phải không có tác dụng.
  - Trang `/ke-khai` và mọi response có `Set-Cookie` không bị Cloudflare cache — kiểm tra bằng
    header `CF-Cache-Status`.
- **UX:** Android Chrome, iPhone Safari, 4G yếu, mất mạng giữa upload, retry, HEIC, bàn phím số
  cho CCCD/điện thoại, thao tác hoàn toàn bằng bàn phím, screen reader, **font scaling 200%**.
- **Tải:** mô phỏng 20 phiên kê khai đồng thời, đo write/phút Sheets và dung lượng Drive tiêu thụ
  trên 20 hồ sơ giả → ngoại suy cho 500 hồ sơ. Làm việc này **trước** khi mở dữ liệu thật.
- Preview dùng Turnstile test key và dữ liệu giả; chạy đủ 20 hồ sơ giả trước khi mở dữ liệu thật.
- **Production chỉ mở sau khi**: B1–B5 ở §0.2 đã chốt; thông báo bảo vệ dữ liệu và thời hạn lưu
  trữ đã nhập nguyên văn; WAF/Turnstile đã cấu hình; OAuth ở `In production`; backup đã verify;
  kiểm tra bảo mật đã chạy; cam kết gọi điện cho người dân đã có người chịu trách nhiệm.

---

## 12. Tài liệu phải cập nhật trước khi code

Theo `CLAUDE.md`, thay đổi kiến trúc/API/schema phải cập nhật tài liệu **đồng bộ**, và ở đây phải
làm **trước**, không phải sau — vì kế hoạch này đảo ngược phạm vi đã ghi (§0.3).

1. `docs/brain/03-decisions.md` — các entry:
   - Mở bề mặt công khai không xác thực (đảo `AGENTS.md` §2), kèm đánh đổi và điều kiện pháp lý.
   - Kích hoạt `PARCELS`/`ASSETS`/`LAND_USES` sớm hơn `AGENTS.md` §8.
   - Tách `PUBLIC_*` khỏi sheet chính thức.
   - Saga accept dùng checkpoint `accept_step`, không chỉ idempotency key; accept không undo.
   - PDF sinh phía server tại accept, không sinh trên thiết bị người dân.
   - Giới hạn 12 MB/file + ngân sách byte/submission — lý do là **thời gian upload và chống lạm
     dụng**, không phải dung lượng (Drive 5 TB).
   - **Cloudflare đứng trước Vercel** cho WAF/rate limiting; hệ quả là không thêm store đếm
     request, giữ nguyên stack. Kèm ràng buộc chặn đường đi vòng qua origin.
   - Cán bộ chọn tổ dân phố tại accept, không lấy từ người dân khai.
   - Cơ sở pháp lý thu thập PII: ghi nguyên văn thẩm quyền đã được phê duyệt, thời hạn lưu trữ và
     quy trình xóa/sửa (thay entry "chưa chốt" hiện có).
2. `AGENTS.md` §2 (phạm vi), §4.1 (sheet), §5 (API), §6 (bảo mật, biến môi trường), và **§8 —
   sửa "bộ 15 rồi 50 nhóm trường nghiệp vụ"**: 50 trường (Phụ lục 02) thuộc VPĐK/đơn vị thi công,
   không phải mục tiêu của hệ thống cấp xã. Mục tiêu là 15 trường Phụ lục 8, dừng ở đó (§5.3).
3. `PLAN.md` — chèn mốc M3.5 và ghi rõ phụ thuộc vào M3.
4. `docs/brain/01-architecture.md` — Code Graph cho `modules/uploads`, `modules/media`, module
   public, và luồng xử lý mới.
5. `docs/brain/04-current-tasks.md` — trạng thái M3/M3.5.
6. `docs/brain/06-ai-working-log.md` — entry sau mỗi lần sửa code.

---

## 13. Phân rã công việc, độ khó và cách giao cho AI

Thang độ khó 1–5: **1** = mechanical, sai thì thấy ngay; **5** = sai âm thầm, hỏng dữ liệu thật,
người review khó phát hiện bằng mắt.

| #   | Gói việc                                                                                                                                             | Khó   | Giao cho                                                     | Bắt buộc                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| P0  | Chốt B1–B5, viết entry `03-decisions.md`, đồng bộ `AGENTS.md`/`PLAN.md`                                                                              | 2     | AI soạn, **người ký**                                        | B1 và B5 là quyết định của người, AI không chốt thay                                                 |
| P1  | Migration: 7 tab `PUBLIC_*` + cột mới trên 5 tab đang có + health check so thứ tự header                                                             | **5** | Model mạnh nhất; **cross-review bởi AI còn lại**             | Backup + verify đọc được **trước** khi chạy. Chạy trên spreadsheet nháp trước                        |
| P2  | Tách `modules/uploads` + `modules/media` dùng chung (làm trong M3)                                                                                   | 4     | Model mạnh nhất                                              | Hợp đồng module chốt trước khi viết cổng công khai                                                   |
| P3  | Phiên công khai: cookie sliding, CSRF public, sinh/verify mã tiếp nhận + mã bí mật, Turnstile                                                        | **5** | Model mạnh nhất; **cross-review**                            | Không còn phụ thuộc B2/B3. Test bảo mật §11 là điều kiện nghiệm thu                                  |
| P4  | Mô hình dữ liệu Phụ lục 8 + validation (`owner_type`, diện tích theo dòng, trường tùy chọn)                                                          | 4     | Model mạnh nhất                                              | **Đối chiếu với ≥10 GCN thật** trước khi chốt schema — việc này người làm, không AI                  |
| P5  | Design token + wizard 8 bước + trạng thái lưu + lối thoát                                                                                            | 3     | Model tầm trung, khối lượng lớn                              | Chia theo bước wizard, mỗi bước một task                                                             |
| P6  | API công khai: draft CRUD, uploads initiate/complete, submit                                                                                         | 4     | Model mạnh nhất                                              | Không viết đường upload thứ hai — dùng P2                                                            |
| P7  | Hàng chờ cán bộ: list/detail/claim/request-supplement/reject + bảng phân quyền §8.3                                                                  | 3     | Model tầm trung                                              | Test phân quyền cho **mọi** role, kể cả role không được phép                                         |
| P8  | Acceptance saga + checkpoint + resume                                                                                                                | **5** | Model mạnh nhất; **cross-review bắt buộc**                   | Giao **từng bước checkpoint một task**, không giao cả saga một lượt. Mỗi bước có test giả lập lỗi    |
| P9  | PDF server-side từ preview                                                                                                                           | 2     | Model tầm trung                                              | Nhúng JPEG thẳng, không decode                                                                       |
| P10 | Bộ test: unit, integration, e2e, security, tải                                                                                                       | 3     | Model tầm trung                                              | Test bảo mật và test saga phải do model mạnh viết                                                    |
| P11 | `proxy.ts` matcher, CSP, Deployment Protection cho Preview                                                                                           | 3     | Model tầm trung                                              | Test cả hai chiều: public mở được, route cán bộ **không** mở                                         |
| P12 | Cloudflare: proxy DNS, SSL Full (strict), cache rule, rate limiting rules, header `ORIGIN_SHARED_SECRET` + kiểm tra ở origin, đọc `CF-Connecting-IP` | 4     | **Người cấu hình dashboard**, AI viết phần kiểm tra ở origin | Phần dashboard AI không làm được. Test "gọi thẳng `*.vercel.app` bị từ chối" là điều kiện nghiệm thu |

### 13.1. Quy tắc giao việc

- **Cross-review cho P1, P3, P8.** Ba gói này sai thì hỏng dữ liệu thật hoặc lộ PII, và lỗi
  không hiện ra khi chạy thử. Ai viết thì người kia review — self-review của cùng một model bắt
  được ít hơn hẳn.
- **Không giao P8 (saga) như một task.** Chia theo 7 checkpoint ở §7.1, mỗi checkpoint một task
  kèm test giả lập lỗi tại đúng bước đó. Giao cả saga một lượt gần như chắc chắn nhận về code
  "chạy được đường thuận, hỏng khi retry".
- **P1 chạy trên spreadsheet nháp trước.** Migration cột trên tab đang có là thao tác không hoàn
  tác được trên dữ liệu M1/M2 đã có thật.
- **Ba việc AI không làm thay được:** cơ sở pháp lý (B1), cam kết vận hành gọi điện (B5), và đối
  chiếu mô hình Phụ lục 8 với GCN thật (P4). AI đoán sai ở P4 thì cả biểu mẫu phải làm lại.
- Sau mỗi gói: entry `docs/brain/06-ai-working-log.md` theo mẫu trong `CLAUDE.md`.

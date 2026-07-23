# 03 — Technical Decisions

> Ghi lại quyết định kỹ thuật quan trọng để agent sau không "phát minh lại" hoặc đảo ngược
> mà không biết lý do. Mỗi entry: quyết định gì, vì sao, đánh đổi gì.
> Các quyết định dưới đây được trích từ `AGENTS.md`, `PLAN.md`, `docs/architecture.md` (đã chốt trước khi bộ brain này được tạo).

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

## [2026-07-22] Không sharding — giữ một spreadsheet, sửa ba chỗ ở tầng truy cập

- **Quyết định:** Bỏ phương án chia 10 spreadsheet theo tổ dân phố kèm `CONTROL_PLANE` trung tâm.
  Giữ **một** spreadsheet, thay vào đó sửa ba chỗ trong tầng truy cập dữ liệu.
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

## Template cho entry mới

```
## [YYYY-MM-DD] Tiêu đề quyết định

- **Quyết định:** <mô tả>
- **Lý do:** <vì sao chọn hướng này>
- **Đánh đổi:** <cái gì bị đánh đổi>
- **Người quyết định:** <user / Claude / Codex>
```

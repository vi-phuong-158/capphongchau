# 06 — AI Working Log

> Nhật ký các lần AI (Claude Code / Codex) sửa code. Mỗi agent PHẢI thêm entry sau mỗi lần
> chạm vào code. Đọc ngược từ trên xuống để biết gần đây ai đã làm gì và vì sao.

---

## [2026-07-23] Cho phép tra cứu GCN đã có không cần tải cặp ảnh CCCD

- **Agent:** Codex
- **Thay đổi:** Bỏ chốt `UPLOAD_INCOMPLETE` ở API kiểm tra/liên kết/kết thúc hồ sơ đã có và nút
  giao diện. Người dân chỉ cần xác nhận CCCD 12 số, họ tên và ngày sinh để tra cứu; ảnh CCCD vẫn
  bắt buộc ở bước nộp GCN mới và vẫn được dùng để đọc QR.
- **Kiểm tra:** Bổ sung unit test điều kiện định danh tra cứu; đã chạy typecheck, lint, test và
  build trước khi bàn giao.

---

## [2026-07-23] Sửa bản tóm tắt file bị trễ làm chặn gửi hồ sơ đủ ảnh

- **Agent:** Codex
- **Vấn đề:** Bản kê khai thử nghiệm có đủ 2 ảnh CCCD và 2 ảnh GCN trong `PUBLIC_FILES`, nhưng
  `file_summary_json` thiếu ảnh CCCD mặt sau. API gửi ưu tiên cache này nên báo thiếu ảnh sai.
- **Thay đổi:** Quyết định nộp, khôi phục nháp và kiểm tra thay ảnh đều đọc `PUBLIC_FILES` là nguồn
  thật. Khi upload, cache tóm tắt được dựng lại từ các dòng file thực thay vì từ snapshot cũ của
  request, không còn ghi đè mất file vừa tải.
- **Kiểm tra:** Sẽ chạy typecheck, lint, toàn bộ test và build trước khi triển khai.

---

## [2026-07-23] Chạy pipeline làm sạch 7.917 dòng dữ liệu Excel cũ (Gói B) + Sao lưu dữ liệu gốc & Đối sánh

- **Agent:** Antigravity (Pair programming with User)
- **Thay đổi:**
  - Viết và thực thi script `scripts/clean_legacy_data.py` xử lý 7.917 dòng dữ liệu lịch sử.
  - **Sao lưu tuyệt đối dữ liệu gốc**: Tạo bản sao file Excel nguyên bản tại `Tai lieu/backup/PHƯỜNG PHONG CHÂU - DS Tổng hợp Làm sạch CSDL đất đai 11-11-2025.ORIGINAL_BACKUP.xlsx` và bản backup JSON 1-1 tại `scratch/legacy_raw_backup.json` (7.920 dòng).
  - **Làm sạch & Chuẩn hóa**: Ép kiểu chuỗi số GCN, xử lý ngày tháng (chuyển ISO/text về chuẩn, sửa lỗi năm `1017` -> `2017`), chuẩn hóa giới tính (`Nam` -> `NAM`, `Nma`/`Nư`/`Nừ` -> `NU`), chuẩn hóa diện tích (chuyển `,` và phân số `"385/2"` -> `192.5`), ánh xạ vai trò/pháp nhân về 6 enum PL3.
  - **Phân loại chất lượng & Đối sánh**: Xuất 7.917 bản ghi chuẩn hóa tại `scratch/legacy_cleaned_records.json`, xuất tệp đối sánh `scratch/legacy_comparison_diff.json` (603 dòng có thay đổi/gắn cờ), và tệp báo cáo ngoại lệ `scratch/legacy_data_exceptions_report.json` (553 bản ghi cần cán bộ xác minh).
- **Lý do:** Chuẩn bị bộ dữ liệu sạch cho Gói B, bảo lưu nguyên trạng file gốc để đối chiếu 1-1, và phân loại `REUSABLE` (7.364 dòng), `DATA_ONLY` (548 dòng), `CONFLICT` (5 dòng).
- **Kiểm tra:** Script thực thi thành công, file sao lưu và các tệp JSON kết quả đã được ghi vào thư mục `Tai lieu/backup/` và `scratch/`.

---

## [2026-07-23] `VietnameseDateInput` — ba ô số Ngày/Tháng/Năm cho ngày sinh và ngày cấp GCN

- **Agent:** Claude Code
- **Thay đổi:** Component `src/components/vietnamese-date-input.tsx` (ba ô số, `inputMode=numeric`,
  tự nhảy ô khi đủ số, Backspace ở ô rỗng lùi ô trước) + module thuần
  `src/modules/public-intake/vietnamese-date.ts` (`splitIsoDate`, `assembleIsoDate` với kiểm ngày
  hợp lệ / năm nhuận / chặn tương lai / khoảng năm). Ráp vào wizard cho **ngày sinh** (năm ≥ 1900)
  và **ngày cấp GCN** (năm ≥ 1987). Gỡ ô `type=date` (ngày sinh) và ô gõ tự do + helper
  `parseVietnameseDate`/`displayVietnameseDate` + state `issueDateInput` (ngày cấp) đã thay thế.
- **Lý do:** gõ tự do dễ sai định dạng (PL3 mẫu có `9/10/1017`); lịch gốc trên điện thoại bắt cuộn
  ngược nhiều năm cho ngày sinh. Ba ô số lấy được cả tốc độ bàn phím số lẫn chuẩn hóa `YYYY-MM-DD`.
  Khép mục `VietnameseDateInput` treo trong `PLAN2.md` §4.5.
- **File đã sửa:** thêm `vietnamese-date-input.tsx`, `vietnamese-date.ts`,
  `tests/vietnamese-date.test.ts`; sửa `wizard.tsx`, `PLAN2.md`.
- **Kiểm tra:** `tsc` sạch · `lint` sạch · `vitest` **144/144** (+8 test module ngày: ngày không tồn
  tại, năm nhuận, chặn tương lai, khoảng năm bắt lỗi `1017`) · `build` sạch · `/ke-khai` không lỗi
  console, component có trong bundle. Thao tác trực tiếp trên ô nằm sau bước tạo hồ sơ (cần Google)
  nên chưa chạy tay được cục bộ; logic phủ bằng unit test.

---

## [2026-07-23] Khóa tra "hồ sơ đã có" rút về CCCD + bắt buộc QR

- **Agent:** Claude Code
- **Thay đổi:**
  - **Khớp chỉ theo HMAC của CCCD.** Gỡ điều kiện `item.identityMatchHmac === identityMatchHash`
    khỏi `findExistingCertificates` và `hasPendingIdentityMatch` (repository.ts); bỏ tham số
    `identityMatchHash` và bỏ ghi `identityMatchHmac` trong `appendPendingIdentityIndex`; gỡ hàm
    `identityMatchHmac` + `normalizeIdentityName` khỏi workflow.ts; cập nhật 4 route caller (check,
    link, no-action, submit) không còn tính/truyền match hash. Script Python `identity_hashes` bỏ
    ngày sinh khỏi join.
  - **Tra nhanh bắt buộc QR.** `hasCompleteExistingRecordLookupIdentity` chỉ nhận `QR_CONFIRMED`
    (trước nhận cả `MANUAL_COMPLETE`); bỏ luôn tham số `dateOfBirth`. Gỡ nút "Kiểm tra GCN đã có"
    đường gõ tay ở wizard (điều kiện thành code chết) + import thừa.
- **Lý do:** soi kho thật thấy 87% ngày sinh chỉ có năm và họ tên đa nguồn hay lệch dấu — để trong
  khóa là trượt phần lớn hồ sơ thật. Chống dò chuyển sang bắt buộc quét QR (đang cầm thẻ thật). Xem
  `03-decisions.md` [2026-07-23].
- **Đánh đổi:** khóa CCCD-đơn ưu tiên **không bỏ sót** (recall) — false-positive do lỗi nhập CCCD
  trong kho được chặn ở bước người dân xác nhận + cán bộ duyệt liên kết. Ai QR không lên thì vẫn kê
  khai/nộp bình thường, chỉ mất lối tắt "đã có".
- **File đã sửa:** `workflow.ts`, `repository.ts`, `existing-records/check|link/route.ts`,
  `no-action/route.ts`, `submit/route.ts`, `wizard.tsx`, `scripts/import_existing_certificates.py`,
  `tests/public-workflow.test.ts`, `PLAN2.md`, `docs/brain/03-decisions.md`.
- **Kiểm tra:** `tsc` sạch · `lint` sạch · `vitest` **136/136** (đổi test QR-only + che số GCN) ·
  `build` sạch · `py_compile` script import OK.

---

## [2026-07-23] Thu "Người sử dụng đất hiện tại" (PL3 O, P, 14, 15) + nghiên cứu ba file kho

- **Agent:** Claude Code
- **Nghiên cứu ba tài liệu** (không sửa file gốc):
  - `24.7.2026_PhuongPhongChau (đã có dữ liệu).xlsx` — kho đã duyệt, 5.041 dòng. CCCD phủ 99% cá
    nhân (3.492 phân biệt); **87% ngày sinh chỉ có năm**; số phát hành GCN 90%, định dạng bẩn; 280
    tổ chức không CCCD (mã dạng `N/A-<mst>`). → Chốt khóa tra = **CCCD, bỏ ngày sinh**, xem
    `03-decisions.md`.
  - `24.7.2026 PhuongPhongChau (hiện trạng dữ liệu).xlsx` — bảng phân loại chất lượng/trạng thái theo
    thửa (nguồn gắn cờ `REUSABLE`), không phải nguồn định danh.
  - `PL3.xlsx` — xác nhận nhóm cột O, P, 14, 15 = "Thông tin người sử dụng đất hiện tại".
- **Thay đổi code — khối Người sử dụng đất hiện tại:** thêm cờ `hasDistinctCurrentUser` + 4 trường
  (`currentUserName`, `currentUserCitizenId`, `currentUserAddress`, `changeReason`) vào `Owner`;
  danh mục `CHANGE_REASON_OPTIONS` (Thừa kế/Tặng cho/Chuyển nhượng/Khác). Khi bật: `requiresCitizenId`
  vẫn true nhưng loại khỏi yêu cầu ảnh CCCD ở `validateDraftForSubmit`, endpoint gửi
  (`identityOwners`), và `completionChecklist`; UI ẩn khối ảnh/QR/ngày sinh, hiện khối người sử dụng
  hiện tại; ô CCCD người trên GCN thành tùy chọn.
- **Lý do:** nhiều ca chủ trên GCN đã mất; không quét được thẻ người đã mất nên phải miễn ảnh và thu
  người thừa kế bằng chữ (chốt "miễn ảnh, chỉ khai chữ").
- **File đã sửa:** `types.ts`, `reference.ts`, `validation.ts`, `submit/route.ts`, `workflow.ts`,
  `wizard.tsx`, `schema.ts`, `repository.ts`, `tests/public-intake-validation.test.ts`, `PLAN2.md`,
  `docs/brain/03-decisions.md`.
- **Deploy:** phải chạy lại `npm run migrate:public-intake` (thêm 5 cột `PUBLIC_OWNERS`).
- **Kiểm tra:** `tsc` sạch · `lint` sạch · `vitest` **136/136** (thêm 2 test: chủ đã mất miễn CCCD
  nhưng bắt khai đủ người sử dụng hiện tại; CCCD người hiện tại 12 số + lý do trong danh mục) ·
  `build` sạch · `/ke-khai` không lỗi console, các chuỗi mới có trong bundle client.

---

## [2026-07-22] Bốn lỗi dữ liệu chặn xuất PL3 — (c)(d)(e)(f) của `PLAN2.md` §4.2

- **Agent:** Claude Code
- **Thay đổi:**
  - **(c) Danh mục trường 12/13 theo PL3.** `OWNER_TYPES` thêm `DONG_SU_DUNG` và
    `CONG_DONG_DAN_CU` (đủ sáu). `CERTIFICATE_ROLE_OPTIONS` thay toàn bộ bốn mã tự đặt bằng sáu giá
    trị PL3: `CA_NHAN`/`CHU_HO`/`CHONG`/`VO`/`NGUOI_DAI_DIEN`/`THANH_VIEN`. `validateDraftForSubmit`
    nay bắt vai trò phải nằm trong danh mục, không chỉ khác rỗng.
  - **(d) Dung sai diện tích 0,5 m².** `LAND_USE_AREA_TOLERANCE_M2`, dùng chung giữa validation ở
    máy chủ và kiểm theo bước ở trình duyệt.
  - **(e) Bịt lỗ định danh.** `requiresCitizenId` nay đúng bằng "không phải tổ chức" — `HO_GIA_DINH`
    và `DONG_SU_DUNG` bắt buộc CCCD 12 số, ngày sinh, giới tính, địa chỉ và đủ cặp ảnh CCCD. Thêm
    `isOrganisationOwner`; tổ chức / cộng đồng dân cư miễn CCCD nhưng bắt buộc **mã số thuế** đúng
    định dạng (10 số, hoặc 10 số kèm 3 số đơn vị trực thuộc) và **địa chỉ trụ sở**.
  - **(f) Tối đa 3 dòng mục đích mỗi thửa.** `MAX_LAND_USES_PER_PARCEL`, chặn ở validation và vô
    hiệu hóa nút "+ Thêm mục đích sử dụng" kèm dòng giải thích khi đủ 3.
- **Lý do:**
  - (c) Bộ mã cũ **không trùng giá trị nào** trong dropdown của PL3 — xuất ra sẽ là giá trị lạ giữa
    file nộp. `label` giờ chính là chuỗi ghi ra file, nên test khóa cả thứ tự để đừng ai sửa nhãn
    cho "gọn" rồi làm lệch file nộp.
  - (d) Quy tắc "tổng không được vượt diện tích thửa" **từ chối chính dữ liệu do cơ quan phát
    hành**: dòng 9 của PL3 mẫu có thửa `29,16` m² nhưng loại đất ghi `29,2` m². Nguyên nhân là làm
    tròn tới 0,1 m², sai số tối đa 0,155 m² — lấy 0,5 m² cho rộng mà vẫn bắt được sai sót thật.
  - (e) Chọn "Hộ gia đình" trước đây là bỏ qua **toàn bộ** phần định danh, nộp được hồ sơ chỉ với
    một cái tên. PL3 mẫu có CCCD ở **cả ba** dòng hộ gia đình (CCCD chủ hộ) → là lỗi, không phải
    thiết kế. Hộ gia đình là dạng phổ biến nhất nên đây là phần lớn thiệt hại.
  - (f) PL3 chỉ có ba bộ cột loại đất (Z–AD, AE–AI, AJ–AN). Không chặn thì thửa khai 4 mục đích vẫn
    nộp được rồi âm thầm mất dòng thứ tư lúc xuất — mất dữ liệu không ai thấy.
- **Đường lùi cho dữ liệu cũ:** `LEGACY_CERTIFICATE_ROLE_CODES` + `normalizeCertificateRole()` đổi
  bốn mã cũ sang giá trị PL3, gọi đúng một chỗ — lúc `adoptServerDraft` tải nháp về. Không có đường
  này thì nháp cũ hiện ô "Vai trò trên GCN" trống mà người dân không hiểu vì sao.
- **Còn hở, đã ghi vào `PLAN2.md` §4.2:** hồ sơ mà **mọi** chủ thể đều là tổ chức thì
  `identityOwners` rỗng, `.every()` trả `true`, nộp được không cần ảnh CCCD nào. Mã số thuế + trụ sở
  nâng rào nhưng chưa bịt hẳn; bịt hẳn phải thu CCCD người đại diện, gộp vào đợt làm trường 14/15.
  `DONG_SU_DUNG` → `Thành viên` cũng là suy đoán gần nhất, cần cán bộ xem lại.
- **File đã sửa:** `src/modules/public-intake/types.ts` (`OWNER_TYPES`, `OWNER_TYPE_LABELS`,
  `requiresCitizenId`, `isOrganisationOwner`, `MAX_LAND_USES_PER_PARCEL`),
  `reference.ts` (`CERTIFICATE_ROLE_OPTIONS`, `CERTIFICATE_ROLE_CODES`,
  `LEGACY_CERTIFICATE_ROLE_CODES`, `normalizeCertificateRole`),
  `validation.ts` (`LAND_USE_AREA_TOLERANCE_M2`, nhánh tổ chức, giới hạn 3 dòng, dung sai),
  `src/app/ke-khai/wizard.tsx` (chuẩn hóa lúc tải nháp, ô mã số thuế / trụ sở, chặn nút thêm mục
  đích, kiểm theo bước), `tests/public-intake-validation.test.ts`, `tests/reference-catalog.test.ts`,
  `PLAN2.md`.
- **Không đổi schema Google Sheets** — bốn sửa đổi đều nằm trong giá trị của cột đã có, nên **không
  cần chạy lại `migrate:public-intake`** cho riêng đợt này (cảnh báo `old_ward` từ đợt trước vẫn còn
  hiệu lực).
- **Kiểm tra:** `npx tsc --noEmit` sạch · `npm run lint` sạch · `npx vitest run` **129/129 xanh**
  (thêm 10 test: hộ gia đình và đồng sử dụng bắt buộc CCCD, tổ chức cần MST + trụ sở, từ chối vai
  trò ngoài danh mục, khóa thứ tự hai danh mục PL3, ánh xạ bốn mã cũ, ca `29,16`/`29,2` của PL3 mẫu
  phải qua còn `29,16`/`30` phải chặn, giới hạn 3 dòng) · `npm run build` sạch · `/ke-khai` chạy dev
  không lỗi console, các chuỗi mới (`Cộng đồng dân cư`, `Mã số thuế`, `Địa chỉ trụ sở`,
  `Thêm mục đích sử dụng (tối đa …)`) có mặt trong bundle client.

---

## [2026-07-22] Thêm trường "đơn vị hành chính cũ" của thửa đất

- **Agent:** Claude Code
- **Thay đổi:** Thêm ô chọn bắt buộc _"Thửa đất thuộc đơn vị nào trước sáp nhập?"_ ở bước Thửa đất:
  Xã Phú Hộ (cũ) / Xã Hà Thạch (cũ) / Phường Phong Châu (cũ) / Không rõ.
- **Lý do:** Mảnh cuối để `lookupNewMapSheet` chạy được. Ba xã cũ đều đánh số tờ bản đồ từ 1, nên
  không có trường này thì "tờ 5" ra ba đáp án (5, 89, hoặc 148) và không thể điền trường 19 của PL3.
- **`KHONG_RO` là lựa chọn hợp lệ, không phải để trống:** bắt buộc người dân chọn một mục, nhưng có
  lối thoát. Phân biệt được "chưa xác định" với "chưa ai đụng tới" — để trống thì hai trạng thái
  này lẫn vào nhau khi cán bộ lọc hàng chờ.
- **File đã sửa:** `src/modules/public-intake/types.ts` (thêm `Parcel.oldWard`),
  `reference.ts` (`OLD_WARD_OPTIONS`), `validation.ts` (kiểm ở ranh giới tin cậy),
  `repository.ts` (ghi vào `PUBLIC_PARCELS`), `src/app/ke-khai/wizard.tsx` (ô chọn + kiểm theo bước),
  `src/modules/bootstrap/schema.ts` (cột `old_ward`), `scripts/migrate-public-intake.ts`,
  `tests/public-intake-validation.test.ts`.
- **Migration:** cột `old_ward` thêm ở **cuối** `PUBLIC_PARCELS` để không dịch cột của dữ liệu đã
  có (mã định vị theo chỉ số cột). `scripts/migrate-public-intake.ts` nay còn **nối cột thiếu vào
  tab đã tồn tại**, không chỉ tạo tab mới — vẫn idempotent, chỉ nối thêm chứ không đổi tên/chèn
  giữa/xóa. **Phải chạy `npm run migrate:public-intake` trước khi deploy bản này.**
- **Kiểm tra:** `vitest run` 119/119 đạt (3 test mới: bắt buộc chọn, chấp nhận `KHONG_RO`, từ chối
  mã lạ); typecheck và lint sạch; `/ke-khai` tải không lỗi console và trường mới có trong chunk gửi
  xuống trình duyệt.
- **Chưa làm:** màn hình chi tiết của cán bộ chưa hiện `oldWard` — nằm trong hạng mục lớn hơn "chi
  tiết cán bộ chưa hiển thị đầy đủ land-use/assets" đã ghi nhận từ trước.

## [2026-07-22] Bảng tham chiếu tờ bản đồ cũ → mới cho Phong Châu (trường 19 của PL3)

- **Agent:** Claude Code
- **Bối cảnh:** Chủ dự án cung cấp `Tai lieu/PL3.xlsx` (bộ **49 trường**, đích xuất cuối cùng — khác
  với 15 trường Phụ lục 8 đang làm) và `Tai lieu/DS THAM CHIEU PHUTHO VINHPHUC HOABINH 25052026.pdf`
  (313 trang, 33.309 dòng), yêu cầu quy đổi số tờ trên GCN sang số tờ bản đồ hiện nay khi xuất báo cáo.
- **Thay đổi:** Trích 164 dòng có xã mới là Phường Phong Châu (mã `07954`, khớp mẫu PL3), sinh
  `src/modules/public-intake/map-sheet-reference.ts` kèm hàm `lookupNewMapSheet`.
- **Quy tắc quy đổi:**
  - Xã Phú Hộ (07954): tờ 1–84 → **giữ nguyên số**.
  - Xã Hà Thạch (07963): tờ 1–59 → tờ **85–143**.
  - Phường Phong Châu cũ (07945): 21 tờ → tờ **144–164**.
- **Phát hiện quan trọng — khóa tra cứu phải gồm TỶ LỆ:** phường Phong Châu cũ có **hai** bộ bản đồ
  đánh số độc lập từ 1. Tờ 7 tỷ lệ 1/500 ra tờ 150, tờ 7 tỷ lệ 1/1000 ra tờ 156. GCN thường không
  ghi tỷ lệ nên ca này **không tự quyết được** — hàm trả `AMBIGUOUS` để cán bộ đối chiếu. Đã kiểm
  bằng test: đây là ca mập mờ **duy nhất** trong toàn bộ 164 dòng.
- **File đã tạo:** `src/modules/public-intake/map-sheet-reference.ts`,
  `tests/map-sheet-reference.test.ts`.
- **File đã sửa:** `docs/brain/01-architecture.md`.
- **Lý do:** Trường 19 "Số hiệu tờ trên bản đồ địa chính" của PL3 đang trống ở mọi dòng mẫu — đây
  chính là việc cần tự động hóa.
- **Kiểm tra:** `vitest run` 116/116 đạt (11 test mới, gồm ca mập mờ tờ 7 và ca số 0 đứng đầu như
  `"07"` mà PL3 mẫu dùng); typecheck và lint sạch. Đối chiếu tổng: 84+59+21 = 164 dòng, tờ mới phủ
  kín 1–164 không trùng không khuyết.
- **Trường còn thiếu đã được bổ sung ngay sau đó** — xem entry kế tiếp cùng ngày.
- **Bảng này KHÔNG giải quyết trường 20** ("Số thứ tự thửa trên bản đồ địa chính") — nó chỉ quy đổi
  số tờ, không quy đổi số thửa. Trường 20 vẫn cần nguồn khác hoặc cán bộ làm thủ công.

## [2026-07-22] Sửa lỗi ảnh JPG từ Zalo bị từ chối; thêm danh bạ cán bộ và phạm vi áp dụng

- **Agent:** Claude Code
- **Vấn đề:** Người dùng thật báo "một số đuôi ảnh không hoạt động, có người dùng đuôi JPG nhưng
  không được". Ảnh chụp màn hình kèm theo cho thấy tên tệp dạng
  `z8070298699198_b736ca25543c2e1e8d31942dab4553cf.jpg` — **tên tệp ảnh Zalo**.
- **Nguyên nhân gốc:** Client gửi thẳng `File.type` lên `uploads/initiate`, route so khớp tuyệt đối
  với `ACCEPTED_MIME_TYPES`. Ảnh nhận qua Zalo/Messenger thường về với `File.type` **rỗng** (hệ điều
  hành không có đăng ký cho phần mở rộng) hoặc bí danh **`image/jpg`** — không có trong danh sách,
  nên bị 400 "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc HEIC" dù tệp là JPEG hợp lệ. Thuộc tính
  `accept` chỉ có MIME còn khiến nhiều trình quản lý tệp Android làm mờ đúng ảnh cần chọn.
- **Thay đổi:**
  - Thêm `modules/public-intake/image-format.ts`: quy bí danh (`image/jpg`, `image/pjpeg`,
    `image/x-png`, `image/heic-sequence`…) về tên chuẩn, suy từ phần mở rộng khi trình duyệt khai
    rỗng, và chuỗi `IMAGE_FILE_ACCEPT` có cả đuôi lẫn MIME.
  - `initiate` chuẩn hóa loại rồi **trả `mimeType` đã chuẩn** về client; client dùng đúng giá trị đó
    cho `Content-Type` của lệnh PUT, không dùng lại `File.type` — lệnh PUT phải khai đúng loại đã
    đăng ký với phiên resumable.
  - Ảnh GCN nay cũng đi qua `prepareCitizenIdImage` (chuyển HEIC→JPEG) như ảnh CCCD. Trước đó chỉ
    ảnh CCCD được chuyển, ảnh GCN chụp bằng iPhone đi thẳng lên Drive ở dạng HEIC.
  - Ghi chú "Đã tải N ảnh GCN" đếm theo **tổng** ảnh của hồ sơ thay vì theo lượt chọn tệp vừa rồi
    (trước đó chọn 2 lượt × 1 ảnh hiển thị "Đã tải 1 ảnh" dù danh sách có 2 dòng — thấy rõ trong ảnh
    chụp màn hình người dùng gửi). Khóa React của danh sách kèm vị trí vì tệp Zalo dễ trùng tên.
  - Thêm `modules/public-intake/support-contacts.ts`: danh bạ cán bộ hỗ trợ theo 8 tổ dân phố, đầu
    mối tư vấn chung, và `COVERAGE_NOTICE` về phạm vi áp dụng. Hiển thị ở khối "Không tự làm được?"
    (link `tel:` bấm gọi thẳng) và ngay đầu `/ke-khai`.
- **File đã tạo:** `src/modules/public-intake/image-format.ts`,
  `src/modules/public-intake/support-contacts.ts`, `tests/image-format.test.ts`.
- **File đã sửa:** `src/modules/public-intake/storage.ts`,
  `src/app/api/public/submissions/current/uploads/initiate/route.ts`, `src/app/ke-khai/wizard.tsx`,
  `src/app/ke-khai/page.tsx`, `docs/brain/01-architecture.md`, `docs/brain/03-decisions.md`.
- **Lý do:** Lỗi định dạng chặn người dân thật ngay ở bước tải ảnh — họ có tệp đúng nhưng hệ thống
  bảo sai. Danh bạ và phạm vi áp dụng để người dân biết gọi ai và biết trước mình có thuộc địa bàn
  không, thay vì kê khai xong mới bị từ chối.
- **Không làm yếu kiểm soát:** Giá trị chuẩn hóa chỉ là lời khai lúc tạo phiên. Chốt chặn thật vẫn
  là `verifyUploadedFile` đọc `mimeType` do Drive nhận dạng **từ nội dung tệp** — PDF đổi đuôi
  `.jpg` vẫn bị chặn và xóa.
- **Kiểm tra:** `vitest run` 105/105 đạt (thêm 10 test mới cho `image-format`, gồm đúng ca tên tệp
  Zalo với `File.type` rỗng); `npm run typecheck` và `npm run lint` sạch; `next build` đạt. Kiểm
  trực tiếp `/ke-khai` trên dev server: danh bạ hiện đủ 8 tổ, 8 liên kết `tel:`, phạm vi áp dụng
  hiện đầu trang, không tràn ngang ở khung 375px, console không lỗi.
- **Tồn đọng đã chủ dự án xác nhận cùng ngày (2026-07-22), cập nhật ngay:**
  1. TDP Hà Thạch — đồng chí Dương Văn Dũng: bổ sung số `0964216333`.
  2. Số trùng là của đồng chí Hoàng Minh Trung (không phải Vũ Đình Lâm) — sửa thành `0375998437`
     cho cả hai tổ Phú An/Phú Lợi mà đồng chí phụ trách. Số của Vũ Đình Lâm (`0962558662`) giữ
     nguyên, nay không còn trùng ai.
- **Đã chốt, KHÔNG sửa:** `NEIGHBORHOOD_HINTS` giữ nguyên **10 tổ dân phố**. Chủ dự án xác nhận
  (2026-07-22) danh sách 10 là đúng; danh bạ cán bộ chỉ có 8 đầu mối vì một cán bộ phụ trách nhiều
  tổ, không phải vì thiếu tổ. Đừng rút danh sách này xuống 8.

## [2026-07-22] Sửa lỗi tải ảnh CCCD báo "Chủ sử dụng không hợp lệ" (400)

- **Agent:** Claude Code
- **Vấn đề:** Chủ dự án test trên production, tải đủ hai mặt CCCD nhưng
  `POST /api/public/submissions/current/uploads/initiate` luôn trả **400** kèm
  "Chủ sử dụng của ảnh CCCD không hợp lệ", giao diện lại báo thiếu ảnh.
- **Nguyên nhân gốc — hai bản nháp có ID chủ sử dụng khác nhau:**
  - Trình duyệt sinh nháp riêng lúc mở trang: `emptyDraft(newId(), …)` (`wizard.tsx`).
  - Máy chủ sinh nháp riêng lúc tạo hồ sơ: `emptyDraft(randomUUID(), …)`
    (`api/public/submissions/route.ts`).
  - Khi tải ảnh, client gửi `ownerId` của nó; route `initiate` tra
    `record.draft.owners.find(c => c.id === ownerId)` trong nháp **của máy chủ** → không thấy → 400.
  - Nháp chỉ được đồng bộ khi bấm "Tiếp tục", mà ảnh CCCD lại tải **trước** lúc đó, nên không lần
    nào tải được. Lỗi có hai biểu hiện: (1) ngay chủ sử dụng đầu tiên, (2) mỗi khi người dân thêm
    người mới rồi tải ảnh ngay.
- **Thay đổi:**
  - Thêm `adoptServerDraft()`: sau khi tạo hồ sơ, lấy nháp máy chủ về bằng
    `GET /api/public/submissions/current`. Chọn hướng _lấy về_ thay vì _đẩy lên_ vì ở lần khôi phục
    (`recovered`), nháp máy chủ mới là bản có dữ liệu đã lưu — đẩy bản rỗng trên máy lên sẽ xoá dữ
    liệu người dân.
  - `handleCitizenIdUpload` gọi `saveDraft()` trước khi tải ảnh, để chủ sử dụng vừa thêm chắc chắn
    đã có trong nháp máy chủ.
- **Lỗi thứ hai phát hiện trong lúc kiểm chứng (do chính lượt trước gây ra):** siteverify của
  Cloudflare với **khóa sandbox** không trả trường `action` và luôn báo `hostname: "example.com"`
  (đã kiểm bằng curl). Phép kiểm nghiêm ngặt thêm ở lượt trước vì thế chặn luôn khóa test — tức
  quy trình chạy local ghi trong `.env.example`/`05-testing-and-deploy.md` **thực ra không dùng
  được**, và lượt trước chưa hề chạy thử đường verify này. Sửa: nhận diện bộ khóa sandbox công bố
  công khai của Cloudflare và bỏ qua hai phép kiểm đó; khóa thật vẫn kiểm nghiêm ngặt như cũ.
  Nhận diện dựa trên secret trong cấu hình máy chủ nên kẻ tấn công không tác động được.
- **File đã sửa:** `src/app/ke-khai/wizard.tsx`, `src/modules/public-intake/turnstile.ts`,
  `tests/turnstile.test.ts`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 95/95 (+2), `build` ✅.
  **Chạy thật đầu-cuối trên máy** (Google Sheets + Drive thật, khóa Turnstile sandbox tạm thời rồi
  khôi phục lại khóa thật ngay sau): tạo hồ sơ `200` → `GET /current` `200` (đồng bộ ID) →
  `PATCH /current` `200` (đẩy nháp) → `uploads/initiate` **`200`** (trước khi sửa là `400`) →
  `uploads/complete` `200`. Không còn thông báo "Chủ sử dụng … không hợp lệ".

---

## [2026-07-22] Deploy production đầu tiên; cờ tạm mở chốt chặn để test không domain

- **Agent:** Claude Code
- **Bối cảnh:** Chủ dự án yêu cầu deploy lên Vercel để test trên điện thoại. `git push` ở entry
  trước đã tự kích hoạt build qua GitHub integration nhưng **lỗi**: thiếu `ORIGIN_SHARED_SECRET`
  trên Vercel (biến bắt buộc, `/ke-khai` throw `EnvironmentValidationError` lúc prerender).
- **Thay đổi:**
  - Link thư mục local với Vercel project `capphongchau` (`vercel link`).
  - Sinh `ORIGIN_SHARED_SECRET` ngẫu nhiên, thêm vào Vercel Production + Preview (dạng Sensitive).
  - Deploy `vercel deploy --prod` → build thành công, alias `https://capphongchau.vercel.app`.
    `GET /api/health/google` trả `ok` cho cả oauth/drive/sheets/schema — tích hợp Google hoạt động
    đúng trên production thật.
  - Kiểm tra `vercel domains ls` / `vercel inspect`: **không có domain tùy chỉnh** nào gắn với
    project này, chỉ có `*.vercel.app`. Chủ dự án nhầm URL Vercel là domain đã "cài trên
    Cloudflare" — thực ra chỉ mới tạo widget Turnstile (khớp với key thật đã thấy trên Vercel từ
    trước), chưa có domain/DNS/Transform Rule nào cả. Vercel giữ DNS zone của `*.vercel.app`, chủ
    dự án không sở hữu nên không thể trỏ Cloudflare vào được.
  - Vì vậy `GET /ke-khai` trả **404** đúng như thiết kế chốt chặn (xem entry lớp biên trước) — nó
    chặn đúng thứ nó sinh ra để chặn, kể cả khi chính chủ dự án gọi trực tiếp. Để chủ dự án test
    được ngay, thêm cờ `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` — mặc định không đặt (chốt chặn vẫn
    bắt buộc), chỉ tắt được khi đặt đúng chuỗi `"true"`. Xem quyết định kỹ thuật đầy đủ trong
    `03-decisions.md`.
- **File đã sửa:** `src/modules/public-intake/edge-guard.ts`, `.env.example`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 93/93 (+3), `build` ✅.
  Test mới khóa hành vi cờ: mặc định vẫn đòi header ở production; giá trị không phải chuỗi `"true"`
  chính xác (`"1"`, `"TRUE"`) không có tác dụng — tránh bật nhầm qua toán tử truthy.
- **CẦN LÀM SAU (bắt buộc trước pilot dữ liệu thật):** Xóa `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE`
  khỏi Vercel ngay khi có domain thật gắn Cloudflare. Xem checklist domain/Cloudflare trong
  `05-testing-and-deploy.md` §"Cấu hình Cloudflare".

---

## [2026-07-22] Áp design system Cherry Gold Civic Glass, bỏ banner bản chạy thử

- **Agent:** Claude Code
- **Thay đổi:**
  - Bỏ khối cảnh báo "BẢN CHẠY THỬ — DỮ LIỆU ĐƯỢC LƯU THẬT" ở đầu `/ke-khai` theo yêu cầu chủ dự án.
  - `globals.css` thay toàn bộ token cũ (xanh lá dịch vụ công) bằng bảng token của `DESIGN.md` §4:
    thang cherry và gold đầy đủ, nền/chữ/viền, màu ngữ nghĩa, bo góc, đổ bóng, thời lượng chuyển
    động. Giữ nguyên tên sáu biến mà JSX đang dùng (`--accent`, `--muted`, `--danger`,
    `--warning-surface`, `--warning-border`, `--foreground`) và ánh xạ chúng sang bảng mới, nên đổi
    được toàn bộ diện mạo mà không phải sửa rải rác trong component.
  - Restyle `pc-input/select/textarea/card/button` theo §7: nút chính cherry-700, nút phụ viền
    cherry-200 chữ cherry-800, focus ring 2px + `--shadow-focus`, chiều cao điều khiển 44px trên
    desktop và 48px trên mobile (§6.3, §7.2). Thêm `.pc-button-gold` cho CTA vàng và `.pc-code`
    cho mã hồ sơ/mã bí mật (mono, `tabular-nums`, bôi đen được — §4.4).
  - `prefers-reduced-motion` giờ áp cho toàn trang, không riêng panel bước (§12.4).
  - Thêm dải gradient cherry→gold ở đầu trang chủ và `/ke-khai` làm điểm neo thị giác, thay vì phủ
    màu thương hiệu dày (§1.3).
- **Phạm vi cố ý không làm:** `DESIGN.md` mô tả cả app shell nội bộ, sidebar, dashboard, bảng dữ
  liệu, modal kính mờ và một cây route khác (`/app/ho-so`, `/public/bat-dau`…). Những màn hình đó
  **chưa tồn tại**; đổi cây route sẽ phá hợp đồng API đang chạy. Lần này chỉ làm mốc "M0 — Nền tảng
  thiết kế" của chính `DESIGN.md` §18, là phần các màn hình sau kế thừa được ngay.
- **File đã sửa:** `src/app/globals.css`, `src/app/page.tsx`, `src/app/ke-khai/page.tsx`,
  `src/app/ke-khai/wizard.tsx`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 90/90, `build` ✅. Đo trên
  trình duyệt: token áp đúng (nút cherry-700 `#991b35`, cao 44px desktop / 48px mobile, bo 10px);
  không tràn ngang ở 360×800, 390×844 và 1440×900; không lỗi console.
- **Sửa thêm một lỗi tương phản của chính DESIGN.md:** `--text-muted` (#83777b) trên nền trắng đo
  được **4.29:1**, dưới ngưỡng AA 4.5:1 mà §13 yêu cầu. Giữ nguyên giá trị token theo §4.2 nhưng
  `.pc-field-hint` chuyển sang `--text-secondary` (7.0:1). Các cặp màu còn lại đều đạt: chữ chính
  15.9:1, chữ trắng trên nút cherry 7.9:1, nút phụ 11.0:1, danger 6.5:1, chữ trên nút vàng 8.9:1.

---

## [2026-07-22] Sửa lỗi quét QR CCCD và thêm nút quét chủ động

- **Agent:** Claude Code
- **Vấn đề:** Chủ dự án báo quét QR "không hoạt động". **Nguyên nhân gốc: thiếu hint
  `TRY_HARDER`.** Ở cấu hình mặc định, ZXing chỉ quét một số dòng ngang cố định của ảnh, nên mã QR
  có đọc được hay không phụ thuộc việc nó rơi trúng dòng quét nào — kết quả thất thường chứ không
  theo ngưỡng dự đoán được. Đo trên 9 bố cục: QR 120px **trượt**, 150px đọc được, 240px **trượt**,
  300px đọc được — cùng một khung ảnh 1200×1600. Ảnh gốc 12MP chụp dọc và ảnh vuông cũng trượt.
  Bật `TRY_HARDER` đọc được **9/9**, tốn 7–52ms. Đây là lý do lỗi sống sót qua thử nghiệm tay:
  vài bố cục ngang vẫn chạy đúng.
- **Thay đổi:**
  - `citizen-id-qr.client.ts` viết lại đường giải mã: truyền `TRY_HARDER`, thu nhỏ cạnh dài về
    1600px, và dùng `decodeFromCanvas` đọc thẳng pixel.
  - Bỏ vòng lặp thử 4 hướng xoay. Nó chỉ tồn tại để chữa cháy đúng lỗi trên (xoay ảnh dọc thành
    ngang thì đôi khi may mắn đọc được), trong khi QR vốn bất biến với hướng xoay. Cách cũ tạo 3
    chuỗi data URL vài MB từ ảnh 12MP — chậm, tốn bộ nhớ, và trên iOS canvas quá lớn có thể trả
    ảnh rỗng khiến quét hỏng im lặng.
  - Thêm nút **"Quét QR căn cước"** ngay đầu khối thông tin từng chủ sử dụng: mở camera chụp một
    kiểu mặt sau thẻ, giải mã tại chỗ, tự điền các ô bên dưới. Ảnh này **không** được tải lên.
  - Gộp phần đổ dữ liệu QR vào chủ sử dụng thành `applyQrResult` dùng chung cho hai đường (đọc
    ngầm khi tải ảnh, và quét chủ động), kèm cờ `force` phân biệt hai hành vi ghi đè.
- **File đã tạo:** `tests/citizen-id-qr-decoding.test.ts`.
- **File đã sửa:** `src/modules/public-intake/citizen-id-qr.client.ts`, `src/app/ke-khai/wizard.tsx`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 90/90 (+8), `build` ✅.
  Test mới khóa lại kết luận đo được: liệt kê đúng các bố cục mà cấu hình mặc định trượt, và
  khẳng định `TRY_HARDER` đọc được tất cả — ai bỏ hint đi thì test đỏ. Trang `/ke-khai` nạp sạch,
  không lỗi console hay server.
- **Chưa kiểm chứng được ở môi trường này:** camera thật trên điện thoại, và luồng quét trong thẻ
  chủ sử dụng (phải tạo một bản kê khai thật mới hiện ra khối đó — thao tác ghi dữ liệu thật vào
  Sheets/Drive nên chưa tự ý chạy). Cần một lượt thử trên điện thoại với thẻ căn cước thật.
- **Rủi ro còn lại cần thẻ thật để kiểm:** `parseCitizenIdQr` yêu cầu đúng 7 trường ngăn bằng `|`
  và 12 chữ số ở trường đầu. Chưa ai đối chiếu định dạng này với **thẻ căn cước mẫu 2024**. Ngoài
  ra chưa ép `CHARACTER_SET`, nên nếu thẻ không khai báo ECI UTF-8 thì địa chỉ có dấu tiếng Việt
  có thể ra sai chữ. Cả hai chỉ kết luận được khi quét một thẻ thật — **không được đoán rồi nới
  lỏng parser**.

---

## [2026-07-22] Lớp biên cổng công khai: chặn đi vòng qua Cloudflare + Turnstile

- **Agent:** Claude Code
- **Vấn đề:** `/api/public/*` và `/ke-khai` là bề mặt ẩn danh, mỗi lần tạo nháp sinh một thư mục
  Drive và hai dòng Sheets, mà toàn bộ kho nằm trên **một tài khoản Gmail cá nhân**. Trước thay
  đổi này cả mã nguồn chỉ có đúng một dòng TODO — không Turnstile, không rate limit, không chặn
  đường gọi thẳng `*.vercel.app`. Một script đơn giản đủ đốt hết quota Drive/Sheets trong một
  đêm. Đây là hạng mục "chặn trước khi mở công khai" trong `04-current-tasks.md`.
- **Thay đổi (phần code — phần dashboard Cloudflare do chủ dự án làm):**
  - `edge-guard.ts`: so sánh constant-time header `X-Origin-Auth` do Cloudflare gắn với
    `ORIGIN_SHARED_SECRET`. Chỉ bắt buộc khi `NODE_ENV=production` — gồm cả Preview của Vercel.
    Đây là nhánh theo môi trường triển khai, **không** có đường nào để người gọi tự khai mình
    đáng tin.
  - `turnstile.ts`: siteverify với timeout 5s, **fail-closed** mọi hướng (lỗi mạng, timeout,
    HTTP lỗi, body không parse được đều là từ chối), kiểm cả `action` lẫn `hostname`, không log
    token.
  - Va chạm đã lường: token Turnstile dùng một lần, còn luồng tạo nháp **cố ý retry cùng
    idempotency key** trên mạng yếu. Nếu chặn thẳng `timeout-or-duplicate` thì phá đúng bản sửa
    lỗi mạng yếu ngày 2026-07-21. Cách xử lý: phân biệt "token đã dùng" với "token giả" — token
    đã dùng chỉ được đi tiếp vào **đường replay idempotency**, không bao giờ tạo bản mới
    (`StaleChallengeError`).
  - Gắn chốt chặn ở ba điểm: `resolvePublicRequest` (phủ 4 route `current/*`), route tạo nháp, và
    trang `/ke-khai` (404 khi không qua Cloudflare). Cố ý **không** dùng middleware: `proxy.ts`
    sửa matcher có rủi ro hai chiều (`PLAN_NL` §10.1) và Edge runtime không có `timingSafeEqual`.
  - Widget Turnstile ở hai hành động `create` và `submit`; token gắn với đúng hành động, lấy
    widget mới sau mỗi lần dùng, nút hành động khóa khi chưa có token.
- **File đã tạo:** `src/modules/public-intake/edge-guard.ts`,
  `src/modules/public-intake/turnstile.ts`, `src/components/turnstile-widget.tsx`,
  `tests/edge-guard.test.ts`, `tests/turnstile.test.ts`, `tests/public-surface-guard.test.ts`.
- **File đã sửa:** `src/modules/common/env.ts`, `src/modules/public-intake/route-context.ts`,
  `src/app/api/public/submissions/route.ts`,
  `src/app/api/public/submissions/current/submit/route.ts`, `src/app/ke-khai/page.tsx`,
  `src/app/ke-khai/wizard.tsx`, `src/proxy.ts` (chỉ thêm comment), `.env.example`,
  `tests/env.test.ts`, `tests/public-submission-create.test.ts`.
- **Kiểm tra:** `typecheck` ✅, `lint` ✅, `format:check` ✅, `test` ✅ 82/82 (+22), `build` ✅.
  Test mới gồm: gọi thẳng deployment không có header → từ chối; header sai giá trị/sai độ dài →
  từ chối; Turnstile fail-closed khi siteverify timeout hoặc lỗi mạng; token sai `action` hoặc
  sai hostname → từ chối; token đã dùng + có nháp cũ → replay được; token đã dùng + chưa có nháp
  → **không** tạo mới; mọi route `/api/public` đều qua chốt chặn (test tự liệt kê thư mục, route
  mới quên gắn sẽ đỏ); matcher `proxy.ts` chặn đúng đường cán bộ và không chạm `/ke-khai`.
  Chạy thật trên trình duyệt: `/ke-khai` render widget, test key cấp token, nút mở khóa;
  `POST /api/public/submissions` thiếu token → 403, token giả → 403 kèm thông báo không lộ chi
  tiết. Hai lượt 403 này bị chặn **trước** mọi lệnh gọi Google. Chưa chạy tạo nháp trọn vẹn vì
  thao tác đó ghi dữ liệu thật vào Sheets/Drive của chủ dự án.
- **Chưa xong (phần dashboard, AI không làm được):** DNS proxy qua Cloudflare, SSL Full (strict),
  Transform Rule gắn `X-Origin-Auth`, cache rule bypass `/api/*` + `/ke-khai*`, rate limiting
  rules, và đặt ba biến môi trường mới trên Vercel cho cả Production lẫn Preview. Chưa làm xong
  các mục này thì `ORIGIN_SHARED_SECRET` ở origin **chưa có tác dụng bảo vệ nào**.
- **Ghi chú cho agent sau:** chưa có chỗ nào đọc `CF-Connecting-IP`. Khi làm audit HMAC(IP) thì
  bắt buộc chỉ đọc header đó **sau** khi đã qua `isTrustedEdgeRequest`, nếu không ai cũng tự khai
  IP tùy ý (`PLAN_NL` §10.2).

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

## [2026-07-21] Chuẩn bị saga tiếp nhận chính thức an toàn

- **Agent:** Codex
- **Thay đổi:** Sửa ánh xạ các cột `PUBLIC_SUBMISSIONS` để mọi transition/lưu nháp/submit bảo toàn
  consent, thời hạn lưu, `official_case_id` và checkpoint. Thêm guard/API `POST
/api/submissions/:submissionId/accept`, định nghĩa checkpoint saga, kiểm tra role/CSRF/version/
  idempotency và khóa rõ ràng khi danh mục mã trường 12 còn placeholder. UI hiển thị nút tiếp nhận
  bị khóa cùng lý do; ảnh preview vẫn sử dụng được.
- **File đã sửa:** `src/modules/public-intake/repository.ts`, `src/modules/submissions/acceptance.ts`,
  `src/app/api/submissions/[submissionId]/accept/route.ts`, `src/app/api/submissions/[submissionId]/route.ts`,
  `src/components/submission-detail.tsx`, `tests/submission-*.test.ts`, `AGENTS.md` và tài liệu brain.
- **Lý do:** Tiếp nhận chính thức là quy trình nhiều hệ thống (Sheets + Drive); không được promotion
  nửa chừng hoặc ghi dữ liệu thật bằng mã danh mục demo.
- **Kiểm tra:** TypeScript, ESLint, 55/55 Vitest, Prettier và `git diff --check` đạt.

## [2026-07-21] Dùng mã loại đất theo Thông tư 08/2024/TT-BTNMT cho bản demo

- **Agent:** Codex
- **Thay đổi:** Thay danh mục loại đất minh họa bằng các mã dùng trong Mục A, Phụ lục II Thông tư
  08/2024/TT-BTNMT; thêm version catalog và test. Mã nguồn gốc, hình thức, thời hạn được giữ là
  mã chuẩn hóa nội bộ để map về danh mục trao đổi của VPĐKĐĐ sau này.
- **Nguồn:** Công báo điện tử Chính phủ, Thông tư 08/2024/TT-BTNMT, hiệu lực 01/08/2024.
- **Kiểm tra:** TypeScript, ESLint, Vitest và Prettier.

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

## [2026-07-21] Cặp ảnh CCCD theo người và tự điền QR từ ảnh

- **Agent:** Codex
- **Thay đổi:** Chuyển bước đầu của `/ke-khai` thành tạo nháp sau đồng ý rồi tải cặp CCCD mặt trước/mặt sau cho từng cá nhân (tối đa 10). Browser chuyển HEIC cục bộ, dùng ZXing thử ảnh/xoay, parse QR bảo thủ và chỉ lưu dữ liệu tách, hash, phiên bản xử lý; người kê khai phải xác nhận kết quả QR. QR thất bại bắt buộc nhập tay ngày sinh, giới tính và thường trú. Bổ sung liên kết `owner_id` cho ảnh, thay ảnh an toàn `REPLACED`, migration append-only và preview cán bộ cho hai mặt.
- **File đã sửa:** `wizard.tsx`, public upload/submit routes, public-intake types/repository/QR parser, schema bootstrap, migration script, test và tài liệu kiến trúc.
- **Lý do:** Giảm thời gian nhập CCCD nhưng không dùng OCR; hỗ trợ QR ở mặt sau thẻ căn cước mới và đối chiếu đầy đủ hai mặt.
- **Kiểm tra:** `npm.cmd run test` (59/59), `typecheck`, `lint`, `format:check`, `build` và `git diff --check` đạt. Cần chạy migration schema trước deploy.

---

## [2026-07-22] Áp dụng migration cặp CCCD trên Google Sheets

- **Agent:** Codex
- **Thay đổi:** Chạy `migrate:citizen-id-pairs`, thêm append-only `owner_id` vào `FILES`, `IDENTITY_QR_SCANS`, `PUBLIC_FILES`; thêm ngày sinh, giới tính, thường trú, nguồn và metadata QR vào `PUBLIC_OWNERS`.
- **Lý do:** Đồng bộ schema Google Sheets thật với luồng cặp ảnh CCCD theo từng cá nhân.
- **Kiểm tra:** Chạy lại migration ngay sau đó không ghi thêm cột nào, xác nhận idempotent.

---

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

---

## [2026-07-22] Thực thi Gói A — tra cứu, khôi phục, đối chiếu GCN cũ và bổ sung có cấu trúc

- **Agent:** Codex
- **Thay đổi:** Thêm cookie phiên v2 có locator/access-version; API và trang `/tra-cuu`; khóa 5
  lần sai/15 phút; file summary phục hồi sau reload; preview có audit; timeline công khai; yêu cầu
  bổ sung theo field/file và khóa các trường ngoài yêu cầu; trạng thái `RESUBMITTED` và
  `NO_ACTION_REQUIRED`; tra cứu GCN cũ bằng HMAC 256 bucket sau xác minh cặp ảnh CCCD + CCCD + họ
  tên + ngày sinh; cảnh báo hồ sơ pending; cấp lại mã bí mật cho quản trị viên sau xác minh trực
  tiếp. Bỏ lần chụp QR riêng, đưa hai ảnh CCCD lên đầu phần cá nhân và cho gõ ngày cấp GCN trực
  tiếp. Thêm công cụ dry-run/apply nhập Excel cũ và báo cáo dòng lỗi không chứa PII.
- **File chính:** `src/modules/public-intake/{workflow,session,repository}.ts`, schema bootstrap,
  public/staff API routes, `/tra-cuu`, `wizard.tsx`, `submission-detail.tsx`,
  `scripts/import_existing_certificates.py`, test và tài liệu kiến trúc.
- **Dữ liệu import:** 7.916 dòng nguồn; 7.038 dòng hợp lệ; 878 dòng loại; 3.826 GCN; 4.517 liên
  kết chủ; 289 dòng thuộc nhóm xung đột; 2.521 dòng lặp trong cùng quan hệ. Đã chạy migration
  append-only và `--apply` bằng pepper thật vào Google Sheets cấu hình; chạy lại xác nhận nguồn
  `COMPLETED` không ghi trùng. Đọc kiểm tra sau import: 3.826 GCN = 3.746 `VERIFIED` + 80
  `CONFLICT`, 4.517 liên kết chủ và 4.394 mục chỉ mục công khai; chỉ `VERIFIED` được tra cứu.
- **Kiểm tra:** `npm.cmd run lint`, `npm.cmd run typecheck`, Vitest 22 file/133 test,
  `npm.cmd run build`, kiểm tra cú pháp Python và `git diff --check` đều đạt. Migration tạo 8 tab,
  nối 3 cột; import thật và kiểm tra idempotency đều đạt.

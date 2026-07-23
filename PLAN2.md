# Kế hoạch triển khai — bản cập nhật 2026-07-22

> Thay thế bản kế hoạch "vận hành 20.000 hồ sơ bằng Google Sheets và My Drive" ngày 22/7.
> Bản gốc còn trong lịch sử Git (commit `1181c09`) để đối chiếu.
>
> Bản này gom toàn bộ vấn đề đã rà soát: kết quả soi mã nguồn, phép tính lại tải trọng,
> hai tài liệu nghiệp vụ mới (`PL3.xlsx`, `DS THAM CHIEU`), và các quyết định chủ dự án đã chốt.

---

## 0. Bốn thay đổi lớn so với bản trước

|                             | Bản trước                           | Bản này              | Vì sao                                                                                                                                                                                                     |
| --------------------------- | ----------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sharding 10 spreadsheet** | Trục chính của kế hoạch             | **Bỏ**               | Quota Sheets tính theo _người dùng_, không theo spreadsheet. Cả 10 shard đều ghi bằng một tài khoản → chia kho nhân được **0 lần** thông lượng. Giới hạn 10 triệu ô cũng không phải ràng buộc ở quy mô này |
| **Kiểm thử tải**            | Đặt ở cuối, trước khi mở chiến dịch | **Đưa lên đầu**      | Bản trước để phép thử quyết định "Sheets hay PostgreSQL" ở cuối 14–18 tuần. Trượt là mất trắng công                                                                                                        |
| **Mục tiêu dữ liệu**        | 15 trường Phụ lục 8                 | **49 trường PL3**    | `Tai lieu/PL3.xlsx` là đầu ra cuối cùng chủ dự án xác nhận                                                                                                                                                 |
| **Duyệt hồ sơ**             | Cán bộ đọc thủ công                 | **Gemini đối chiếu** | Chủ dự án chốt 22/7 — xem `docs/brain/03-decisions.md`                                                                                                                                                     |

Ước công: **~1,5 tuần** cho nhóm chặn pilot (mục 1–3), thay vì 14–18 tuần của bản trước.
Phần lớn khoản tiết kiệm đến từ việc bỏ sharding và `CONTROL_PLANE`.

---

## 1. Đã làm xong (2026-07-22)

| Việc                                                                        | Commit               |
| --------------------------------------------------------------------------- | -------------------- |
| Sửa ảnh JPG từ Zalo bị từ chối oan (`File.type` rỗng / bí danh `image/jpg`) | `0c48075`            |
| Ảnh GCN cũng chuyển HEIC→JPEG như ảnh CCCD                                  | `0c48075`            |
| `accept` có cả phần mở rộng — Android không còn làm mờ ảnh hợp lệ           | `0c48075`            |
| Danh bạ cán bộ hỗ trợ theo tổ dân phố + phạm vi áp dụng                     | `0c48075`, `3d84aa0` |
| Bảng tham chiếu tờ bản đồ cũ → mới (164 dòng, trường 19 của PL3)            | `4f32e27`            |
| Trường "đơn vị hành chính cũ" của thửa đất                                  | `177fa8e`            |

**Đã chạy 2026-07-22 trên Google Sheet đang cấu hình:** `npm run migrate:public-intake` (cột
`old_ward` và schema Gói A). Google Sheet của môi trường khác vẫn phải chạy trước deploy.

---

## 2. Điều kiện chặn — bắt buộc xong trước dữ liệu thật

Xếp theo mức thiệt hại nếu bỏ qua.

### 2.1. Khôi phục hồ sơ bằng mã tiếp nhận + mã bí mật — **rủi ro vận hành số một**

Phiên chỉ sống **2 giờ trượt, trần 12 giờ** (`session.ts`). Người dân bắt đầu buổi sáng, chiều
quay lại là mất sạch. Tải lại trang, đóng trình duyệt, đổi máy — cũng mất.

Nặng hơn: mã nguồn đang **hứa** với người dân _"Nhập lại mã tiếp nhận và mã bí mật để tiếp tục"_
(`route-context.ts:88`) — một màn hình **chưa được viết**. `accessSecretMatches` là mã chết,
`failedAttempts` / `lockedUntil` không nơi nào ghi.

Ở 20.000 hồ sơ, chỉ 10% gặp cảnh này là **2.000 người dân gọi lên phường** mà cán bộ không có cách
nào giúp.

- [ ] Trang "Tra cứu / tiếp tục hồ sơ": mã tiếp nhận + mã bí mật + Turnstile; dùng được cho cả
      **nháp chưa gửi** và **hồ sơ đã gửi**
- [ ] Đếm sai, khóa tạm — dùng `failedAttempts`/`lockedUntil` đã có sẵn cột
- [ ] Cấp lại session + CSRF, trả về nháp, **danh sách ảnh đã tải**, trạng thái, yêu cầu bổ sung
- [ ] `GET /api/public/submissions/current` phải trả file summary (hiện chỉ trả `draft`)
- [ ] Sửa `certificatePhotos` đang là state client thuần — tải lại trang là về 0 dù ảnh đã ở Drive

#### Tra cứu sau khi đã nộp — người dân phải tự trả lời được ba câu hỏi

1. **Tôi đã nộp chưa?** Hiện mã tiếp nhận, trạng thái bằng tiếng Việt, thời điểm gửi/cập nhật gần
   nhất và mã hồ sơ chính thức nếu đã tiếp nhận. Ánh xạ trạng thái tối thiểu:
   `DRAFT` → Chưa gửi; `SUBMITTED`/`RESUBMITTED` → Đã gửi; `UNDER_REVIEW` → Đang kiểm tra;
   `NEEDS_SUPPLEMENT` → Cần bổ sung; `ACCEPTING` → Đang tiếp nhận; `ACCEPTED` → Đã tiếp nhận;
   `REJECTED` → Không tiếp nhận; `EXPIRED` → Hết thời hạn lưu nháp.
2. **Tôi đã nộp những gì?** Hiện checklist theo từng người và từng GCN: CCCD mặt trước, CCCD mặt
   sau, số ảnh GCN, tên/nhãn tài liệu, thời điểm hệ thống xác nhận upload và trạng thái
   `Đã nhận`/`Đã thay`/`Không còn hiệu lực`. Dữ liệu phải lấy từ `PUBLIC_FILES` đã xác minh, không
   lấy từ state trình duyệt hoặc chỉ dựa vào tên file.
3. **Tôi còn thiếu gì?** Hệ thống tự tính các mục bắt buộc chưa đủ theo schema hiện hành và gộp với
   yêu cầu bổ sung của cán bộ. Mỗi mục cần có: người/GCN liên quan, trường hoặc ảnh còn thiếu, lý do,
   hướng dẫn bổ sung và thời hạn nếu cơ quan có quy định. Khi đủ phải hiện rõ **"Hồ sơ hiện không
   còn nội dung cần bổ sung"**.

- [ ] API tra cứu trả DTO tối thiểu: `status`, `statusLabel`, `updatedAt`, `officialCaseId` đã che khi
      cần, `fileSummary`, `completionChecklist`, `missingItems` và `supplementRequest`; không trả Drive ID,
      link Drive, QR raw, CCCD đầy đủ hoặc `draft_json` ngoài phiên đã xác thực
- [ ] Màn tra cứu có timeline trạng thái, nút "Bổ sung hồ sơ" chỉ mở khi `NEEDS_SUPPLEMENT`, và nút
      "Tiếp tục bản nháp" chỉ mở khi `DRAFT`
- [ ] Việc xem danh sách tài liệu/ảnh nhạy cảm phải qua mã tiếp nhận + mã bí mật, rate limit,
      `private, no-store`; xem ảnh phải ghi audit. Không mở trang tra cứu công khai chỉ bằng CCCD hoặc
      số điện thoại; việc đối chiếu CCCD trước khi nộp chỉ thực hiện trong phiên kê khai có kiểm soát
      theo mục 5.1
- [ ] Yêu cầu bổ sung phải lưu cấu trúc theo mục cần sửa/ảnh cần thay, không chỉ một đoạn ghi chú;
      gửi lại phải giữ lịch sử lần nộp trước để người dân và cán bộ cùng đối chiếu

**Ước 3–4 ngày** cho khôi phục nháp + tra cứu sau nộp + checklist thiếu/đủ; chưa gồm luồng cán bộ
soạn yêu cầu bổ sung có cấu trúc ở mục 6.1.

### 2.2. Đồng ý và thông báo bảo vệ dữ liệu

- [ ] Server đang tự ghi `draft.consentAccepted = true` vô điều kiện (`submissions/route.ts:230`) — phải kiểm thật
- [ ] Giới hạn kích thước `draft_json`: hiện `validateDraftForSave` **chỉ kiểm số điện thoại**, toàn bộ object client gửi được `JSON.stringify` vào một ô Sheets (trần 50.000 ký tự)
- [ ] **Nội dung thông báo bảo vệ dữ liệu** — hiện là placeholder trong `wizard.tsx:940`, phải nêu cả việc chuyển dữ liệu ra nước ngoài cho Gemini → _chỉ người có thẩm quyền nghiệp vụ soạn được_

### 2.3. Bịt lỗ định danh

Chọn **"Hộ gia đình"** hoặc **"Tổ chức"** hiện bỏ qua **toàn bộ**: số định danh, ngày sinh, giới
tính, địa chỉ, **và cả hai ảnh CCCD**. `identityOwners.every()` trên mảng rỗng trả `true` nên nộp
được hồ sơ chỉ với một cái tên + một ảnh GCN.

PL3 mẫu có CCCD ở **cả 6 dòng**, kể cả 3 dòng hộ gia đình (CCCD của chủ hộ) → đây chắc chắn là lỗi,
không phải thiết kế.

### 2.4. Lớp biên

- [ ] Gỡ `PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE` khỏi Vercel (đang **BẬT** trên production)
- [ ] Domain thật sau Cloudflare, WAF, rate limit
- [ ] Security headers (`next.config.ts` hiện không có header nào)
- [ ] OAuth consent screen chuyển `In production`
- [ ] Backup có **đường phục hồi đã thử**, tách khỏi tài khoản gốc

---

## 3. Tải trọng — sửa ba chỗ, không cần sharding

### 3.1. Phép tính lại

Bản trước đặt mục tiêu **150 lượt/giờ** trong ngân sách **45 lần ghi/phút**. Hai con số này
**không cùng đúng được**. Đếm trên mã hiện tại, mỗi hồ sơ tiêu **~22–31 lần ghi** cho cả vòng đời:

| Giai đoạn                            | Số lần ghi   |
| ------------------------------------ | ------------ |
| Tạo nháp                             | 1            |
| Autosave (mỗi lần 1 `values.update`) | 10–20        |
| Hoàn tất mỗi file                    | ~7           |
| Gửi chính thức                       | 1 (đã batch) |
| Cán bộ nhận xử lý                    | 2            |
| Saga tiếp nhận                       | ~10          |

150 × 22 ÷ 60 = **55 lần ghi/phút** — vượt ngân sách 45, sát trần cứng 60/phút/người dùng.

### 3.2. Quota ĐỌC — hạng mục bản trước bỏ sót hoàn toàn

`repository.ts:229` đọc **toàn bộ** dải `PUBLIC_SUBMISSIONS!A2:S` mỗi request rồi tìm trong bộ
nhớ. Cột S chứa nguyên `draft_json` của **mọi** hồ sơ. Ở 2.000 hồ sơ, mỗi lần người dân bấm lưu là
kéo về **~8 MB** chỉ để lấy một dòng. Không có cache ở bất kỳ đâu.

Quota đọc cũng **60/phút/người dùng**. Mỗi autosave = 1 đọc + 1 ghi; mỗi lần khởi tạo upload = 2
đọc. Đọc chạm trần **trước** ghi.

Chú thích ngay trong mã thừa nhận: _"Tối đa 500 bản kê khai ở pilot nên đọc theo lô, không phân
trang"_ (`repository.ts:265`).

### 3.3. Ba chỗ sửa

| #   | Việc                                                                                          | Công     | Hiệu quả                      |
| --- | --------------------------------------------------------------------------------------------- | -------- | ----------------------------- |
| 1   | **Lưu số dòng vào cookie phiên** (đã ký HMAC, nâng `v1`→`v2`), đọc đúng dải `A{dòng}:S{dòng}` | 0,5 ngày | Payload đọc **giảm ~500 lần** |
| 2   | **Autosave chỉ khi đổi bước** + `localStorage` để không mất phần đang gõ                      | 1 ngày   | −10 lần ghi/hồ sơ             |
| 3   | **Gộp audit vào cùng batch** với lệnh ghi trạng thái                                          | 0,5 ngày | −6 lần ghi/hồ sơ              |

Số dòng an toàn để đưa vào cookie: bảng chỉ append, không xóa nên số dòng bất biến; cookie có chữ
ký nên không giả được; và kể cả giả được thì `submission_id` đọc ra không khớp phiên → từ chối.

### 3.4. Kết quả

|                                  | Trước    | Sau               |
| -------------------------------- | -------- | ----------------- |
| Lần ghi/hồ sơ                    | ~22–31   | **~15–20**        |
| Payload đọc mỗi request          | tới 8 MB | **~4 KB**         |
| Năng lực ở ngân sách 45 ghi/phút | ~90/giờ  | **~135/giờ**      |
| Tổng 20 ngày × 8 giờ             | ~14.400  | **~21.600 hồ sơ** |

**Đạt 20.000 với một spreadsheet duy nhất.**

### 3.5. Spike đo tải — làm trước, không làm sau

- [ ] Script phát lại đúng hồ sơ đọc/ghi thật lên spreadsheet nháp 2.000 dòng, tăng tải đến khi 429
- [ ] Đo **cả đọc lẫn ghi**, không chỉ ghi
- [ ] Chạy **sau** ba chỗ sửa ở 3.3, để xác nhận chứ không phải để quyết kiến trúc

Nếu spike vẫn trượt sau khi sửa → mới xét PostgreSQL + object storage.

---

## 4. Mở rộng dữ liệu theo PL3 (49 trường)

`Tai lieu/PL3.xlsx` là đích xuất cuối cùng. Khác Phụ lục 8 ở ba điểm:

- **49 trường** (đánh số 1–49, **thiếu 21 và 22**), không phải 15
- **Mỗi dòng = một (GCN × thửa × người)** — dòng 9/10 của mẫu là cùng GCN, cùng thửa, hai dòng cho chồng và vợ
- Giá trị ghi **bằng chữ** (`Đất ở tại đô thị`, `Lâu dài`), không phải mã

### 4.1. Hai danh mục chính thức đã tìm được trong dropdown của PL3

Đây là câu trả lời cho mục "chưa chốt nội hàm trường 7" treo từ đầu dự án:

- **Trường 12 — Pháp nhân trên GCN:** `Cá nhân · Hộ gia đình · Vợ chồng · Đồng sử dụng · Cộng đồng dân cư · Tổ chức`
- **Trường 13 — Vai trò pháp nhân:** `Cá nhân · Chủ hộ · Chồng · Vợ · Người đại diện · Thành viên`

Hệ thống hiện **sai cả hai**: `OWNER_TYPES` thiếu _Đồng sử dụng_ và _Cộng đồng dân cư_;
`CERTIFICATE_ROLE_OPTIONS` **không trùng giá trị nào**. Cấu trúc hai trường thì đúng, chỉ giá trị sai.

### 4.2. Bốn lỗi sửa được ngay, không phụ thuộc câu trả lời của cơ quan

- [x] **(c)** Sửa giá trị trường 12/13 theo dropdown PL3
- [x] **(d)** Dung sai diện tích — quy tắc hiện tại **từ chối chính dữ liệu PL3 mẫu** (dòng 9: thửa `29,16` m², loại đất `29,2` m² → báo lỗi "tổng vượt diện tích thửa")
- [x] **(e)** Bịt lỗ Hộ gia đình / Tổ chức (xem 2.3)
- [x] **(f)** Giới hạn **3** dòng mục đích mỗi thửa cho khớp PL3 (hiện không giới hạn → thửa có 4 mục đích sẽ mất dữ liệu khi xuất)

**Xong ngày 2026-07-22.** Chi tiết ở `docs/brain/06-ai-working-log.md`. Ba điểm cần biết:

- Bốn mã vai trò cũ (`CHU_SU_DUNG`/`DONG_SU_DUNG`/`DAI_DIEN_HO`/`DAI_DIEN_TO_CHUC`) đã có ánh xạ
  sang giá trị PL3, tự đổi khi tải nháp cũ. `DONG_SU_DUNG` → `Thành viên` là **suy đoán gần nhất**
  (PL3 xếp "Đồng sử dụng" vào trường 12 chứ không phải 13) — hồ sơ cũ mang mã này cần cán bộ xem lại.
- Dung sai diện tích chốt **0,5 m²**, đủ che sai số làm tròn 0,1 m² trên tối đa ba dòng.
- **Còn hở:** hồ sơ toàn chủ thể là tổ chức vẫn nộp được mà không có ảnh CCCD nào. Đã nâng rào bằng
  mã số thuế đúng định dạng + địa chỉ trụ sở, nhưng bịt hẳn thì phải thu CCCD **người đại diện** —
  việc này gộp vào đợt làm trường 14/15 (người sử dụng hiện tại).

### 4.3. Trường 19 — đã tự tính được

Bảng tham chiếu 164 dòng đã trích từ `DS THAM CHIEU ... 25052026.pdf`:

| Đơn vị cũ            | Mã    | Tờ trên GCN | Tờ Phong Châu mới   |
| -------------------- | ----- | ----------- | ------------------- |
| Xã Phú Hộ            | 07954 | 1–84        | **giữ nguyên 1–84** |
| Xã Hà Thạch          | 07963 | 1–59        | **85–143**          |
| Phường Phong Châu cũ | 07945 | 21 tờ       | **144–164**         |

**Cái bẫy:** phường Phong Châu cũ có **hai bộ bản đồ cùng đánh số từ 1**. Tờ 7 tỷ lệ 1/500 → tờ
**150**; tờ 7 tỷ lệ 1/1000 → tờ **156**. GCN thường không ghi tỷ lệ nên hàm trả `AMBIGUOUS` cho cán
bộ quyết, không đoán. Test xác nhận đây là ca mập mờ **duy nhất** trong 164 dòng.

GCN theo **bản đồ giấy** (khoảng năm 2000) tra không thấy → trả `NOT_FOUND`, tự động rơi vào danh
sách cán bộ đối chiếu thủ công thay vì bị gán bừa.

### 4.4. Còn thiếu so với PL3

| Nhóm                             | Trường            | Trạng thái                                                                                                                                                                      |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nhà ở / chung cư                 | 40–48 (9 trường)  | ❌ Chưa thu. `Asset` hiện chỉ có loại + mô tả                                                                                                                                   |
| Người sử dụng hiện tại           | cột O, P + 14, 15 | ✅ **Đã thu** (2026-07-23). Bật khi người trên GCN đã mất/sang tên; miễn ảnh CCCD người trên GCN, khai Tên + CCCD + Địa chỉ 2 cấp + Lý do (thừa kế/tặng cho/chuyển nhượng/khác) |
| Số thứ tự thửa trên BĐ địa chính | 20                | ❌ **Không có nguồn nào** — bảng tham chiếu chỉ quy đổi số _tờ_, không quy đổi số _thửa_                                                                                        |
| Tên file quét                    | 49                | ❌ Cần sinh PDF đặt tên `{số phát hành}-GCN.pdf` và `-GT.pdf`                                                                                                                   |
| Mã ĐVHC cấp xã                   | 1                 | ✅ Đã biết: **`07954`**                                                                                                                                                         |

### 4.5. Bẫy chất lượng dữ liệu nằm ngay trong PL3 mẫu

- `D6 = '9/10/1017'` — **năm 1017**, lỗi gõ của 2017, lọt vào file mẫu chính thức. ✅ **Đã làm** (2026-07-23) `VietnameseDateInput` (ba ô số Ngày/Tháng/Năm): kiểm ngày hợp lệ, chặn ngày tương lai, năm sinh ≥ 1900, năm cấp GCN ≥ 1987 → chặn đúng lỗi `1017`. Dùng cho cả ngày sinh và ngày cấp GCN
- Cột ngày **trộn hai kiểu**: `D5` là chuỗi `'20/02/2006'`, `D7` là datetime thật. Export phải chuẩn hóa
- Diện tích thửa `29,16` vs diện tích loại đất `29,2` (xem 4.2 mục d)

---

## 5. Biểu mẫu người dân

- [ ] `VietnameseDateInput` dùng chung: gõ `DD/MM/YYYY` bằng bàn phím số, nhận `15-08-1992`/`15081992`, lịch là tùy chọn, kiểm năm hợp lý và không cho ngày tương lai. Áp cho ngày sinh, ngày cấp GCN, ngày hết hạn
- [ ] Chuẩn hóa số thập phân kiểu Việt: `123,5` · `123.5` · `1 234,5` (hiện `Number("123,5")` = `NaN`)
- [ ] Ảnh GCN: xem trước, xóa mềm, thay, sắp xếp, gắn nhãn trang (hiện **chỉ hiện tên file, không có nút xóa**)
- [ ] Đưa khối **"Ảnh căn cước công dân" lên đầu phần thông tin của từng người**. Trên cùng một màn
      hình cho chọn/chụp luôn đủ hai ô **Mặt trước** và **Mặt sau**, có preview, tiến độ tải và nút thay
      riêng từng mặt; sau đó mới tới các ô họ tên, số CCCD, ngày sinh, giới tính, địa chỉ
- [ ] Ngay khi có ảnh, trình duyệt tự thử đọc QR từ **cả hai ảnh đã chọn** rồi gợi ý điền thông tin;
      dữ liệu QR vẫn phải được người dân kiểm tra/xác nhận và không ghi đè nội dung họ đã sửa tay
- [ ] **Không yêu cầu chụp/tải thêm ảnh thứ ba chỉ để quét QR.** Nút "Đọc lại QR" phải dùng lại hai
      ảnh CCCD hiện có. Sau khi tải lại trang hoặc đổi thiết bị, ứng dụng lấy preview riêng tư qua API
      rồi thử đọc lại trên thiết bị; chỉ yêu cầu thay ảnh nếu file thực sự hỏng/không đọc được, không bắt
      tải lại cả hai mặt
- [ ] Khi triển khai, cập nhật quyết định cũ trong `docs/brain/03-decisions.md` đang cho chụp thêm một
      ảnh riêng để quét; yêu cầu mới tại mục này **thay thế** quyết định đó
- [ ] QR không đọc được không được chặn lưu/gửi; chuyển sang nhập tay và giữ nguyên hai ảnh đã tải
- [ ] Trang kiểm tra cuối hiển thị **đầy đủ** nội dung + nút "Sửa" từng khối (hiện chỉ đếm số lượng)
- [ ] Danh mục dài (loại đất **45 mục**) cần **ô tìm kiếm lọc**, không phải `<select>` thuần — 45 dòng chữ dài trên màn hình 375px là không dùng được
- [ ] Mục "Không tìm thấy — ghi theo bìa" + ô chữ tự do, cho GCN cũ ghi "đất thổ cư", "đất vườn"
- [ ] Mục "Tôi không chắc — đề nghị cán bộ đối chiếu"
- [ ] Accessibility: `id`/`htmlFor`, `name`, `autoComplete`, `aria-describedby`, tự chuyển focus tới lỗi đầu tiên. Hiện **toàn repo không có một `htmlFor` nào**

### 5.1. Kiểm tra hồ sơ đã có theo CCCD — chỉ yêu cầu nộp phần còn thiếu

Mục tiêu của luồng này là tận dụng dữ liệu phường đã có, không bắt người dân nộp lại cùng một GCN.
Đây **không phải** trang tìm hồ sơ đất đai công khai bằng số CCCD.

**Chốt sau khi soi kho thật `24.7.2026_PhuongPhongChau (đã có dữ liệu).xlsx` (2026-07-23):**

- **Khóa tra = CCCD.** Kho có 5.041 dòng; **99% cá nhân có CCCD 12 số** (3.492 CCCD phân biệt).
  Số phát hành GCN chỉ phủ 90% và định dạng bẩn (`AĐ 266864`, `W 654083`) → không dùng làm khóa
  chính. Số GCN chỉ là **lối phụ** cho 218 dòng có GCN mà thiếu CCCD.
- **BỎ ngày sinh khỏi khóa khớp.** Kho có **87% ngày sinh chỉ ghi mỗi năm** (`1989`), phần còn lại
  định dạng Mỹ `mm/dd/yyyy`. HMAC hiện gồm `CCCD+tên+ngày sinh` (cả `workflow.ts` lẫn script import)
  sẽ **trượt ~87%** vì app gửi ngày sinh đầy đủ. Phải đổi khóa về **CCCD** (tên chỉ để người dân
  nhìn xác nhận, không băm vào khóa). **Đây là lỗi chặn — chưa sửa thì đừng bật tính năng.**
- **Chống dò: bắt buộc quét QR** (phương án chủ dự án chốt 2026-07-23). Vì đã bỏ ngày sinh, khóa chỉ
  còn CCCD; ô tra nhanh chỉ mở khi có QR CCCD hợp lệ trong phiên (đang cầm thẻ thật), không cho gõ
  tay số CCCD rồi dò. Thay cho yêu cầu "đủ hai ảnh CCCD" ở bản trước.
- **Tổ chức (280 dòng, 0 có CCCD):** khớp bằng mã số thuế; kho ghi dạng `N/A-796300046` → bóc tiền
  tố `N/A-` lấy 10 số. **92 dòng** không CCCD lẫn GCN → cán bộ thủ công.
- Đối chiếu chuẩn hóa **Python (import) vs TS (app)** phải có vector test chung: `toLocaleUpperCase("vi-VN")`
  (TS) vs `.upper()` (Python) có thể lệch, lệch là trượt âm thầm.

Hai file kia: `24.7.2026 PhuongPhongChau (hiện trạng dữ liệu).xlsx` là **bảng phân loại chất
lượng/trạng thái theo thửa** (đã xuất sổ, đồng bộ 3 khối, đang vận hành) — nguồn để gắn cờ
`REUSABLE`, không phải nguồn định danh. `PL3.xlsx` là dữ liệu thô (bộ 49 trường, đích xuất).

**Hai điểm kích hoạt trên cùng khối thông tin CCCD:**

1. QR đọc thành công → người dân kiểm tra và bấm **"Xác nhận thông tin"** → hệ thống tự chạy kiểm
   tra hồ sơ đã có.
2. QR không đọc được → người dân nhập CCCD 12 số → bấm **"Kiểm tra hồ sơ đã có"**. Nút chỉ bật khi
   CCCD hợp lệ; muốn chọn tái sử dụng GCN phải hoàn thành thêm họ tên/ngày sinh và có đủ hai ảnh CCCD
   trong phiên, tránh người khác chỉ biết một số CCCD là xem được hồ sơ.

**Kết quả phải trả lời rõ:**

- `CHƯA CÓ`: "Chưa tìm thấy hồ sơ đã nộp" → tiếp tục tải ảnh GCN như bình thường.
- `ĐÃ CÓ VÀ ĐƯỢC TÁI SỬ DỤNG`: hiện các GCN ở dạng che một phần số phát hành, ngày cấp và trạng thái
  `Đã có trong hệ thống — không cần nộp lại`; người dân xác nhận đúng/sai và vẫn có nút **"Tôi có
  thêm GCN khác"**.
- `ĐÃ CÓ DỮ LIỆU NHƯNG CHƯA ĐỦ MINH CHỨNG`: thông báo hệ thống đã có thông tin, chỉ yêu cầu đúng ảnh
  hoặc trường còn thiếu; không bắt khai lại toàn bộ.
- `CÓ DỮ LIỆU MÂU THUẪN/TRÙNG`: không hiển thị thông tin của chủ thể khác, không tự liên kết; chuyển
  cán bộ kiểm tra và vẫn cho người dân tiếp tục kê khai.

**Điều kiện để bỏ qua việc nộp lại:**

- Bản ghi cũ phải được chuẩn hóa thành quan hệ **CCCD HMAC ↔ chủ thể ↔ GCN**, có nguồn dữ liệu và
  trạng thái `REUSABLE` do cơ quan xác nhận. Không đánh dấu toàn bộ dữ liệu Excel cũ là tái sử dụng
  một cách tự động.
- Nếu bản ghi cũ chỉ có dữ liệu hàng/cột mà chưa có file quét, cơ quan phải quyết định loại hồ sơ nào
  được coi là đủ. Checklist của người dân chỉ đánh dấu `Đã đủ` khi quy tắc này cho phép.
- Khi người dân chọn một GCN đã có, hệ thống lưu **liên kết tới bản ghi hiện có**, không sao chép dòng
  hoặc file. Cán bộ vẫn xác nhận liên kết trước khi tiếp nhận chính thức.

**Kỹ thuật và bảo mật:**

- [ ] Import/chuẩn hóa bộ dữ liệu hiện có (tệp tổng hợp đang có 7.916 dòng, khoảng 4.351 số phát hành)
      và phân loại `REUSABLE`/`DATA_ONLY`/`CONFLICT` trước khi bật tính năng
- [ ] Tạo chỉ mục tra cứu bằng HMAC CCCD phía server (Codex đã dựng `PUBLIC_LOOKUP_INDEX` 256 cột
      theo byte đầu HMAC); không quét toàn bộ `OWNERS`/`PUBLIC_OWNERS`, không lưu CCCD rõ trong chỉ
      mục hoặc technical log
- [x] **Đổi khóa khớp về CCCD** (2026-07-23): khớp chỉ theo HMAC của CCCD. Bỏ `identityMatchHmac`
      khỏi cả hai điều kiện khớp (`findExistingCertificates`, `hasPendingIdentityMatch`); bỏ ngày
      sinh khỏi `identity_hashes` của script import Python. Ngày sinh + họ tên không còn trong khóa.
- [x] **Bắt buộc quét QR cho ô tra nhanh** (2026-07-23): `hasCompleteExistingRecordLookupIdentity`
      giờ chỉ chấp nhận `QR_CONFIRMED`. Nút "Kiểm tra GCN đã có" đường gõ tay đã gỡ khỏi wizard.
- [ ] `POST /api/public/submissions/current/existing-records/check`: chỉ chạy trong draft session đã
      đồng ý thông báo dữ liệu, có CSRF + Turnstile/rate limit; không truyền CCCD trong URL; phản hồi
      chỉ chứa kết quả đã che và không có Drive ID/link Drive, địa chỉ thửa hoặc thông tin người khác
- [ ] `POST /api/public/submissions/current/existing-records/link`: lưu `existing_record_id`,
      `owner_id`, loại khớp, nguồn và trạng thái cán bộ xác nhận; có idempotency, version và audit
- [ ] `completionChecklist` và `missingItems` phải tính cả GCN đã liên kết: hồ sơ đã có đủ thì không
      yêu cầu tải lại; chỉ thiếu phần nào mới mở đúng ô tải/nhập của phần đó
- [ ] Mọi lần kiểm tra CCCD, xem kết quả, xác nhận đúng/sai và liên kết GCN đều ghi audit nhưng chỉ ghi
      HMAC/mã nội bộ; thông báo `có`/`không có` phải chống dò hàng loạt và không tiết lộ PII

**Ước 3–4 ngày** sau khi dữ liệu cũ đã được chuẩn hóa và cơ quan chốt tiêu chí `REUSABLE`; công làm
sạch/import dữ liệu cũ tính riêng.

---

## 6. Luồng cán bộ

### 6.1. Sửa lỗi trạng thái

- [ ] Gửi lại ghi `RESUBMITTED`, không phải `SUBMITTED` (`repository.ts:555` hardcode chuỗi)
- [ ] Gửi lại phải **upsert**, không `appendCells` — hiện mỗi lần gửi lại thêm dòng owner/thửa/mục đích trùng
- [ ] Yêu cầu bổ sung / từ chối bắt buộc **mã lý do + nội dung + trường cần sửa** (schema hiện chỉ có `action` + `version`)
- [ ] `idempotency-key` phải **trả kết quả cũ** khi lặp, hiện chỉ kiểm có mặt
- [ ] Ghi trạng thái + audit **cùng một batch**
- [ ] Che PII mặc định, "Hiện để đối chiếu" có audit
- [ ] Debounce ô tìm kiếm (hiện gọi Sheets **mỗi ký tự**)
- [ ] Hiện đầy đủ land-use, assets và `oldWard` ở màn chi tiết
- [ ] Checklist theo PL3 cho từng hồ sơ

### 6.2. Gemini đối chiếu

Chốt 22/7 — chi tiết ở `docs/brain/03-decisions.md`.

**Mô hình: so lệch hai nguồn, KHÔNG điền sẵn.** Người dân tự khai (đã có), Gemini đọc độc lập từ
ảnh GCN, hệ thống so từng trường. Khớp → hạ ưu tiên duyệt. Lệch → đẩy lên đầu hàng chờ, hiện cạnh
nhau hai giá trị kèm vùng ảnh.

Điền sẵn rồi cho bấm duyệt sẽ tạo _automation bias_: ô đã điền 95% đúng khiến người duyệt bấm qua
5% sai nhiều hơn hẳn so với khi tự gõ.

**Ranh giới cứng:**

- [ ] **Chỉ gửi ảnh GCN, không gửi ảnh CCCD** — CCCD đã có QR chính xác tuyệt đối trên máy người dân
- [ ] Gửi bản preview đã hạ kích thước, không gửi ảnh gốc
- [ ] **Không sinh mã trường 12** — chỉ trích nguyên văn đoạn chữ trên bìa cho cán bộ đọc
- [ ] Mô hình trả `null` thay vì đoán
- [ ] Kết quả **không bao giờ tự ghi** vào hồ sơ chính thức
- [ ] Lưu JSON thô + version model vào `OCR_FIELDS` (append, không ghi đè)
- [ ] Cache theo `sha256Checksum` đã có sẵn — một ảnh không gọi Gemini lần hai

**Điều kiện chặn:** xác minh tài khoản Gemini đã bật thanh toán và điều khoản hiện hành **không**
dùng dữ liệu để huấn luyện (tầng miễn phí có dùng).

**Tác động:** ~5 phút/hồ sơ → ~2 phút. Vẫn cần **4–5 cán bộ** duyệt toàn thời gian — chủ dự án xác
nhận có đủ nhân sự.

### 6.3. Saga tiếp nhận

Hiện là **hard stop** (`accept/route.ts:101`). Chỉ mở khi đủ: thông báo dữ liệu cá nhân, danh mục
trường 12, mã phường, phân loại nhóm 4/5.

⚠️ `REFERENCE_IS_PLACEHOLDER` đang bị đặt `false` trong khi bảng mã chưa chốt — nên đảo về `true`
để chốt chặn nằm ở **dữ liệu**, không nằm ở một dòng `return` dễ xóa.

---

## 7. Báo cáo và xuất dữ liệu

**Chưa làm cho tới khi có danh mục chính thức** — xây export trên mã chưa chốt là làm hai lần.

Làm được ngay: **checklist từng hồ sơ** (cấu trúc độc lập với giá trị mã).

- [ ] `POST /api/exports` (hiện **không tồn tại**)
- [ ] Xuất XLSX đúng cấu trúc PL3: mỗi dòng = một (GCN × thửa × người)
- [ ] Sinh PDF theo số phát hành (trường 49)
- [ ] `EXPORT_JOBS` có checkpoint, ghi vào `03_EXPORTS`, có audit và checksum
- [ ] Chỉ hồ sơ đã xác nhận vào báo cáo chính thức; còn lại xuất riêng thành danh sách tồn đọng

---

## 8. Kiểm thử và mở dần

- Unit: ngày Việt, số thập phân, tra tờ bản đồ, trạng thái, idempotency, danh mục, checklist
- Integration: retry/quota, thay ảnh, khóa mã truy cập, gửi lại không trùng dòng, saga resume
- E2E: Android Chrome, iPhone Safari; tải lại trang, **đổi thiết bị**, 4G yếu, mất mạng giữa chừng
- E2E tra cứu sau nộp: nhập mã tiếp nhận + mã bí mật, xem đúng trạng thái, danh sách đã nộp và phần
  còn thiếu; sai mã bị giới hạn thử; không lộ Drive ID/CCCD đầy đủ; bổ sung xong checklist trở về đủ
- E2E CCCD/QR: tải mặt trước + mặt sau ngay đầu biểu mẫu, tự đọc QR từ ảnh đã chọn, tải lại/đổi máy
  vẫn nhận ra hai ảnh đã có và **không yêu cầu chụp hoặc tải lần thứ ba**
- E2E đối chiếu hồ sơ đã có: QR xác nhận thì tự kiểm tra; nhập tay CCCD thì nút kiểm tra trả đúng
  GCN đã che; GCN `REUSABLE` không bị yêu cầu tải lại; vẫn thêm được GCN mới; dữ liệu mâu thuẫn
  chuyển cán bộ và không lộ chủ thể khác
- Security: không gọi API kiểm tra nếu thiếu draft session/CSRF/consent; rate limit chống dò CCCD;
  CCCD không xuất hiện trong URL, response lỗi, audit metadata hoặc technical log
- Ảnh HEIC, ảnh 20–30 MB, **ảnh từ Zalo** (ca lỗi đã gặp thật)
- Ngày sinh/ngày cấp cũ 20–30 năm; font scaling 200%

Mở theo nấc, mỗi nấc chỉ mở khi không mất dữ liệu, retry an toàn, quota ổn định, backup/restore đạt:

1. 20 hồ sơ giả
2. 200 hồ sơ thật một tổ
3. 2.000 hồ sơ hai tổ
4. Toàn phường

---

## 9. Chờ cơ quan trả lời

Câu hỏi đã soạn sẵn để gửi cán bộ chuyên trách.

| #     | Câu hỏi                                                                                                                                                           | Ảnh hưởng                                                                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **a** | "Nguồn gốc sử dụng" có danh mục cố định không? Giá trị _"Nhận chuyển nhượng đất được Công nhận QSDĐ như giao đất có thu tiền"_ là **một mục** hay **ghép hai ý**? | **Quyết định thiết kế**: một ô chọn hay hai ô. Sai hướng thì không lỗi nào hiện ra, chỉ lệch ở báo cáo cuối |
| **b** | Cột "Loại đất" ghi tên hay ký hiệu? Theo Thông tư 08/2024 hay danh mục riêng của tỉnh?                                                                            | Cần **bảng ánh xạ mã→chữ được duyệt**. Không tự dịch nhãn                                                   |
| c     | "Thời hạn": ghi `Lâu dài` hay `Sử dụng ổn định lâu dài`? Đất có thời hạn thì ghi ngày hết hạn hay chữ?                                                            | Danh mục + mô hình dữ liệu                                                                                  |
| d     | Danh mục đầy đủ "Hình thức sử dụng"                                                                                                                               | Danh mục                                                                                                    |
| e     | Trường **21 và 22** của PL3 là gì? (số nhảy từ 20 sang 23)                                                                                                        | Phạm vi thu thập                                                                                            |
| f     | Cột O, P không có số thứ tự — thuộc bộ 49 hay cột phụ?                                                                                                            | Phạm vi thu thập                                                                                            |
| g     | Có bảng tham chiếu **số thửa** cũ→mới không?                                                                                                                      | Nếu không, trường 20 phải tra tay cho 20.000 hồ sơ                                                          |

**Nếu họ gửi file danh mục thì tự trả lời được câu (a):** file có sẵn mục ghép → một dropdown; file
có hai danh sách riêng → hai dropdown.

**Lưu ý về dropdown:** nó dập tắt hoàn toàn chuyện mỗi người ghi một kiểu, nhưng _chọn hợp lệ ≠
chọn đúng_. Vẫn cần đối chiếu ảnh (mục 6.2) và lối thoát cho bìa cũ (mục 5).

---

## 10. Việc chỉ chủ dự án làm được

- [ ] Soạn **nội dung thông báo bảo vệ dữ liệu cá nhân**, nêu cả việc chuyển dữ liệu ra nước ngoài
- [ ] Xác minh tầng dịch vụ Gemini (bật thanh toán, không dùng dữ liệu huấn luyện)
- [ ] Mua dung lượng: 20.000 hồ sơ × ~7 ảnh × ~3 MB ≈ **420 GB**, cộng preview ≈ **500–600 GB**. Tài khoản miễn phí có 15 GB
- [ ] Domain thật gắn Cloudflare
- [ ] Đếm **tỷ lệ GCN cấp cho hộ gia đình** trên ~30 GCN thật — quyết định có chặn được HGĐ hay không
- [ ] Lấy danh mục ở mục 9
- [ ] Xác nhận dữ liệu đang có trên production **là dữ liệu thử** (production đã chạy với cờ bỏ qua lớp biên và thông báo bảo vệ dữ liệu còn là placeholder)

---

## 11. Ràng buộc đã ghi nhận, không đề xuất lại

- **Kho dữ liệu:** giữ Google Sheets + Drive của tài khoản dùng chung. Chủ dự án đã quyết. Ghi chú kỹ thuật: mã nguồn **không hỗ trợ Shared Drive** (không có `supportsAllDrives` ở bất kỳ lời gọi Drive API nào) — muốn chuyển sau này phải sửa toàn bộ lời gọi, không chỉ đổi folder ID
- **Nhân sự duyệt:** chủ dự án xác nhận đủ
- **10 tổ dân phố** trong `NEIGHBORHOOD_HINTS` là đúng — danh bạ chỉ có 8 đầu mối vì một cán bộ phụ trách nhiều tổ. **Không rút xuống 8**
- **Không sharding, không PostgreSQL** cho tới khi spike ở 3.5 chứng minh là cần

---

## Phụ lục — Đối chiếu 49 trường PL3 với hệ thống

✅ đã có · ⚠️ có nhưng cần sửa · ❌ chưa có

| Cột   | STT   | Trường                                            | Nguồn trong hệ thống                                   |
| ----- | ----- | ------------------------------------------------- | ------------------------------------------------------ |
| B     | 1     | Mã ĐVHC cấp xã                                    | ✅ hằng số `07954`                                     |
| C     | 2     | Số phát hành GCN                                  | ✅ `certificate.issueNumber`                           |
| D     | 3     | Ngày cấp GCN                                      | ⚠️ `certificate.issueDate` — cần `VietnameseDateInput` |
| E     | 4     | Số vào sổ GCN                                     | ✅ `certificate.registryNumber`                        |
| F     | 5     | Tên tổ chức                                       | ⚠️ `owner.fullName` khi `ownerType=TO_CHUC`            |
| G     | 6     | Số định danh tổ chức                              | ⚠️ hiện **cho phép trống**                             |
| H     | 7     | Họ tên chủ sử dụng                                | ✅ `owner.fullName`                                    |
| I     | 8     | Ngày sinh                                         | ⚠️ cần `VietnameseDateInput`                           |
| J     | 9     | Giới tính                                         | ✅ `owner.gender`                                      |
| K     | 10    | Số định danh cá nhân / CCCD                       | ⚠️ HGĐ và Tổ chức đang bỏ qua                          |
| L     | 11    | Địa chỉ thường trú                                | ✅ `owner.residenceAddress`                            |
| M     | 12    | Pháp nhân trên GCN                                | ⚠️ `owner.ownerType` — **thiếu 2 giá trị**             |
| N     | 13    | Vai trò pháp nhân                                 | ⚠️ `owner.roleOnCertificate` — **sai toàn bộ giá trị** |
| O     | —     | Tên người sử dụng hiện tại                        | ❌                                                     |
| P     | —     | Số định danh người SD hiện tại                    | ❌                                                     |
| Q     | 14    | Địa chỉ thường trú (2 cấp)                        | ❌                                                     |
| R     | 15    | Lý do thay đổi                                    | ❌                                                     |
| S     | 16    | Mã định danh thửa đất                             | ✅ `parcel.parcelIdCode`                               |
| T     | 17    | Số tờ bản đồ ghi trên GCN                         | ✅ `parcel.mapSheetNumber`                             |
| U     | 18    | Số thứ tự thửa ghi trên GCN                       | ✅ `parcel.parcelNumber`                               |
| V     | 19    | Số hiệu tờ trên BĐ địa chính                      | ✅ **tự tính** từ `oldWard` + bảng tham chiếu          |
| W     | 20    | Số thứ tự thửa trên BĐ địa chính                  | ❌ **không có nguồn**                                  |
| X     | 23    | Địa chỉ thửa đất                                  | ✅ `parcel.addressOnCertificate`                       |
| Y     | 24    | Diện tích thửa đất                                | ⚠️ cần chuẩn hóa dấu phẩy + dung sai                   |
| Z–AD  | 25–29 | Loại đất 1 (loại/DT/nguồn gốc/hình thức/thời hạn) | ⚠️ `landUses[0]` — mã vs chữ, danh mục chưa chốt       |
| AE–AI | 30–34 | Loại đất 2                                        | ⚠️ `landUses[1]`                                       |
| AJ–AN | 35–39 | Loại đất 3                                        | ⚠️ `landUses[2]` — cần **giới hạn tối đa 3**           |
| AO    | 40    | Loại tài sản gắn liền với đất                     | ⚠️ `asset.assetType` — danh mục khác PL3               |
| AP–AW | 41–48 | Nhóm nhà ở / chung cư (8 trường)                  | ❌                                                     |
| AX    | 49    | Tên file quét GCN/CCCD                            | ❌ cần sinh PDF theo số phát hành                      |

**Tổng:** ✅ 11 · ⚠️ 12 · ❌ 14 nhóm (chưa kể O, P)

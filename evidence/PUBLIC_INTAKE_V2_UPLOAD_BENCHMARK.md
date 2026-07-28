# PUBLIC INTAKE V2 — UPLOAD BENCHMARK

## Trạng thái: CHƯA CÓ SỐ ĐO THẬT

Kế hoạch §0.2 mục 12: *"Không tuyên bố tăng tốc nếu chưa có số đo trước/sau."*

Phiên thi công này **không đo được** thời gian tải thật, vì cần:

- Google Drive OAuth thật (upload resumable đi thẳng từ trình duyệt lên Drive);
- Supabase database thật;
- thiết bị di động thật trên mạng 4G.

Không có thứ nào trong ba thứ đó ở môi trường phát triển này.

**Do đó:**

- `NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED` mặc định **`false`**.
- Mốc §18.2 (giảm ≥ 35% thời gian tải, ≥ 50% dung lượng) **chưa được nghiệm thu**.
- Không có tuyên bố hiệu năng nào trong commit hay tài liệu của lần thi công này.

---

## Cái đã kiểm được: logic quyết định

`tests/image-normalization.test.ts` (23 test) khóa các bất biến sau bằng cách giả lập
`createImageBitmap` và `canvas`:

| Bất biến | Vì sao quan trọng |
|---|---|
| Không bao giờ phóng to | Phóng to chỉ tăng dung lượng, không thêm thông tin |
| Giữ đúng tỷ lệ (sai số < 1%) | Ảnh méo làm sai tỷ lệ sơ đồ thửa trên GCN |
| Ảnh nhỏ sẵn giữ nguyên | Mã hóa lại ảnh đã gọn chỉ thêm một lượt mất chất lượng |
| Kết quả to hơn nguồn thì dùng nguồn | Không bao giờ làm chậm đi |
| `imageOrientation: "from-image"` | Thiếu nó thì ảnh chụp dọc bị xoay ngang sau khi vẽ lại canvas |
| Ảnh dọc vẫn dọc sau khi thu nhỏ | Cán bộ không phải tự xoay từng tờ |
| Giải mã lỗi → trả tệp nguồn | Trình duyệt lạ không được làm người dân kê khai không nổi |
| Kích thước 0 → trả tệp nguồn | canvas lớn trên iOS đôi khi trả ảnh rỗng |
| Canvas được đặt về 0×0 sau khi dùng | Giữ nhiều canvas lớn là đường ngắn nhất tới tab bị kill trên iOS |
| Tên tệp tải lên là `cccd.jpg` / `gcn.jpg` | Tên gốc thường mang số CCCD, tên người, ngày giờ |

**Cái này *không* chứng minh:** chữ trên GCN còn đọc được, góc giấy không mất, QR CCCD còn quét
được. Không unit test nào chứng minh được những điều đó.

---

## Việc bắt buộc phải làm trước khi bật cờ

Chạy trên **preview deployment** với thiết bị thật. Không bật cho người dân trước khi mục nào
cũng đạt.

### 1. Bộ ảnh kiểm

Tối thiểu 20 ảnh GCN **giả lập** — tự dựng hoặc dùng mẫu công khai. **Không dùng giấy tờ thật,
không commit giấy tờ thật vào repo.** Phải có đủ:

- chữ nhỏ ở phần "Thửa đất" và "Ghi chú";
- ảnh chụp xa, chụp gần;
- lóa sáng nhẹ ở một góc;
- cả ảnh dọc và ảnh ngang;
- dải dung lượng 8–20 MiB;
- ít nhất 3 ảnh HEIC từ iPhone;
- 3 ảnh CCCD có QR test (không phải CCCD thật).

### 2. Kiểm chất lượng — mọi mục phải PASS

| # | Kiểm | Đạt khi |
|---|---|---|
| Q1 | Mở ảnh sau chuẩn hóa ở 100% | Đọc được toàn bộ chữ, kể cả dòng nhỏ nhất |
| Q2 | So góc ảnh trước/sau | Không mất góc, không cắt cạnh |
| Q3 | Hướng ảnh | Ảnh dọc vẫn dọc, ảnh ngang vẫn ngang |
| Q4 | Quét QR CCCD | Tỷ lệ đọc được **không thấp hơn** trước khi bật cờ |
| Q5 | Dung lượng | Ảnh > 6 MiB: median giảm ≥ 50% |
| Q6 | Dung lượng | Sau chuẩn hóa không ảnh nào > 5 MiB (trừ ca giữ nguồn) |
| Q7 | Lỗi giải mã | Không ảnh nào rơi vào nhánh `UNCHANGED` vì decode lỗi |

Một mục Q1–Q4 trượt là **điều kiện dừng** theo §0.3 — không bật cờ, báo cáo lại.

### 3. Đo thời gian — điền vào bảng dưới

Cùng thiết bị, cùng mạng, đo lần lượt cờ tắt rồi cờ bật.

| Fixture | Thiết bị | Mạng | Cờ | Dung lượng nguồn | Dung lượng tải | Chuẩn bị (ms) | Initiate (ms) | Truyền (ms) | Complete (ms) | Retry |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| GCN-01 (JPEG 2 MiB) | | | tắt | | | | | | | |
| GCN-01 (JPEG 2 MiB) | | | bật | | | | | | | |
| GCN-02 (JPEG 8 MiB) | | | tắt | | | | | | | |
| GCN-02 (JPEG 8 MiB) | | | bật | | | | | | | |
| GCN-03 (JPEG 12 MiB) | | | tắt | | | | | | | |
| GCN-03 (JPEG 12 MiB) | | | bật | | | | | | | |
| GCN-04 (HEIC) | | | tắt | | | | | | | |
| GCN-04 (HEIC) | | | bật | | | | | | | |
| 3 ảnh GCN liên tiếp | | | tắt | | | | | | | |
| 3 ảnh GCN liên tiếp | | | bật | | | | | | | |

Ghi kèm: commit SHA trước/sau, tên trình duyệt và phiên bản, kết luận, và **giới hạn của phép
đo** (mạng di động dao động lớn; ít nhất 3 lần đo mỗi ô, lấy trung vị).

### 4. Nguồn số đo dài hạn

Sau khi bật cho nhóm test, bảng `public.public_upload_attempts` (Phase 5) là nguồn số liệu thật:
P50/P95 từng công đoạn theo loại tài liệu, nền tảng và dải dung lượng nguồn. Chạy
`scripts/report-upload-performance.ts` để lấy báo cáo — không chứa PII.

---

## Rollback

Đặt `NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED=false` và deploy lại. Không có migration nào
cần hoàn tác. HEIC vẫn được chuyển sang JPEG như trước V2.

# PUBLIC INTAKE V2 — TEST MATRIX

`npm test` — **516 pass, 10 skipped** (sau vòng rà soát; trước vòng rà soát 464; baseline trước cả
đợt V2 là 266). Không test nào bị vô hiệu hóa hay đánh dấu skip để đi qua.

## File test thêm mới

| File                                              | Số test | Khóa điều gì                                                                              |
| ------------------------------------------------- | ------: | ----------------------------------------------------------------------------------------- |
| `tests/public-intake-v2-characterization.test.ts` |      24 | Hiện trạng trước khi sửa, và các đảo chiều có chủ đích                                    |
| `tests/citizen-submit-validation.test.ts`         |      41 | Ma trận §6 — MỨC A qua nhưng MỨC C chặn                                                   |
| `tests/public-wizard-validation.test.ts`          |      53 | Kiểm tra theo từng bước; trọng tâm là **cái không còn chặn**                              |
| `tests/image-normalization.test.ts`               |      23 | Logic quyết định chuẩn hóa ảnh                                                            |
| `tests/upload-queue.test.ts`                      |      21 | Giới hạn đồng thời; một ảnh hỏng không kéo theo ảnh khác                                  |
| `tests/upload-transport.test.ts`                  |      11 | Tiến độ liên tục và **không bao giờ tụt**                                                 |
| `tests/assigned-officer.test.ts`                  |      12 | Cổng công khai không bao giờ lộ email cán bộ                                              |
| `tests/officer-assisted-intake.test.ts`           |      21 | Client không forge được nhãn `OFFICER_ASSISTED`; quyền lập hồ sơ hộ dân hẹp hơn quyền đọc |
| `tests/upload-metrics.test.ts`                    |      26 | Không PII nào lọt vào bảng số đo; số đo hỏng không phá lượt tải                           |
| `tests/public-upload-complete-route.test.ts`      |       9 | Dọn tệp mồ côi nghiêng về **giữ lại**; tên tệp do máy chủ đặt                             |
| `tests/public-intake-v2-review-fixes.test.ts`     |      13 | Các lỗi vòng rà soát — đây là những chỗ **đã từng sai**                                   |

## Ma trận §6 — hai tầng cho kết quả khác nhau

Nguồn: `tests/citizen-submit-validation.test.ts`.

| Trường hợp                   | Người dân gửi | Tiếp nhận chính thức |
| ---------------------------- | ------------- | -------------------- |
| Chỉ phone + tên + đủ ảnh     | **Pass**      | **Block**            |
| Thiếu CCCD mặt sau           | Block         | Block                |
| Thiếu ảnh GCN                | Block         | Block                |
| GCN fields trống             | **Pass**      | **Block**            |
| Số tờ/số thửa trống          | **Pass**      | Pass                 |
| Loại đất chỉ ghi raw `LUC`   | **Pass**      | **Block**            |
| CCCD text trống nhưng đủ ảnh | **Pass**      | **Block**            |
| CCCD nhập sai 11 số          | Block         | Block                |
| Tài sản trống                | Pass          | Pass                 |
| Đầy đủ PL3                   | Pass          | Pass                 |

Hai dòng "số tờ/số thửa trống" và "tài sản trống" **không** bị chặn ở tầng nào — đúng chính sách
nghiệp vụ đã chốt (§2.1 mức C của đầu bài liệt kê số tờ/số thửa là "theo quyết định nghiệp vụ",
và tài sản là "nếu có").

## Các đảo chiều có chủ đích

`tests/public-intake-v2-characterization.test.ts` được viết ở Phase 0 để **ghi lại hiện trạng**,
rồi Phase 1 đảo ngược. Sáu test chuyển từ "KHÔNG chặn" sang "chặn":

| Thiếu sót                        | Trước V2    | Sau V2                     |
| -------------------------------- | ----------- | -------------------------- |
| `oldWard` trống                  | không chặn  | `PARCEL_0_WARD_INVALID`    |
| Vai trò trên GCN                 | không chặn  | `OWNER_0_ROLE_MISSING`     |
| Ngày sinh / giới tính / địa chỉ  | không chặn  | 3 mã BLOCKING              |
| Địa chỉ trên GCN                 | không chặn  | `PARCEL_0_ADDRESS_MISSING` |
| Nguồn gốc / hình thức / thời hạn | không chặn  | 3 mã BLOCKING              |
| Không có ảnh nào                 | chỉ WARNING | 3 mã BLOCKING              |

`tests/completion-checks.test.ts` CC1 phải bổ sung fixture cho đủ điều kiện mới. **Đó là siết chặt,
không phải nới lỏng** — fixture cũ thiếu `oldWard`, thiếu nguồn gốc/hình thức/thời hạn và không có
file nào.

## Khoảng trống — chưa kiểm được

| Hạng mục                       | Vì sao                                                                                                                                          | Phải làm khi nào                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm run test:e2e`             | Playwright cần dev server + Supabase/Google credential thật                                                                                     | Trước khi merge                                               |
| Bảy kịch bản E2E §17.3         | **Đã viết** ở `tests/e2e/public-intake-v2.spec.ts`, `--list` ra 12 test; **chưa chạy lần nào**. Điều kiện ở `PUBLIC_INTAKE_V2_E2E_CHECKLIST.md` | Trước khi merge                                               |
| Chất lượng ảnh sau chuẩn hóa   | Unit test không chứng minh được "chữ còn đọc được"                                                                                              | Trước khi bật cờ                                              |
| Số đo tốc độ tải               | Thiếu Drive/Supabase thật và thiết bị 4G                                                                                                        | Trước khi tuyên bố hiệu năng                                  |
| Ma trận thiết bị di động §17.4 | Cần thiết bị thật                                                                                                                               | Trước khi mở cho người dân                                    |
| Render component wizard        | `vitest.config.ts` chỉ nhận `tests/**/*.test.ts`, dự án không có testing-library                                                                | Đã bù bằng cách tách logic ra module thuần và test 53 ca ở đó |

**Ghi chú về khoảng trống cuối:** kế hoạch §7 gợi ý `tests/public-minimal-wizard.test.tsx`. Không
làm được nếu không thêm `@testing-library/react` và sửa `vitest.config.ts` — tức là đổi stack test.
Thay vào đó toàn bộ luật kiểm tra được tách sang `public-wizard-validation.ts` (module thuần) và
test đầy đủ ở đó. Phần còn lại của wizard là JSX render, đã xác nhận bằng build + mở trang thật.

# PUBLIC INTAKE V2 — SECURITY REVIEW

Checklist §22 của `CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2.md`, đối chiếu với mã nguồn thực tế
tại commit cuối của nhánh `claude/land-declaration-process-feedback-126f2e`.

| # | Mục | Trạng thái | Bằng chứng |
|---|---|---|---|
| 1 | Không log CCCD | **ĐẠT** | Lỗi trả về chỉ có `code` + `fieldPath` + thông báo; `issuesDetails()` ở submit route không đưa giá trị người dùng nhập vào payload |
| 2 | Không log QR raw | **ĐẠT** (giữ nguyên) | `citizen-id-qr.client.ts` chỉ trả hash, không đổi ở V2 |
| 3 | Không log upload URL | **ĐẠT** | `xhr-upload-transport.client.ts` có chú thích cấm; không có `console.*` nào trong đường upload |
| 4 | Không log Drive ID ở client | **ĐẠT** | Không thêm log nào; Drive ID chỉ đi trong body request tới complete route |
| 5 | Metric không có filename/PII | **KHÔNG ÁP DỤNG** | Phase 5 chưa làm — chưa có bảng metric |
| 6 | Assisted channel không forge được | **ĐẠT** | Cổng công khai gán cứng `SELF_SERVICE`; route cán bộ lấy danh tính từ `requireActiveUser`; CHECK ở DB bắt buộc đủ dấu vết. `tests/officer-assisted-intake.test.ts` |
| 7 | Public status không trả email cán bộ | **ĐẠT** | `publicAssignedOfficer()` chỉ trả `displayName`; test khẳng định payload không chứa ký tự `@` |
| 8 | Complete cleanup không xóa file đã adopt | **KHÔNG ÁP DỤNG** | Phase 5 chưa làm; hành vi cleanup hiện tại giữ nguyên như trước V2 |
| 9 | Idempotency giữ nguyên | **ĐẠT** | `create-submission.ts` giữ nguyên logic cũ, chỉ đổi chỗ đặt; `tests/public-submission-create.test.ts` vẫn xanh |
| 10 | CSRF/Turnstile giữ nguyên | **ĐẠT** | Cổng công khai không đổi. Route cán bộ **thay** Turnstile bằng phiên đăng nhập + CSRF (mạnh hơn), không phải bỏ trống |
| 11 | Service worker không cache API/ảnh | **ĐẠT** (giữ nguyên) | Không đụng tới cấu hình PWA |
| 12 | Không lưu Blob vào localStorage/IndexedDB | **ĐẠT** | Ảnh chỉ nằm trong bộ nhớ phiên; `sessionStorage` chỉ chứa nhãn trang và khóa idempotency |
| 13 | Official acceptance full validation | **ĐẠT — siết chặt hơn trước** | `completion-checks.ts` viết lại; xem bảng bên dưới |
| 14 | Working payload cần claim | **ĐẠT** (giữ nguyên) | Không đụng `commitWorkingPayload` |
| 15 | Migration additive và có constraint | **ĐẠT** | Cả hai migration chỉ `add column if not exists`; `202607280002` có 2 CHECK |
| 16 | Error message không lộ nội bộ | **ĐẠT** | Route cán bộ không trả stack/`String(error)`; test khóa lại |

## Thay đổi làm hệ thống **an toàn hơn** so với trước V2

1. **`completionChecks` từ gác cổng thủng thành gác cổng đầy đủ.** Trước V2, hồ sơ thiếu `oldWard`,
   thiếu vai trò trên GCN, thiếu nguồn gốc/hình thức/thời hạn, thậm chí **không có ảnh nào**, vẫn
   tiếp nhận chính thức được. Hiện trạng đó được khóa bằng test trước khi sửa (commit `1cc7d93`) và
   đảo ngược trong cùng release.

2. **Không còn HMAC của chuỗi rỗng trong bảng tra cứu.** Trước V2 route submit băm `identityNumber`
   của mọi owner cá nhân. Vô hại khi CCCD còn bắt buộc, nhưng V2 cho phép để trống — nếu giữ
   nguyên, mọi hồ sơ không nhập CCCD sẽ dùng chung một khóa tra cứu trong `public_lookup_index`.

3. **Tên tệp gửi lên không còn mang PII.** Máy chủ ghép tên tệp client gửi vào tên tệp trong Drive
   (`initiate/route.ts:175`). Tên do máy ảnh hoặc người dân đặt thường chứa số CCCD, tên người,
   ngày giờ. Client nay luôn gửi `cccd.jpg` / `gcn.jpg`. Đây là lỗ có sẵn, sửa nhân tiện.

4. **Email cán bộ không ra cổng công khai.** Tính năng "cán bộ tiếp nhận là ai" được làm theo hướng
   chỉ trả tên; hồ sơ cũ chưa có tên trả `null` chứ không lùi về email.

## Điểm cần chú ý khi vận hành

- **`PUBLIC_INTAKE_SKIP_EDGE_GUARD_UNSAFE`** vẫn là cờ nguy hiểm có sẵn. Không đụng tới ở V2, nhưng
  nhắc lại: còn bật là mở `/ke-khai` và `/api/public/*` cho bất kỳ ai gọi thẳng.
- **`/ke-khai-ho` chỉ khác `/ke-khai` một gạch nối.** Ba lớp chặn (proxy Edge → trang → route) và
  `tests/public-surface-guard.test.ts` khóa cả hai chiều. Đừng gộp matcher.
- **Quyền vào `/ke-khai-ho` hiện là `SUBMISSION_READ_ROLES`** — rộng hơn mức tối thiểu cần thiết.
  Nếu muốn siết, đổi ở cả `page.tsx` và `route.ts`, đừng đổi một chỗ.

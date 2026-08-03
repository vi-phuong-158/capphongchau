# Báo cáo triển khai GCN v2

Ngày: 2026-08-03
Branch: `codex/gcn-v2-full-extraction`
Contract-first commit: `b4c850b`

## Kết luận

**PASS WITH CONDITIONS.** Bản triển khai nguồn đã qua lint, TypeScript và toàn bộ Vitest; contract
`gcn-v2.0` đi hết schema/prompt/merge/repository/API/panel/apply/completion/PL3 bằng fixture tổng hợp.
Không có migration, deploy, merge `main`, Drive/database/GCN thật hay dữ liệu định danh thật trong đợt này.

## Phạm vi đã hoàn thành

- Hợp đồng chung cho certificate, nhiều chủ, nhiều thửa/mục đích, tài sản AO–AW và biến động review-only.
- Schema Zod + JSON Schema strict, evidence theo leaf/source/page, metadata fail-closed, normalization và
  merger nhiều trang; conflict/ambiguity không được tự nạp.
- Stable key source-anchor-first, có parent anchor cho bảng con; sửa text OCR cùng anchor không tạo phần tử
  mảng trùng. Stable key và UI không hiển thị raw PII hay ID nội bộ.
- Persistence/API/local station giữ legacy ba trường, kiểm manifest/schema/prompt/model/source hash, metadata
  và cache `private, no-store`.
- Apply server-side copy-on-write với provenance; không ghi đè citizen/officer/confirmed, không cho nạp một
  phần owner mới thiếu `ownerType`, và giới hạn ba mục đích/thửa.
- Panel sáu nhóm lazy-load, hiển thị label an toàn Chủ/Thửa/Mục đích/Tài sản, ordinal ảnh từ manifest và đủ
  các evidence conflict.

## Database và compatibility

Không thêm/chạy migration. Dữ liệu mới ở JSONB result/comparison và `IntakeDraft`/working payload sẵn có;
legacy `v2.0` vẫn parse và apply qua nhánh cũ.

## Kiểm tra đã chạy

| Kiểm tra                                              | Kết quả                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm.cmd run lint`                                    | PASS                                                                                                 |
| `npm.cmd run typecheck`                               | PASS                                                                                                 |
| `npm.cmd test`                                        | PASS — 108 files, 976 tests; 4 files/28 tests skip có chủ đích                                       |
| Focus GCN v2                                          | PASS — 11 files/124 tests: contract/schema/prompt/backend/API/UI/completion/PL3/end-to-end synthetic |
| `git diff --check`                                    | PASS tại các lần kiểm tra trước final snapshot                                                       |
| Browser E2E authenticated                             | Chưa chạy: không dùng Preview/session/DB thật                                                        |
| V2 success transaction/local submit với Postgres thật | Chưa chạy: không có database rehearsal được cấp                                                      |
| `npm.cmd run build` snapshot cuối                     | PASS — compile khoảng 45 giây, TypeScript khoảng 18 giây, tạo 23 static pages                        |

## Điều kiện còn lại

1. Đo độ chính xác bằng bộ GCN đã ẩn danh có ground truth, tách khỏi unit test; không suy diễn tỉ lệ chính xác
   từ fixture tổng hợp.
2. Chạy Preview có đăng nhập với dữ liệu rehearsal để kiểm lazy panel → chọn field → apply, cùng transaction
   V2 success/local station; sau đó dọn audit rehearsal theo runbook.
3. Cùng một input/job đã hoàn tất chưa có cơ chế run-generation append-only. Rerun hiện chỉ xuất hiện khi input,
   citizen version, prompt hoặc schema đổi. Mở lại cùng job đòi hỏi migration/decision riêng để không thay đổi
   manifest gắn với result lịch sử.
4. Nếu ảnh được re-upload có file/source anchor khác, xử lý như input mới và review mapping; không tự ghép với
   phần tử AI cũ khi không có bằng chứng duy nhất.
5. Kết quả JSON không hợp lệ hiện bị từ chối trước transaction và job vẫn có thể xử lý lại, nhưng chưa ghi
   lỗi kỹ thuật redacted/audit riêng cho nhánh reject sớm; cần chốt cơ chế append-only đó trong đợt vận hành sau.
6. Merger nhiều trang đã là thư viện có unit test; local station hiện nhận JSON cuối do agent đã hợp nhất,
   chưa tự điều phối gọi merger trong CLI.

## An toàn vận hành

- Không log token, URL Drive, Drive ID, QR raw hay CCCD 12 số.
- AI chỉ đề xuất; không xác nhận định danh, không hoàn tất hồ sơ, không xuất PL3.
- Không có PR, merge hoặc deploy trong task này.

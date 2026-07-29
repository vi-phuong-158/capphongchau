# Performance baseline — Phase 1 queue pagination/search

## Phase 4 — pool Supabase và region (2026-07-29)

- Branch: `codex/phase4-pool-region`; base: `d6cb796`.
- Baseline code: Supavisor dùng `prepare: false`, SSL, `idle_timeout=20`, `connect_timeout=10` và hard-code `max: 1`; `vercel.json` chưa khai báo `regions`.
- Thay đổi code: `SUPABASE_POOL_MAX` chỉ nhận 1–3, default 1; `vercel.json` khóa `sin1`. Không migration, không thay dữ liệu hoặc quyền API.
- Benchmark Preview: **BLOCKED** cho đến khi deployment Ready và có session cán bộ Preview riêng cùng dữ liệu synthetic. Runner bắt buộc warm-up 10, đo 40 lượt/route với 4 worker; report chỉ có P50/P95, error rate, HTTP status, Server-Timing allowlist và region label.
- Tiêu chí chọn pool: chỉ chọn 2/3 nếu P95 cải thiện ≥10% so với 1, error rate 0, không timeout/deadlock/too-many-connections và peak connection <70% quota Supabase. Nếu không đạt, giữ 1. Không suy diễn hay rollout Production từ kết quả này.

## Phase 2 — mở chi tiết và preview theo yêu cầu (2026-07-29)

- Branch: `codex/phase2-detail-lazy-preview`; base: `c17254c`.
- Không migration, không thay đổi dữ liệu. Initial detail chuyển sang Server Component; client không còn GET detail khi mount. Ảnh và AI chỉ tạo request sau thao tác mở rõ ràng.
- `Server-Timing` mới: detail `detail_db`, `detail_total`; preview `preview_db`, `preview_drive`, `preview_total`. Header không chứa PII, query, Drive ID/link hay token.
- Local verification: typecheck/lint pass; unit test 75 files pass, 2 skip; 669 pass, 10 skip; webpack production build pass.
- Benchmark authenticated/P50/P95 Preview: **BLOCKED**. Không có credential/session cán bộ Preview. Preview `dpl_6TsEG6rLbPfoVQjei3ycp15qdrVN` đang build; không suy diễn số đo từ Preview cũ hay Production. Một deployment Production do CLI tạo nhầm đã được xóa khi còn `Initializing` (0 ms build), trước `Ready`; không có release Production.
- Acceptance chưa PASS cho đến khi Preview deployment từ branch này chạy và E2E có session cán bộ xác minh: SSR không có GET detail client, không preview trước click, scope file 404, role/phone masking và P95 metadata ≤ 1,5 giây hoặc có phân tích nguyên nhân.

- Ngày ghi: 2026-07-29
- Branch: `codex/perf-queue-sql-pagination`
- Base commit: `2fca1f363c8c6212692ca048c61e3929750493e8`
- Phạm vi: hàng chờ cán bộ `GET /api/submissions`
- Dữ liệu dùng: không dùng dữ liệu thật; chưa kết nối database Preview/Production

## Baseline trước thay đổi

| Kiểm tra            | Kết quả                                                 |
| ------------------- | ------------------------------------------------------- |
| `npm test`          | 68 file pass, 2 skip; 646 test pass, 10 skip; 8,29 giây |
| `npm run typecheck` | Exit 0                                                  |
| `npm run lint`      | Exit 0; 10 warning có sẵn, 0 error                      |
| `npm run build`     | Exit 0; compile 21,9 giây, TypeScript 26,3 giây         |

Đường code baseline:

```text
GET /api/submissions
→ repository.list() khi có từ khóa hoặc listSummaries() khi không có
→ lọc + sắp xếp toàn bộ trong JavaScript
→ tìm cursor bằng findIndex(submissionId)
→ cắt 100 dòng
```

`.env.local` không được dùng để benchmark vì không có bằng chứng đó là Preview. Sau đó đã xác nhận
rehearsal/Preview project ref `ddiaaweuqfvutogjckwc` (tách khỏi project ref trong `.env.local`) và chỉ
chạy thao tác trên database này.

## Trạng thái sau thay đổi code

```text
GET /api/submissions
→ listQueuePage(status, query, cursor, limit=100)
→ PostgreSQL WHERE + ILIKE + keyset
→ ORDER BY updated_at DESC, submission_id DESC
→ LIMIT 101
→ trả tối đa 100 dòng + cursor opaque
```

Migration cần áp trước code:
`supabase/migrations/202607290004_queue_search_performance.sql`.

## Kết quả migration và benchmark Preview 20.000

- Migration `202607290004_queue_search_performance.sql` đã chạy thành công, idempotent, trên rehearsal DB.
- Đã xác nhận đủ 5 index queue và generated columns.
- Chèn 20.000 hồ sơ synthetic trong transaction, chạy `EXPLAIN (ANALYZE, BUFFERS)`, sau đó `ROLLBACK`;
  không có dữ liệu benchmark tồn tại.

| Truy vấn | Plan/index chính | Execution time |
| --- | --- | ---: |
| Trang status (101 dòng) | `public_submissions_status_updated_idx` + top-N sort | 17.99 ms |
| Tìm owner chọn lọc | `public_submissions_queue_owner_trgm_idx` (Bitmap) | 4.95 ms |
| Tìm receipt (20.000 match) | `public_submissions_queue_receipt_trgm_idx` (Bitmap) | 47.22 ms |
| Tìm issue chọn lọc | status index + filter (planner không chọn trigram) | 62.60 ms |

Kết quả là warm-cache, single connection, không phải P50/P95 HTTP; cần lặp lại trên Preview deployment
để đo `queue_db_ms`/`queue_total_ms` thực tế.

Preflight tổng thể trên rehearsal đạt 29/32: còn thiếu các migration cũ `202607290001`/`202607290002`;
đây là blocker deploy code trên database này, không phải lỗi của migration queue.

## Nghiệm thu Phase 1 — lần chạy sau (2026-07-29)

- Rehearsal `ddiaaweuqfvutogjckwc` đã được reset schema `public` trong transaction; toàn bộ 20 migration được áp theo thứ tự tên file, bao gồm `202607290001`, `202607290002` và `202607290004`.
- Preflight: **32/32 PASS**. Database health/schema: **ok**.
- Preview deploy Ready: `https://capphongchau-c1dsyba2h-vi-phuong-158s-projects.vercel.app` (deployment `dpl_2bPH2zEneNfy48QE1CRZdmpVXN3o`, target không phải Production).
- Đã thêm `Server-Timing: auth, queue_db, total` cho response thành công của `GET /api/submissions`.
- Kiểm tra qua Vercel protection bypass: `/api/health/database` HTTP 200; `/api/submissions` không cookie trả HTTP 401 `UNAUTHENTICATED`, chứng minh auth guard hoạt động.
- **Chưa thể chạy E2E authenticated queue benchmark** (mở hàng chờ, status/search/cursor, P50/P95, phone masking) vì Preview credentials/session cookie không được cung cấp; Vercel env pull chỉ trả placeholder `[SENSITIVE]`. Do đó chưa có P50/P95 end-to-end và chưa kết luận Phase 1 PASS.

## Benchmark Preview còn phải chạy

1. Áp migration theo đúng thứ tự trên database Preview chứa dữ liệu giả.
2. Sinh 500, 5.000 và 20.000 hồ sơ giả/ẩn danh.
3. Chạy `EXPLAIN (ANALYZE, BUFFERS)` cho:
   - trang đầu tất cả trạng thái;
   - trang có status;
   - trang kế với hai hồ sơ cùng `updated_at`;
   - tìm mã tiếp nhận;
   - tìm số GCN;
   - tìm tên chủ.
4. Ghi P50/P95 của `GET /api/submissions`; mục tiêu định hướng P95 ≤ 1,5 giây.
5. Xác nhận không sequential scan toàn bảng ở lọc/phân trang thông thường và trigram index được dùng
   cho tìm kiếm đủ chọn lọc.

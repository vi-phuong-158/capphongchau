# REVIEW HIỆU NĂNG VÀ KẾ HOẠCH THI CÔNG ĐỀ XUẤT

**Dự án:** Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu  
**Nguồn review:** `capphongchau-main (2).zip`  
**Ngày lập:** 29/07/2026  
**Trạng thái:** Đề xuất kỹ thuật — **chưa sửa mã nguồn, chưa chạy migration, chưa deploy**

---

## 1. Kết luận dành cho người quyết định

Hệ thống chậm không phải do một lỗi đơn lẻ. Có ba “nút thắt” chính:

1. **Hàng chờ duyệt hồ sơ đang tải nhiều dữ liệu hơn mức cần thiết.** Việc lọc, sắp xếp và chia trang được thực hiện trong JavaScript sau khi đã đọc một lượng lớn bản ghi từ PostgreSQL.
2. **Tạo bản kê khai phải chờ Google Drive tạo đủ cây thư mục.** Mỗi lần tạo hồ sơ có thể phát sinh ba thao tác tìm/tạo thư mục nối tiếp nhau trước khi người dân được đi tiếp.
3. **Mở một hồ sơ duyệt kéo theo nhiều yêu cầu phụ.** Trang tải lại dữ liệu bằng API sau khi máy chủ đã kiểm tra đăng nhập, đồng thời trình duyệt tự tải tất cả ảnh; mỗi ảnh lại gọi database và Google Drive riêng.

Ngoài ra, bước **tiếp nhận chính thức** đang di chuyển từng ảnh lần lượt và ghi checkpoint database sau từng ảnh, nên hồ sơ nhiều ảnh dễ tạo cảm giác “quay mãi”.

### Phương án đề xuất

Không viết lại dự án. Thi công theo từng đợt độc lập:

- **Đợt 1:** đưa phân trang và tìm kiếm hàng chờ xuống PostgreSQL.
- **Đợt 2:** trả dữ liệu hồ sơ ngay từ Server Component và chỉ tải ảnh khi cán bộ yêu cầu xem.
- **Đợt 3:** tạo bản kê khai trước, chỉ khởi tạo thư mục Drive khi bắt đầu tải ảnh.
- **Đợt 4:** xử lý ảnh tiếp nhận theo nhóm nhỏ song song, giảm số lần ghi database và hiển thị tiến độ thật.
- **Đợt 5:** đo tải rồi mới điều chỉnh connection pool, region và bật chuẩn hóa ảnh.

**Ưu tiên nên triển khai ngay:** Đợt 1 và Đợt 2. Đây là hai đợt ít rủi ro nhất nhưng cải thiện trực tiếp phần cán bộ đang sử dụng hằng ngày.

---

## 2. Phạm vi review

Review tập trung vào hai luồng người dùng phản ánh chậm:

### 2.1. Luồng người dân kê khai

- Tạo bản kê khai;
- Lưu nháp khi chuyển bước;
- Chuẩn bị và tải ảnh CCCD/GCN;
- Khôi phục hồ sơ;
- Gửi hồ sơ.

### 2.2. Luồng cán bộ duyệt

- Mở hàng chờ;
- Lọc và tìm hồ sơ;
- Mở chi tiết;
- Xem ảnh;
- Nhận xử lý, chỉnh sửa và tiếp nhận chính thức.

Không review sâu thuật toán nghiệp vụ PL3, AI extraction hoặc phân quyền ngoài phần có ảnh hưởng trực tiếp tới hiệu năng.

---

## 3. Bằng chứng chính trong mã nguồn

| Mã      | Mức độ | Phát hiện                                                                      | Bằng chứng                                                                                                  |
| ------- | ------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| PERF-01 | **P0** | Hàng chờ đọc toàn bộ danh sách rồi mới chia trang                              | `src/app/api/submissions/route.ts:27`, `:58`, `:90`; `repository.list()` và `listSummaries()` đọc toàn bảng |
| PERF-02 | **P0** | Tìm kiếm đọc cả `draft_json` của toàn bộ hồ sơ                                 | `src/app/api/submissions/route.ts:54-87`                                                                    |
| PERF-03 | **P0** | Tạo hồ sơ chờ tạo 3 cấp thư mục Drive                                          | `src/modules/public-intake/create-submission.ts:96`; `storage.ts:60-66`                                     |
| PERF-04 | **P1** | Transaction database được giữ trong khi chờ Drive list/create                  | `src/modules/public-intake/storage.ts:285-327`                                                              |
| PERF-05 | **P1** | Pool đặt `max: 1` cho mỗi tiến trình server                                    | `src/modules/supabase/database.ts:15`                                                                       |
| PERF-06 | **P1** | Màn hình chi tiết kiểm tra quyền ở trang rồi client lại gọi API để tải dữ liệu | `src/app/submissions/[submissionId]/page.tsx:15-29`; `submission-detail.tsx:60`, `:155-159`                 |
| PERF-07 | **P1** | Tất cả ảnh được gắn `src` ngay khi render                                      | `src/components/submission-detail.tsx:719-736`                                                              |
| PERF-08 | **P1** | Mỗi ảnh preview đọc lại hồ sơ và toàn bộ danh sách file                        | `src/app/api/submissions/[submissionId]/files/[fileId]/route.ts:23-35`                                      |
| PERF-09 | **P1** | Tiếp nhận di chuyển file tuần tự và checkpoint sau từng file                   | `src/modules/submissions/acceptance-saga.ts:332-365`                                                        |
| PERF-10 | **P2** | Ô tìm kiếm gọi API theo từng ký tự, chưa debounce                              | `src/components/submissions-queue.tsx:90-94`                                                                |
| PERF-11 | **P2** | Chuẩn hóa ảnh đã có nhưng mặc định đang tắt                                    | `.env.example:66`                                                                                           |
| PERF-12 | **P2** | Repo khai `VERCEL_REGION=sin1` nhưng `vercel.json` không thể hiện region       | `.env.example:23`; `vercel.json` chỉ có cron                                                                |

> **Lưu ý chính xác:** `max: 1` là giới hạn trong **mỗi tiến trình/runtime instance**, không có nghĩa toàn bộ hệ thống chỉ tồn tại một kết nối. Tuy nhiên, trong cùng instance, một transaction đang chờ Drive có thể làm các thao tác database khác phải xếp hàng.

---

## 4. Phân tích chi tiết

## 4.1. PERF-01/PERF-02 — Hàng chờ không phân trang tại database

### Hiện trạng

API hiện thực hiện:

```text
Đọc toàn bộ danh sách
→ lọc trạng thái bằng JavaScript
→ tìm kiếm bằng JavaScript
→ sắp xếp bằng JavaScript
→ cắt ra 100 hồ sơ
```

Khi không tìm kiếm, hệ thống đã cố giảm dung lượng bằng `listSummaries()`, nhưng vẫn đọc tất cả hàng tóm tắt. Khi có từ khóa, `repository.list()` đọc toàn bộ `draft_json`, sau đó mới tìm mã tiếp nhận, số GCN hoặc tên chủ.

### Tác động

- Số hồ sơ càng tăng, thời gian và RAM tăng gần tuyến tính.
- 100 hồ sơ hiển thị nhưng server có thể phải đọc hàng nghìn hoặc hàng chục nghìn hồ sơ.
- Mỗi ký tự cán bộ gõ lại kích hoạt một request mới.
- Nhiều cán bộ tìm kiếm cùng lúc làm tải database và server tăng không cần thiết.

### Kết luận

Đây là nguyên nhân rõ nhất khiến **hàng chờ và tìm kiếm duyệt hồ sơ ngày càng chậm**.

---

## 4.2. PERF-03/PERF-04 — Tạo hồ sơ phụ thuộc trực tiếp Google Drive

### Hiện trạng

`createIntakeSubmission()` gọi `createSubmissionFolder()` trước khi ghi bản kê khai vào database.

Cây thư mục được tạo theo thứ tự:

```text
01_INBOX
└── {submissionId}
    └── originals
```

Mỗi cấp dùng `findOrCreateFolder()`. Hàm này mở PostgreSQL transaction, giữ advisory lock rồi gọi Google Drive `files.list` hoặc `files.create` trong lúc transaction còn mở.

### Tác động

- Người dân bấm “Tiếp tục” nhưng phải chờ cả database và ba vòng Drive.
- Google Drive chậm hoặc lạnh kết nối thì màn hình tạo hồ sơ chậm theo.
- Trong cùng Vercel instance, connection pool `max: 1` có thể bị chiếm bởi transaction đang chờ mạng Google.
- Hồ sơ chưa tải ảnh vẫn tạo thư mục Drive, gây thao tác thừa và nhiều thư mục nháp bỏ dở.

### Kết luận

Cần tách hai việc:

```text
Tạo bản kê khai trong Supabase
≠
Tạo nơi chứa ảnh trên Drive
```

Bản kê khai nên được tạo và trả về trước. Drive chỉ cần được khởi tạo khi người dân bắt đầu tải ảnh đầu tiên.

---

## 4.3. PERF-05 — Connection pool `max: 1`

### Hiện trạng

Postgres client đặt:

```ts
max: 1;
```

Đây có thể là lựa chọn an toàn để tránh mỗi serverless instance mở quá nhiều kết nối Supabase. Tuy nhiên mã nguồn cũng có nhiều comment phải tránh deadlock vì pool chỉ có một kết nối.

### Đánh giá

Không nên chỉ sửa thành `max: 5` hoặc `max: 10` ngay lập tức. Với serverless, số instance tăng có thể làm tổng số kết nối tăng mạnh.

### Đề xuất

1. Trước hết loại bỏ việc giữ transaction trong khi chờ Drive.
2. Đưa phân trang xuống SQL để mỗi request kết thúc nhanh.
3. Sau đó cho phép cấu hình bằng biến môi trường:

```text
SUPABASE_POOL_MAX=1|2|3
```

4. Benchmark lần lượt 1, 2 và 3 trên preview.
5. Chỉ chọn giá trị cao hơn khi chứng minh được giảm thời gian chờ mà không vượt giới hạn kết nối Supabase.

---

## 4.4. PERF-06/PERF-07/PERF-08 — Mở chi tiết tạo nhiều request và tải ảnh sớm

### Hiện trạng

Luồng hiện tại:

```text
Server Component kiểm tra đăng nhập
→ trả trang gần như rỗng
→ client gọi GET /api/submissions/:id
→ API kiểm tra đăng nhập lần nữa
→ đọc hồ sơ + file + ghi audit
→ render tất cả thẻ <img src="...">
→ mỗi ảnh gọi một API preview
→ mỗi API preview:
   - kiểm tra đăng nhập
   - đọc lại hồ sơ
   - đọc toàn bộ file rồi find(fileId)
   - gọi Drive lấy thumbnail
   - tải thumbnail
   - ghi audit
```

Ngoài ra, `AiDraftPanel` có thể gọi API khi component được mount dù cán bộ chưa mở phần AI.

### Tác động

Một hồ sơ có 10 ảnh có thể phát sinh:

- Một request tải hồ sơ;
- Mười request preview;
- Nhiều truy vấn database;
- Mười lượt lấy metadata/thumbnail từ Drive;
- Mười dòng audit preview.

Trang chỉ hoàn tất cảm giác tải khi ảnh đã dần xuất hiện, nên cán bộ thấy “quay mãi”.

### Đề xuất

- Server Component đọc dữ liệu hồ sơ một lần và truyền `initialSubmission` vào client.
- API chi tiết vẫn giữ để refresh sau thao tác ghi, không dùng cho lần tải đầu.
- Ảnh không có `src` cho tới khi cán bộ bấm “Xem ảnh” hoặc ảnh đi vào vùng nhìn thấy.
- Thêm repository method đọc đúng một file:

```text
findActiveFile(submissionId, fileId)
```

- Không gọi `findById()` và `listFiles()` cho từng preview.
- Chỉ mount/fetch `AiDraftPanel` khi cán bộ mở phần “Đối chiếu AI”.

---

## 4.5. PERF-09 — Tiếp nhận chính thức xử lý ảnh tuần tự

### Hiện trạng

Với mỗi file, saga đang làm lần lượt:

```text
Drive files.get
→ Drive files.update
→ UPDATE checkpoint database
→ chuyển sang file tiếp theo
```

### Tác động

Với 10 ảnh:

- Tối thiểu 20 lượt gọi Drive;
- 10 lượt ghi checkpoint;
- Độ trễ mạng bị cộng nối tiếp;
- Một request HTTP phải giữ lâu;
- Giao diện chỉ biết “đang tiếp nhận”, không cho cán bộ biết đang ở file nào.

### Đề xuất

- Chia file thành nhóm 2 file.
- Trong mỗi nhóm, chạy `get + update` song song tối đa 2 luồng.
- Sau khi nhóm hoàn tất, ghi checkpoint một lần.
- Nếu một file lỗi, saga vẫn giữ cơ chế retry và nhận ra file đã di chuyển ở lần chạy sau.
- Nếu request vẫn dài, chuyển saga thành nhiều “work unit”: mỗi POST xử lý tối đa một nhóm rồi trả `step`, `movedCount`, `totalCount`; client gọi tiếp cùng idempotency key.

Không dùng background task không đảm bảo trên Vercel.

---

## 4.6. PERF-10/PERF-11/PERF-12 — Các tối ưu vận hành

### Tìm kiếm

Thêm debounce khoảng 300–400 ms và chỉ gửi khi từ khóa rỗng hoặc có ít nhất 2 ký tự. Abort request cũ như hiện tại vẫn giữ.

### Chuẩn hóa ảnh

Mã nguồn đã có:

- CCCD cạnh dài tối đa khoảng 2400 px;
- GCN cạnh dài tối đa khoảng 3000 px;
- Upload GCN tối đa hai luồng.

Nhưng cờ mặc định đang tắt. Không bật ngay trên production. Phải thực hiện benchmark chất lượng ảnh theo tài liệu có sẵn, dùng ảnh giả/đã loại dữ liệu thật, rồi bật trên preview trước.

### Region

Biến `VERCEL_REGION=sin1` trong `.env` không đủ để kết luận Function đang thực sự chạy tại Singapore. Cần kiểm tra Project Settings/deployment log. Mục tiêu là backend Vercel và Supabase ở vùng gần nhau.

---

# 5. Kiến trúc sau tối ưu

```text
NGƯỜI DÂN TẠO HỒ SƠ
Turnstile
→ INSERT public_submissions + request_log
→ trả mã tiếp nhận ngay
→ chưa gọi Drive

NGƯỜI DÂN TẢI ẢNH ĐẦU TIÊN
initiate upload
→ đảm bảo folder Drive READY bằng lease database ngắn
→ gọi Drive ngoài transaction
→ lưu drive_folder_id
→ tạo resumable upload session
→ browser PUT trực tiếp Drive

CÁN BỘ MỞ HÀNG CHỜ
GET /api/submissions
→ PostgreSQL WHERE + ORDER BY + LIMIT 101
→ trả đúng một trang

CÁN BỘ MỞ HỒ SƠ
Server Component
→ auth + query detail + files một lần
→ render dữ liệu ngay
→ ảnh chỉ tải khi bấm xem

TIẾP NHẬN CHÍNH THỨC
Saga resumable
→ mỗi work unit xử lý nhóm 2 file
→ checkpoint theo nhóm
→ UI hiển thị số file đã chuyển
```

---

# 6. Kế hoạch thi công đề xuất

## PHASE 0 — Baseline và đo hiệu năng

### Mục tiêu

Có số đo trước khi sửa để chứng minh hiệu quả và tránh “cảm giác nhanh hơn”.

### Công việc

1. Đọc bắt buộc:
   - `AGENTS.md`;
   - `PLAN.md`;
   - `docs/brain/`;
   - `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`.
2. Kiểm tra migrations PL3/Public Intake đang chờ áp dụng; không trộn performance migration vào môi trường chưa đồng bộ schema.
3. Thêm số đo không chứa PII:
   - `queue_total_ms`;
   - `queue_db_ms`;
   - `detail_total_ms`;
   - `preview_drive_ms`;
   - `create_total_ms`;
   - `drive_folder_ms`;
   - `accept_file_count`;
   - `accept_move_ms`.
4. Có thể dùng `Server-Timing` header và log cấu trúc chỉ gồm request ID, route, thời gian, số lượng; không log từ khóa, tên, CCCD, số điện thoại, Drive ID hoặc URL.
5. Tạo dữ liệu giả trên database preview ở các mức 500, 5.000 và 20.000 hồ sơ.
6. Ghi baseline P50/P95 vào `evidence/PERFORMANCE_BASELINE.md`.

### Tiêu chí hoàn thành

- Có số đo tải hàng chờ, tìm kiếm, mở chi tiết và tiếp nhận.
- Không có PII trong log/số đo.
- Không sửa nghiệp vụ hoặc production.

---

## PHASE 1 — Phân trang và tìm kiếm bằng PostgreSQL

### Mức ưu tiên

**P0 — làm đầu tiên.**

### Migration đề xuất

Dùng migration số tiếp theo còn trống, ví dụ:

```text
supabase/migrations/202607290004_queue_search_performance.sql
```

### Thiết kế schema

Thêm hai cột hiển thị được sinh từ `draft_json`:

```sql
alter table public.public_submissions
  add column if not exists queue_owner_name text
    generated always as (
      coalesce(draft_json #>> '{owners,0,fullName}', '')
    ) stored,
  add column if not exists queue_issue_number text
    generated always as (
      coalesce(draft_json #>> '{certificate,issueNumber}', '')
    ) stored;
```

Thêm chỉ mục thứ tự hàng chờ:

```sql
create index if not exists public_submissions_queue_page_idx
  on public.public_submissions (status, updated_at desc, submission_id desc);

create index if not exists public_submissions_queue_all_page_idx
  on public.public_submissions (updated_at desc, submission_id desc);
```

Nếu Supabase preview hỗ trợ `pg_trgm`, thêm trigram index cho tìm kiếm chứa chuỗi. Agent phải xác minh extension và operator class trực tiếp trên preview trước khi chốt SQL.

### Repository mới

Thêm API nội bộ:

```ts
listQueuePage({
  status,
  query,
  cursor,
  limit,
}): Promise<{
  items: QueueSubmissionSummary[];
  nextCursor: string | null;
}>
```

SQL phải thực hiện đầy đủ:

- `WHERE status = ...` nếu có;
- tìm trên `receipt_code`, `queue_issue_number`, `queue_owner_name`;
- keyset cursor theo `(updated_at, submission_id)`;
- `ORDER BY updated_at DESC, submission_id DESC`;
- `LIMIT 101`, trả 100 và dùng dòng thứ 101 để xác định trang tiếp.

### Cursor

Cursor nên là base64url của object đã validate:

```json
{
  "updatedAt": "2026-07-29T08:00:00.000Z",
  "submissionId": "..."
}
```

Không dùng cách tìm `submissionId` trong mảng toàn bộ như hiện nay.

### File dự kiến sửa

- `src/modules/public-intake/repository.ts`;
- `src/app/api/submissions/route.ts`;
- `src/components/submissions-queue.tsx`;
- migration SQL mới;
- test repository/API/UI;
- `docs/brain/01-architecture.md`;
- `docs/brain/03-decisions.md`;
- `docs/brain/06-ai-working-log.md`;
- `CHATGPT_HANDOFF.md`.

### UI

- Debounce tìm kiếm 350 ms.
- Dưới 2 ký tự: chưa tìm, trừ khi ô được xóa rỗng.
- Khi đổi bộ lọc, giữ bảng cũ và hiện trạng thái tải nhỏ; không xóa toàn bộ bảng thành màn hình trắng.
- Không thay đổi quyền hoặc dữ liệu trả về.

### Tiêu chí nghiệm thu

- API không gọi `repository.list()` hoặc `listSummaries()` cho hàng chờ.
- Với 20.000 hồ sơ giả, mỗi request đọc tối đa khoảng 101 hàng kết quả chính.
- `EXPLAIN (ANALYZE, BUFFERS)` cho thấy dùng index phù hợp; không sequential scan toàn bảng trong trường hợp lọc/phân trang thông thường.
- P95 hàng chờ và tìm kiếm giảm rõ so với baseline; mục tiêu định hướng dưới 1,5 giây trên preview cùng vùng.
- Cursor không bỏ sót hoặc lặp hồ sơ khi nhiều hồ sơ có cùng `updated_at`.
- Quyền `SUBMISSION_READ_ROLES` giữ nguyên.

### Rollback

- Revert code route/repository/UI.
- Các generated column/index là additive, có thể giữ lại hoặc drop bằng migration rollback riêng.

---

## PHASE 2 — Tối ưu mở và xem hồ sơ duyệt

### Mức ưu tiên

**P0/P1 — làm ngay sau Phase 1.**

### Thiết kế

#### 2.1. Server-prime dữ liệu

Tạo service dùng chung, ví dụ:

```text
src/modules/submissions/detail.ts
```

Service chịu trách nhiệm:

- kiểm quyền đã được route/page thực hiện;
- đọc record;
- đọc danh sách file;
- ánh xạ DTO;
- ghi audit mở chi tiết đúng một lần.

`page.tsx` gọi service và truyền:

```tsx
<SubmissionDetail initialSubmission={submission} ... />
```

`SubmissionDetail` khởi tạo state từ prop, không gọi `loadSubmission()` trong `useEffect` ở lần đầu.

GET API chi tiết vẫn giữ để refresh sau CLAIM/SAVE/ACCEPT.

#### 2.2. Preview theo yêu cầu

Tạo component:

```text
src/components/admin/document-preview.tsx
```

Mặc định hiển thị:

```text
[CCCD mặt trước] [Xem ảnh]
[CCCD mặt sau]   [Xem ảnh]
[GCN trang 1]    [Xem ảnh]
```

Chỉ khi bấm mới đặt `src` và gọi API. Có thể thêm nút “Xem tất cả” dành cho cán bộ cần đối chiếu nhanh.

`loading="lazy"` có thể dùng bổ sung nhưng **không thay thế** cơ chế không đặt `src`, vì nhiều ảnh đầu trang vẫn có thể được browser tải ngay.

#### 2.3. Query đúng một file

Thêm repository method:

```ts
findActiveFile(submissionId: string, fileId: string): Promise<StoredFile | null>
```

SQL:

```sql
select ...
from public.public_files
where submission_id = $1
  and file_id = $2
  and status = 'UPLOADED'
limit 1;
```

Preview route bỏ:

- `findById(submissionId)`;
- `listFiles(submissionId).find(...)`.

Kiểm tra file thuộc đúng submission được thực hiện trong cùng SQL, giữ fail-closed.

#### 2.4. AI panel

Không fetch AI draft khi mở trang. Chỉ mount `AiDraftPanel` khi cán bộ mở accordion/tab “Đối chiếu AI”.

### File dự kiến sửa

- `src/app/submissions/[submissionId]/page.tsx`;
- `src/app/api/submissions/[submissionId]/route.ts`;
- `src/app/api/submissions/[submissionId]/files/[fileId]/route.ts`;
- `src/components/submission-detail.tsx`;
- `src/components/admin/document-preview.tsx` mới;
- `src/components/admin/ai-draft-panel.tsx` hoặc wrapper lazy;
- `src/modules/public-intake/repository.ts`;
- service DTO mới;
- test và tài liệu.

### Tiêu chí nghiệm thu

- Mở hồ sơ lần đầu không phát sinh GET `/api/submissions/:id` từ client.
- Chưa bấm xem ảnh thì không có request preview.
- Bấm một ảnh chỉ gọi một preview endpoint và một query đúng file.
- File ID của hồ sơ khác vẫn trả 404/không lộ dữ liệu.
- Audit mở chi tiết và audit xem ảnh vẫn đúng mục đích, không nhân đôi vì render lại.
- Phần thông tin văn bản xuất hiện ngay, không chờ ảnh.
- P95 mở metadata giảm rõ so với baseline.

### Rollback

Code-only. Revert component/service; không cần rollback schema.

---

## PHASE 3 — Tạo hồ sơ trước, tạo folder Drive khi tải ảnh đầu tiên

> **Đã triển khai trên branch `codex/phase3-lazy-drive-folder` (2026-07-29), chưa deploy.**
> Migration `202607290005` và code có thể được đưa lên trước trong khi feature flag vẫn mặc định
> `false`. Chỉ bật trên Preview sau khi áp migration và chạy preflight mở rộng.

### Mức ưu tiên

**P1 — hiệu quả cao nhưng có thay đổi schema và luồng idempotency; chỉ làm sau khi Phase 1–2 ổn định.**

### Không được làm theo cách đơn giản sau

Không được chỉ đổi `drive_folder_id` thành chuỗi rỗng rồi để nhiều request đồng thời tự tạo folder. Cách đó có thể tạo thư mục trùng khi hai lần initiate chạy cùng lúc.

### Migration đề xuất

```sql
alter table public.public_submissions
  alter column drive_folder_id drop not null;

alter table public.public_submissions
  add column if not exists drive_folder_state text not null default 'PENDING'
    check (drive_folder_state in ('PENDING','CREATING','READY','FAILED')),
  add column if not exists drive_folder_lease_until timestamptz,
  add column if not exists drive_folder_attempts integer not null default 0;

update public.public_submissions
set drive_folder_state = 'READY'
where drive_folder_id is not null
  and drive_folder_id <> '';
```

Không lưu thông báo lỗi Drive chứa ID/link vào database.

### Luồng tạo hồ sơ mới

```text
POST /api/public/submissions
→ Turnstile
→ transaction:
   INSERT public_submissions(drive_folder_id = null, state=PENDING)
   INSERT request_log
   INSERT audit
→ trả receiptCode + session
```

Không gọi Google Drive trong đường CREATE.

### Service đảm bảo folder

Tạo service, ví dụ:

```text
src/modules/public-intake/submission-folder.ts
```

Thuật toán:

1. Đọc `drive_folder_id`; nếu READY thì trả ngay.
2. Dùng một câu `UPDATE ... WHERE` để giành lease ngắn, ví dụ 60 giây.
3. Commit transaction ngay.
4. Request thắng lease gọi Drive **ngoài database transaction**.
5. Drive vẫn thực hiện `list-before-create` để retry sau crash có thể tìm lại folder đã tạo.
6. Update `drive_folder_id`, state `READY`, xóa lease.
7. Request không thắng lease chờ/poll có giới hạn hoặc trả lỗi retryable có `Retry-After`.
8. Lease hết hạn cho phép request sau tiếp tục.

### Giảm lock Drive

- Giữ advisory lock cho các thư mục dùng chung nếu cần.
- Với folder riêng theo `submissionId`, database lease đã là cơ chế điều phối; không giữ database transaction trong khi gọi Drive.
- Cân nhắc bootstrap và cấu hình trực tiếp ID của `01_INBOX` để giảm một lượt tìm thư mục ở cold start.

### Route ảnh

`uploads/initiate` phải gọi:

```ts
const folderId = await ensureSubmissionFolderReady(record.submissionId);
```

sau đó mới tạo resumable session.

`uploads/complete`, delete và acceptance phải guard rõ `driveFolderId !== null`.

### Feature flag

```text
LAZY_DRIVE_FOLDER_CREATION_ENABLED=false
```

- Preview: bật true để rehearsal.
- Production: chỉ bật sau E2E và kiểm tra orphan folder.
- Khi false, giữ hành vi tạo folder ngay để rollback nhanh.

### Tiêu chí nghiệm thu

- CREATE không gọi Google Drive.
- Tạo bản kê khai thành công dù Drive tạm chậm; lỗi Drive chỉ xuất hiện khi tải ảnh.
- Hai initiate đồng thời cho cùng hồ sơ chỉ dẫn tới một cây folder hợp lệ.
- Crash sau khi Drive tạo folder nhưng trước khi update DB: retry tìm lại folder, không tạo bản thứ hai.
- Hồ sơ chưa từng tải ảnh không tạo thư mục.
- Idempotency create vẫn ghi `public_submissions` và `request_log` cùng transaction.
- Không nới Turnstile, consent, CSRF, session hoặc validation file.

### Rollback

- Tắt feature flag.
- Trước khi khôi phục `NOT NULL`, chạy repair cho các bản kê khai `drive_folder_id is null` hoặc giữ schema nullable trong thời gian chuyển tiếp.
- Không drop cột state ngay khi rollback code; đây là migration additive an toàn.

---

## PHASE 4 — Tối ưu connection pool và vị trí chạy

### Mức ưu tiên

**P1/P2 — chỉ thực hiện sau khi đã rút ngắn transaction và query.**

### Công việc

1. Đổi hard-code thành cấu hình:

```ts
max: environment.SUPABASE_POOL_MAX;
```

2. Allowlist giá trị 1–3; mặc định 1.
3. Benchmark 1, 2, 3 với cùng tải.
4. Theo dõi:
   - P95 route;
   - lỗi connection timeout;
   - số connection Supabase;
   - cold start;
   - transaction duration.
5. Kiểm tra Vercel Function thực tế đang chạy cùng/ gần vùng Supabase.
6. Không coi biến `VERCEL_REGION` tự đặt là bằng chứng region runtime.

### Tiêu chí nghiệm thu

- Không vượt giới hạn connection của gói Supabase.
- Không xuất hiện deadlock hoặc lỗi “too many connections”.
- Chỉ tăng pool nếu P95 tốt hơn có ý nghĩa.

---

## PHASE 5 — Tối ưu tiếp nhận chính thức

### Mức ưu tiên

**P1 — tác động trực tiếp nút “Tiếp nhận chính thức”.**

### Phase 5A — Chạy theo nhóm

- Concurrency mặc định: 2.
- Chia `activeFiles` thành các chunk 2 file.
- Trong mỗi chunk, chạy `get + update` song song.
- Merge kết quả vào `movedMap`.
- Ghi `moved_files` một lần/chunk.
- Retry giữ nguyên khả năng nhận ra file đã ở destination.

### Phase 5B — Work unit và tiến độ thật

Nếu một request vẫn dài:

- Mỗi POST xử lý tối đa một chunk;
- Response:

```json
{
  "submission": {
    "status": "ACCEPTING",
    "acceptStep": "FILES_MOVING",
    "movedCount": 4,
    "totalCount": 10,
    "completed": false
  }
}
```

- Client gọi lại cùng idempotency key cho tới `completed: true`.
- UI hiển thị:

```text
Đang chuyển ảnh 4/10
Đang ghi dữ liệu hồ sơ
Đang hoàn tất
```

- Cho phép cán bộ rời trang; mở lại hồ sơ thấy checkpoint và bấm “Tiếp tục tiếp nhận”.

### Ràng buộc

- Không chuyển sang xử lý nền không đảm bảo.
- Không mất cơ chế saga, advisory lock, idempotency hoặc official acceptance guard.
- Không chạy nhiều hơn 2–3 Drive request đồng thời khi chưa có benchmark quota.

### Tiêu chí nghiệm thu

- 10 file không còn 10 checkpoint DB riêng lẻ.
- Replay sau lỗi không nhân đôi case/file/owner/parcel/asset.
- Hai phiên tiếp nhận đồng thời vẫn có đúng một phiên thắng.
- UI không hiển thị spinner vô hạn không thông tin.
- Integration test acceptance saga hiện có tiếp tục pass.

---

## PHASE 6 — Bật chuẩn hóa ảnh có kiểm soát

### Điều kiện trước khi bật

- Thực hiện đúng benchmark đã nêu trong `docs/brain/04-current-tasks.md`.
- Dùng ảnh mẫu không chứa dữ liệu thật.
- Kiểm tra trên Android, iPhone và máy tính.
- Cán bộ xác nhận chữ nhỏ trên GCN vẫn đọc rõ.

### Rollout

1. Preview: `NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED=true`.
2. So sánh:
   - dung lượng nguồn/tải lên;
   - thời gian chuẩn bị;
   - thời gian upload;
   - tỷ lệ lỗi;
   - khả năng đọc QR CCCD;
   - khả năng đọc chữ GCN.
3. Chỉ bật production khi đạt chất lượng.

### Rollback

Đặt cờ về `false`; không cần migration.

---

# 7. Kế hoạch kiểm thử bắt buộc

## 7.1. Unit test

- Encode/decode cursor hợp lệ và cursor hỏng.
- Hai bản ghi cùng `updated_at` không bị lặp/bỏ sót.
- Debounce không gửi request theo từng ký tự.
- `DocumentPreview` chưa bấm thì chưa có `src`.
- `findActiveFile` không trả file của submission khác.
- Folder lease:
  - một request thắng;
  - request thứ hai không tạo folder;
  - lease hết hạn được recovery;
  - Drive lỗi chuyển state FAILED;
  - retry thành công.
- Acceptance chunk:
  - concurrency không vượt 2;
  - checkpoint theo chunk;
  - partial failure retry an toàn.

## 7.2. Integration test PostgreSQL

- Migration chạy lặp không lỗi.
- Backfill/generated column đúng với draft legacy hợp lệ.
- Queue query với 20.000 dòng.
- `EXPLAIN ANALYZE` sử dụng index.
- Version/idempotency không bị thay đổi.
- Lazy folder state transition nguyên tử.

## 7.3. E2E preview

1. Người dân tạo hồ sơ: không có Drive call trong CREATE.
2. Tải ảnh đầu tiên: folder được tạo, upload hoàn tất.
3. Hai tab cùng initiate: không có folder trùng.
4. Hàng chờ 20.000 dữ liệu giả: tải trang và tải thêm.
5. Tìm mã tiếp nhận, số GCN, tên chủ.
6. Mở hồ sơ: dữ liệu text xuất hiện trước ảnh.
7. Chưa bấm xem: không request preview.
8. Xem từng ảnh và “Xem tất cả”.
9. Tiếp nhận 10 ảnh, giả lập lỗi giữa chừng, retry hoàn tất.
10. Kiểm tra audit không ghi PII/Drive ID/link.

## 7.4. Load test preview

Không chạy production.

Kịch bản tối thiểu:

- 20 người đồng thời mở hàng chờ;
- 10 người đồng thời tìm kiếm;
- 10 người tạo hồ sơ;
- 5 cán bộ mở hồ sơ nhiều ảnh;
- 3 cán bộ tiếp nhận hồ sơ khác nhau.

Ghi P50/P95/error rate trước và sau từng phase.

---

# 8. Chỉ tiêu nghiệm thu tổng thể

| Luồng       | Chỉ tiêu                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Hàng chờ    | PostgreSQL trả đúng một trang; không tải toàn bảng                                               |
| Tìm kiếm    | Debounce; query có index; không đọc toàn bộ `draft_json`                                         |
| Tạo hồ sơ   | Không phụ thuộc Drive khi CREATE nếu Phase 3 bật                                                 |
| Mở chi tiết | Không client-fetch lại ở lần đầu                                                                 |
| Xem ảnh     | Không tải ảnh trước khi yêu cầu; một query đúng file                                             |
| Tiếp nhận   | File theo chunk, checkpoint theo chunk, có tiến độ                                               |
| Database    | Không tăng pool khi chưa benchmark; không giữ transaction chờ Drive ở luồng folder mới           |
| Bảo mật     | Giữ nguyên auth, CSRF, consent, Turnstile, DataScope, idempotency, audit và no-public-Drive-link |
| Dữ liệu     | Không xóa dữ liệu, không làm mất file, migration additive và idempotent                          |

Mục tiêu hiệu năng định hướng trên preview cùng vùng:

- Hàng chờ/tìm kiếm P95: **≤ 1,5 giây** với 20.000 hồ sơ giả.
- Metadata chi tiết P95: **≤ 1,5 giây**, không tính ảnh chưa được yêu cầu.
- CREATE: giảm rõ so với baseline và không chứa thời gian Drive sau Phase 3.
- Tiếp nhận 10 ảnh: không timeout, có tiến độ và resume; thời gian giảm tối thiểu **30% so với baseline** trong cùng điều kiện thử.

Các con số phải được xác nhận bằng baseline thực tế; không tuyên bố đạt trước khi đo.

---

# 9. Thứ tự commit/branch đề xuất

Không thi công tất cả trong một commit lớn.

```text
branch: perf/queue-sql-pagination
commit 1: test(perf): characterize queue pagination and search
commit 2: perf(queue): move filtering and keyset pagination into PostgreSQL
commit 3: docs(perf): record queue benchmark and migration evidence

branch: perf/review-detail-lazy-preview
commit 1: test(review): characterize initial detail and preview requests
commit 2: perf(review): server-prime detail and lazy-load document previews
commit 3: docs(review): record request-count and timing evidence

branch: perf/lazy-drive-folder
commit 1: test(intake): characterize folder creation and concurrent initiate
commit 2: feat(intake): add leased lazy Drive folder initialization
commit 3: docs(intake): add migration/runbook/rollback evidence

branch: perf/acceptance-file-batches
commit 1: test(acceptance): characterize sequential file checkpoints
commit 2: perf(acceptance): move files in bounded batches with progress
commit 3: docs(acceptance): update saga architecture and rehearsal evidence
```

Mỗi branch phải có `CHATGPT_HANDOFF.md` riêng trước khi merge.

---

# 10. Điều kiện dừng bắt buộc cho coding agent

Agent phải dừng và báo cáo `STOPPED` nếu:

1. Các migration đang chờ trong `docs/brain/04-current-tasks.md` chưa được đồng bộ và performance migration phụ thuộc vào schema đó.
2. Baseline test/build hiện tại thất bại mà không phân biệt được lỗi cũ/mới.
3. Phải nới quyền, bỏ audit, bỏ idempotency, bỏ version guard hoặc bỏ validation để đạt tốc độ.
4. Cần thao tác production, secret hoặc Drive thật chưa được cho phép.
5. Lazy folder có nguy cơ tạo folder trùng hoặc mất liên kết file.
6. Preview optimization làm lộ file của submission khác.
7. Acceptance concurrency làm replay không còn idempotent.
8. Số file sửa vượt đáng kể phạm vi từng phase.

---

# 11. Phạm vi không được tự ý mở rộng

- Không viết lại wizard.
- Không đổi framework Next.js, Supabase hoặc Google Drive.
- Không đưa ảnh qua Vercel body thay cho resumable upload.
- Không dùng link Drive công khai.
- Không tắt audit vì lý do hiệu năng.
- Không tăng giới hạn ảnh hoặc nới `completionChecks`.
- Không sửa nghiệp vụ PL3 trong task hiệu năng.
- Không merge/deploy production tự động.
- Không chỉnh lint/nợ kỹ thuật ngoài file đã chạm nếu không liên quan.

---

# 12. Prompt giao coding agent — khuyến nghị triển khai Phase 1 trước

```text
Bạn đang làm việc trên repository capphongchau.

NHIỆM VỤ DUY NHẤT: triển khai PHASE 1 — phân trang và tìm kiếm hàng chờ hoàn toàn bằng PostgreSQL theo file PERFORMANCE_REVIEW_AND_IMPLEMENTATION_PLAN_CAPPHONGCHAU.md. Không làm Phase 2 trở đi trong cùng đợt.

BẮT BUỘC TRƯỚC KHI CODE:
1. Đọc AGENTS.md, PLAN.md, toàn bộ docs/brain/ theo thứ tự hướng dẫn và AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md.
2. Kiểm tra branch, git status, thay đổi chưa commit và bảo toàn mọi thay đổi của người dùng.
3. Đọc docs/brain/04-current-tasks.md để xác định migration nào chưa chạy; không tự thao tác production.
4. Chạy baseline test/typecheck/build phù hợp. Ghi rõ lỗi cũ nếu có.
5. Tạo test characterization chứng minh route hiện tại đọc toàn danh sách/chia trang trong ứng dụng.

YÊU CẦU THI CÔNG:
- Thêm migration additive/idempotent cho cột hiển thị hàng chờ và index cần thiết.
- Thêm repository method listQueuePage dùng WHERE, keyset cursor, ORDER BY updated_at DESC + submission_id DESC và LIMIT 101.
- Route GET /api/submissions không được gọi repository.list() hoặc listSummaries().
- Tìm kiếm mã tiếp nhận, số GCN, tên chủ bằng SQL.
- Thêm debounce 350 ms ở UI, giữ AbortController.
- Không đổi auth, masking phone, DataScope, response error contract hoặc quyền.
- Thêm unit/integration test cho cursor, phân trang, query và trường hợp cùng updated_at.
- Cập nhật docs/brain/01-architecture.md, docs/brain/03-decisions.md, docs/brain/06-ai-working-log.md và tài liệu migration.

NGHIỆM THU:
- Chạy test, typecheck, build và test liên quan.
- Nếu có database preview được phép, chạy migration + EXPLAIN ANALYZE trên dữ liệu giả; không dùng dữ liệu thật trong báo cáo.
- Tự review diff, không sửa ngoài phạm vi.
- Tạo CHATGPT_HANDOFF.md tự chứa theo đúng AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md, gồm baseline, file/symbol thay đổi, SQL migration, test, acceptance matrix, rủi ro, rollback và unified diff theo quy định.
- Không tự merge, không tự deploy.
```

---

# 13. Tình trạng kiểm thử trong phiên review này

Tôi đã thử chạy baseline trên bản ZIP:

```text
npm test
```

Không chạy được vì archive không có `node_modules` (`vitest: not found`). Sau đó thử:

```text
npm ci
```

nhưng registry của môi trường review trả 404 đối với gói `zod-validation-error-4.0.2.tgz`.

Do đó:

- Chưa có bằng chứng test/build mới từ phiên review này;
- Đây là hạn chế của môi trường cài dependency, **không phải bằng chứng mã nguồn đang lỗi test**;
- Coding agent có môi trường repository đầy đủ phải chạy baseline trước khi sửa.

---

# 14. Khuyến nghị quyết định

Phê duyệt thi công theo thứ tự:

1. **Phase 1 — Queue SQL pagination/search**;
2. **Phase 2 — Server-prime detail + lazy preview**;
3. Nghiệm thu thực tế với cán bộ;
4. **Phase 3 — Lazy Drive folder**;
5. **Phase 5 — Acceptance batching/progress**;
6. Sau cùng mới tối ưu pool, region và bật chuẩn hóa ảnh.

Không nên giao agent sửa cả năm phase trong một lượt. Hai phase đầu đủ nhỏ để review kỹ, ít đụng luồng dữ liệu và có khả năng tạo cải thiện thấy ngay.

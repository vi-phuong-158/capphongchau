# CHATGPT HANDOFF REPORT

> Báo cáo này **thay thế** báo cáo Đợt 2B. Nội dung 2B được giữ nguyên ở
> `docs/brain/06-ai-working-log.md` và ở commit `6942381`/`7bb4341` — không mất gì.

## 1. Report metadata

- Project: `land-ocr-180` (capphongchau) — thu thập và kiểm tra hồ sơ đất đai Phường Phong Châu
- Repository path: `/home/user/capphongchau`
- Generated at: 2026-07-30
- Agent: Claude Code
- Task: hai việc trong một phiên, hai commit riêng:
  - **(A)** Test cho hai điểm Đợt 2B sửa mà không test nào khóa được (`src/proxy.ts` header
    `no-store`; nhánh `notFound()` của `/submissions/[submissionId]/page.tsx`).
  - **(B) Đợt 2C** — cán bộ tự tải ảnh giấy tờ cá nhân/GCN bổ sung khi hồ sơ nộp thiếu.
  - **(C) Đợt 2C bổ sung lần một** — cán bộ **gỡ** ảnh Giấy chứng nhận khỏi hồ sơ (xóa mềm).
  - **(D) Đợt 2C bổ sung lần hai** — cán bộ **gán lại chủ sử dụng** của một ảnh CCCD.
  Người dùng yêu cầu: *"Làm 2 test đó rồi sang 2C"*, rồi sau khi tôi nêu lỗ còn lại và ba phương án:
  *"Cho phép cả hai, làm phương án 1 đi"* (gỡ ảnh do hộ dân tải được, xóa mềm GCN-only), rồi hỏi
  *"theo bạn nên xử lý việc xoá ảnh hoặc thay ảnh thế nào?"* và cuối cùng
  *"Đồng ý đề xuất nội dung tiếp theo"* → làm tiếp thao tác gán lại `owner_id` mà tôi đã nêu là lỗ
  còn sót lại (xác nhận qua `AskUserQuestion` để chọn đúng mục).
- Nhánh: `claude/redesign-document-review-screen-tfuvov`
- Baseline khi bắt đầu: `6942381`
- HEAD khi kết thúc: `5c97c08`
- Status: `READY_FOR_REVIEW` — đã commit local; **chưa push, chưa merge, chưa deploy**
- Migration: **KHÔNG CÓ**
- Source plan: phạm vi 2C đã được ghi thành văn từ Đợt 2B trong `docs/brain/04-current-tasks.md`:
  *"2C — CHƯA LÀM (tính năng mới, người dùng yêu cầu thêm): cán bộ tự tải ảnh giấy tờ cá nhân/GCN
  bổ sung khi hồ sơ nộp thiếu — cần endpoint mới vì API upload hiện tại của người dân bị khóa theo
  session cookie + trạng thái hồ sơ, cán bộ không dùng lại được trực tiếp."*
- Source security constraints: `CLAUDE.md` (không lộ PII/token trong log, không hardcode secret,
  không đổi stack, không thêm tính năng ngoài scope), `docs/brain/02-coding-rules.md`.

## 2. Git identity

### Git status

Sạch tại thời điểm viết báo cáo (trước khi commit chính file này):

```
(không có thay đổi chưa commit)
```

`next-env.d.ts` bị `npm run build` sửa đã được `git checkout` trả về nguyên trạng — **không** commit
vào đợt này.

### Commits

```
5c97c08 feat(submissions): Đợt 2C - cán bộ gán lại chủ sử dụng ảnh CCCD
c57d4c3 docs: cập nhật CHATGPT_HANDOFF.md cho chức năng gỡ ảnh
69dfa2e feat(submissions): Đợt 2C - cán bộ gỡ ảnh Giấy chứng nhận khỏi hồ sơ (xóa mềm)
9ed64ca docs: cập nhật CHATGPT_HANDOFF.md cho Đợt 2C và test của 2B
af4b9e1 feat(submissions): Đợt 2C - cán bộ tự tải ảnh giấy tờ bổ sung vào hồ sơ
b548c7d test(submissions): khóa header no-store của proxy và nhánh notFound của trang duyệt
6942381 docs: cập nhật CHATGPT_HANDOFF.md cho Đợt 2B          ← baseline
7bb4341 perf(submissions): Đợt 2B - nạp sẵn màn duyệt trên server, tải ảnh/AI theo yêu cầu
```

### Diff statistics (`6942381..5c97c08`)

```
 AGENTS.md                                          |    4 +-
 CHATGPT_HANDOFF.md                                 | 1134 ++++++++------------
 docs/brain/01-architecture.md                      |   88 +-
 docs/brain/03-decisions.md                         |  101 ++
 docs/brain/04-current-tasks.md                     |   18 +-
 docs/brain/06-ai-working-log.md                    |  129 +++
 .../submissions/current/uploads/complete/route.ts  |   36 +-
 .../submissions/current/uploads/initiate/route.ts  |    8 +-
 .../[submissionId]/files/[fileId]/route.ts         |  242 ++++-
 .../[submissionId]/uploads/complete/route.ts       |  266 +++++
 .../[submissionId]/uploads/initiate/route.ts       |  247 +++++
 src/components/admin/document-viewer.tsx           |  193 +++-
 src/components/admin/officer-file-upload.tsx       |  278 +++++
 src/components/submission-detail.tsx               |   78 ++
 src/modules/public-intake/repository.ts            |   71 +-
 src/modules/public-intake/upload-commit.ts         |   54 +
 tests/officer-file-delete.test.ts                  |  195 ++++
 tests/officer-file-reassign-owner.test.ts          |  177 +++
 tests/officer-file-upload.test.ts                  |  258 +++++
 tests/proxy-no-store.test.ts                       |   72 ++
 tests/public-upload-complete-route.test.ts         |   19 +-
 tests/submission-detail-page.test.ts               |  127 +++
 tests/upload-metrics.test.ts                       |   22 +-
 23 files changed, 3093 insertions(+), 724 deletions(-)
```

### Name status

```
A  src/app/api/submissions/[submissionId]/uploads/initiate/route.ts
A  src/app/api/submissions/[submissionId]/uploads/complete/route.ts
A  src/modules/public-intake/upload-commit.ts
A  src/components/admin/officer-file-upload.tsx
A  tests/officer-file-upload.test.ts
A  tests/proxy-no-store.test.ts
A  tests/submission-detail-page.test.ts
A  tests/officer-file-delete.test.ts
A  tests/officer-file-reassign-owner.test.ts
M  src/app/api/submissions/[submissionId]/files/[fileId]/route.ts   (thêm DELETE, PATCH)
M  src/components/admin/document-viewer.tsx    (onDeleteFile, onReassignOwner)
M  src/modules/public-intake/repository.ts     (reassignFileOwner, FileOwnerReassignConflictError)
M  src/components/submission-detail.tsx
M  src/app/api/public/submissions/current/uploads/initiate/route.ts
M  src/app/api/public/submissions/current/uploads/complete/route.ts
M  tests/public-upload-complete-route.test.ts
M  tests/upload-metrics.test.ts
M  AGENTS.md
M  docs/brain/01-architecture.md
M  docs/brain/03-decisions.md
M  docs/brain/04-current-tasks.md
M  docs/brain/06-ai-working-log.md
```

## 3. Executive summary

**(A) `b548c7d` — test cho hai điểm không có test của Đợt 2B.** Không sửa một dòng source nào.

1. `src/proxy.ts` gắn `cache-control: private, no-store` vì trang duyệt hồ sơ giờ nạp sẵn PII vào
   HTML. `tests/public-surface-guard.test.ts` chỉ soi `matcher`, nên gỡ dòng header đi thì test vẫn
   xanh trong khi HTML chứa số điện thoại/CCCD/địa chỉ được phép nằm lại trong cache trung gian.
2. `page.tsx` phân biệt `loadSubmissionDetail` trả `null` (hồ sơ không tồn tại → `notFound()`) với
   việc nó **ném lỗi** (sự cố tạm → vẫn render, `initialSubmission={null}` để client tự fetch). Hai
   nhánh cách nhau đúng một dòng sửa; đảo chúng thì cán bộ thấy "không tìm thấy hồ sơ" khi cơ sở dữ
   liệu chỉ chớp tắt một nhịp, mà typecheck và lint đều không kêu.

**(B) `af4b9e1` — Đợt 2C.** Cán bộ tự tải ảnh giấy tờ bổ sung.

Dự đoán trong `04-current-tasks.md` là đúng: **không dùng lại được** đường của hộ dân.
`resolvePublicRequest` xác thực bằng cookie phiên kê khai ẩn danh, và `isEditable(record)` đòi
`DRAFT`/`NEEDS_SUPPLEMENT` **và** chưa ai nhận xử lý. Đúng lúc cán bộ cần thêm ảnh thì cả hai điều
kiện đều sai: hồ sơ đang `UNDER_REVIEW` và do chính họ giữ. Nới `isEditable` để chứa trường hợp này
là mở lại đường ghi cho hộ dân trong khi cán bộ đang làm — đúng thứ Đợt 2A-3 vừa đóng.

Cửa vào của đường mới là `mayStaffEdit` — **đang giữ hồ sơ và hồ sơ `UNDER_REVIEW`** — cùng chốt với
`PATCH /api/submissions/:id` và Bàn làm việc PL3. Không mở khái niệm quyền mới.

**(C) `69dfa2e` — Đợt 2C bổ sung: gỡ ảnh GCN.**

Đợt 2C để lại đúng một lỗ: cán bộ tải nhầm, hoặc hộ dân nộp một trang GCN sai, thì không có cách nào
gỡ — chỉ thay được bằng ảnh khác. `DELETE /api/submissions/:id/files/:fileId` sao y hợp đồng của
đường hộ dân đã có: **xóa mềm** (`status = 'DELETED'`, tệp nằm nguyên trên Drive), **chỉ ảnh
`CERTIFICATE`**, cùng cửa quyền `mayStaffEdit`. Người dùng chốt: **gỡ được cả ảnh do hộ dân tải lên**,
không chỉ ảnh cán bộ vừa bổ sung.

**(D) `5c97c08` — Đợt 2C bổ sung lần hai: gán lại chủ sử dụng ảnh CCCD.**

Vá nốt lỗ tôi nêu ở lần bàn giao trước: cán bộ tải nhầm ảnh CCCD của chủ 2 vào ô của chủ 1. Thay ảnh
không có gì để thay nếu chủ 1 chưa có ảnh nào; gỡ ảnh chỉ để lại ô trống, mất luôn ảnh đúng của chủ 2.
`PATCH /api/submissions/:id/files/:fileId` đổi `owner_id` — **không** tự động ghi đè ảnh đang đúng ở
ô đích như `appendFile` lúc thay ảnh; nếu ô đích đã có ảnh thì trả 409, bắt cán bộ xử lý trước.

**Phát hiện ngoài dự kiến:** một test đang **xanh sai** từ trước, chưa bao giờ kiểm đúng thứ nó nói.
Chi tiết ở §11.

## 4. Baseline before changes

Chạy tại `6942381` **trước** khi sửa gì:

| Lệnh                | Kết quả baseline                                |
| ------------------- | ----------------------------------------------- |
| `npm run typecheck` | 0 lỗi                                           |
| `npm run lint`      | 0 lỗi, **5 warning có sẵn**                     |
| `npx vitest run`    | **687 pass / 10 skip** (82 file pass, 2 skip)   |
| `npm run build`     | đạt                                             |

5 warning lint có từ trước (2 ở `scripts/add-system-admins.ts`, 3 ở
`tests/staging-rehearsal-scenarios.test.ts`), không do đợt này và không sửa (ngoài phạm vi).

## 5. Scope

### In scope

- Test cho `src/proxy.ts` (header `no-store`) và cho nhánh `notFound()` của
  `/submissions/[submissionId]/page.tsx`.
- Đợt 2C: hai endpoint tải ảnh cho cán bộ, ô tải ảnh trên màn duyệt, và test.
- Tách trần số ảnh/dung lượng và `discardIfOrphan` sang module dùng chung.
- Cập nhật `docs/brain/{01,03,04,06}` và `AGENTS.md`.

### Out of scope — cố tình KHÔNG làm

- **Gỡ ảnh CCCD.** Chỉ ảnh GCN gỡ được — xem §6 quyết định #10.
- **Tự động ghi đè ảnh đang có ở ô đích khi gán lại.** Cố tình từ chối (409), không tự đánh
  `REPLACED` như thay ảnh — xem §6 quyết định #14.
- **Mở tải/gỡ/gán lại ảnh cho hồ sơ đã `ACCEPTED`.** Đường đó là `mayAmendOfficialRecord`, đòi
  `amendmentReason`.
- **Nới `API_ERROR_CODES`.** Xem §10.
- **Chuẩn hóa/nén ảnh ở client** như luồng hộ dân. Xem §6 quyết định #8.
- **`@testing-library/react` + jsdom.** Thêm devDependency chưa được duyệt, nên `OfficerFileUpload`
  và phần lazy ảnh/accordion của 2B vẫn không có test render.
- 5 warning lint có sẵn.

### Deviations from approved plan

Một điều chỉnh so với phạm vi tối thiểu, đã cân nhắc: **tách `MAX_CERTIFICATE_PHOTOS`,
`SUBMISSION_BYTE_BUDGET` và `discardIfOrphan` ra `src/modules/public-intake/upload-commit.ts`** thay
vì để mỗi route giữ bản riêng. Đây là chạm vào file của bề mặt công khai, tức rộng hơn "chỉ thêm cái
mới" — nhưng hai đường ghi vào **cùng thư mục Drive và cùng bảng `public_files`**, nên trần là trần
của *hồ sơ*: để hai bản là sửa một bên thành hai bên lệch nhau, và cán bộ tải thêm ảnh sẽ vượt ngân
sách mà bên kia vẫn tưởng còn chỗ. `discardIfOrphan` theo cùng vì bất biến "không bao giờ xóa tệp cơ
sở dữ liệu đã nhận" phải giống nhau ở cả hai đường.

Hành vi của đường hộ dân **không đổi một dòng logic nào** — chỉ đổi nơi import. 14 ca của
`tests/public-upload-complete-route.test.ts` và 27 ca của `tests/upload-metrics.test.ts` vẫn xanh.

## 6. Decisions implemented

| #   | Quyết định                                                                | Lý do |
| --- | ------------------------------------------------------------------------- | ----- |
| 1   | Endpoint riêng `POST /api/submissions/:id/uploads/initiate\|complete`      | Đường hộ dân khóa theo cookie phiên + `isEditable`; nới ra là mở lại đường ghi cho hộ dân khi cán bộ đang làm |
| 2   | Cửa quyền `mayStaffEdit` + `SUBMISSION_DECISION_ROLES` + CSRF cán bộ       | Ảnh giấy tờ là dữ liệu của hồ sơ → đi đúng cửa đang dùng cho dữ liệu của hồ sơ. Nghiệp vụ đổi thì sửa một hằng số, không phải ba route |
| 3   | Chủ sử dụng đọc từ `effectivePayload(record).owners`, không từ `record.draft` | Chủ do cán bộ thêm ở Bàn làm việc chỉ tồn tại ở `working_payload`; đọc `draft_json` là ảnh CCCD của chủ vừa thêm không gắn được vào ai |
| 4   | `request_log.kind = OFFICER_UPLOAD_COMPLETE`                              | `findStoredMutation` lọc theo cả khóa **và** loại; dùng chung là hai đường đọc được replay của nhau — cán bộ gửi lại một khóa hộ dân đã dùng sẽ nhận về `fileId` của hộ dân |
| 5   | Thay ảnh CCCD **đòi `replaceFileId`** tường minh                          | `appendFile` tự đánh `REPLACED` cho ảnh cùng chủ + cùng mặt → không chặn là một lần bấm nhầm đẩy bằng chứng đang dùng xuống lịch sử mà cán bộ không biết |
| 6   | Trần + `discardIfOrphan` sang `upload-commit.ts` dùng chung               | Trần là trần của hồ sơ, không của một đường |
| 7   | **Không** nới `API_ERROR_CODES`                                           | Bề mặt công khai mở rộng **cục bộ** (`PublicErrorCode`), không nới bộ mã chung. Nới là đổi hợp đồng API cho mọi client cán bộ đang `switch` theo mã, mà client chỉ hiển thị `error.message` |
| 8   | **Không** chuẩn hóa/nén ảnh ở client                                      | Bên hộ dân nén để dùng được 3G; cán bộ ngồi máy có dây và cần giữ nét để đọc số GCN. Trần `MAX_UPLOAD_MB` của server vẫn áp |
| 9   | Tên tệp Drive có tiền tố `OFFICER-`                                       | Nhìn thư mục Drive là biết ảnh nào do cán bộ bổ sung. Ai bổ sung thì tra `audit_logs`, **không** nhét email vào tên tệp |
| 10  | Gỡ ảnh là **xóa mềm**, chỉ ảnh `CERTIFICATE`                              | Bất biến không đối xứng: giữ lại một ảnh đáng gỡ thì bấm lại mất vài giây, xóa thật là bằng chứng mất vĩnh viễn. CCCD là ràng buộc của `completionChecks` nên gỡ nó chỉ tạo trạng thái bí — luồng đúng là thay ảnh |
| 11  | **Gỡ được cả ảnh do hộ dân tải lên** (người dùng chốt 2026-07-30)         | Cán bộ là người quyết định hồ sơ gồm những gì (cùng tinh thần `[2026-07-25] Q2`); xóa mềm không mất dữ liệu và audit ghi rõ ai làm. Chặn lại thì một trang GCN chụp nhầm nằm trong hồ sơ vĩnh viễn |
| 12  | `DELETE` **không** đòi `idempotency-key`                                  | `markFileStatus` khóa dòng (`for update`) rồi mới chuyển trạng thái và no-op khi đã `DELETED`; route chỉ ghi audit trong nhánh `UPLOADED`. Thêm một khóa không dùng tới chỉ là hình thức |
| 13  | **Không** chặn ảnh GCN cuối cùng ở tầng route                             | Việc đó của `completionChecks` (`FILES_CERTIFICATE_MISSING`). Chặn ở đây là bắt cán bộ muốn thay cả bộ ảnh phải làm ngược thứ tự, và có thể vượt trần 10 ảnh giữa đường |
| 14  | Gán lại chủ **không** tự động ghi đè ảnh đang có ở ô đích                 | Thay ảnh là "vừa chụp ảnh mới cho đúng người" — ghi đè có chủ ý. Gán lại là "sửa nhãn ảnh cũ" — ảnh đang chiếm ô đích có thể đang đúng. Trả 409, bắt cán bộ tự xử lý ảnh đang chiếm chỗ trước |
| 15  | Chỉ ảnh CCCD gán lại được, không áp dụng `CERTIFICATE`                    | GCN luôn ghi `owner_id = ''` từ lúc tải lên, không gắn với một chủ cụ thể |
| 16  | Gán đúng chủ đang có là **NOOP** thành công, không audit                  | Cho phép gọi lại an toàn sau khi mất mạng giữa chừng mà không cần thêm `idempotency-key` |
| 17  | Khóa **cả hai** hàng (nguồn + đích) trong cùng transaction                | Thiếu khóa hàng đích thì hai yêu cầu gán lại đồng thời vào cùng một ô có thể cùng thấy "còn trống" rồi cùng ghi đè lên nhau |

Đã ghi đầy đủ vào `docs/brain/03-decisions.md`.

## 7. Changed files

### Mới

| File | Nội dung |
| ---- | -------- |
| `src/app/api/submissions/[submissionId]/uploads/initiate/route.ts` | POST — tạo phiên resumable Drive cho cán bộ |
| `src/app/api/submissions/[submissionId]/uploads/complete/route.ts` | POST — verify Drive + `appendFile` + audit |
| `src/modules/public-intake/upload-commit.ts` | `MAX_CERTIFICATE_PHOTOS`, `SUBMISSION_BYTE_BUDGET`, `discardIfOrphan` |
| `src/components/admin/officer-file-upload.tsx` | `OfficerFileUpload` — ô tải ảnh trên màn duyệt |
| `tests/officer-file-upload.test.ts` | 33 ca cho đường cán bộ |
| `tests/proxy-no-store.test.ts` | 4 ca cho header `no-store` của proxy |
| `tests/submission-detail-page.test.ts` | 7 ca cho `page.tsx` |
| `tests/officer-file-delete.test.ts` | 19 ca cho đường gỡ ảnh |
| `tests/officer-file-reassign-owner.test.ts` | 21 ca cho đường gán lại chủ sử dụng |

### Sửa

| File | Symbol | Thay đổi |
| ---- | ------ | -------- |
| `src/modules/public-intake/repository.ts` | `appendFile` | thêm `idempotencyOptions.kind` (danh mục đóng 2 giá trị), mặc định `PUBLIC_UPLOAD_COMPLETE` |
| `src/components/submission-detail.tsx` | `SubmissionDetail` | render `<OfficerFileUpload>` khi `isClaimedByMe && status === "UNDER_REVIEW"`; `onUploaded` gọi `loadSubmission` |
| `src/app/api/public/.../uploads/initiate/route.ts` | (module) | gỡ 2 hằng số cục bộ, import từ `upload-commit` |
| `src/app/api/public/.../uploads/complete/route.ts` | `discardIfOrphan` | gỡ hàm cục bộ, import từ `upload-commit` |
| `tests/public-upload-complete-route.test.ts` | 4 ca | trỏ sang `upload-commit.ts`; bất biến không đổi |
| `tests/upload-metrics.test.ts` | 1 ca sửa + 1 ca mới | sửa test **xanh sai** — xem §11 |
| `src/app/api/submissions/[submissionId]/files/[fileId]/route.ts` | `DELETE` (mới) | gỡ ảnh GCN, xóa mềm; `GET` không đổi |
| `src/components/admin/document-viewer.tsx` | `DocumentViewer` | thêm prop tùy chọn `onDeleteFile` (nút gỡ, chỉ ảnh GCN) và `onReassignOwner`/`reassignableOwners` (nút gán lại chủ, chỉ ảnh CCCD); mỗi nút có dải xác nhận riêng tại chỗ |
| `src/modules/public-intake/repository.ts` (lần hai) | `reassignFileOwner`, `FileOwnerReassignConflictError` | transaction khóa cả hàng nguồn lẫn hàng đích; `NOOP` khi gán đúng chủ đang có |
| `src/app/api/submissions/[submissionId]/files/[fileId]/route.ts` (lần hai) | `PATCH` (mới) | gán lại `owner_id`, 409 khi ô đích đã có ảnh; `GET`/`DELETE` không đổi |

## 8. Detailed implementation by phase

### Phase A1 — `tests/proxy-no-store.test.ts`

Mock `next-auth` để `NextAuth()` trả `{ auth: (handler) => handler }`, nhờ đó gọi được thân handler
với request tự dựng, không cần session JWT thật hay biến môi trường Google. 4 ca: `private, no-store`
cho phiên đã đăng nhập; chỉ thị luôn chứa `no-store` (không chỉ `private`) và không có `max-age`;
chưa đăng nhập → 307 về trang chủ; session còn hạn nhưng **thiếu email** cũng bị coi là chưa đăng
nhập (vì `requireActiveUser` phía Node không đối chiếu allowlist được).

### Phase A2 — `tests/submission-detail-page.test.ts`

Mock `next/navigation` (`notFound`/`redirect` **ném lỗi** đúng như Next thật, để code sau lời gọi
không chạy tiếp), `@/components/submission-detail`, `@/modules/auth/authorization`,
`@/modules/submissions/detail-view`. 7 ca, trọng tâm là **cặp đối lập**: `null` → `notFound()`;
`throw` → **không** `notFound()` mà vẫn render với `initialSubmission=null`.

### Phase B1 — `initiate` (cán bộ)

Thứ tự cố định: parse Zod → `requireActiveUser(SUBMISSION_DECISION_ROLES)` → `verifyCsrfToken` →
`findById` (404) → `mayStaffEdit` (403) → `canonicalImageMimeType` → trần `MAX_UPLOAD_MB` →
`listFiles` **từ cơ sở dữ liệu** (không dùng `record.fileSummaries`: đường cán bộ không có phiên nào
giữ bản chụp, và ảnh có thể vừa được thêm ở tab khác) → kiểm `replaceFileId` cùng loại giấy tờ →
ngân sách byte → trần theo loại → `createUploadSession`.

Tên tệp do **máy chủ** đặt: `OFFICER-${documentType}-${Date.now()}-${randomUUID().slice(0,8)}.${ext}`.
Không ghép mảnh nào của `body.data.fileName`; trường đó chỉ dùng để suy ra loại ảnh khi trình duyệt
không khai được `mimeType`.

### Phase B2 — `complete` (cán bộ)

Hai điểm về thứ tự, cả hai là bài học đã có từ đường hộ dân:

1. **Replay đứng trước mọi kiểm tra trạng thái.** Sau lần commit đầu, chính ảnh vừa nhận làm kiểm
   tra "đã có ảnh CCCD" thất bại; nếu nhánh đó chạy trước thì lần gọi lại (response đầu mất mạng) sẽ
   đi vào cửa dọn dẹp và **xóa mất tệp mà cơ sở dữ liệu đang trỏ tới**.
2. **Mọi nhánh thất bại đều qua `discardIfOrphan`** (8 lời gọi), không `discardFile` trực tiếp ở đâu.

`mutationHash` gồm `actorEmail`: hai cán bộ dùng cùng một idempotency key không được coi là một
thao tác. Audit `SUBMISSION_OFFICER_FILE_UPLOADED`, metadata
`{ documentType, fileId, sizeBytes, replaced }`.

### Phase B3 — `OfficerFileUpload` + wiring

Chọn loại giấy tờ → (nếu CCCD) chọn chủ sử dụng → chọn tệp. Khi mặt CCCD đó **đã có ảnh**, ô chọn
tệp bị khóa tới khi cán bộ tích "Thay ảnh đang có" — lớp thứ nhất; server cũng từ chối lượt không kèm
`replaceFileId`. Dùng lại `uploadWithResume` + `createXhrTransport` của luồng hộ dân để được thử lại
tự động khi mạng chớp tắt. Xong thì gọi `loadSubmission` để khung xem ảnh thấy ảnh mới **mà không
cần tải lại trang**.

## 9. Behavior before and after

| Tình huống | Trước | Sau |
| ---------- | ----- | --- |
| Hộ dân nộp thiếu 1 mặt CCCD, cán bộ đang giữ hồ sơ `UNDER_REVIEW` | Không có đường nào; phiên hộ dân đã khóa | Cán bộ tải trực tiếp trên màn duyệt |
| Cán bộ **không** giữ hồ sơ, hoặc hồ sơ không `UNDER_REVIEW` | — | Không thấy ô tải ảnh; API trả 403 nếu gọi thẳng |
| Tải ảnh CCCD vào chỗ đã có ảnh, không tích "thay ảnh" | — | Ô chọn tệp bị khóa; API trả 409 |
| Thay ảnh CCCD | — | Ảnh cũ → `REPLACED`, **vẫn nằm trên Drive** |
| Ghi cơ sở dữ liệu hỏng sau khi tệp đã lên Drive | — | `discardIfOrphan`: chỉ xóa khi chắc chưa ai nhận **và** tệp nằm đúng thư mục hồ sơ |
| Đường tải ảnh của hộ dân | — | **Không đổi hành vi** |

## 10. API, data and security impact

### Authentication

`requireActiveUser(SUBMISSION_DECISION_ROLES)` — REVIEW_OFFICER, WARD_ADMIN, SYSTEM_ADMIN.

### Authorization

`verifyCsrfToken(AUTH_SECRET, user.email, header "x-csrf-token")`, rồi `mayStaffEdit(record, email)`
= đang giữ hồ sơ **và** `UNDER_REVIEW`.

⚠️ **`/api/submissions/*` KHÔNG nằm trong `matcher` của `src/proxy.ts`** — matcher có
`/submissions/:path*` là **trang**, không phải API. Ba lớp trong route là lớp chặn **duy nhất**. Đã
khóa bằng test.

Không nhận `x-public-csrf-token` (token của phiên kê khai ẩn danh, không chứng minh được cán bộ nào).
Đã khóa bằng test.

### DataScope

Chỉ đọc/ghi trong phạm vi một `submissionId`: `verifyUploadedFile` đòi tệp nằm đúng
`record.driveFolderId`; `discardIfOrphan` đòi cả "chưa ai nhận" **và** "nằm đúng thư mục hồ sơ đang
gọi".

### API contract

Hai endpoint mới. **Không** thay đổi endpoint nào đang có. **Không** nới `API_ERROR_CODES`:

| Tình huống | Mã | HTTP |
| ---------- | -- | ---- |
| Body/idempotency key sai, mimeType lạ, quá `MAX_UPLOAD_MB`, vượt ngân sách byte, chủ sử dụng sai, `replaceFileId` sai | `VALIDATION_FAILED` | 400 |
| Chưa đăng nhập | `UNAUTHENTICATED` | 401 |
| CSRF sai, không đủ quyền, không giữ hồ sơ / không `UNDER_REVIEW` | `ACCESS_DENIED` | 403 |
| Không có hồ sơ | `NOT_FOUND` | 404 |
| Đã đủ 10 ảnh GCN, CCCD trùng chỗ, trạng thái thay ảnh không còn hợp lệ | `VERSION_CONFLICT` | 409 |
| Khóa chống gửi trùng dùng cho thao tác khác | `IDEMPOTENCY_CONFLICT` | 409 |

Mọi phản hồi (kể cả thành công) đều `cache-control: no-store`. Đã khóa bằng test.

### Database and migrations

**KHÔNG CÓ MIGRATION.** Đã kiểm `supabase/migrations/202607230001_supabase_schema.sql`:
`request_log.kind` và `audit_logs.action` đều là `text not null` **không có check constraint**, nên
`OFFICER_UPLOAD_COMPLETE` và `SUBMISSION_OFFICER_FILE_UPLOADED` dùng được ngay. Không thêm bảng,
không thêm cột, không đổi constraint, không backfill.

⚠️ **4 migration của các đợt trước vẫn đang nợ** và không liên quan tới đợt này:
`202607290002_full_pl3_editor.sql`, `202607290003_drop_working_payload_override_columns.sql`,
`202607290004_queue_search_performance.sql`, `202607290005_submission_internal_notes.sql`. Phải áp
**theo thứ tự tên file**.

### Validation and file handling

Zod ở ranh giới; `canonicalImageMimeType` quy bí danh `image/jpg` và trường hợp trình duyệt không
khai được loại; `extensionFromMimeType` lấy đuôi từ mimeType **đã kiểm**, không từ tên client;
`verifyUploadedFile` kiểm định dạng/dung lượng/checksum và thư mục trước khi nhận vào hồ sơ.

### Sensitive data

- Tên tệp trong kho do máy chủ đặt, không ghép tên client gửi lên (tên máy ảnh hay mang CCCD, họ
  tên, ngày giờ, đôi khi cả toạ độ).
- URL phiên upload là bí mật: trả trong response, **không** ghi log hay audit.
- Audit metadata chỉ danh mục đóng và số — không `driveFileId`, không tên tệp, không `ownerId`.
- Response thành công không trả `driveFileId`.

Cả bốn điều trên đều có test khóa.

## 11. Tests added or changed

### Thêm mới — 44 ca

| File | Ca | Nội dung |
| ---- | -- | -------- |
| `tests/proxy-no-store.test.ts` | 4 | `private, no-store` cho phiên đã đăng nhập; chỉ thị luôn chứa `no-store` không chỉ `private`, và không có `max-age`; chưa đăng nhập → 307 về trang chủ; session không có email cũng bị coi là chưa đăng nhập |
| `tests/submission-detail-page.test.ts` | 7 | `null` → `notFound()`; **lỗi tạm KHÔNG thành 404** mà vẫn render với `initialSubmission=null`; nạp sẵn thành công truyền thẳng hồ sơ; luôn đi qua `loadSubmissionDetail` (giữ audit); không đủ quyền → `/profile`; lỗi hạ tầng không bị hạ cấp thành redirect; `isAdministrator` suy từ vai trò |
| `tests/officer-file-upload.test.ts` | 33 | cửa quyền (3 lớp; không dùng cửa công khai; không tự viết lại điều kiện quyền); trần dùng chung; không im lặng ghi đè; `effectivePayload`; idempotency tách loại + replay trước kiểm tra trạng thái; `discardIfOrphan` đủ 8 nhánh; audit không PII; mọi phản hồi `no-store`; điều kiện hiện nút ở client |
| `tests/officer-file-delete.test.ts` | 19 | **không có đường xóa thật nào** (`discardFile`/`files.delete`/`discardIfOrphan`); `markFileStatus` chỉ `update`, không `delete from`; script dọn tệp mồ côi không dọn ảnh đã gỡ; chỉ `CERTIFICATE` ở cả route lẫn nút; cùng cửa quyền với upload; gọi lại là no-op và **không** ghi audit thứ hai; `refreshFileSummaries` để `completionChecks` thấy bộ ảnh mới; audit không PII; không đếm ảnh GCN còn lại ở tầng route |
| `tests/officer-file-reassign-owner.test.ts` | 21 | **không tự động ghi đè ô đích** (ném `FileOwnerReassignConflictError`, không chứa chuỗi `REPLACED`); khóa cả hàng nguồn lẫn hàng đích (`for update` cả hai); chỉ CCCD, `CERTIFICATE` bị từ chối ở cả route lẫn repository lẫn nút; cùng cửa quyền `mayStaffEdit`; chủ đích đọc `effectivePayload`; `NOOP` khi gán đúng chủ đang có và **không** ghi audit; **không** đòi `idempotency-key`; chỉ đổi `owner_id`, không chạm `document_type`/`drive_file_id`; audit không mang `ownerId`; không có đường chạm Drive nào trong `PATCH` |

### ⚠️ SỬA MỘT TEST ĐANG XANH SAI

`tests/upload-metrics.test.ts`, ca **"complete route nuốt lỗi ghi metric"**. Mẫu cũ:

```
/appendUploadAttempt\([\s\S]*?\)\s*\.catch\(\(\) => undefined\)/
```

`[\s\S]*?` là lazy nhưng **không bị chặn ở ranh giới câu lệnh**, nên nó chạy tuốt xuống
`.catch(() => undefined)` nằm trong `discardIfOrphan` ở **cuối file** — một hàm không liên quan gì
tới số đo. Route thật dùng `.catch(reportUploadMetricFailure)`. Tức là ca này **chưa bao giờ kiểm
đúng thứ nó nói**, và vẫn xanh suốt.

Chỉ lộ ra khi Đợt 2C chuyển `discardIfOrphan` sang module khác, làm mất đoạn `.catch` mà nó vô tình
bám vào. Đã sửa mẫu thành `[^;]*?` (không vượt dấu chấm phẩy → ràng trong đúng một câu lệnh) và thêm
một ca kiểm `reportUploadMetricFailure` thật sự không ném lại.

### Sửa nơi đọc — `tests/public-upload-complete-route.test.ts`

4 ca trỏ từ route sang `upload-commit.ts`. **Bất biến không đổi**, và giờ chúng khóa cho cả hai đường
một lượt. Một ca (`route không gọi discardFile trực tiếp`) trước đây cắt chuỗi bằng
`route.indexOf("/**\n * Xóa tệp")` — mốc cắt đó đã biến mất nên nó cũng đang xanh yếu; đã đổi sang
khẳng định trực tiếp trên cả file.

### Kiểm chứng test không rỗng (mutation testing)

Không tin test xanh mà chưa thấy nó đỏ. Đã đột biến source rồi revert:

| Đột biến | Kết quả |
| -------- | ------- |
| Bỏ `response.headers.set("cache-control", ...)` trong `proxy.ts` | 2 ca đỏ |
| `catch { initialSubmission = null }` → `catch { missing = true }` trong `page.tsx` | 1 ca đỏ |
| Vô hiệu hóa chốt `mayStaffEdit` ở `initiate` | 1 ca đỏ |
| `kind: "OFFICER_UPLOAD_COMPLETE"` → `"PUBLIC_UPLOAD_COMPLETE"` | 1 ca đỏ |
| Bỏ một lời gọi `discardIfOrphan` ở nhánh lỗi | 1 ca đỏ |
| Nút tải ảnh hiện với mọi cán bộ (`isClaimedByMe && ...` → `true`) | 1 ca đỏ |
| Thêm `discardFile` vào route gỡ ảnh cho "gọn kho" | 1 ca đỏ |
| Cho gỡ cả ảnh CCCD (`documentType !== "CERTIFICATE"` → `false`) | 1 ca đỏ |
| Bỏ chốt `status === "UPLOADED"` → audit ghi mỗi lần gọi | 1 ca đỏ |
| Bỏ chốt `mayStaffEdit` ở route gỡ ảnh | 1 ca đỏ |
| Bỏ kiểm tra xung đột khi gán lại (tự động ghi đè như `appendFile`) | 1 ca đỏ |
| Cho gán lại ảnh `CERTIFICATE` | 1 ca đỏ |
| Bỏ chốt `mayStaffEdit` ở route gán lại chủ | 1 ca đỏ |
| Ghi audit cả khi kết quả là `NOOP` | 1 ca đỏ |

Đã revert cả 14; `git diff src/` trống trước mỗi commit.

## 12. Final verification

| Lệnh | Baseline `6942381` | Sau `af4b9e1` |
| ---- | ------------------ | ------------- |
| `npm run typecheck` | 0 lỗi | **0 lỗi** |
| `npm run lint` | 0 lỗi / 5 warning | **0 lỗi / 5 warning** (đúng baseline) |
| `npx vitest run` | 687 pass / 10 skip | **772 pass / 10 skip** (85 file pass, 2 skip) |
| `npm run build` | đạt | **đạt** — bảng route có `/api/submissions/[submissionId]/uploads/{initiate,complete}` và `/files/[fileId]` (GET/DELETE/PATCH) |

772 = 687 + 84 ca mới + 1 ca thêm ở `upload-metrics`. **Không test cũ nào fail hay mới bị skip.**

`npm run test:e2e` **KHÔNG chạy** — Playwright cần app chạy thật, và môi trường này không có
credential (chỉ có `.env.example`; `loadServerEnvironment()` đòi ~15 biến nên `npm run dev` không
khởi động được).

## 13. Acceptance criteria matrix

| #     | Điều kiện | Trạng thái | Bằng chứng |
| ----- | --------- | ---------- | ---------- |
| AC-01 | Cán bộ đang giữ hồ sơ `UNDER_REVIEW` tải được ảnh CCCD/GCN bổ sung | **CODE_COMPLETE / NOT_TESTED_MANUALLY** | 2 route + component; 33 test đọc mã nguồn |
| AC-02 | Cán bộ khác, hoặc trạng thái khác, không tải được | **PASS** (test) | `mayStaffEdit` ở cả 2 route + điều kiện hiện nút; mutation test |
| AC-03 | Không im lặng ghi đè ảnh CCCD đang dùng | **PASS** (test) | 409 khi thiếu `replaceFileId`; ảnh cũ → `REPLACED` |
| AC-04 | Không xóa tệp cơ sở dữ liệu đã nhận trên bất kỳ đường lỗi nào | **PASS** (test) | 8 lời gọi `discardIfOrphan`, 0 `discardFile` trực tiếp; đếm khóa bằng test |
| AC-05 | Idempotency không lẫn với đường hộ dân | **PASS** (test) | `kind` tách riêng ở khóa + tra cứu + lúc ghi |
| AC-06 | Audit ghi ai bổ sung ảnh nào, không PII | **PASS** (test) | `SUBMISSION_OFFICER_FILE_UPLOADED`; metadata chỉ danh mục đóng và số |
| AC-07 | Đường tải ảnh của hộ dân không đổi hành vi | **PASS** (test) | 14 ca `public-upload-complete-route` + 27 ca `upload-metrics` xanh |
| AC-08 | Header `no-store` của proxy được khóa bằng test | **PASS** | `tests/proxy-no-store.test.ts` + mutation test |
| AC-09 | Nhánh `notFound()` vs lỗi tạm của `page.tsx` được khóa bằng test | **PASS** | `tests/submission-detail-page.test.ts` + mutation test |
| AC-10 | Không migration | **PASS** | `request_log.kind`/`audit_logs.action` là `text` không check constraint |
| AC-11 | Một lượt tải ảnh thật thành công trên môi trường có Drive | **NOT_TESTED** | cần credential — xem §14 |
| AC-13 | Cán bộ gỡ được ảnh GCN; ảnh biến khỏi khung xem nhưng **vẫn còn trên Drive** | **CODE_COMPLETE / NOT_TESTED_MANUALLY** | `DELETE` + 19 test; `listFiles` mặc định lọc `UPLOADED` |
| AC-14 | Không có đường nào xóa thật tệp trên Drive từ chức năng gỡ ảnh | **PASS** (test) | 3 ca phủ định + mutation test |
| AC-15 | Không gỡ được ảnh CCCD | **PASS** (test) | route 400 + nút không hiện; mutation test |
| AC-16 | Gỡ lại ảnh đã gỡ là no-op, không ghi audit thứ hai | **PASS** (test) | nhánh `status === "UPLOADED"`; `markFileStatus` khóa dòng |
| AC-17 | Cán bộ gán lại được chủ sử dụng của ảnh CCCD gán nhầm | **CODE_COMPLETE / NOT_TESTED_MANUALLY** | `PATCH` + 21 test |
| AC-18 | Gán lại **không** tự động ghi đè ảnh đang đúng ở ô đích | **PASS** (test) | 409 `VERSION_CONFLICT`; mutation test |
| AC-19 | Gán đúng chủ đang có là no-op, không audit thứ hai | **PASS** (test) | nhánh `NOOP`; mutation test |
| AC-20 | Chỉ ảnh CCCD gán lại được, không áp dụng GCN | **PASS** (test) | route + repository + nút; mutation test |
| AC-12 | Lazy ảnh / accordion AI của Đợt 2B | **NOT_TESTED** | cần testing-library + jsdom, chưa được duyệt |

## 14. Manual verification required

Chưa làm được ở đây: không có `.env`, mọi biến trống, `loadServerEnvironment()` đòi ~15 biến nên
`npm run dev` không khởi động được. Cần chạy ở môi trường có credential:

1. Áp 4 migration đang nợ **theo thứ tự tên file** (`202607290002` → `...0005`), rồi
   `npx tsx scripts/preflight-public-intake-v2-migrations.ts`.
2. Đăng nhập bằng tài khoản có vai trò REVIEW_OFFICER.
3. Mở một hồ sơ `SUBMITTED` → **Nhận xử lý** (hồ sơ về `UNDER_REVIEW`).
4. Xác nhận ô **"Tải thêm ảnh giấy tờ"** xuất hiện dưới khung xem ảnh.
5. Chọn "Giấy chứng nhận" → chọn một ảnh JPG → xác nhận thông báo "Đã thêm…" và ảnh mới xuất hiện
   trong tab của khung xem ảnh **mà không cần tải lại trang**.
6. Chọn "CCCD — mặt trước" → chọn một chủ **đã có ảnh mặt trước** → xác nhận ô chọn tệp **bị khóa**
   và có cảnh báo; tích "Thay ảnh đang có" → ô mở ra → thay được.
7. Chọn "CCCD — mặt trước" của một chủ **chưa có ảnh** → tải được, không hỏi thay ảnh.
8. Mở tab thứ hai cùng hồ sơ, **Trả hồ sơ** ở tab đó, rồi thử tải ảnh ở tab đầu → phải nhận 403 với
   thông điệp về "đang nhận xử lý", **không** phải lỗi 500.
9. Kiểm thư mục Drive của hồ sơ: ảnh vừa tải có tên bắt đầu bằng `OFFICER-`; ảnh bị thay **vẫn còn**
   trên Drive.
10. Kiểm `audit_logs`: có dòng `SUBMISSION_OFFICER_FILE_UPLOADED` với `actor_email` đúng, và
    `metadata` **không** chứa tên tệp / `driveFileId` / `ownerId`.
11. DevTools → Network: mọi phản hồi của `/api/submissions/*/uploads/*` có `cache-control: no-store`.
12. Thử một ảnh lớn hơn `MAX_UPLOAD_MB` → thông điệp rõ ràng, không phải 500.
13. Ngắt mạng giữa lúc tải rồi nối lại → `uploadWithResume` tiếp tục hoặc báo lỗi có thể hiểu; nếu
    thất bại, kiểm Drive **không** còn tệp mồ côi.

Thêm cho chức năng **gỡ ảnh**:

14. Chọn một tab ảnh GCN → xác nhận **có** nút thùng rác trên thanh công cụ; chọn một tab ảnh CCCD →
    xác nhận **không** có nút đó.
15. Bấm nút gỡ → hiện dải xác nhận đỏ với đúng nhãn ảnh đang xem → bấm **Hủy** → không có gì xảy ra.
16. Bấm gỡ lần nữa → **Xác nhận gỡ** → ảnh biến khỏi danh sách tab **mà không cần tải lại trang**.
17. Kiểm thư mục Drive: **tệp vừa gỡ vẫn còn nguyên**. Kiểm `public_files`: dòng đó
    `status = 'DELETED'`.
18. Kiểm `audit_logs`: có đúng **một** dòng `SUBMISSION_OFFICER_FILE_DELETED`.
19. Gỡ hết ảnh GCN → bấm **Tiếp nhận** → phải bị chặn với lỗi `FILES_CERTIFICATE_MISSING`
    ("Thiếu ảnh Giấy chứng nhận"), không phải lỗi 500.
20. **Trả hồ sơ** rồi thử gọi thẳng `DELETE` bằng curl với cookie hợp lệ → 403, không phải 500.

Thêm cho chức năng **gán lại chủ sử dụng**:

21. Chọn một tab ảnh CCCD của chủ A → xác nhận có nút gán lại (icon người) trên thanh công cụ.
22. Bấm nút → hiện dải xanh với dropdown liệt kê **các chủ khác** (không có chủ A trong danh sách).
23. Chọn chủ B, bấm **Xác nhận gán lại** → ảnh chuyển sang nhãn "CCCD chủ B — …" trong tab, không
    cần tải lại trang.
24. Kiểm `public_files`: dòng đó `owner_id` đã đổi sang chủ B; `updated_at` mới.
25. Thử gán ảnh CCCD sang một chủ **đã có sẵn ảnh cùng mặt** → nhận lỗi rõ ràng (409), ảnh ở ô đích
    **không** bị đổi.
26. Kiểm `audit_logs`: có đúng một dòng `SUBMISSION_OFFICER_FILE_OWNER_REASSIGNED` cho bước 23,
    **không có** dòng nào cho bước 25 (vì bị từ chối).
27. Thử gán ảnh CCCD "sang" đúng chủ đang giữ nó (chọn lại chính chủ hiện tại nếu UI cho phép, hoặc
    gọi API trực tiếp) → thành công, nhưng kiểm `audit_logs` **không** có dòng mới.

## 15. Remaining issues and warnings

1. **Không có cách xử lý xung đột tự động khi gán lại.** Nếu ô đích đã có ảnh, cán bộ phải tự gỡ
   hoặc thay ảnh đó trước rồi mới gán lại được — không có luồng "gộp hai bước" trong một lần bấm.
   Đây là lựa chọn có chủ ý (xem §6 quyết định #14), không phải thiếu sót, nhưng tăng số bước thao
   tác cho ca hiếm khi cả hai ô đều có ảnh sai.
2. **Ảnh `DELETED`/`REPLACED` tích trên Drive vĩnh viễn** — không có script nào dọn, và đó là cố ý.
   Nếu dung lượng thành vấn đề thật thì bàn **chính sách lưu trữ**, đừng cho xóa thật.
3. **Chưa mở cho hồ sơ đã `ACCEPTED`.** Nếu nghiệp vụ cần, đường đúng là ghép vào
   `mayAmendOfficialRecord` (đòi `amendmentReason`), **không** phải nới `mayStaffEdit`.
4. **Không có test render cho `OfficerFileUpload`** và cho dải xác nhận gỡ ảnh trong `DocumentViewer`. Điều kiện hiện nút được khóa bằng test đọc mã
   nguồn, nhưng hành vi thật của ô chọn tệp và checkbox thay ảnh thì chưa.
5. **52 test của 2C đọc mã nguồn, không chạy route thật.** Cùng cách và cùng lý do với
   `tests/public-upload-complete-route.test.ts` đã có từ Phase 5. Chúng bắt hồi quy về *cấu trúc*
   (mất một chốt quyền, quên một `discardIfOrphan`, lẫn loại idempotency) chứ **không** chứng minh
   route chạy đúng với Supabase và Drive thật.
6. **4 migration của đợt trước vẫn đang nợ.** Không liên quan tới đợt này nhưng chặn deploy.
7. **Không có số đo P50/P95** cho bất cứ thứ gì. Không tuyên bố đạt mục tiêu hiệu năng nào.
8. 5 warning lint có sẵn, không sửa (ngoài phạm vi).

## 16. Regression and compatibility notes

- `appendFile` thêm tham số **tùy chọn** `kind` với mặc định `PUBLIC_UPLOAD_COMPLETE` → mọi bên gọi
  cũ giữ nguyên hành vi, không cần sửa.
- Đường tải ảnh của hộ dân chỉ đổi **nơi import** hai hằng số và `discardIfOrphan`; logic giữ nguyên
  từng dòng.
- `submission-detail.tsx` chỉ **thêm** một khối render có điều kiện; không sửa nhánh nào đang có.
- Không đổi schema → không cần rollback dữ liệu, không cần backfill.
- `PublicFileSummary` trả về từ `appendFile` không đổi hình dạng.
- `DocumentViewer.onDeleteFile` là prop **tùy chọn**; không truyền thì component hành xử y như trước.
- `GET /api/submissions/:id/files/:fileId` không đổi một dòng nào — chỉ thêm `DELETE` rồi `PATCH`
  vào cùng file.
- `DocumentViewer.onReassignOwner`/`reassignableOwners` là prop **tùy chọn**; không truyền thì
  component hành xử y như trước khi có tính năng gán lại.

## 17. Rollback plan

Không có migration nên rollback là thuần code:

```bash
git revert 5c97c08        # chỉ bỏ chức năng gán lại chủ, giữ tải ảnh + gỡ ảnh
git revert 69dfa2e        # bỏ cả chức năng gỡ ảnh, giữ tải ảnh
git revert af4b9e1        # bỏ cả Đợt 2C, giữ test của 2B
git revert b548c7d        # nếu muốn bỏ cả test (không nên)
```

Ảnh cán bộ đã tải trước khi revert **vẫn nằm trong `public_files` và trên Drive** — chúng là bản ghi
hợp lệ như ảnh của hộ dân, chỉ mất đường tải thêm. Ảnh đã gán lại chủ vẫn còn nguyên nội dung, chỉ đổi `owner_id`; muốn trả về chủ cũ thì gọi lại
`PATCH` với `ownerId` cũ — hai chiều đều là đổi giá trị một cột, không có gì để mất.

Ảnh đã gỡ vẫn ở `status = 'DELETED'`; muốn phục hồi
thì `update public.public_files set status = 'UPLOADED' where file_id = ...` rồi refresh
`file_summary_json` — **tệp trên Drive chưa bao giờ bị xóa** nên không mất gì. Không cần dọn dữ liệu.

## 18. Recommended next action

1. Áp 4 migration đang nợ trên Preview, rồi chạy preflight.
2. Chạy 13 bước ở §14 trên Preview.
3. Nếu vận hành gặp ca cả ô nguồn lẫn ô đích đều có ảnh sai: cân nhắc thêm một tùy chọn "hoán đổi"
   (swap) hai ảnh CCCD cho nhau trong một lần gọi, thay vì bắt cán bộ gỡ một ảnh trước.
4. Nếu muốn có test render cho phần client (2B lẫn 2C): duyệt thêm `@testing-library/react` +
   `jsdom` làm devDependency.

## 19. Commands to reproduce

```bash
# Cài đặt
npm ci

# Kiểm tra (đúng các lệnh đã chạy cho báo cáo này)
npm run typecheck            # 0 lỗi
npm run lint                 # 0 lỗi, 5 warning có sẵn
npx vitest run               # 772 pass / 10 skip
npm run build                # đạt; kiểm bảng route có 2 endpoint uploads mới
git checkout next-env.d.ts   # build sửa file này, trả lại nguyên trạng

# Chạy riêng test của đợt này
npx vitest run tests/officer-file-upload.test.ts \
               tests/officer-file-delete.test.ts \
               tests/officer-file-reassign-owner.test.ts \
               tests/proxy-no-store.test.ts \
               tests/submission-detail-page.test.ts \
               tests/public-upload-complete-route.test.ts \
               tests/upload-metrics.test.ts
```

# PUBLIC INTAKE V2 — TOÀN BỘ TEST BỊ SKIP

`npm test` (vitest): **529 pass, 10 skipped**. Đúng 10 test này nằm trong **hai file**, cả hai gác
bởi `describe.skipIf(!hasTestDb)` với `hasTestDb = Boolean(process.env.ACCEPTANCE_SAGA_TEST_DATABASE_URL)`.
Không có test nào khác trong repo bị `skip`/`fixme` ở tầng vitest — đã xác nhận bằng
`grep -rn "\.skip\(|skipIf" tests/*.ts` (loại trừ `tests/e2e/`, là Playwright, một hệ chạy khác).

## Danh sách đầy đủ

| #   | File                                                          | Tên test                                                                                                               | Loại                                       | Lý do skip                                |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| 1   | `tests/staging-rehearsal-acceptance-saga.integration.test.ts` | Kịch bản 1: ngắt giữa chừng bước FILES_MOVED → retry cùng idempotency key → tiếp tục đúng                              | Integration (Postgres thật, Drive giả lập) | Thiếu `ACCEPTANCE_SAGA_TEST_DATABASE_URL` |
| 2   | ″                                                             | Kịch bản 1b: GCN nhiều thửa nhiều mục đích → parcels/assets ghi đủ, replay không nhân đôi                              | ″                                          | ″                                         |
| 3   | ″                                                             | Kịch bản 1c: làm mới hình chiếu chuẩn hóa 2 lần liên tiếp không vi phạm khóa ngoại `public_land_uses → public_parcels` | ″                                          | ″                                         |
| 4   | ″                                                             | Kịch bản 1d: điều chỉnh hồ sơ ĐÃ tiếp nhận → dữ liệu chính thức ghi lại đúng, mã hồ sơ giữ nguyên                      | ″                                          | ″                                         |
| 5   | ″                                                             | Kịch bản 2a: saga dở dang → request khác key khác bị từ chối `ACCEPTANCE_IN_PROGRESS`                                  | ″                                          | ″                                         |
| 6   | ″                                                             | Kịch bản 2b: hai request tiếp nhận đồng thời cho hồ sơ mới, không bao giờ sinh 2 case/reservation                      | ″                                          | ″                                         |
| 7   | ″                                                             | Kịch bản 3a: bấm lại sau COMPLETED (request_log còn hạn) → trả cache y hệt, không tăng version                         | ″                                          | ″                                         |
| 8   | ″                                                             | Kịch bản 3b: bấm lại sau COMPLETED, request_log đã hết hạn/bị dọn → vẫn đúng, đọc từ saga step                         | ″                                          | ″                                         |
| 9   | ″                                                             | Kịch bản 3c: idempotency key cũ + payload khác → `IDEMPOTENCY_CONFLICT`                                                | ″                                          | ″                                         |
| 10  | `tests/canonical-projection.integration.test.ts`              | CP1: xóa thửa đất tự động xóa theo mục đích sử dụng (`on delete cascade`)                                              | Integration (Postgres thật)                | Thiếu `ACCEPTANCE_SAGA_TEST_DATABASE_URL` |

Không có test nào trong 10 test này thuộc phạm vi thi công V2 trực tiếp (wizard 4 bước, chuẩn hóa
ảnh, hàng đợi upload, chế độ hỗ trợ, Phase 5) — cả 10 đều bảo vệ `runOfficialAcceptance`
(`acceptance-saga.ts`) và ràng buộc DB đi kèm, từ trước V2. Bị gộp vào con số "10 skipped" của
`npm test` chỉ vì cùng file test suite, không phải vì V2 làm chúng skip.

## Đối chiếu với danh sách luồng bắt buộc không được để skip/fixme ở preview có credential

| Luồng bắt buộc            | Có nằm trong 10 test này không                                    | Ở đâu                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Official acceptance guard | **Có** — #1, #4, #5, #6                                           | File 1, Kịch bản 1/1d/2a/2b                                                                                                        |
| Idempotent replay         | **Có** — #1, #2, #7, #8, #9                                       | File 1, Kịch bản 1/1b/3a/3b/3c                                                                                                     |
| Public minimal submit     | Không                                                             | Đã chạy không skip — `tests/citizen-submit-validation.test.ts`, `tests/public-wizard-validation.test.ts`                           |
| Required image validation | Không                                                             | `tests/citizen-submit-validation.test.ts` (`validateCitizenRequiredFiles`)                                                         |
| Google Drive upload       | Không (unit) / **Có** (E2E)                                       | Unit: `tests/resumable-upload.test.ts`, `tests/upload-transport.test.ts`. Thật: `tests/e2e/public-intake-v2.spec.ts` E2E-01/E2E-03 |
| Retry/resume              | Không (unit) / **Có** (E2E)                                       | Unit: `tests/resumable-upload.test.ts` (đơn điệu tăng, hỏi lại tiến độ). Thật: E2E-04                                              |
| Assisted intake           | Không                                                             | `tests/officer-assisted-intake.test.ts`, `tests/assisted-submissions-route.test.ts` (mock đầy đủ, chạy thật không cần DB thật)     |
| Public officer privacy    | Không                                                             | `tests/assigned-officer.test.ts`, `tests/public-intake-v2-review-fixes.test.ts`                                                    |
| Next-submission flow      | Không (unit không dựng được — wizard là component) / **Có** (E2E) | E2E-08                                                                                                                             |
| Orphan cleanup            | Không (unit đọc mã nguồn) / **Có** (E2E)                          | Unit: `tests/public-upload-complete-route.test.ts`. Thật: E2E-09                                                                   |

**Kết luận:** hai luồng "official acceptance guard" và "idempotent replay" là hai luồng DUY NHẤT
trong danh sách bắt buộc thực sự bị skip ở tầng vitest, và chỉ vì thiếu một Postgres thử nghiệm.
Tám luồng còn lại **không** bị skip ở tầng vitest (đã chạy pass không điều kiện); phần "chạy thật
end-to-end" của chúng nằm ở Playwright (`tests/e2e/public-intake-v2.spec.ts`), nơi đã bỏ toàn bộ
`test.fixme(true, ...)` không điều kiện ở vòng rà soát này — xem
`evidence/PUBLIC_INTAKE_V2_E2E_CHECKLIST.md`.

## Lệnh chạy bắt buộc ở preview có credential

```bash
ACCEPTANCE_SAGA_TEST_DATABASE_URL=postgres://... npx vitest run \
  tests/staging-rehearsal-acceptance-saga.integration.test.ts \
  tests/canonical-projection.integration.test.ts
```

Yêu cầu:

- Một Postgres **thử nghiệm**, KHÔNG PHẢI production — Supabase project test riêng hoặc
  Postgres local/docker. File tự chặn cứng (`throw`) nếu biến này trùng `SUPABASE_DATABASE_URL`.
- Không cần Google Drive thật: tầng Drive được giả lập bằng `vi.mock("googleapis", ...)` trong
  chính file test — chỉ Postgres là thật.
- Migration tự áp trong `beforeAll` (`bootstrapDatabase`) nếu bảng `public_acceptance_sagas` chưa
  tồn tại — không cần chạy migration tay trước.

Đặt biến này có sẵn thì `describe.skipIf(!hasTestDb)` tự chuyển từ skipped sang chạy thật — **không
cần sửa mã nguồn test**. Đây là lý do 10 test này không nằm trong khoảng "chưa viết" mà là "đã
viết đầy đủ, chỉ chờ hạ tầng".

## Vì sao KHÔNG un-skip bằng cách mock Postgres

Đã cân nhắc và từ chối: mock hoàn toàn Postgres cho các kịch bản này sẽ đánh mất đúng thứ chúng
được viết ra để kiểm — advisory lock, transaction, `ON CONFLICT`, ràng buộc khóa ngoại thật giữa
`public_land_uses` và `public_parcels`. Đây chính là lý do
`tests/staging-rehearsal-scenarios.test.ts` (khác file, không nằm trong 10 test skip) từng bị đánh
giá KHÔNG ĐẠT khi chỉ mock JS thuần — xem `docs/brain/06-ai-working-log.md` [2026-07-24]. Giữ
nguyên yêu cầu Postgres thật là quyết định đã chốt, không phải khoảng trống bỏ sót.

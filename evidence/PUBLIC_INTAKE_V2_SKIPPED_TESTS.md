# PUBLIC INTAKE V2 — TEST BỊ SKIP

## Kết quả mới nhất (2026-07-31)

Lệnh:

```text
npm.cmd test
```

Kết quả:

```text
Test Files  94 passed | 4 skipped (98)
Tests       805 passed | 28 skipped (833)
```

So với baseline trước khi sửa (`787 pass / 28 skip`), đợt post-merge hardening thêm **18 test
pass**, không thêm test skip và không biến integration test thành mock.

## Bốn file / 28 test bị skip

| File | Số test skip | Lý do | Có sau PR #12 |
| --- | ---: | --- | --- |
| `tests/officer-file-mutations.integration.test.ts` | 11 | Thiếu `ACCEPTANCE_SAGA_TEST_DATABASE_URL` trỏ tới Postgres thử nghiệm | **Có** — bảo vệ transaction upload/delete/reassign của cán bộ |
| `tests/public-file-mutations.integration.test.ts` | 4 | Thiếu cùng biến database thử nghiệm | **Có** — bảo vệ transaction upload/delete công khai |
| `tests/staging-rehearsal-acceptance-saga.integration.test.ts` | 12 | Thiếu cùng biến database thử nghiệm | Có từ trước; hiện gồm cả ca lazy-folder/concurrency |
| `tests/canonical-projection.integration.test.ts` | 1 | Thiếu cùng biến database thử nghiệm | Có từ trước |
| **Tổng** | **28** | | |

Ba file đầu được gọi riêng trong phiên này:

```text
npx.cmd vitest run \
  tests/officer-file-mutations.integration.test.ts \
  tests/public-file-mutations.integration.test.ts \
  tests/staging-rehearsal-acceptance-saga.integration.test.ts \
  --reporter=verbose
```

Kết quả thật: **3 file skip / 27 test skip**. Vitest in rõ yêu cầu
`ACCEPTANCE_SAGA_TEST_DATABASE_URL`; không có test nào được giả vờ ghi PASS. File
`canonical-projection.integration.test.ts` chiếm test skip thứ 28 trong full suite.

## Ranh giới môi trường

- Không đặt `ACCEPTANCE_SAGA_TEST_DATABASE_URL` trong phiên 2026-07-31.
- Không dùng `SUPABASE_DATABASE_URL` Production thay thế.
- Không kết nối database thật và không thao tác Google Drive thật.
- Repository có đầy đủ integration suite, nhưng trạng thái **Rehearsal/Preview** chỉ được ghi PASS
  sau khi chạy trên Postgres thử nghiệm đã xác minh.
- Không chạy integration test trên Production.

## Lệnh cần chạy trên database rehearsal đã xác minh

```bash
ACCEPTANCE_SAGA_TEST_DATABASE_URL=postgres://... npx vitest run \
  tests/officer-file-mutations.integration.test.ts \
  tests/public-file-mutations.integration.test.ts \
  tests/staging-rehearsal-acceptance-saga.integration.test.ts \
  tests/canonical-projection.integration.test.ts
```

Các file tự chặn nếu URL test trùng `SUPABASE_DATABASE_URL`. Drive trong acceptance saga được giả
lập; mục tiêu của database thật là kiểm advisory lock, transaction, constraint, `ON CONFLICT` và
race condition mà mock JavaScript không chứng minh được.

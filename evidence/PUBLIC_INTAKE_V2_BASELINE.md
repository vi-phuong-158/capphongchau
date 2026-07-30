# PUBLIC INTAKE V2 — BASELINE (Phase 0)

Ghi hiện trạng **trước** khi sửa, theo yêu cầu §5 của
`docs/archive/plans/CLAUDE_IMPLEMENTATION_PLAN_PUBLIC_INTAKE_V2-2026-07-28.md`.

## Repo

| Mục                  | Giá trị                                                        |
| -------------------- | -------------------------------------------------------------- |
| Repo                 | `https://github.com/vi-phuong-158/capphongchau.git`            |
| Worktree             | `.claude/worktrees/land-declaration-process-feedback-126f2e`   |
| Nhánh                | `claude/land-declaration-process-feedback-126f2e`              |
| Base commit          | `79f4ae67448625c9e92fb20c356c889008a27940`                     |
| `git status --short` | sạch (chỉ thêm kế hoạch V2 đã lưu trong `docs/archive/plans/`) |
| Node / npm           | v24.11.0 / 11.6.1                                              |
| Ngày đo              | 2026-07-28                                                     |

**Lệch với §0.2 mục 4 của kế hoạch:** kế hoạch yêu cầu `git switch -c
claude/public-intake-v2-upload-performance`. Phiên này đã được mở sẵn trong một git worktree
riêng trên nhánh `claude/land-declaration-process-feedback-126f2e`. Tạo thêm nhánh nữa chỉ làm
phân mảnh công việc, nên giữ nguyên nhánh của worktree — vẫn thỏa điều kiện "không sửa trực tiếp
`main`, không đụng vào thay đổi đang có của người dùng".

## Kết quả baseline

| Lệnh                | Kết quả                                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`            | OK                                                                                                                                                                           |
| `npm run lint`      | **PASS** — 0 error, 5 warning có từ trước (`scripts/add-system-admins.ts` ×2, `tests/staging-rehearsal-scenarios.test.ts` ×3, đều là `no-unused-vars`)                       |
| `npm run typecheck` | **PASS** — 0 lỗi                                                                                                                                                             |
| `npm test`          | **PASS** — 46 test file passed, 2 skipped; 266 test passed, 10 skipped                                                                                                       |
| `npm run build`     | **PASS** — Next.js 16 build hoàn tất, toàn bộ route render được                                                                                                              |
| `npm run test:e2e`  | **KHÔNG CHẠY** — Playwright cần dev server + Supabase/Google credentials thật, không có trong môi trường này. Ghi nhận là khoảng trống, không dùng kết quả lịch sử thay thế. |

Baseline **xanh**. Không có điều kiện dừng nào ở §0.3 bị kích hoạt tại thời điểm này.

## Đo thủ công tốc độ upload — CHƯA THỰC HIỆN

Kế hoạch §5 mục 7–8 yêu cầu đo tay bằng bộ ảnh test (JPEG 2 MiB, JPEG 8–12 MiB, HEIC, 3 ảnh GCN
liên tiếp) trên thiết bị thật.

**Không thực hiện được trong phiên này** vì cần:

- Google Drive service account thật (upload resumable đi thẳng lên Drive);
- Supabase database thật;
- thiết bị di động thật trên mạng 4G.

Hệ quả bắt buộc, theo đúng §0.2 mục 12 ("không tuyên bố tăng tốc nếu chưa có số đo trước/sau"):

> **Không có claim hiệu năng nào trong lần thi công này.** Phần chuẩn hóa ảnh chỉ được báo cáo
> bằng **tỷ lệ giảm dung lượng đo trên fixture tổng hợp trong unit test**, không phải thời gian
> truyền thật. Mốc §18.2 (giảm ≥ 35% thời gian upload) **chưa được nghiệm thu** và phải đo lại
> trên preview deployment trước khi bật flag cho người dân.

Bảng metric `public_upload_attempts` ở Phase 5 chính là hạ tầng để lấy số đo đó sau khi deploy
preview.

## Hiện trạng mã nguồn đã xác nhận (khớp §1 của kế hoạch)

- `src/app/ke-khai/wizard.tsx` — **3255 dòng**, 7 bước:
  `["Khởi tạo và ảnh CCCD", "Thông tin GCN", "Thửa đất", "Loại đất", "Tài sản", "Tải ảnh GCN", "Kiểm tra và gửi"]`.
- `validateDraftForSubmit()` (`src/modules/public-intake/validation.ts:179`) bắt buộc toàn bộ
  trường PL3 sâu: số phát hành / ngày cấp / số vào sổ, CCCD 12 số, ngày sinh, giới tính, địa chỉ,
  vai trò, `oldWard`, diện tích > 0, và đủ `purposeCode`/`originCode`/`formCode`/`termCode`.
- `completionChecks()` (`src/modules/submissions/completion-checks.ts`) **yếu hơn hẳn**:
  - không kiểm `roleOnCertificate`;
  - không kiểm ngày sinh / giới tính / địa chỉ thường trú;
  - không kiểm `hasDistinctCurrentUser` (tên / CCCD / địa chỉ / lý do thay đổi của người sử dụng
    hiện tại);
  - không kiểm định danh tổ chức;
  - không kiểm `addressOnCertificate`;
  - `oldWard` **trống vẫn qua** (chỉ chặn khi có giá trị sai danh mục);
  - không kiểm land use rỗng, không kiểm `originCode`/`formCode`/`termCode`, không kiểm tổng
    diện tích;
  - file chỉ là **WARNING**, thiếu toàn bộ ảnh vẫn tiếp nhận chính thức được.

→ Đây chính là lỗ hổng §1.5 của kế hoạch. Nới `validateDraftForSubmit` mà **không** vá
`completionChecks` trước sẽ để hồ sơ thiếu dữ liệu lọt thẳng qua tiếp nhận chính thức. Phase 1
phải làm cả hai trong cùng một commit.

- `src/app/api/public/submissions/current/submit/route.ts` tạo HMAC định danh cho **mọi** owner cá
  nhân, kể cả khi `identityNumber` rỗng — hiện chưa lộ vì `validateDraftForSubmit` đã chặn CCCD
  rỗng từ trước. Khi Phase 1 cho phép CCCD trống, dòng này sinh HMAC của chuỗi rỗng và mọi hồ sơ
  không nhập CCCD sẽ đụng nhau ở bảng lookup. Phải sửa **cùng** Phase 1.

## Test characterization đã bổ sung

`tests/public-intake-v2-characterization.test.ts` — khóa hành vi **hiện tại** trước khi đổi:

1. public submit hiện từ chối draft thiếu `certificate.issueNumber` / `issueDate` /
   `registryNumber`;
2. public submit hiện từ chối CCCD rỗng, `oldWard` rỗng, land use thiếu origin/form/term;
3. `completionChecks` hiện **không** chặn `oldWard` rỗng;
4. `completionChecks` hiện **không** chặn thiếu `roleOnCertificate`;
5. `completionChecks` hiện chỉ WARNING khi không có file nào.

Các test 3–5 là **bằng chứng lỗ hổng**, được viết ở dạng khẳng định hiện trạng và sẽ bị Phase 1
đảo ngược có chủ đích (kèm ghi chú trong file).

## Kết luận Phase 0

- Baseline xanh, đủ điều kiện đi tiếp Phase 1.
- Không có PII trong tài liệu này.
- Hai khoảng trống đã ghi rõ: **E2E chưa chạy** và **chưa có số đo upload thật**.

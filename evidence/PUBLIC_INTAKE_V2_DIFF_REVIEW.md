# PUBLIC INTAKE V2 — RÀ SOÁT DIFF `79f4ae6..HEAD`

> **SNAPSHOT LỊCH SỬ:** phần này được viết trước khi thêm kill switch server-side ngày 2026-07-28.
> Nguồn hiện hành là `docs/brain/03-decisions.md`, `docs/brain/04-current-tasks.md` và mã nguồn.

Rà soát toàn bộ 61 file của chín commit V2 theo 14 điểm bắt buộc. Trạng thái lúc bắt đầu:
`aa2135e`, working tree sạch, nhánh `claude/land-declaration-process-feedback-126f2e`.

**Kết quả: 1 BLOCKER, 4 HIGH, 5 MEDIUM, 3 LOW.** Toàn bộ BLOCKER và HIGH đã sửa trong đợt này.
MEDIUM/LOW ghi rõ bên dưới kèm lý do chưa làm.

---

## BLOCKER

### B-01 — Nút "Kê khai hồ sơ tiếp theo" luôn hỏng

`src/app/ke-khai/wizard.tsx` — `startNextSubmission` POST lên endpoint tạo hồ sơ với
`JSON.stringify({ phone: "" })`. Cả `/api/public/submissions` lẫn `/api/staff/assisted-submissions`
đều bắt buộc `^0\d{9}$` **trước** khi tạo. Nút trả 400 trong **mọi** trường hợp.

Đây là một trong sáu góp ý của cán bộ ("báo hoàn thành... rồi quay về trang đầu để kê khai lại")
và là toàn bộ lý do tồn tại của Phase 6. Nó chưa từng chạy được.

Không test nào bắt được: wizard không có test render (`vitest.config.ts` chỉ nhận
`tests/**/*.test.ts`, dự án không có `@testing-library/react`), còn E2E thì chưa chạy được vì
thiếu credential. Đây chính là khoảng trống đã ghi trong `PUBLIC_INTAKE_V2_TEST_MATRIX.md` — lần
này nó có giá.

**Đã sửa.** Thao tác chuyển thành thuần cục bộ: dọn PII, đóng phiên hồ sơ cũ (`receipt`,
`csrfToken`, khóa idempotency tạo), quay về bước 1. Số điện thoại của hộ **sau** thì lúc bấm nút
chưa ai biết — chỉ hỏi được ở bước 1 — nên đường tạo hồ sơ vẫn là đúng một đường duy nhất đã chạy
tốt. Không còn lời gọi mạng nào để hỏng.

Đồng thời bổ sung danh sách mã tiếp nhận đã gửi trong ca (kế hoạch §12): chỉ mã, chỉ trong bộ nhớ
trang. Trước đó bấm nút là mất mã cũ khỏi màn hình.

Khóa lại: `tests/public-intake-v2-review-fixes.test.ts`.

---

## HIGH

### H-01 — Máy chủ ghép tên tệp do client gửi vào tên tệp trong kho

`uploads/initiate/route.ts` — `${documentType}-${Date.now()}-${body.fileName.trim().slice(-60)}`.
Tên đó thành tên tệp trên Drive **và** cột `public_files.file_name`.

Báo cáo trước ghi mục này là "ĐẠT" vì trình duyệt của app gửi `cccd.jpg`/`gcn.jpg`. Đó là biện
pháp phía client. Ranh giới tin cậy nằm ở route, và bất kỳ ai gọi thẳng endpoint bằng `curl` đều
gửi được `nguyen-van-a-001234567890.jpg`.

**Đã sửa.** Tên do máy chủ đặt hoàn toàn: `{documentType}-{timestamp}-{8 ký tự ngẫu nhiên}.{đuôi
theo mimeType đã kiểm}`. `body.fileName` vẫn được đọc để suy loại ảnh khi trình duyệt không khai
được `mimeType` — nhưng chỉ phần mở rộng đã qua `canonicalImageMimeType` mới được dùng lại, không
phải phần thân tên.

Tên chính thức lúc tiếp nhận (`buildOriginalFileNames`) không đổi.

### H-02 — Chế độ cán bộ hỗ trợ dùng chung quyền đọc hàng đợi

`/ke-khai-ho` và `/api/staff/assisted-submissions` dùng `SUBMISSION_READ_ROLES`. Đó là quyền
_xem_ hồ sơ, còn đây là quyền _tạo dữ liệu mới mang dấu vết "cán bộ đã nhập hộ"_ — hồ sơ do cán bộ
nhập được coi là đáng tin hơn hồ sơ hộ dân tự khai.

**Đã sửa.** `ASSISTED_INTAKE_ROLES` = `INTAKE_OFFICER`, `WARD_ADMIN`, `SYSTEM_ADMIN`.

`REVIEW_OFFICER` bị loại có chủ đích: vai trò đó **thẩm định** hồ sơ. Cho cùng một người vừa nhập
vừa duyệt là bỏ mất chốt kiểm tra chéo duy nhất trong quy trình.

**Giả định** (mã nguồn không mô tả nghiệp vụ chi tiết hơn): `INTAKE_OFFICER` là cán bộ tiếp nhận
tại bộ phận một cửa, đúng nhóm "anh em đi làm cho dân". Hai vai trò quản trị giữ lại để phường
không bị khóa cứng khi cần xử lý ngoại lệ. Nếu nghiệp vụ chốt khác, sửa đúng hằng số đó — cả trang
lẫn API đọc từ một chỗ.

### H-03 — Ghi cơ sở dữ liệu hỏng để lại tệp mồ côi trên Drive

`uploads/complete/route.ts` — `appendFile` ném lỗi không phải idempotency (mất kết nối, constraint,
hết kết nối pool) thì tệp đã nằm trên Drive mà không bản ghi nào trỏ tới. Không ai biết nó thuộc hồ
sơ nào; kho của quản trị viên tích rác không tên.

**Đã sửa** theo đúng §10.2 của kế hoạch, và **không đối xứng** có chủ đích:

```ts
const adopted = await repository.isDriveFileAdopted(...).catch(() => true);
if (adopted) return;
await storage.discardFile(...).catch(() => undefined);
```

`.catch(() => true)` không phải là nuốt lỗi cho gọn. Hỏi cơ sở dữ liệu mà không hỏi được thì mặc
định coi như **đã nhận**, tức là không xóa. Sai theo hướng để lại tệp thừa thì có script rà soát
dọn sau; sai theo hướng kia là mất ảnh giấy tờ của người dân, vĩnh viễn, và không ai phát hiện cho
tới lúc cán bộ mở hồ sơ ra đối chiếu.

`isDriveFileAdopted` đọc **mọi** trạng thái kể cả `REPLACED`/`DELETED`: tệp đã bị thay vẫn là tệp
từng được nhận.

### H-04 — Cổng công khai có thể phát tán email cán bộ qua ô tên hiển thị

`publicAssignedOfficer` trả `claimedByDisplayName` nguyên văn; `publicActorName` cũng vậy cho dòng
thời gian ở `/tra-cuu`. `public.users.display_name` là ô nhập tự do của quản trị viên, và trong
thực tế rất hay được điền bằng chính email công vụ.

Cam kết "email cán bộ không ra cổng công khai" khi đó bị vô hiệu mà không ai phải sửa dòng mã nào —
chỉ cần một quản trị viên gõ nhanh.

**Đã sửa.** Cả hai đường ra công khai từ chối chuỗi hình dạng địa chỉ thư và lùi về nhãn chung
("Đã phân công cán bộ" / "Cán bộ phường"). Màn hình quản trị **không** đổi — nội bộ vẫn cần biết
chính xác tài khoản nào.

Kiểm ở ranh giới ra ngoài chứ không ở ô nhập: siết ô nhập không cứu được bản ghi đã có, còn đường
ra công khai thì chỉ có hai chỗ này.

---

## MEDIUM — ghi nhận, chưa sửa

### M-01 — Phản hồi 308 tiêu một lượt thử

`resumable-upload.ts` — 308 nghĩa là Google đã nhận một phần và cần gửi tiếp; vòng lặp `continue`
nhưng vẫn tính vào `maxAttempts = 3`. Trên 4G chập chờn, một lượt tải **đang tiến triển** vẫn có
thể hết lượt thử.

Chưa sửa: đổi ngữ nghĩa thử lại mà không có mạng thật để kiểm là rủi ro hơn giá trị thu được — bỏ
đếm lượt cho 308 mở ra khả năng lặp dài nếu offset không tăng. Cần đo bằng dữ liệu Phase 5 (`retry_count`,
`FAILED` theo hạng mạng) rồi mới chỉnh, khi đó có căn cứ chọn con số.

### M-02 — Đua giữa hai lượt tải ảnh GCN song song

Hàng đợi chạy 2 luồng; hai lượt `initiate` cùng lúc đều có thể qua kiểm "tối đa 10 ảnh" và kiểm
ngân sách byte khi đang ở sát ngưỡng → 11 ảnh, hoặc vượt ngân sách một chút.

Chưa sửa: không phải lỗ bảo mật. Mỗi ảnh vẫn bị chặn dung lượng riêng và vẫn qua `verifyUploadedFile`.
Sửa đúng cần khóa tư vấn ở tầng `initiate`, tức đụng vào đường nóng của mọi lượt tải — đánh đổi
không xứng với hệ quả "11 thay vì 10".

### M-03 — Không có tài khoản test để chạy E2E

Bảy kịch bản §17.3, đặc biệt **E2E-05 official guard**, vẫn chưa chạy lần nào. Xem mục "Điều kiện
E2E" trong `PUBLIC_INTAKE_V2_RELEASE_CHECKLIST.md`.

### M-04 — Chưa có audit `ASSISTED_SUBMISSION_SUBMITTED`

Kế hoạch §12 yêu cầu hai sự kiện; hiện chỉ có `ASSISTED_SUBMISSION_CREATED`. Đường gửi hồ sơ dùng
chung route công khai, nơi không biết hồ sơ thuộc kênh nào mà không thêm một lượt đọc.

### M-05 — `/ke-khai-ho` chưa nhớ tổ dân phố gần nhất

Kế hoạch §12 có; chưa làm. Không chặn gì, chỉ là thao tác thừa cho cán bộ nhập nhiều hộ cùng khu.

---

## LOW

- **L-01** — Danh sách mã vừa gửi mất khi tải lại trang. Đúng ý đồ (không ghi PII xuống đĩa), ghi
  lại để khỏi bị coi là lỗi.
- **L-02** — `readConnectionHints` chỉ đọc `navigator.connection`; Safari luôn trả `null` nên hàng
  đợi ở đó luôn chạy 2 luồng. Chấp nhận được — 2 là mặc định an toàn.
- **L-03 (đã supersede)** — Snapshot này ghi nhận thời điểm chưa có cờ bật/tắt. Sau đó hệ thống đã
  thêm `OFFICER_ASSISTED_INTAKE_ENABLED` là kill switch server-side, mặc định `false`; xem nguồn
  hiện hành nêu ở đầu file.

---

## Đối chiếu 14 điểm bắt buộc

| #   | Nội dung                                 | Kết luận                                                                                                                     |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Public minimal validation                | Đạt. `validateCitizenSubmitDraft` chỉ bắt buộc phone + đồng ý + tên chủ sử dụng + ảnh; mọi ô đã nhập vẫn phải đúng định dạng |
| 2   | Official `completionChecks`              | Đạt — **siết chặt hơn** trước V2. Sáu nhóm thiếu sót trước đây lọt qua, nay chặn                                             |
| 3   | Mọi route tiếp nhận chính thức           | Chỉ có `POST /api/submissions/[id]/accept`; đã gọi `completionChecks` và chặn theo `BLOCKING`                                |
| 4   | HMAC tra cứu CCCD                        | Đạt. `citizenIdsForLookup` lọc theo `CITIZEN_ID_PATTERN`, không còn băm chuỗi rỗng                                           |
| 5   | Vietnamese decimal                       | Đạt. `parseVietnameseDecimal` dùng ở cả client lẫn server                                                                    |
| 6   | Resumable, retry, offset, idempotency    | Đạt, trừ **M-01**                                                                                                            |
| 7   | Upload queue concurrency                 | Đạt, trừ **M-02**. Một việc hỏng không kéo theo việc khác                                                                    |
| 8   | Chuẩn hóa ảnh và bộ nhớ                  | Đạt. `decoded.release()` trong `finally`, canvas về 0×0 ngay sau `toBlob`; mọi đường hỏng trả tệp nguồn                      |
| 9   | Public status lộ email/dữ liệu nội bộ    | **H-04 — đã sửa**                                                                                                            |
| 10  | Public forge được assisted không         | Không. Cổng công khai gán cứng `SELF_SERVICE`, không đọc `channel` từ body; CHECK ở DB bắt buộc đủ dấu vết                   |
| 11  | Tên tệp trung tính, Drive metadata       | **H-01 — đã sửa**                                                                                                            |
| 12  | Tương thích migration                    | Đạt — xem `PUBLIC_INTAKE_V2_MIGRATION_REVIEW_V2.md`                                                                          |
| 13  | Nháp cũ có tài sản                       | Không mất. Schema giữ `assets`, wizard spread nguyên bản nháp lấy về. Khóa bằng test                                         |
| 14  | Hồ sơ tối thiểu lọt tiếp nhận chính thức | Không, qua bất kỳ route nào. Ma trận §6 ở `PUBLIC_INTAKE_V2_TEST_MATRIX.md`                                                  |

---

## Cờ

| Cờ                                               | Giá trị | Ghi chú                                                            |
| ------------------------------------------------ | ------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED` | `false` | Giữ nguyên. Điều kiện bật ở `PUBLIC_INTAKE_V2_UPLOAD_BENCHMARK.md` |

Snapshot này không phản ánh feature flag hiện tại. Hiện tại proxy Edge, `requireActiveUser`, CSRF và
`OFFICER_ASSISTED_INTAKE_ENABLED` cùng được kiểm ở server; cờ không thay thế phân quyền.

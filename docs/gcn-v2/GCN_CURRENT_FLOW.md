# Luồng GCN hiện tại trước nâng cấp v2

Ngày khảo sát: 2026-08-03. Base commit: `2cf2404a12b67fdcd8d7ffee75f9e0773627e982`.

## Kết luận khảo sát

Luồng hiện tại đã có nền tảng an toàn để mở rộng mà không thiết kế lại database: job chỉ nhận ảnh
GCN đã xác minh, kết quả được validate trước khi lưu, có fingerprint/idempotency, bảng comparison,
optimistic locking và một nút nạp nháp chỉ dành cho cán bộ đang giữ hồ sơ. Điểm thiếu là hợp đồng
AI chỉ có ba trường `certificate.issueNumber`, `certificate.issueDate` và
`certificate.registryNumber`; chủ sử dụng, thửa, mục đích và tài sản vẫn phải nhập tay toàn bộ.

## Luồng đầu-cuối hiện tại

1. Khi hồ sơ có ảnh GCN `ORIGINAL`/`UPLOADED`, `enqueueAiDraftForSubmission()` trong
   `src/modules/ai-extraction/repository.ts` tạo `ai_extraction_jobs` và
   `ai_extraction_job_files`. Fingerprint gồm submission, `citizen_payload_version` và checksum.
2. Trạm cục bộ chạy `scripts/ai/local-draft.ts list`; script chỉ liệt kê file manifest còn khớp
   `public_files`, dựng đường dẫn dưới đúng `01_INBOX/{submission}/originals` và kiểm SHA-256.
3. Coding agent đọc ảnh GCN theo `agent/prompts/certificate-extraction.md` và
   `agent/schemas/certificate-extraction-schema.json`. Web app không gọi model.
4. `scripts/ai/local-draft.ts submit` gọi `validateAiResultPayload()`, quét chuỗi giống CCCD,
   prompt injection, schema strict, evidence và manifest/fingerprint trước khi ghi
   `ai_extraction_results`, `ai_field_comparisons`, audit và `request_log` trong một transaction.
   Đường API cũ `POST /api/ai/results` giữ cùng guard nhưng bị cờ `AI_EXTRACTION_ENABLED=false`.
5. `GET /api/submissions/:submissionId/ai-draft` gọi
   `AiExtractionRepository.getCurrentComparisons()`, kiểm result còn khớp phiên bản và bộ ảnh, rồi
   trả comparison cho cán bộ với `Cache-Control: no-store`.
6. `AiDraftPanel` chỉ tải khi cán bộ mở accordion. `POST .../ai-draft/apply` yêu cầu role, CSRF,
   idempotency, version hiện tại, hồ sơ `UNDER_REVIEW` và đúng cán bộ đang giữ.
7. `applyClearAiFields()` chỉ điền trường `CLEAR`, có evidence, đang trống. Repository ghi
   `working_payload_json`/`draft_json`, projection, history, audit và request replay trong cùng
   transaction; comparison chuyển sang `APPLIED`.
8. `completionChecks()` là gác cổng tiếp nhận chính thức. `buildSubmissionRows()` xuất payload hiệu
   lực thành 49 cột PL3 B–AX theo tích Descartes `parcels × owners`.

## Bản đồ source chính

| Trách nhiệm        | File/symbol hiện tại                                                                          | Nhận xét                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Kiểu kết quả AI    | `src/modules/ai-extraction/draft.ts` — `aiExtractionPayloadSchema`                            | Chỉ ba trường GCN, mỗi giá trị bị bọc cùng status/evidence.                                    |
| Version AI         | `src/modules/ai-extraction/repository.ts` — `AI_PROMPT_VERSION`, `AI_SCHEMA_VERSION`          | Đang là `v2.0`, cần version mới và không đọc nhầm result cũ.                                   |
| Prompt/JSON Schema | `agent/prompts/certificate-extraction.md`, `agent/schemas/certificate-extraction-schema.json` | Cấm tên, ngày sinh, giới tính, địa chỉ; chưa có multi-page merge.                              |
| Trạm cục bộ        | `scripts/ai/local-draft.ts`                                                                   | Là nơi ghi thật hiện hành; không gọi `/api/ai/*`.                                              |
| Validator          | `scripts/ai/validator.ts`                                                                     | Zod strict, PII scanner, prompt-injection scanner, evidence guard.                             |
| API AI cũ          | `src/app/api/ai/results/route.ts`                                                             | Feature-flagged off nhưng phải giữ contract tương thích để tránh hai đường validate khác nhau. |
| Lưu job/result     | migrations `202607250005`, `202607260001`, `202607260002`                                     | JSONB đã đủ mở rộng; `field_path` là text, chưa cần đổi schema chỉ để thêm trường.             |
| Payload đích       | `src/modules/public-intake/types.ts` — `IntakeDraft`                                          | Certificate, owners, parcels/landUses, assets; ID nội bộ đã có.                                |
| Runtime validation | `src/modules/public-intake/validation.ts` — `draftSchema`                                     | Strict; giới hạn ba land uses/thửa và kiểm asset tham chiếu thửa.                              |
| Form cán bộ        | `WorkingPayloadEditor`, `EditableParcelTable`                                                 | Bao phủ PL3 C–AW cùng B/V/AX override.                                                         |
| API lưu            | `PUT /api/submissions/:id/working-payload`                                                    | Zod, CSRF, idempotency, version, claim/state guard.                                            |
| Ghi nguyên tử      | `PublicIntakeRepository.commitWorkingPayload()`                                               | Lưu JSON, projection/history/audit/request log trong transaction.                              |
| Khóa cạnh tranh    | `expectedVersion` + conditional update                                                        | Lệch version trả `409 VERSION_CONFLICT`.                                                       |
| Hoàn thành         | `src/modules/submissions/completion-checks.ts`                                                | Nguồn duy nhất của lỗi chặn chính thức.                                                        |
| PL3                | `src/modules/public-intake/pl3-export.ts`                                                     | 49 cột; mỗi dòng `GCN × thửa × người`, tối đa ba land use.                                     |
| UI AI              | `src/components/admin/ai-draft-panel.tsx`                                                     | Bảng phẳng ba dòng, không nhóm, không conflict/provenance.                                     |

## Dữ liệu đích thực tế

- Certificate: số phát hành, ngày cấp, số vào sổ.
- Owner: pháp nhân, tổ chức/người đại diện, họ tên, ngày sinh, giới tính, CCCD, địa chỉ, vai trò,
  người sử dụng hiện tại và lý do thay đổi.
- Parcel: mã thửa, tờ/thửa trên GCN, đơn vị cũ, tờ/thửa địa chính, địa chỉ, diện tích.
- Land use: tối đa ba dòng/thửa; loại đất, diện tích, nguồn gốc, hình thức, thời hạn.
- Asset: loại và chín cột AO–AW, tham chiếu thửa bằng `parcelId`.
- Trường B/V/AX là hệ thống hoặc cán bộ ghi đè có lý do; không phải dữ liệu AI tự điền.

## Invariant phải giữ

- Chỉ ảnh `CERTIFICATE` trong manifest; không mở CCCD/QR hay file ngoài thư mục hồ sơ.
- JSON AI có chuỗi giống số CCCD vẫn bị chặn fail-closed.
- Không log PII, raw document, Drive ID/link, token, đường dẫn upload hoặc connection string.
- Evidence của dữ liệu dùng để nạp phải trỏ file trong manifest còn khớp checksum/tên/trạng thái.
- AI chỉ đề xuất; không tự xác nhận, không đổi trạng thái hồ sơ, không gọi acceptance.
- Nạp nháp phải giữ role/CSRF/idempotency/version/claim/state và transaction hiện hành.
- Dữ liệu người dân/cán bộ/đã xác nhận không bị ghi đè khi chạy lại AI.
- Payload cũ và result AI schema cũ vẫn đọc an toàn hoặc bị bỏ qua rõ ràng, không crash.

## Khoảng trống cần đóng ở v2

1. Không có contract máy đọc được cho toàn bộ trường GCN/PL3.
2. Không có extraction theo trang và merge nhiều chủ/nhiều thửa/nhiều land use.
3. Không có stable key/quy tắc ghép mảng để chạy lại AI.
4. Không phân biệt nguồn `CITIZEN_PROVIDED`, `AI_PROPOSED`, `OFFICER_EDITED`,
   `OFFICER_CONFIRMED`, conflict và unreadable.
5. UI chưa nhóm dữ liệu, chưa hiển thị raw evidence/confidence/page và chưa cho chọn từng trường.
6. Test hiện tại bảo vệ ba trường cũ, chưa bao phủ 25 kịch bản GCN v2.

## Baseline trước thay đổi

| Check                            | Kết quả                                                             |
| -------------------------------- | ------------------------------------------------------------------- |
| `npm.cmd run typecheck`          | PASS, 22.08 giây                                                    |
| `npm.cmd run lint`               | PASS                                                                |
| `npm.cmd test`                   | PASS: 100 file, 885 test; 4 file/28 test skip; 39.57 giây           |
| AI/completion/PL3 focused Vitest | PASS: 10 file, 99 test                                              |
| Python qua runtime bundled       | PASS: 3/3                                                           |
| `npm.cmd run build`              | PASS, 23 route pages; compile 17.9 giây                             |
| `npx.cmd playwright test --list` | 16 test/2 file                                                      |
| E2E smoke `home.spec.ts`         | PASS 1/1; runner Windows cần dừng webserver thủ công, tổng 2.1 phút |
| `npm.cmd run format:check`       | FAIL nền: 49 file chưa đúng Prettier trước khi task bắt đầu         |

E2E smoke còn in cảnh báo nền Next.js: `src/app/page.tsx` đọc `searchParams.callbackUrl` đồng bộ.
Task GCN v2 không sửa cảnh báo ngoài phạm vi này.

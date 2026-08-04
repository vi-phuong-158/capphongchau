# Vận hành Antigravity local station — GCN v2

> Đây là checklist rút gọn. Trước lần chạy đầu, đọc đầy đủ [`AGENTS.md`](AGENTS.md), prompt
> [`prompts/certificate-extraction.md`](prompts/certificate-extraction.md) và strict JSON Schema
> [`schemas/certificate-extraction-schema.json`](schemas/certificate-extraction-schema.json).
> Contract hiện hành: schema/prompt `gcn-v2.0`.

1. Máy quản trị đồng bộ My Drive. `.env.local` cần `SUPABASE_DATABASE_URL` và
   `AI_LOCAL_DRIVE_ROOT` trỏ tới thư mục chứa `01_INBOX`. Không in hoặc commit các giá trị này.

2. Lấy manifest:

```bash
npm run ai:list-jobs
```

Chỉ mở file `CERTIFICATE` có trạng thái `OK` trong đúng job. Không mở CCCD/QR; dừng ngay với
`CHECKSUM_MISMATCH` hoặc `REJECTED`.

3. Nếu bản in yêu cầu tạo job cho hồ sơ còn thiếu:

```bash
npm run ai:enqueue -- --submission=<submissionId>
```

Sau đó chạy lại `list` và dùng manifest mới.

4. Đọc **tất cả** file/trang GCN `OK`, thử rotation 0/90/180/270, phân loại từng trang rồi hợp nhất
   nhiều trang. Trích xuất certificate, owners/tổ chức, parcels, tối đa toàn bộ land uses trên giấy,
   assets và registered changes. Giữ stable key, raw evidence, file/page/confidence và conflict.

5. Viết JSON vào `agent-workspace/<jobId>.json` theo strict schema. Quy tắc cứng:

   - `pagesProcessed === pages.length`; metadata schema/prompt/model/hash/time phải là giá trị thật.
     Chép `sourceDocumentHash` non-null 64 hex từ `expectedMetadata`; local submit từ chối `null`.
   - Mỗi field leaf, kể cả `null`, có evidence; `EXTRACTED`/`LOW_CONFIDENCE` có raw + confidence.
     `LOW_CONFIDENCE` được phép có value `null` khi raw đọc được nhưng không map an toàn.
   - Ngày là `YYYY-MM-DD`; diện tích là decimal string dấu chấm; tờ/thửa giữ số 0 đầu.
   - Mờ/thiếu/conflict không được đoán. Conflict có value `null` và giữ evidence từng nguồn.
   - Không có `identityNumber`, current-user fields, QR raw hoặc chuỗi 12 chữ số ở bất kỳ đâu.
   - Biến động chỉ review-only; không kết luận pháp lý.

6. Submit bằng model thật sự đã nhìn ảnh:

```bash
npm run ai:submit-draft -- --job=<jobId> --result=agent-workspace/<jobId>.json --model=<ten-model>
```

Script kiểm lại schema, security, metadata, manifest/checksum/fingerprint và idempotency trước khi
ghi transaction. `STALE` nghĩa là phải enqueue/đọc lại theo bộ ảnh mới; không retry bằng dữ liệu cũ.

7. Kết quả:

| Kết quả           | Xử lý                                                             |
| ----------------- | ----------------------------------------------------------------- |
| `PASSED`          | Hoàn tất job; cán bộ vẫn quyết định trường nào được nạp.          |
| `REVIEW_REQUIRED` | Bình thường khi mờ/thiếu/conflict/biến động; không ép thành PASS. |
| `BLOCKED`         | Không trường nào được nạp; giữ nguyên để cán bộ thấy lý do.       |

Cán bộ là người duy nhất nạp đề xuất vào working payload. Trạm không sửa `public_submissions`,
không xác nhận danh tính, không đổi trạng thái và không gọi official acceptance.

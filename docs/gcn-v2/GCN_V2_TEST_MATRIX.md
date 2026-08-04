# Ma trận kiểm thử GCN v2

Trạng thái ban đầu: contract locked; các test implementation được đánh dấu khi hoàn tất.

| ID     | Kịch bản                        | Tầng bắt buộc                  | Kỳ vọng                                        |
| ------ | ------------------------------- | ------------------------------ | ---------------------------------------------- |
| GCN-01 | Một chủ, một thửa, một loại đất | schema + merge + apply + PL3   | Không mất trường, một dòng PL3                 |
| GCN-02 | Hai người cùng sử dụng          | merge + apply + PL3            | Hai owner, hai dòng PL3                        |
| GCN-03 | Hộ gia đình hoặc tổ chức        | normalization + completion     | Đúng ownerType; tổ chức tách F/G và H–L        |
| GCN-04 | Một GCN nhiều thửa              | merge + apply + PL3            | Không gộp thửa, đủ dòng                        |
| GCN-05 | 15–20 thửa                      | performance + merge + PL3      | Không truncate, thời gian hợp lý               |
| GCN-06 | Một thửa nhiều mục đích         | merge + apply                  | Land use gắn đúng thửa                         |
| GCN-07 | Diện tích riêng từng loại đất   | normalization + completion     | Giữ diện tích từng dòng, kiểm tổng             |
| GCN-08 | Sử dụng chung và riêng          | reference mapping              | Map đúng danh mục hoặc review                  |
| GCN-09 | Có thời hạn                     | reference mapping              | Không bịa ngày; map term khi rõ                |
| GCN-10 | Có nguồn gốc                    | reference mapping              | Raw + code đúng danh mục                       |
| GCN-11 | Có tài sản                      | merge + apply + PL3            | Asset nối đúng parcel, đủ AO–AW                |
| GCN-12 | Có trang bổ sung                | page merge                     | Evidence và dữ liệu gắn đúng GCN/thửa          |
| GCN-13 | Có nội dung biến động           | page merge + UI                | Hiển thị review-only, không ghi đè dữ liệu gốc |
| GCN-14 | Thiếu trang                     | validator/UI                   | Warning; không bịa dữ liệu thiếu               |
| GCN-15 | Ảnh mờ hoặc xoay                | page normalization             | Rotation được ghi; low confidence/unreadable   |
| GCN-16 | Không đọc được số tờ/thửa       | validator/apply                | Null + UNREADABLE; không nạp                   |
| GCN-17 | Diện tích khó đọc               | normalization                  | Không đoán; raw/evidence còn nguyên            |
| GCN-18 | AI khác dữ liệu người dân       | provenance/apply               | CONFLICT; không ghi đè                         |
| GCN-19 | Cán bộ sửa rồi rerun            | provenance/apply               | OFFICER_EDITED bất biến                        |
| GCN-20 | Cán bộ xác nhận rồi rerun       | provenance/apply               | OFFICER_CONFIRMED bất biến                     |
| GCN-21 | AI trả sai schema               | validator + route/local script | BLOCKED, không persist/apply                   |
| GCN-22 | API gọi lặp lại                 | route/repository               | Replay cùng kết quả, không nhân bản            |
| GCN-23 | Hai phiên cạnh tranh            | route/repository               | Một thành công, một 409 version conflict       |
| GCN-24 | Hồ sơ/result schema cũ          | compatibility                  | Không crash; ba field legacy còn đọc được      |
| GCN-25 | PL3 nhiều thửa/nhiều loại đất   | integration PL3                | Đúng số dòng, đúng 49 cột, không lệch nhóm     |

Các guard bổ sung phải có test: CCCD-like value, prompt injection, evidence file ngoài manifest,
checksum/fingerprint stale, max 3 land uses ở payload đích, stable key collision và array ambiguity.

## Kết quả thực thi 2026-08-03

- **PASS synthetic/unit-domain:** GCN-01 đến GCN-21, GCN-24 và GCN-25 được bao phủ bởi contract,
  schema/prompt, merger, backend, UI, completion/PL3 và end-to-end domain tests; fixture có 2 chủ,
  18 thửa × 3 mục đích, tài sản, nhiều trang, xoay/mờ/thiếu/conflict/leading zero.
- **PASS route/mock:** GCN-22 và GCN-23 được bao phủ bởi replay/idempotency/version tests của route
  và repository helper; nhánh legacy cũng giữ compatibility.
- **Điều kiện vận hành:** không suy diễn Browser E2E authenticated, transaction PostgreSQL V2-success
  hoặc độ chính xác model từ kết quả trên. Xem `GCN_V2_IMPLEMENTATION_REPORT.md`.

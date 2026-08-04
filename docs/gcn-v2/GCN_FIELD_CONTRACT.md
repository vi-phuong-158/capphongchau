# Hợp đồng trường GCN v2

Trạng thái: **LOCKED cho triển khai** từ 2026-08-03.

Nguồn máy đọc được là `src/modules/ai-extraction/gcn-v2-contract.ts`. Tài liệu này giải thích các
quyết định và dẫn chứng source; prompt, Zod/JSON Schema, backend comparison, UI label, merger và
fixture phải import hoặc được test đối chiếu với registry đó.

## Quyết định phạm vi

- Giữ `IntakeDraft` làm đích, không tạo mô hình nghiệp vụ song song.
- AI đọc certificate, chủ/người đại diện, thửa, land use, tài sản và nội dung biến động.
- Số CCCD/số định danh cá nhân 12 chữ số không nằm trong output AI; guard
  `scanForCitizenIdLikeValues()` tiếp tục chặn toàn bộ JSON. CCCD, người sử dụng hiện tại và xác nhận
  định danh vẫn do QR/người dân/cán bộ.
- B/V/AX, tờ/thửa địa chính chuẩn hóa và địa chỉ hai cấp không do AI tự điền.
- Nội dung biến động là `REVIEW_ONLY`: hiển thị để đối chiếu, không tự đổi dữ liệu gốc,
  `hasDistinctCurrentUser` hoặc `changeReason`.
- Diện tích giữ kiểu chuỗi chuẩn hóa thập phân thay vì number để tương thích `IntakeDraft`, giữ số 0
  đầu ở số tờ/thửa và tránh đổi cách biểu diễn khi xuất PL3.
- Chỉ map enum khi raw text khớp danh mục đã chốt trong `reference.ts`; không nhận ra thì giữ raw
  text/evidence và đánh dấu review, không đoán mã.

## Ma trận trường

`Có điều kiện` nghĩa là chỉ bắt buộc khi loại chủ/tài sản/nhánh nghiệp vụ tương ứng được chọn.

| Nhóm      | Đường dẫn dữ liệu                      | Tên trường                  | Form cán bộ               | Kiểm tra hoàn thành            | Xuất PL3           | AI đọc                      | Kiểu            | Bắt buộc     |
| --------- | -------------------------------------- | --------------------------- | ------------------------- | ------------------------------ | ------------------ | --------------------------- | --------------- | ------------ |
| GCN       | `certificate.issueNumber`              | Số phát hành                | `WorkingPayloadEditor`, C | `CERT_ISSUE_NUMBER_MISSING`    | C/2                | Có                          | string          | Có           |
| GCN       | `certificate.issueDate`                | Ngày cấp                    | D                         | `CERT_ISSUE_DATE_INVALID`      | D/3                | Có                          | ISO date string | Có           |
| GCN       | `certificate.registryNumber`           | Số vào sổ                   | E                         | `CERT_REGISTRY_NUMBER_MISSING` | E/4                | Có                          | string          | Có           |
| Chủ       | `owners[].ownerType`                   | Pháp nhân trên GCN          | M                         | Nhánh owner/org                | M/12               | Có, chỉ map chắc chắn       | enum            | Có           |
| Chủ       | `owners[].organisationName`            | Tên tổ chức                 | F                         | `ORG_NAME_MISSING`             | F/5                | Có                          | string          | Có điều kiện |
| Chủ       | `owners[].organisationIdentityNumber`  | Mã số tổ chức               | G                         | `ORG_ID_INVALID`               | G/6                | Có, trừ chuỗi giống CCCD    | string          | Có điều kiện |
| Chủ       | `owners[].fullName`                    | Họ tên chủ/người đại diện   | H                         | `NAME_MISSING`                 | H/7                | Có                          | string          | Có           |
| Chủ       | `owners[].dateOfBirth`                 | Ngày sinh                   | I                         | `DOB_MISSING`                  | I/8                | Có khi đủ ngày              | ISO date string | Có điều kiện |
| Chủ       | `owners[].gender`                      | Giới tính                   | J                         | `GENDER_MISSING`               | J/9                | Có khi ghi rõ               | enum            | Có điều kiện |
| Chủ       | `owners[].identityNumber`              | CCCD                        | K                         | `ID_INVALID`                   | K/10               | **Không**                   | string          | Có điều kiện |
| Chủ       | `owners[].residenceAddress`            | Địa chỉ thường trú          | L                         | `ADDRESS_MISSING`              | L/11               | Có                          | string          | Có điều kiện |
| Chủ       | `owners[].roleOnCertificate`           | Vai trò trên GCN            | N                         | `ROLE_MISSING`                 | N/13               | Có, chỉ map chắc chắn       | enum            | Có           |
| Hiện tại  | `owners[].hasDistinctCurrentUser`      | Có người dùng hiện tại khác | checkbox                  | Điều khiển O–R                 | điều kiện O–R      | Không                       | boolean         | Không        |
| Hiện tại  | `owners[].currentUserName`             | Tên người dùng hiện tại     | O                         | `CURRENT_USER_NAME_MISSING`    | O                  | Không                       | string          | Có điều kiện |
| Hiện tại  | `owners[].currentUserCitizenId`        | CCCD người dùng hiện tại    | P                         | `CURRENT_USER_ID_INVALID`      | P                  | Không                       | string          | Có điều kiện |
| Hiện tại  | `owners[].currentUserAddress`          | Địa chỉ người dùng hiện tại | Q                         | `CURRENT_USER_ADDRESS_MISSING` | Q/14               | Không                       | string          | Có điều kiện |
| Hiện tại  | `owners[].changeReason`                | Lý do thay đổi              | R                         | `CHANGE_REASON_MISSING`        | R/15               | Không; biến động chỉ review | enum            | Có điều kiện |
| Thửa      | `parcels[].parcelIdCode`               | Mã định danh thửa           | S                         | Không                          | S/16               | Có                          | string          | Không        |
| Thửa      | `parcels[].mapSheetNumber`             | Số tờ trên GCN              | T                         | Không trực tiếp                | T/17               | Có                          | string          | Không        |
| Thửa      | `parcels[].parcelNumber`               | Số thửa trên GCN            | U                         | Không trực tiếp                | U/18               | Có                          | string          | Không        |
| Thửa      | `parcels[].oldWard`                    | ĐVHC cũ                     | select                    | `WARD_INVALID`                 | nguồn tự động V/19 | Có, map chắc chắn           | enum            | Có           |
| Thửa      | `parcels[].cadastralMapSheetNumber`    | Tờ địa chính                | V override                | lý do override                 | V/19               | Không                       | string          | Không        |
| Thửa      | `parcels[].cadastralParcelNumber`      | Thửa địa chính              | W                         | Không                          | W/20               | Không                       | string          | Không        |
| Thửa      | `parcels[].addressOnCertificate`       | Địa chỉ thửa trên GCN       | X                         | `ADDRESS_MISSING`              | X/23               | Có                          | string          | Có           |
| Thửa      | `parcels[].addressTwoLevel`            | Địa chỉ hai cấp             | ô nội bộ                  | Không                          | không trực tiếp    | Không                       | string          | Không        |
| Thửa      | `parcels[].area`                       | Diện tích thửa              | Y                         | `AREA_INVALID`                 | Y/24               | Có                          | decimal string  | Có           |
| Loại đất  | `parcels[].landUses[].purposeCode`     | Mã loại đất                 | Z/AE/AJ                   | `PURPOSE_*`                    | 25/30/35           | Có, map chắc chắn           | enum            | Có           |
| Loại đất  | `parcels[].landUses[].purposeFreeText` | Loại đất nguyên văn         | khi `GHI_THEO_BIA`        | `PURPOSE_FREE_TEXT_MISSING`    | 25/30/35           | Có                          | string          | Có điều kiện |
| Loại đất  | `parcels[].landUses[].area`            | Diện tích theo mục đích     | AA/AF/AK                  | tổng không vượt thửa           | 26/31/36           | Có                          | decimal string  | Không        |
| Loại đất  | `parcels[].landUses[].originCode`      | Nguồn gốc                   | AB/AG/AL                  | `ORIGIN_MISSING`               | 27/32/37           | Có, map chắc chắn           | enum            | Có           |
| Loại đất  | `parcels[].landUses[].formCode`        | Hình thức                   | AC/AH/AM                  | `FORM_MISSING`                 | 28/33/38           | Có, map chắc chắn           | enum            | Có           |
| Loại đất  | `parcels[].landUses[].termCode`        | Thời hạn                    | AD/AI/AN                  | `TERM_MISSING`                 | 29/34/39           | Có, map chắc chắn           | enum            | Có           |
| Tài sản   | `assets[].assetType`                   | Loại tài sản                | AO                        | `TYPE_INVALID` khi có asset    | AO/40              | Có                          | enum            | Có điều kiện |
| Tài sản   | `assets[].description`                 | Mô tả tài sản               | ô nội bộ                  | Không                          | không trực tiếp    | Có                          | string          | Không        |
| Tài sản   | `assets[].mixedUseBuildingName`        | Khu nhà hỗn hợp             | AP                        | Không                          | AP/41              | Có                          | string          | Không        |
| Tài sản   | `assets[].apartmentBuildingName`       | Nhà chung cư                | AQ                        | Không                          | AQ/42              | Có                          | string          | Không        |
| Tài sản   | `assets[].apartmentNumber`             | Số căn hộ                   | AR                        | Không                          | AR/43              | Có                          | string          | Không        |
| Tài sản   | `assets[].constructionArea`            | Diện tích xây dựng          | AS                        | số dương nếu có                | AS/44              | Có                          | decimal string  | Không        |
| Tài sản   | `assets[].floorArea`                   | Diện tích sàn               | AT                        | số dương nếu có                | AT/45              | Có                          | decimal string  | Không        |
| Tài sản   | `assets[].ownershipForm`               | Hình thức sở hữu            | AU                        | Không                          | AU/46              | Có                          | string          | Không        |
| Tài sản   | `assets[].ownershipTerm`               | Thời hạn sở hữu             | AV                        | Không                          | AV/47              | Có                          | string          | Không        |
| Tài sản   | `assets[].grade`                       | Cấp hạng                    | AW                        | Không                          | AW/48              | Có                          | string          | Không        |
| Biến động | `registeredChanges[].confirmedDate`    | Ngày xác nhận biến động     | panel AI review           | Không                          | Không              | Có                          | date            | Không        |
| Biến động | `registeredChanges[].content`          | Nội dung biến động          | panel AI review           | Không                          | Không              | Có                          | string          | Không        |
| Biến động | `registeredChanges[].confirmedBy`      | Cơ quan xác nhận biến động  | panel AI review           | Không                          | Không              | Có                          | string          | Không        |

Nguồn form: `src/components/admin/working-payload-editor.tsx` và
`src/components/admin/editable-parcel-table.tsx`. Nguồn completion:
`src/modules/submissions/completion-checks.ts`. Nguồn PL3:
`src/modules/public-intake/pl3-export.ts` (`PL3_COLUMNS`, `buildRow`, `landUseCells`, `assetCells`).
Kiểu đích: `src/modules/public-intake/types.ts`; Zod đích:
`src/modules/public-intake/validation.ts` (`draftSchema`).

## Evidence, metadata và trạng thái

Mỗi trường AI đọc phải có một evidence riêng trong `evidence[]`:

```ts
{
  fieldPath: string;
  rawText: string | null;
  fileId: string;
  pageNumber: number | null;
  confidence: number | null;
  status: "EXTRACTED" | "LOW_CONFIDENCE" | "UNREADABLE" | "CONFLICT" | "NOT_FOUND";
}
```

- `EXTRACTED` mới có thể nạp.
- `LOW_CONFIDENCE`, `CONFLICT`, `UNREADABLE`, `NOT_FOUND` chỉ hiển thị để cán bộ xử lý.
- `fileId` luôn phải thuộc manifest còn hợp lệ.
- `rawText` giữ chữ nguồn nhưng không được đưa vào audit/technical log.
- Metadata bắt buộc: schema/prompt/model, số trang, source hash và thời điểm xử lý.

Provenance hiển thị cho từng comparison:
`EMPTY`, `AI_PROPOSED`, `CITIZEN_PROVIDED`, `OFFICER_EDITED`, `OFFICER_CONFIRMED`, `CONFLICT`,
`UNREADABLE`. Provenance được suy ra từ `citizen_payload_json`, payload hiệu lực, lịch sử
`ai_field_comparisons.decision`, trạng thái xác nhận và evidence; không cần thêm cột database.

## Stable key và merge mảng

- AI tạo `stableKey` xác định bằng hash của loại phần tử và **source anchor lần xuất hiện đầu**
  (file/page/ordinal; thêm stable key thửa cha cho land use/tài sản). Text OCR không là định danh
  duy nhất, nên sửa text cùng source anchor không sinh phần tử mới. Stable key không chứa raw PII.
- Owner ưu tiên ghép với ID nội bộ đã có khi tên/tổ chức khớp duy nhất; không duy nhất thì conflict.
- `mapSheetNumber + parcelNumber` chỉ là tín hiệu đối chiếu, không phải identity của stable key.
- Land use ghép trong đúng parcel; không tách parcel chỉ vì nhiều mục đích.
- Asset nối thửa qua `parcelStableKey`, rồi chuyển thành `parcelId` nội bộ khi nạp.
- Khi job mới được tạo do bộ ảnh, phiên bản citizen, prompt hoặc schema đổi, rerun chỉ cập nhật trường
  `EMPTY` hoặc `AI_PROPOSED`; không ghi đè citizen/officer/confirmed. Đọc lại **cùng** input/job đã
  hoàn tất chưa có run-generation append-only; cần quyết định schema riêng, không được reset job cũ.
- Thay ảnh bằng file ID/source anchor mới là input mới và phải tạo job mới; không được map ngầm sang
  phần tử AI cũ nếu không có bằng chứng đối chiếu duy nhất.
- Không thay cả mảng. Phần tử mới được append bằng ID ổn định; conflict không tự append/replace.

## Tương thích

- Result cũ schema `v2.0` chỉ ba trường tiếp tục được parser legacy nhận để xem/nạp ba trường cũ.
- Job mới dùng schema/prompt `gcn-v2.0`; unique job key tách khỏi result cũ.
- `ai_extraction_results.raw_json/normalized_json` và `ai_field_comparisons.field_path` là JSONB/text,
  đủ chứa contract mới; không cần migration chỉ vì mở rộng số trường.

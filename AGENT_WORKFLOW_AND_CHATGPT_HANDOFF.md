# QUY TRÌNH CHUNG CHO AI AGENT VÀ BÁO CÁO BÀN GIAO CHO CHATGPT

> Tên khuyến nghị của file này trong mỗi repository: `AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md`
>
> Phạm vi áp dụng: mọi project có sử dụng ChatGPT, Codex, Claude Code, Gemini/Antigravity, Cursor hoặc coding agent khác.

---

## 1. Mục đích

Tài liệu này thiết lập một quy trình thống nhất để:

1. ChatGPT phân tích repository, trao đổi và chốt phương án với người dùng.
2. Coding agent thi công theo kế hoạch đã được phê duyệt.
3. Sau khi thi công, coding agent xuất **một file duy nhất** là `CHATGPT_HANDOFF.md`.
4. Người dùng chỉ cần tải `CHATGPT_HANDOFF.md` lên ChatGPT hoặc sao chép toàn bộ nội dung file vào hội thoại.
5. ChatGPT có đủ dữ liệu để:
   - Hiểu agent đã làm gì;
   - Đối chiếu kế hoạch và điều kiện nghiệm thu;
   - Nhận biết file, hàm, endpoint, schema và luồng nghiệp vụ đã thay đổi;
   - Đọc kết quả test, build, lint và cảnh báo;
   - Xác định có cần tải lại repository hay không.

`CHATGPT_HANDOFF.md` phải là báo cáo tự chứa, có bằng chứng và có thể đọc độc lập. Không được chỉ ghi những câu chung chung như “đã sửa xong”, “test đã pass” hoặc “đã tối ưu code”.

---

## 2. Phân vai

### 2.1. ChatGPT trong hội thoại

ChatGPT chịu trách nhiệm:

- Phân tích repository ban đầu;
- Giải thích hiện trạng;
- Làm rõ yêu cầu nghiệp vụ;
- Đề xuất phương án;
- Ghi nhận quyết định đã chốt;
- Tạo kế hoạch thi công;
- Tạo điều kiện nghiệm thu;
- Soạn prompt giao việc;
- Đọc `CHATGPT_HANDOFF.md` để nghiệm thu.

ChatGPT không nhất thiết trực tiếp sửa source code trong giai đoạn phân tích.

### 2.2. Coding agent

Coding agent chịu trách nhiệm:

- Đọc tài liệu và kế hoạch đã được chốt;
- Kiểm tra Git, baseline và trạng thái repository;
- Thi công đúng phạm vi;
- Chạy kiểm thử;
- Tự kiểm tra diff;
- Không làm mất thay đổi có sẵn của người dùng;
- Xuất hoặc cập nhật `CHATGPT_HANDOFF.md` trước khi kết thúc.

### 2.3. Người dùng

Người dùng chịu trách nhiệm:

- Chốt các quyết định nghiệp vụ;
- Không giao đồng thời cùng một thay đổi cho nhiều agent trên cùng một nhánh;
- Kiểm tra giao diện hoặc quy trình thực tế khi cần;
- Gửi `CHATGPT_HANDOFF.md` cho ChatGPT để nghiệm thu;
- Chỉ gửi lại repository hoặc file bổ sung khi ChatGPT xác định báo cáo chưa đủ bằng chứng.

---

## 3. Các file khuyến nghị trong repository

Tùy quy mô project, có thể sử dụng:

```text
AGENTS.md
AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md
docs/
  00-CURRENT-STATE.md
  01-DECISION-LOG.md
  02-IMPLEMENTATION-PLAN.md
  03-ACCEPTANCE-CRITERIA.md
  04-TEST-PLAN.md
  05-SECURITY-CONSTRAINTS.md
CHATGPT_HANDOFF.md
```

Đối với nhiệm vụ nhỏ, có thể chỉ cần:

```text
AGENTS.md
AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md
IMPLEMENTATION_PLAN.md
CHATGPT_HANDOFF.md
```

`CHATGPT_HANDOFF.md` là file được tạo mới hoặc ghi đè có kiểm soát sau mỗi đợt thi công.

---

## 4. Quy trình bắt buộc trước khi sửa code

Coding agent phải thực hiện theo thứ tự:

1. Đọc `AGENTS.md` và file hướng dẫn này.
2. Đọc kế hoạch, quyết định, điều kiện nghiệm thu và ràng buộc bảo mật.
3. Kiểm tra:
   - Repository hiện tại;
   - Branch hiện tại;
   - Commit hiện tại;
   - Remote;
   - `git status`;
   - Các thay đổi chưa commit;
   - Các file không được phép đụng tới.
4. Chạy baseline phù hợp:
   - Test;
   - Build;
   - Lint;
   - Typecheck;
   - Kiểm thử nghiệp vụ liên quan.
5. Ghi nhận đầy đủ baseline vào báo cáo.
6. Chỉ bắt đầu sửa khi có thể phân biệt:
   - Lỗi đã tồn tại từ trước;
   - Lỗi do thay đổi mới gây ra.
7. Nếu phát hiện rủi ro nghiêm trọng, phải dừng theo điều kiện dừng.

---

## 5. Quy tắc thi công

Coding agent phải tuân thủ:

- Không tự mở rộng phạm vi.
- Không refactor diện rộng nếu kế hoạch không yêu cầu.
- Không đổi framework, database, hệ thống xác thực hoặc kiến trúc triển khai khi chưa được chốt.
- Không xóa dữ liệu.
- Không thao tác production.
- Không tự merge.
- Không tự deploy trừ khi người dùng yêu cầu rõ.
- Không sửa hoặc commit thay đổi có sẵn của người dùng ngoài phạm vi.
- Không đọc, ghi hoặc đưa secret vào báo cáo.
- Không chép dữ liệu cá nhân, dữ liệu nghiệp vụ thật hoặc thông tin nhạy cảm vào báo cáo.
- Mọi thay đổi quan trọng phải gắn với:
  - File;
  - Hàm, class, component, route, endpoint, migration hoặc test liên quan;
  - Lý do thay đổi;
  - Điều kiện nghiệm thu tương ứng.
- Sau mỗi phase phải chạy test liên quan.
- Trước khi kết thúc phải kiểm tra toàn bộ diff.

---

## 6. Điều kiện dừng bắt buộc

Coding agent phải dừng và báo cáo, không tự xử lý tiếp, khi:

1. Baseline thất bại nghiêm trọng và không xác định được ranh giới an toàn.
2. Kế hoạch mâu thuẫn với source code hiện tại.
3. Phải đổi schema, authorization, authentication hoặc kiến trúc ngoài phạm vi.
4. Có nguy cơ mất dữ liệu hoặc truy cập sai phạm vi dữ liệu.
5. Cần secret, quyền production hoặc tài khoản bên ngoài chưa được cung cấp.
6. Phát hiện thay đổi sẵn có của người dùng có thể bị ghi đè.
7. Không thể chạy test hoặc build cần thiết.
8. Số lượng file thay đổi vượt đáng kể dự kiến.
9. Cần quyết định nghiệp vụ mới chưa có trong Decision Log.
10. Có dấu hiệu agent đang sửa lỗi bằng cách tắt kiểm tra, bỏ validation, bỏ test hoặc giảm bảo mật.

Trong trường hợp dừng, vẫn phải tạo `CHATGPT_HANDOFF.md` với trạng thái `STOPPED`.

---

## 7. Nguyên tắc báo cáo một file duy nhất

Sau mỗi đợt thi công, coding agent phải tạo:

```text
CHATGPT_HANDOFF.md
```

File này phải:

- Đặt ở thư mục gốc repository;
- Được viết bằng Markdown;
- Có ngày giờ tạo;
- Có branch, base commit và head commit;
- Có trạng thái rõ ràng;
- Có đủ thông tin để ChatGPT đọc mà không cần lịch sử terminal;
- Không phụ thuộc vào câu trả lời trước của agent;
- Không dùng các tham chiếu mơ hồ như “file trên”, “đoạn vừa sửa”, “như đã nói”;
- Không giấu lỗi, cảnh báo hoặc test chưa chạy;
- Không khai “pass” nếu không có lệnh và kết quả;
- Không chèn secret;
- Không chèn nội dung file nhị phân.

Trạng thái hợp lệ:

```text
STOPPED
IN_PROGRESS
READY_FOR_REVIEW
READY_FOR_COMMIT
READY_FOR_DEPLOY_REVIEW
```

Không sử dụng trạng thái `DONE` nếu chưa đối chiếu toàn bộ acceptance criteria.

---

## 8. Mức độ bằng chứng

### 8.1. Mức A — bắt buộc

Luôn phải có:

- Branch;
- Base commit;
- Head commit hoặc trạng thái uncommitted;
- `git status`;
- `git diff --stat`;
- Danh sách file thay đổi;
- Tóm tắt thay đổi theo file;
- Test/build/lint/typecheck đã chạy;
- Acceptance criteria matrix;
- Lỗi và cảnh báo còn lại;
- Rủi ro;
- Đề xuất bước tiếp theo.

### 8.2. Mức B — bắt buộc với thay đổi nghiệp vụ hoặc bảo mật

Phải bổ sung:

- Luồng trước và sau thay đổi;
- Endpoint hoặc route bị ảnh hưởng;
- Quy tắc phân quyền;
- Quy tắc DataScope;
- Validation;
- Schema hoặc migration;
- Tác động dữ liệu;
- Tình huống biên;
- Test bảo mật hoặc test phân quyền.

### 8.3. Mức C — phục vụ review sâu

Phải bổ sung một trong các dạng sau:

- Các đoạn unified diff quan trọng;
- Danh sách symbol đã đổi;
- Nội dung migration;
- API contract trước và sau;
- Cấu trúc payload;
- Câu lệnh tái hiện lỗi và xác nhận sửa lỗi.

---

## 9. Chính sách đưa diff vào một file

Để ChatGPT có thể review mà chỉ nhận một file, agent phải đưa diff vào cuối `CHATGPT_HANDOFF.md` theo quy tắc:

### 9.1. Diff nhỏ

Nếu unified diff sau khi loại binary và secret có dung lượng không quá khoảng 150 KB:

- Chèn toàn bộ diff vào mục `FULL UNIFIED DIFF`;
- Dùng code fence `diff`;
- Ghi rõ base và head.

### 9.2. Diff lớn

Nếu diff vượt khoảng 150 KB:

- Không chèn toàn bộ diff;
- Chèn:
  - `git diff --stat`;
  - `git diff --name-status`;
  - Tóm tắt chi tiết theo từng file;
  - Các đoạn diff quan trọng;
  - Danh sách file cần ChatGPT yêu cầu thêm nếu review sâu.
- Ghi rõ: `FULL_DIFF_OMITTED_DUE_TO_SIZE`.
- Không được nói rằng ChatGPT đã có đủ source để kiểm toán từng dòng.

### 9.3. File nhị phân

Với ảnh, PDF, font, database, archive hoặc file nhị phân:

- Chỉ ghi tên file, kích thước, hash nếu cần và lý do thay đổi;
- Không nhúng base64;
- Không đưa file nhị phân vào Markdown.

---

## 10. Mẫu bắt buộc của `CHATGPT_HANDOFF.md`

Coding agent phải tạo báo cáo theo cấu trúc dưới đây.

---

# CHATGPT HANDOFF REPORT

## 1. Report metadata

- Project:
- Repository path:
- Generated at:
- Agent:
- Task:
- Status:
- Source plan:
- Source acceptance criteria:
- Source security constraints:

## 2. Git identity

- Current branch:
- Remote:
- Base commit before work:
- Head commit after work:
- Commit created:
- Working tree state:
- User changes detected before work:
- User changes preserved:

### Git status

```text
Dán kết quả git status --short và thông tin cần thiết tại đây.
```

### Diff statistics

```text
Dán kết quả git diff --stat hoặc diff của commit range tại đây.
```

### Name status

```text
Dán kết quả git diff --name-status tại đây.
```

## 3. Executive summary

Mô tả ngắn gọn:

- Vấn đề cần giải quyết;
- Phương án đã thực hiện;
- Kết quả;
- Nội dung chưa hoàn thành;
- Trạng thái đề xuất.

## 4. Baseline before changes

| Check             | Command | Result | Evidence |
| ----------------- | ------- | ------ | -------- |
| Unit tests        |         |        |          |
| Integration tests |         |        |          |
| E2E tests         |         |        |          |
| Build             |         |        |          |
| Lint              |         |        |          |
| Typecheck         |         |        |          |

Ghi rõ lỗi đã tồn tại từ trước. Không trộn lỗi baseline với lỗi phát sinh sau thay đổi.

## 5. Scope

### In scope

-

### Out of scope

-

### Deviations from approved plan

- Không có; hoặc mô tả cụ thể, lý do và tác động.

## 6. Decisions implemented

| Decision | Implementation | Evidence |
| -------- | -------------- | -------- |
|          |                |          |

## 7. Changed files

| File | Change type            | Symbols/routes/components affected | Purpose | Risk |
| ---- | ---------------------- | ---------------------------------- | ------- | ---- |
|      | Added/Modified/Deleted |                                    |         |      |

Mỗi file phải có mô tả cụ thể. Không ghi chung chung “cập nhật logic”.

## 8. Detailed implementation by phase

### Phase 1 — Tên phase

- Mục tiêu:
- Các file liên quan:
- Nội dung đã thực hiện:
- Nội dung không thực hiện:
- Test đã chạy:
- Kết quả:
- Rủi ro:

### Phase 2 — Tên phase

Lặp lại cấu trúc trên.

## 9. Behavior before and after

| Scenario | Before | After | Verification |
| -------- | ------ | ----- | ------------ |
|          |        |       |              |

## 10. API, data and security impact

### Authentication

- Không thay đổi; hoặc mô tả.

### Authorization

- Không thay đổi; hoặc mô tả.

### DataScope

- Không thay đổi; hoặc mô tả cách scope được xác minh trước read/write.

### API contract

- Endpoint:
- Method:
- Request before:
- Request after:
- Response before:
- Response after:
- Error handling:

### Database and migrations

- Migration added:
- Tables/columns/indexes affected:
- Backfill:
- Rollback:
- Production action required:

### Validation and file handling

- Trường bắt buộc:
- Quy tắc tên file:
- Giới hạn file:
- MIME/type validation:
- Xử lý lỗi:

### Sensitive data

- Dữ liệu nhạy cảm bị tác động:
- Log có thể chứa dữ liệu:
- Biện pháp che hoặc loại bỏ:

## 11. Tests added or changed

| Test file | Test case | Requirement covered | Result |
| --------- | --------- | ------------------- | ------ |
|           |           |                     |        |

## 12. Final verification

| Check             | Command | Result | Evidence |
| ----------------- | ------- | ------ | -------- |
| Unit tests        |         |        |          |
| Integration tests |         |        |          |
| E2E tests         |         |        |          |
| Build             |         |        |          |
| Lint              |         |        |          |
| Typecheck         |         |        |          |
| Security check    |         |        |          |
| Secret scan       |         |        |          |

Phải ghi số lượng test pass/fail/skip và exit code khi có.

## 13. Acceptance criteria matrix

| ID    | Acceptance criterion | Status                       | Evidence | Notes |
| ----- | -------------------- | ---------------------------- | -------- | ----- |
| AC-01 |                      | PASS/FAIL/NOT_TESTED/BLOCKED |          |       |

Không được đánh dấu PASS nếu chưa có bằng chứng.

## 14. Manual verification required

- Màn hình hoặc quy trình cần người dùng kiểm tra:
- Dữ liệu mẫu cần dùng:
- Các bước kiểm tra:
- Kết quả mong đợi:

## 15. Remaining issues and warnings

| Severity                 | Issue | Impact | Recommended action |
| ------------------------ | ----- | ------ | ------------------ |
| Critical/High/Medium/Low |       |        |                    |

## 16. Regression and compatibility notes

- Trình duyệt:
- Thiết bị:
- Node/runtime:
- Database:
- API bên ngoài:
- Backward compatibility:
- Excel/PDF/import/export compatibility:
- Khác:

## 17. Rollback plan

- Cách rollback code:
- Cách rollback migration:
- Dữ liệu có cần phục hồi:
- Điều kiện không được rollback tự động:

## 18. Recommended next action

Chọn đúng một trạng thái:

- `STOP_AND_DECIDE`
- `REQUEST_CHANGES`
- `READY_FOR_CHATGPT_REVIEW`
- `READY_FOR_COMMIT`
- `READY_FOR_DEPLOY_REVIEW`

Giải thích ngắn gọn.

## 19. Commands to reproduce

```bash
# Liệt kê chính xác các lệnh để cài, chạy, test và tái hiện.
```

## 20. Key diff excerpts

Chèn các đoạn diff quan trọng liên quan trực tiếp đến:

- Logic nghiệp vụ;
- Phân quyền;
- DataScope;
- Schema;
- API contract;
- Validation;
- Test.

```diff
# Diff quan trọng
```

## 21. Full unified diff

Ghi một trong hai:

```text
FULL_DIFF_INCLUDED
```

hoặc:

```text
FULL_DIFF_OMITTED_DUE_TO_SIZE
Reason:
Files requiring deeper review:
```

Nếu bao gồm:

```diff
# Toàn bộ unified diff đã loại binary và secret.
```

## 22. Agent declaration

Agent xác nhận:

- Đã đọc các tài liệu nguồn sự thật;
- Không tự mở rộng phạm vi ngoài phần đã nêu;
- Không ghi đè thay đổi có sẵn của người dùng;
- Không đưa secret vào báo cáo;
- Không tự merge;
- Không tự deploy nếu chưa được yêu cầu;
- Kết quả test được ghi đúng theo lệnh thực tế;
- Các nội dung chưa xác minh đã được đánh dấu rõ.

---

## 11. Prompt bắt buộc giao cho coding agent

Có thể sao chép nguyên văn phần sau khi giao nhiệm vụ:

```text
Trước khi thực hiện, hãy đọc:
1. AGENTS.md;
2. AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md;
3. Tài liệu kế hoạch và acceptance criteria của nhiệm vụ.

Thực hiện đúng phạm vi đã được chốt. Không tự mở rộng, không refactor diện rộng, không ghi đè thay đổi hiện có của người dùng, không merge và không deploy nếu chưa được yêu cầu.

Bắt buộc:
- Ghi nhận Git status và baseline trước khi sửa;
- Chạy test liên quan sau từng phase;
- Chạy kiểm tra cuối;
- Đối chiếu từng acceptance criterion;
- Tạo hoặc cập nhật duy nhất file CHATGPT_HANDOFF.md theo đúng mẫu trong AGENT_WORKFLOW_AND_CHATGPT_HANDOFF.md;
- Nếu diff đủ nhỏ, đưa toàn bộ unified diff vào cuối CHATGPT_HANDOFF.md;
- Nếu diff quá lớn, đưa diff stat, name-status, tóm tắt chi tiết từng file và các đoạn diff quan trọng;
- Không đưa secret, dữ liệu cá nhân hoặc nội dung nhạy cảm vào báo cáo.

Trước khi kết thúc, tự kiểm tra rằng chỉ cần đọc CHATGPT_HANDOFF.md là ChatGPT có thể hiểu:
- Mục tiêu;
- Hiện trạng trước sửa;
- Mọi thay đổi đã thực hiện;
- File và symbol bị tác động;
- Kết quả test;
- Acceptance criteria;
- Rủi ro;
- Việc còn lại;
- Bước tiếp theo.

Không chỉ trả lời trong chat của agent. Phải ghi báo cáo vào file CHATGPT_HANDOFF.md ở thư mục gốc repository.
```

---

## 12. Prompt gửi lại cho ChatGPT sau khi agent hoàn thành

Người dùng chỉ cần tải `CHATGPT_HANDOFF.md` lên và gửi:

```text
Hãy đọc CHATGPT_HANDOFF.md như báo cáo bàn giao chính thức của coding agent.

Nhiệm vụ của bạn:
1. Kiểm tra tính đầy đủ và tính nhất quán của báo cáo.
2. Đối chiếu thay đổi với mục tiêu, quyết định và acceptance criteria được ghi trong báo cáo.
3. Phân biệt:
   - Nội dung đã có bằng chứng;
   - Nội dung agent chỉ tuyên bố nhưng chưa đủ bằng chứng;
   - Nội dung chưa kiểm thử;
   - Nội dung vượt phạm vi;
   - Rủi ro bảo mật hoặc dữ liệu.
4. Kiểm tra các file, symbol, endpoint, migration và test đã thay đổi.
5. Đọc diff được nhúng trong báo cáo nếu có.
6. Kết luận theo một trong các trạng thái:
   - Chưa đủ dữ liệu để review;
   - Cần agent sửa tiếp;
   - Đạt để commit;
   - Đạt để review deploy.
7. Nếu chưa đủ dữ liệu, chỉ rõ chính xác cần bổ sung:
   - File nào;
   - Đoạn diff nào;
   - Log nào;
   - Test nào;
   - Hay cần tải lại toàn bộ repository.

Không mặc nhiên tin kết luận của agent. Chỉ công nhận những nội dung có bằng chứng trong báo cáo.
```

---

## 13. Khi nào một file báo cáo là đủ?

Thông thường `CHATGPT_HANDOFF.md` đủ để:

- Theo dõi tiến độ;
- Nghiệm thu theo acceptance criteria;
- Kiểm tra test và build;
- Hiểu file và chức năng đã thay đổi;
- Phát hiện thay đổi vượt phạm vi;
- Phát hiện thiếu test;
- Đánh giá sơ bộ bảo mật;
- Quyết định có nên commit hay yêu cầu sửa tiếp.

Một file báo cáo **không thể thay thế hoàn toàn repository** trong các trường hợp:

- Cần audit từng dòng code;
- Diff rất lớn nhưng không được nhúng đầy đủ;
- Agent mô tả không đủ chi tiết;
- Cần chạy code;
- Cần kiểm tra dependency hoặc cấu hình thực tế;
- Có file nhị phân;
- Có lỗi phụ thuộc nhiều file không thay đổi;
- Có nghi vấn agent bỏ sót hoặc báo cáo sai.

Trong các trường hợp đó, ChatGPT phải yêu cầu đúng phần bổ sung cần thiết, thay vì yêu cầu người dùng tải lại toàn bộ một cách mặc định.

---

## 14. Khuyến nghị vận hành thực tế

1. Mỗi nhiệm vụ dùng một branch riêng.
2. Trước khi giao agent, phải có kế hoạch và acceptance criteria.
3. Agent luôn xuất `CHATGPT_HANDOFF.md`.
4. Người dùng gửi duy nhất file này cho ChatGPT trước.
5. Chỉ tải lại `.zip` khi:
   - ChatGPT yêu cầu review sâu;
   - Báo cáo thiếu diff;
   - Có thay đổi kiến trúc lớn;
   - Có nghi vấn bảo mật;
   - Cần chạy hoặc kiểm tra source thực tế.
6. Sau khi nhiệm vụ được chấp nhận, có thể lưu lại báo cáo theo tên:

```text
docs/handoffs/2026-07-28_feature-name_CHATGPT_HANDOFF.md
```

7. File `CHATGPT_HANDOFF.md` ở thư mục gốc luôn đại diện cho đợt thi công gần nhất.

---

## 15. Tiêu chuẩn chất lượng cuối cùng

Một báo cáo tốt phải trả lời được đầy đủ các câu hỏi sau mà không cần hỏi lại agent:

1. Agent nhận nhiệm vụ gì?
2. Dựa trên kế hoạch nào?
3. Repository ở commit nào trước khi sửa?
4. Có thay đổi chưa commit của người dùng không?
5. Agent đã sửa file nào?
6. Trong từng file đã thay đổi symbol hoặc hành vi gì?
7. Luồng nghiệp vụ trước và sau khác nhau thế nào?
8. Có ảnh hưởng authentication, authorization, DataScope hoặc dữ liệu không?
9. Đã chạy lệnh kiểm thử nào?
10. Kết quả cụ thể là gì?
11. Acceptance criterion nào pass, fail hoặc chưa test?
12. Có lỗi, cảnh báo hoặc rủi ro nào còn lại?
13. Có thể rollback thế nào?
14. Có cần người dùng kiểm tra thủ công không?
15. Bước tiếp theo nên là gì?
16. ChatGPT có đủ diff để review sâu hay chưa?

Nếu thiếu một trong các nội dung trọng yếu trên, agent chưa hoàn tất nghĩa vụ bàn giao.

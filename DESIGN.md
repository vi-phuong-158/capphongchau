# DESIGN.md

> Thiết kế giao diện cho **Hệ thống thu thập và kiểm tra nhanh hồ sơ đất đai Phường Phong Châu** (`land-ocr-180`).
>
> Tài liệu này là nguồn chỉ dẫn thiết kế cho coding agent. Khi có mâu thuẫn, ưu tiên yêu cầu mới nhất của người dùng, sau đó đến `AGENTS.md`, `DESIGN.md`, `PLAN.md` và các tài liệu triển khai khác.
>
> Trước khi code, phải đọc `AGENTS.md` và toàn bộ `docs/brain/`. Không được thay đổi quy tắc nghiệp vụ, phân quyền, dữ liệu, API hoặc bảo mật chỉ để thuận tiện cho giao diện.

---

## 1. Tầm nhìn thiết kế

### 1.1. Tên phong cách

**Cherry Gold Civic Glass**

Một hệ thống hành chính số hiện đại, trang trọng và dễ tin cậy, sử dụng:

- Đỏ cherry làm màu nhận diện chính.
- Vàng kim làm màu nhấn có kiểm soát.
- Nền sáng trung tính để dữ liệu dễ đọc.
- Khối nổi mềm, bo góc vừa phải.
- Kính mờ có chiều sâu cho modal, sheet, command palette và một số vùng nổi quan trọng.
- Chuyển động ngắn, chính xác, không phô trương.

### 1.2. Cảm xúc cần truyền tải

Giao diện phải tạo được bốn cảm nhận đồng thời:

1. **Tin cậy:** phù hợp với hệ thống tiếp nhận hồ sơ hành chính có dữ liệu nhạy cảm.
2. **Hiện đại:** không mang cảm giác biểu mẫu giấy được đưa nguyên lên web.
3. **Dễ thao tác:** cán bộ và người dân có thể sử dụng trên điện thoại mà không cần hướng dẫn dài.
4. **Có kiểm soát:** mọi trạng thái, quyền hạn, lỗi và hành động nhạy cảm đều rõ ràng.

### 1.3. Nguyên tắc cốt lõi

- Nội dung và trạng thái nghiệp vụ luôn quan trọng hơn hiệu ứng trang trí.
- Kính mờ chỉ dùng ở lớp nổi; không dùng làm nền cho bảng dữ liệu dài.
- Màu đỏ không được phủ dày toàn màn hình; dùng làm điểm neo thị giác.
- Màu vàng không dùng cho đoạn văn hoặc dữ liệu nhỏ trên nền sáng.
- Không dùng gradient sặc sỡ, neon, 3D giả lập hoặc hiệu ứng gaming.
- Không dùng icon thay hoàn toàn cho nhãn ở hành động quan trọng.
- Không hiển thị CCCD đầy đủ tại danh sách, log, toast hoặc notification.
- Không hiển thị Drive ID, link Drive, token, QR raw hoặc dữ liệu kỹ thuật nhạy cảm.

---

## 2. Phạm vi bề mặt giao diện

Hệ thống có hai khu vực giao diện độc lập về trải nghiệm nhưng dùng chung design tokens.

### 2.1. Cổng tiếp nhận hồ sơ

Dành cho người nộp hồ sơ hoặc cán bộ hỗ trợ nhập hồ sơ ban đầu.

Mục tiêu:

- Tạo hồ sơ nhanh.
- Chụp hoặc chọn đúng một ảnh CCCD mặt trước.
- Chụp hoặc chọn từ một đến mười ảnh GCN/bìa đỏ.
- Đọc QR CCCD tại thiết bị để gợi ý dữ liệu.
- Nhập tay khi QR thất bại.
- Lưu nháp, tiếp tục hồ sơ hiện tại và gửi hồ sơ.
- Hiển thị mã tiếp nhận và hướng dẫn lưu mã bí mật an toàn.

### 2.2. Khu nghiệp vụ nội bộ

Dành cho người dùng đã đăng nhập Google, có trong allowlist `USERS` và được phân quyền.

Mục tiêu:

- Tiếp nhận, tìm kiếm, lọc và xử lý hồ sơ.
- Xem ảnh, kiểm tra dữ liệu, yêu cầu bổ sung và xác nhận hồ sơ.
- Theo dõi tiến độ theo tổ dân phố.
- Quản lý người dùng, quyền, cấu hình và sức khỏe tích hợp.
- Xuất dữ liệu và xem audit log theo quyền.

### 2.3. Không thiết kế trong MVP

- OCR tự động CCCD hoặc GCN.
- Đối soát dân cư tự động.
- Giao diện PostgreSQL, Shared Drive hoặc hàng đợi OCR.
- Chế độ offline đầy đủ.
- Chia sẻ file Drive công khai.
- Trang dành cho người dân tự xem toàn bộ dữ liệu đã xác minh.

---

## 3. Kiến trúc thông tin

### 3.1. Cổng tiếp nhận

```text
/public
├── /bat-dau
├── /ho-so-hien-tai
│   ├── thong-tin-chung
│   ├── cccd
│   ├── giay-chung-nhan
│   ├── chu-su-dung
│   ├── kiem-tra
│   └── hoan-tat
└── /tro-giup
```

### 3.2. Khu nghiệp vụ

```text
/app
├── /dashboard
├── /ho-so
│   ├── danh-sach
│   └── /[caseId]
│       ├── tong-quan
│       ├── tai-lieu
│       ├── chu-su-dung
│       ├── giay-chung-nhan
│       ├── lich-su
│       └── thao-tac
├── /tiep-nhan
├── /yeu-cau-bo-sung
├── /bao-cao
├── /xuat-du-lieu
├── /nguoi-dung
├── /nhat-ky
├── /tich-hop
└── /cai-dat
```

### 3.3. Điều hướng theo vai trò

Menu phải được tạo từ quyền thực tế phía server, không dựa vào role cũ lưu ở client.

- `SYSTEM_ADMIN`: toàn bộ menu.
- `WARD_ADMIN`: dashboard, hồ sơ, tiếp nhận, báo cáo, xuất dữ liệu, người dùng phạm vi phường.
- `INTAKE_OFFICER`: dashboard cá nhân, hồ sơ được phân công, tạo hồ sơ, upload.
- `REVIEW_OFFICER`: hồ sơ cần kiểm tra, yêu cầu bổ sung, xác nhận.
- `REPORT_VIEWER`: dashboard, báo cáo, xuất dữ liệu theo phạm vi.
- `AUDITOR`: nhật ký, chi tiết hồ sơ ở chế độ chỉ đọc nếu được cấp.
- `POPULATION_MATCH_OFFICER`: chưa hiển thị chức năng đối soát trong MVP.

Không hiển thị menu bị cấm rồi mới báo lỗi. Server vẫn phải kiểm tra quyền cho mọi route và API.

---

## 4. Design tokens

### 4.1. Màu thương hiệu

```css
:root {
  --cherry-950: #3f0712;
  --cherry-900: #5c0b1c;
  --cherry-800: #781127;
  --cherry-700: #991b35;
  --cherry-600: #b42343;
  --cherry-500: #cf3657;
  --cherry-400: #e75d77;
  --cherry-300: #f18da0;
  --cherry-200: #f8bdc8;
  --cherry-100: #fde3e8;
  --cherry-50: #fff4f6;

  --gold-900: #6b4500;
  --gold-800: #895c00;
  --gold-700: #aa7605;
  --gold-600: #cc9512;
  --gold-500: #e9b52c;
  --gold-400: #f4ca56;
  --gold-300: #f8db86;
  --gold-200: #fbe9b5;
  --gold-100: #fff5d8;
  --gold-50: #fffbef;
}
```

### 4.2. Màu nền và chữ

```css
:root {
  --background: #f7f5f3;
  --background-subtle: #fbfaf9;
  --surface: #ffffff;
  --surface-raised: rgba(255, 255, 255, 0.86);
  --surface-glass: rgba(255, 255, 255, 0.72);
  --surface-glass-strong: rgba(255, 255, 255, 0.88);

  --text-primary: #22181b;
  --text-secondary: #5f5357;
  --text-muted: #83777b;
  --text-inverse: #fffaf7;

  --border: #e7dfe1;
  --border-strong: #d5c6ca;
  --border-glass: rgba(255, 255, 255, 0.72);
}
```

### 4.3. Màu ngữ nghĩa

```css
:root {
  --success: #177447;
  --success-soft: #e8f6ef;
  --warning: #9a5b00;
  --warning-soft: #fff4dc;
  --danger: #b42336;
  --danger-soft: #fdebec;
  --info: #2463a5;
  --info-soft: #eaf3fc;
  --neutral-soft: #f1eeee;
}
```

Quy tắc:

- `success`, `warning`, `danger`, `info` chỉ biểu thị ý nghĩa, không đổi theo màu thương hiệu.
- Không dùng màu cherry thay cho lỗi nếu hành động không phải lỗi.
- Trạng thái phải có cả màu, icon và nhãn chữ.

### 4.4. Typography

Sử dụng **Be Vietnam Pro** làm font mặc định cho toàn hệ thống để hiển thị tiếng Việt mượt mà, chuẩn sắc thái hành chính công hiện đại. Font được tích hợp bằng `next/font/google` (self-host khi build, không gọi CDN ngoài ở runtime để tối ưu tốc độ và hỗ trợ PWA offline):

```css
font-family: var(--font-be-vietnam), "Be Vietnam Pro", Inter, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
```

Nếu môi trường không tải được font biến môi trường, tự động trôi về system font stack.

Thang chữ:

| Token     | Desktop | Mobile | Weight | Dùng cho             |
| --------- | ------: | -----: | -----: | -------------------- |
| `display` |   40/48 |  32/40 |    700 | tiêu đề landing ngắn |
| `h1`      |   30/38 |  26/34 |    700 | tiêu đề trang        |
| `h2`      |   24/32 |  22/30 |    650 | tiêu đề khu vực      |
| `h3`      |   18/26 |  18/26 |    650 | tiêu đề card/modal   |
| `body-lg` |   16/26 |  16/25 |    400 | hướng dẫn chính      |
| `body`    |   14/22 |  15/23 |    400 | nội dung mặc định    |
| `label`   |   13/18 |  14/20 |    600 | nhãn trường          |
| `caption` |   12/18 |  12/18 |    400 | metadata             |

- Không dùng toàn chữ hoa cho câu dài.
- Mã hồ sơ dùng font mono hệ thống và cho phép copy.
- Số liệu dashboard dùng `font-variant-numeric: tabular-nums`.

### 4.5. Khoảng cách

Dùng lưới 4px:

```text
1 = 4px
2 = 8px
3 = 12px
4 = 16px
5 = 20px
6 = 24px
8 = 32px
10 = 40px
12 = 48px
16 = 64px
```

### 4.6. Bo góc

```css
--radius-xs: 8px;
--radius-sm: 10px;
--radius-md: 14px;
--radius-lg: 18px;
--radius-xl: 24px;
--radius-2xl: 30px;
--radius-pill: 999px;
```

- Input, select, button: 10–12px.
- Card: 14–18px.
- Modal, drawer, bottom sheet: 22–28px.
- Không bo tròn quá mức cho bảng và vùng nghiệp vụ dày đặc.

### 4.7. Đổ bóng

```css
--shadow-xs: 0 1px 2px rgba(63, 7, 18, 0.06);
--shadow-sm: 0 4px 14px rgba(63, 7, 18, 0.08);
--shadow-md: 0 12px 30px rgba(63, 7, 18, 0.12);
--shadow-lg: 0 24px 64px rgba(63, 7, 18, 0.18);
--shadow-focus: 0 0 0 4px rgba(180, 35, 67, 0.18);
```

Bóng phải mềm, rộng, không có viền đen dày.

---

## 5. Glassmorphism và lớp nổi

### 5.1. Công thức modal kính mờ

```css
.glass-modal {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow:
    0 28px 80px rgba(63, 7, 18, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(22px) saturate(135%);
  -webkit-backdrop-filter: blur(22px) saturate(135%);
  border-radius: 26px;
}
```

### 5.2. Backdrop

```css
.modal-backdrop {
  background:
    radial-gradient(circle at 20% 10%, rgba(180, 35, 67, 0.18), transparent 42%),
    rgba(34, 24, 27, 0.42);
  backdrop-filter: blur(6px);
}
```

### 5.3. Quy tắc sử dụng

Dùng kính mờ cho:

- Modal xác nhận.
- Modal xem nhanh hồ sơ.
- Drawer bộ lọc.
- Bottom sheet trên mobile.
- Command palette.
- Menu tài khoản.
- Upload progress nổi.

Không dùng kính mờ cho:

- Bảng dữ liệu dài.
- Form nhiều trường.
- Nội dung ảnh CCCD/GCN cần đối chiếu.
- Audit log.
- Khu vực có chữ nhỏ dày đặc.

### 5.4. Fallback

Nếu trình duyệt không hỗ trợ `backdrop-filter`, modal phải chuyển sang nền trắng đặc `rgba(255,255,255,0.98)` mà không mất tương phản.

### 5.5. Reduced transparency

Khi hệ điều hành hoặc trình duyệt ưu tiên giảm trong suốt, dùng nền đặc và bỏ blur.

---

## 6. Bố cục ứng dụng

### 6.1. Desktop nội bộ

```text
┌──────────────────────────────────────────────────────────────┐
│ Top bar: breadcrumb / search / sync status / account         │
├──────────────┬───────────────────────────────────────────────┤
│ Sidebar      │ Page header                                   │
│ 248px        │ Main content                                  │
│              │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

- Sidebar rộng 248px, có chế độ thu gọn 76px.
- Nội dung tối đa 1440px, tự giãn với màn hình lớn.
- Page padding 24–32px.
- Header không cố định nếu làm giảm diện tích đọc; chỉ top bar chính có thể sticky.

### 6.2. Tablet

- Sidebar chuyển thành rail 72px hoặc drawer.
- Bảng dữ liệu có cột ưu tiên và nút mở chi tiết.
- Form chi tiết từ 2 cột về 1 cột khi dưới 900px.

### 6.3. Mobile

- Bottom navigation tối đa 4 mục chính theo vai trò.
- Hành động phụ nằm trong menu “Thêm”.
- Bottom sheet thay modal ở thao tác nhập liệu hoặc lọc.
- Nút chính có thể sticky dưới màn hình nhưng không che nội dung.
- Vùng chạm tối thiểu 44×44px.
- Không yêu cầu kéo ngang để hoàn thành quy trình.

### 6.4. Cổng tiếp nhận

- Bố cục một cột, tối đa 720px.
- Trên desktop có panel hướng dẫn bên trái và form bên phải.
- Trên mobile ưu tiên camera, upload và tiến trình.
- Không hiển thị sidebar nội bộ.

---

## 7. Thành phần nền tảng

### 7.1. Button

Biến thể:

- `primary`: nền cherry-700, chữ trắng.
- `secondary`: nền trắng, viền cherry-200, chữ cherry-800.
- `gold`: nền gold-500, chữ cherry-950; chỉ dùng cho một CTA nổi bật ở landing hoặc hoàn tất.
- `ghost`: nền trong suốt.
- `danger`: đỏ ngữ nghĩa, không dùng cherry thương hiệu.

Trạng thái:

- Default, hover, pressed, focus-visible, disabled, loading.
- Loading giữ nguyên chiều rộng và có nhãn động từ rõ ràng.
- Không chỉ hiển thị spinner không có chữ ở thao tác gửi/xác nhận.

### 7.2. Input

- Chiều cao 44px desktop, 48px mobile.
- Label đặt trên input, không dùng placeholder thay label.
- Helper text chỉ hiển thị khi cần.
- Error message đặt ngay dưới trường.
- Trường CCCD dùng numeric input, mask khi xem lại theo quyền.
- Trường ngày có nhập tay và date picker tương thích mobile.

### 7.3. Select và combobox

- Dùng combobox tìm kiếm cho tổ dân phố, người xử lý và trạng thái khi danh sách dài.
- Mười tổ dân phố phải hiển thị theo dữ liệu tham chiếu cố định, không cho nhập tùy ý.
- Clear filter phải rõ ràng.

### 7.4. Badge trạng thái

| Trạng thái             | Nhãn tiếng Việt | Màu                  |
| ---------------------- | --------------- | -------------------- |
| `DRAFT`                | Bản nháp        | neutral              |
| `UPLOADED`             | Đã tải tài liệu | info                 |
| `PENDING_REVIEW`       | Chờ kiểm tra    | warning              |
| `NEEDS_MORE_DOCUMENTS` | Cần bổ sung     | danger/amber kết hợp |
| `VERIFIED`             | Đã xác nhận     | success              |
| `ARCHIVED`             | Đã lưu trữ      | neutral đậm          |

Mỗi badge gồm icon nhỏ + nhãn. Không hiển thị enum tiếng Anh cho người dùng cuối.

### 7.5. Card

- Card mặc định nền trắng, viền mỏng, bóng rất nhẹ.
- Card dashboard có top accent 3px hoặc icon nền tint; không dùng gradient mạnh.
- Card chọn tệp có trạng thái empty, uploading, verifying, success, error.

### 7.6. Table

- Header sticky khi danh sách dài.
- Mỗi dòng cao 52–60px.
- Cột đầu là mã hồ sơ; cột cuối là menu hành động.
- Cho phép chọn nhiều dòng chỉ ở nghiệp vụ thực sự hỗ trợ batch action.
- Trên mobile chuyển sang list card, không ép table thu nhỏ.
- CCCD chỉ hiển thị dạng che.

### 7.7. Toast và notification

- Toast chỉ dùng cho phản hồi ngắn, tự đóng với success/info.
- Lỗi cần hành động phải tồn tại cho đến khi người dùng đóng hoặc khắc phục.
- Không đưa dữ liệu nhạy cảm vào toast.
- Lỗi API hiển thị `requestId` dạng copyable trong vùng “Chi tiết kỹ thuật” thu gọn.

### 7.8. Empty state

Mỗi empty state gồm:

- Icon line-art đơn giản.
- Tiêu đề mô tả đúng tình trạng.
- Một câu hướng dẫn.
- Tối đa một CTA chính và một CTA phụ.

Không dùng thông điệp chung chung như “Không có dữ liệu”.

### 7.9. Skeleton

- Skeleton bám sát cấu trúc thật.
- Không dùng spinner toàn trang nếu có thể hiển thị skeleton.
- Không skeleton ảnh hồ sơ quá lâu; hiển thị trạng thái tải và retry.

---

## 8. Modal, drawer và bottom sheet

### 8.1. Kích thước modal

| Loại          |            Desktop | Mobile            |
| ------------- | -----------------: | ----------------- |
| Confirm       |          420–480px | bottom sheet      |
| Form nhỏ      |          560–640px | full-height sheet |
| Preview hồ sơ |         840–1040px | full screen       |
| Xem ảnh       | tối đa 92vw × 90vh | full screen       |

### 8.2. Cấu trúc modal

```text
Modal
├── Header
│   ├── icon/title
│   ├── description ngắn
│   └── close button
├── Body scrollable
└── Footer sticky
    ├── secondary action
    └── primary action
```

### 8.3. Quy tắc tương tác

- Focus trap bắt buộc.
- `Esc` đóng modal không có dữ liệu chưa lưu.
- Nếu có dữ liệu chưa lưu, hiển thị xác nhận rời.
- Click backdrop không đóng modal nhạy cảm hoặc đang upload.
- Khi modal đóng, focus trở lại nút mở.
- Modal không lồng quá hai cấp.
- Không hiển thị ba modal chồng nhau.

### 8.4. Modal hành động nhạy cảm

Áp dụng cho xác nhận hồ sơ, lưu trữ, thay ảnh CCCD, thay đổi quyền và export.

Phải hiển thị:

- Đối tượng bị tác động.
- Hệ quả.
- Điều kiện hoặc quyền thực hiện.
- Nút chính có động từ cụ thể.
- Trạng thái loading và chống gửi lặp.

Không dùng nút chung chung “OK”.

---

## 9. Luồng cổng tiếp nhận hồ sơ

### 9.1. Trang bắt đầu

Nội dung:

- Tên hệ thống.
- Mô tả ngắn: công cụ thu thập và chuẩn hóa trung gian, không thay thế CSDL đất đai chuyên ngành.
- Danh sách tài liệu cần chuẩn bị.
- Thông báo hệ thống cần internet.
- CTA `Bắt đầu tạo hồ sơ`.
- CTA phụ `Tiếp tục hồ sơ đang làm`.

Visual:

- Hero nền cream, dải cherry ở cạnh hoặc header.
- Một họa tiết bản đồ/thửa đất line-art rất nhẹ.
- CTA vàng chỉ dùng nếu đủ tương phản; mặc định CTA chính cherry.

### 9.2. Stepper

Các bước:

1. Thông tin địa bàn.
2. CCCD mặt trước.
3. Giấy chứng nhận.
4. Chủ sử dụng và thông tin GCN.
5. Kiểm tra.
6. Hoàn tất.

Stepper desktop ngang, mobile dạng progress + “Bước 2/6”.

### 9.3. Chọn tổ dân phố

- Hiển thị 10 tổ dân phố theo danh sách cố định.
- Có tìm kiếm nhanh nhưng không cho nhập giá trị ngoài danh sách.
- Card chọn có icon vị trí, tên và trạng thái selected.

### 9.4. Upload CCCD

Yêu cầu giao diện:

- Chỉ cho đúng một ảnh mặt trước.
- Nút `Chụp ảnh CCCD` và `Chọn từ thiết bị`.
- Hướng dẫn ảnh rõ, đủ bốn góc, không lóa.
- Preview sau khi chọn.
- Trạng thái chuyển HEIC/HEIF sang JPEG nếu cần.
- Upload trực tiếp Drive qua resumable session.
- Thanh tiến độ có phần trăm, retry và hủy khi còn an toàn.
- Sau upload phải có trạng thái `Đang xác minh tệp` trước khi báo thành công.

Thay ảnh CCCD:

- Không xóa ảnh cũ trước.
- Modal giải thích ảnh mới phải upload và xác minh thành công trước khi ảnh cũ chuyển sang `REPLACED`.

### 9.5. Đọc QR CCCD

- Quét trên thiết bị, không gửi raw QR lên server.
- Hiển thị khung camera và hướng dẫn căn QR.
- Có phương án chọn ảnh có QR.
- Thử xoay ảnh tự động nhưng không mô tả chi tiết kỹ thuật cho người dùng.
- Sau khi đọc, hiển thị form dữ liệu gợi ý và yêu cầu xác nhận.
- Trường đã được người dùng sửa tay không bị QR ghi đè.
- Khi thất bại, hiện CTA `Nhập thông tin thủ công`; không khóa luồng.

### 9.6. Upload GCN/bìa đỏ

- Tối thiểu 1, tối đa 10 ảnh.
- Grid preview 2 cột mobile, 3–4 cột desktop.
- Cho sắp thứ tự bằng nút lên/xuống; không phụ thuộc drag-and-drop trên mobile.
- Mỗi ảnh có trạng thái upload/xác minh.
- Xóa là soft-delete; giao diện dùng từ `Loại khỏi hồ sơ`, không nói xóa khỏi Drive.

### 9.7. Nhập dữ liệu GCN

Các trường chính:

- Số phát hành.
- Ngày cấp.
- Số vào sổ.
- Chủ sử dụng.
- Ghi chú.

Không tự suy luận tính pháp lý. Dữ liệu nhập là thông tin phục vụ thu thập và kiểm tra.

### 9.8. Kiểm tra trước khi gửi

Hiển thị theo nhóm:

- Địa bàn.
- Chủ sử dụng.
- CCCD.
- GCN.
- Ghi chú.

Mỗi nhóm có nút `Chỉnh sửa` quay về bước tương ứng.

Checklist bắt buộc:

- Đúng một CCCD mặt trước.
- Ít nhất một ảnh GCN.
- Tệp đã upload và xác minh.
- Các trường bắt buộc hợp lệ.

### 9.9. Hoàn tất

- Hiển thị mã tiếp nhận rõ ràng và nút copy.
- Mã bí mật chỉ hiển thị theo cơ chế nghiệp vụ an toàn; cảnh báo không chia sẻ công khai.
- Không ghi mã bí mật vào log, analytics hoặc URL.
- Có nút tải/in phiếu xác nhận chỉ khi backend hỗ trợ và không lộ dữ liệu ngoài phạm vi.

---

## 10. Luồng khu nghiệp vụ nội bộ

### 10.1. Đăng nhập và từ chối truy cập

Trang đăng nhập:

- Nút `Đăng nhập bằng Google`.
- Giải thích đăng nhập chỉ xác thực tài khoản; quyền dùng hệ thống phụ thuộc allowlist.
- Không yêu cầu hoặc lưu mật khẩu Google.

Trường hợp email không có trong `USERS`:

- Hiển thị trang `Tài khoản chưa được cấp quyền`.
- Cho biết email đã đăng nhập ở dạng an toàn.
- Có nút đăng xuất.
- Không hiển thị một phần dashboard rồi mới chặn.

### 10.2. Dashboard

Khối đầu trang:

- Tiêu đề và phạm vi thời gian.
- Trạng thái kết nối Google ở mức tổng quan.
- Bộ lọc tổ dân phố theo quyền.

KPI chính:

- Tổng hồ sơ.
- Hồ sơ chờ kiểm tra.
- Hồ sơ cần bổ sung.
- Hồ sơ đã xác nhận.

Khu vực dưới:

- Tiến độ theo tổ dân phố.
- Phân bổ theo trạng thái.
- Hồ sơ mới gần đây.
- Cảnh báo upload hoặc tích hợp.

Biểu đồ:

- Không dùng hiệu ứng 3D.
- Có bảng dữ liệu thay thế.
- Màu ngữ nghĩa nhất quán.
- Tooltip không chứa CCCD đầy đủ.

### 10.3. Danh sách hồ sơ

Bộ lọc:

- Từ khóa.
- Tổ dân phố.
- Trạng thái.
- Người tiếp nhận/xử lý nếu có quyền.
- Khoảng thời gian.

Cột đề xuất:

- Mã hồ sơ.
- Tổ dân phố.
- Chủ sử dụng.
- CCCD che.
- Số ảnh.
- Trạng thái.
- Cập nhật gần nhất.
- Người xử lý.
- Hành động.

Tìm kiếm:

- Debounce hợp lý.
- Hiển thị filter chips.
- Có nút xóa toàn bộ bộ lọc.
- Không tìm kiếm CCCD rõ qua URL query string.

### 10.4. Chi tiết hồ sơ

Header:

- Mã hồ sơ copyable.
- Badge trạng thái.
- Tổ dân phố.
- Người tiếp nhận.
- Thời gian tạo/cập nhật.
- Các CTA theo quyền.

Desktop:

- Cột trái 56–60%: viewer ảnh.
- Cột phải 40–44%: dữ liệu và thao tác.

Mobile:

- Tab `Tài liệu`, `Thông tin`, `Lịch sử`.
- Hành động chính sticky bottom.

Viewer ảnh:

- Zoom, xoay, fit width, reset.
- Thumbnail list.
- Không có link mở Drive công khai.
- Tải/xem file phải qua API có kiểm tra quyền và ghi audit.

### 10.5. Yêu cầu bổ sung

Modal/sheet gồm:

- Lý do cần bổ sung.
- Danh mục thông tin/tài liệu còn thiếu.
- Ghi chú hướng dẫn.
- Xác nhận thay đổi trạng thái sang `NEEDS_MORE_DOCUMENTS`.

Sau khi gửi:

- Timeline ghi người thực hiện và thời gian.
- Toast thành công không chứa dữ liệu nhạy cảm.

### 10.6. Xác nhận hồ sơ

Nút `Xác nhận hồ sơ` chỉ xuất hiện khi:

- Người dùng có quyền.
- Trạng thái hợp lệ.
- Tài liệu bắt buộc đã đủ.
- Dữ liệu không có lỗi validation chặn.

Modal phải nêu rõ:

- Đây là xác nhận nghiệp vụ trong hệ thống thu thập trung gian.
- Không tự tạo hoặc thay thế giá trị pháp lý của hồ sơ đất đai.
- Hành động được ghi audit.

### 10.7. Lịch sử và audit

Timeline hồ sơ hiển thị:

- Hành động.
- Người thực hiện.
- Thời gian.
- Trạng thái trước/sau.
- Request ID khi cần điều tra lỗi.

Không hiển thị:

- Token.
- QR raw.
- Link Drive.
- CCCD đầy đủ.
- Stack trace.

### 10.8. Quản lý người dùng

- Danh sách email, họ tên, vai trò, phạm vi, trạng thái.
- Thay đổi vai trò bằng modal xác nhận.
- Cảnh báo khi tự hạ quyền quản trị cuối cùng.
- Không cho frontend tự quyết quyền; cập nhật phải qua API và audit.

### 10.9. Xuất dữ liệu

Flow:

1. Chọn phạm vi dữ liệu.
2. Hiển thị số bản ghi dự kiến.
3. Xác nhận nội dung nhạy cảm được phép xuất.
4. Tạo export.
5. Hiển thị trạng thái xử lý và kết quả.

Mọi export phải ghi người tạo, thời gian và bộ lọc.

### 10.10. Tình trạng tích hợp

Trang health gồm các card:

- Google OAuth.
- Refresh token.
- Google Sheets schema.
- Drive root folder.
- Google API quota/lỗi gần đây.

Không hiển thị secret hoặc token. Chi tiết kỹ thuật chỉ dành cho `SYSTEM_ADMIN`.

---

## 11. Trạng thái hệ thống và lỗi

### 11.1. Mất kết nối

Vì PWA là online-only:

- Hiển thị banner cố định `Mất kết nối Internet`.
- Vô hiệu hóa thao tác gửi/upload mới.
- Không khẳng định dữ liệu đã được lưu nếu server chưa xác nhận.
- Khi kết nối lại, cho phép retry rõ ràng.

### 11.2. Version conflict

Khi API trả `409 VERSION_CONFLICT`:

- Không ghi đè im lặng.
- Modal cho biết hồ sơ đã được người khác cập nhật.
- CTA `Tải phiên bản mới nhất`.
- Nếu có dữ liệu người dùng vừa nhập, hiển thị bản nháp tạm để sao chép, không tự merge mù quáng.

### 11.3. Idempotency và gửi lặp

- Disable nút ngay khi submit.
- Hiển thị trạng thái đang xử lý.
- Retry dùng cùng idempotency key theo hợp đồng API.
- Không tạo hai hồ sơ hoặc hai upload vì người dùng bấm nhiều lần.

### 11.4. Lỗi API chuẩn

Giao diện đọc:

- `error.code`
- `error.message`
- `error.requestId`
- `error.details` nếu an toàn

Hiển thị message tiếng Việt từ server; không render stack trace.

### 11.5. Lỗi upload

Phân loại:

- File không hợp lệ.
- Quá 30 MB.
- Mất kết nối.
- Upload session hết hạn.
- Xác minh metadata/checksum thất bại.
- Google API lỗi/quota.

Mỗi lỗi có hành động tiếp theo cụ thể.

---

## 12. Chuyển động và phản hồi

### 12.1. Thời lượng

```css
--duration-fast: 120ms;
--duration-base: 180ms;
--duration-slow: 260ms;
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
--ease-emphasized: cubic-bezier(0.2, 0.8, 0.2, 1);
```

### 12.2. Dùng chuyển động cho

- Modal fade + scale 0.98 → 1.
- Drawer trượt từ cạnh.
- Bottom sheet trượt từ dưới.
- Badge/filter chip thay đổi nhẹ.
- Upload progress.
- Expand/collapse section.

### 12.3. Không dùng

- Parallax.
- Spring nảy mạnh.
- Background animation liên tục.
- Confetti khi hoàn tất hồ sơ.
- Shimmer quá sáng trên dữ liệu nhạy cảm.

### 12.4. Reduced motion

Tôn trọng `prefers-reduced-motion`; bỏ scale/slide, giữ fade rất ngắn hoặc chuyển tức thời.

---

## 13. Khả năng truy cập

- Đạt tối thiểu WCAG 2.1 AA cho màu chữ, focus và thao tác bàn phím.
- Tương phản chữ chính tối thiểu 4.5:1.
- Focus ring rõ ràng, không chỉ đổi màu nền.
- Tất cả icon button có accessible name.
- Modal có `aria-labelledby`, `aria-describedby` và focus trap.
- Trạng thái upload có `aria-live` phù hợp.
- Lỗi form được liên kết bằng `aria-describedby`.
- Không dùng màu là tín hiệu duy nhất.
- Viewer ảnh hỗ trợ phím zoom và nút điều khiển có nhãn.
- Bảng có header đúng ngữ nghĩa.
- Skip link cho khu nội dung chính.

---

## 14. Nội dung giao diện

### 14.1. Giọng điệu

- Chính xác.
- Bình tĩnh.
- Hướng dẫn bằng động từ cụ thể.
- Không đổ lỗi cho người dùng.
- Không dùng thuật ngữ kỹ thuật khi không cần.

### 14.2. Nhãn hành động tốt

- `Lưu bản nháp`
- `Tải ảnh CCCD`
- `Gửi hồ sơ`
- `Yêu cầu bổ sung`
- `Xác nhận hồ sơ`
- `Tải phiên bản mới nhất`
- `Thử tải lại`

Tránh:

- `OK`
- `Submit`
- `Xử lý`
- `Tiếp tục` khi không rõ tiếp tục việc gì

### 14.3. Thông báo dữ liệu nhạy cảm

Dùng câu ngắn, rõ:

> Hồ sơ có dữ liệu cá nhân. Chỉ sử dụng trong phạm vi nhiệm vụ được phân công và không chia sẻ ra ngoài hệ thống.

---

## 15. Responsive breakpoint

```css
--breakpoint-sm: 640px;
--breakpoint-md: 768px;
--breakpoint-lg: 1024px;
--breakpoint-xl: 1280px;
--breakpoint-2xl: 1536px;
```

Nguyên tắc:

- Mobile-first.
- Không chỉ thu nhỏ desktop.
- Dưới 768px chuyển table sang list card.
- Dưới 1024px sidebar thành drawer/rail.
- Viewer ảnh và form chuyển thành tab/stack.

---

## 16. Quy ước triển khai với Next.js và Tailwind

### 16.1. Cấu trúc đề xuất

```text
src/
├── app/
│   ├── (public)/
│   ├── (auth)/
│   └── (internal)/
├── components/
│   ├── ui/
│   ├── layout/
│   ├── cases/
│   ├── uploads/
│   ├── qr/
│   ├── dashboard/
│   └── security/
├── design/
│   ├── tokens.css
│   ├── status-map.ts
│   └── motion.ts
└── lib/
```

### 16.2. UI layer

- Component frontend không gọi trực tiếp Google API.
- Không để component tự suy luận quyền từ role client-side.
- Server trả capability/permission cần thiết cho từng màn hình.
- Business state phải lấy từ enum và hợp đồng API.
- Không hardcode trạng thái bằng chuỗi tự do.

### 16.3. CSS variables

- Khai báo màu bằng CSS variables để dễ kiểm soát.
- Tailwind map token qua `theme.extend.colors` hoặc cú pháp CSS variable tương ứng.
- Không rải mã hex ngẫu nhiên trong component.
- Không dùng `!important` trừ trường hợp tích hợp thư viện bắt buộc và có chú thích.

### 16.4. Component contract

Mỗi component phức tạp phải có:

- Props typed nghiêm ngặt, không `any`.
- Empty/loading/error/disabled state.
- Keyboard behavior.
- Mobile behavior.
- Test ID chỉ khi cần cho E2E, không thay semantic query.

### 16.5. Thư viện giao diện

- Ưu tiên component headless hoặc component tự xây trên nền semantic HTML.
- Không thêm một UI framework nặng chỉ để có modal/card.
- Nếu thêm dependency mới, phải ghi quyết định và đánh giá bundle, accessibility, bảo trì.
- Icon phải nhất quán một bộ; không trộn nhiều phong cách.

---

## 17. Mẫu component

### 17.1. Page header

```text
[breadcrumb]
[Tên trang]                         [Hành động phụ] [Hành động chính]
[Mô tả ngắn / phạm vi dữ liệu]
```

### 17.2. KPI card

```text
┌────────────────────────────┐
│ icon tint      nhãn        │
│ 1.248                      │
│ +12% so với kỳ trước       │
└────────────────────────────┘
```

Không hiển thị xu hướng nếu dữ liệu so sánh không tồn tại.

### 17.3. File card

```text
┌────────────────────────────┐
│ thumbnail                  │
│ CCCD mặt trước             │
│ 2,4 MB · JPEG              │
│ [Đã xác minh]              │
│ [Xem] [Thay ảnh]           │
└────────────────────────────┘
```

### 17.4. Review panel

```text
┌────────────────────────────┐
│ Trạng thái hồ sơ           │
│ [badge]                    │
│                            │
│ Checklist                  │
│ ✓ CCCD                     │
│ ✓ GCN                      │
│ ! Dữ liệu cần kiểm tra     │
│                            │
│ [Yêu cầu bổ sung]          │
│ [Xác nhận hồ sơ]           │
└────────────────────────────┘
```

---

## 18. Màn hình ưu tiên triển khai

### M0 — Nền tảng thiết kế

- Tokens.
- Typography.
- Button, input, badge, card.
- Modal glass.
- Toast.
- App shell responsive.

### M1 — Cổng tiếp nhận

- Bắt đầu.
- Stepper.
- Upload CCCD/GCN.
- QR confirm.
- Review và hoàn tất.

### M2 — Hồ sơ nội bộ

- Đăng nhập/không có quyền.
- Danh sách hồ sơ.
- Chi tiết hồ sơ.
- Yêu cầu bổ sung.
- Xác nhận.

### M3 — Dashboard và báo cáo

- KPI.
- Tiến độ theo tổ dân phố.
- Bộ lọc.
- Export.

### M4 — Quản trị và vận hành

- Người dùng.
- Audit log.
- Health integration.
- Error states nâng cao.

---

## 19. Kiểm thử giao diện

### 19.1. Visual QA

Kiểm tra tối thiểu:

- 360×800.
- 390×844.
- 768×1024.
- 1366×768.
- 1440×900.
- 1920×1080.

### 19.2. Trình duyệt/thiết bị

- Android Chrome.
- iPhone Safari.
- Desktop Chrome/Edge.
- Wi-Fi và 4G yếu.

### 19.3. State matrix

Mỗi màn hình quan trọng phải chụp/kiểm tra:

- Empty.
- Loading.
- Loaded.
- Validation error.
- Permission denied.
- Offline.
- API error.
- Version conflict.
- Upload retry.

### 19.4. Modal QA

- Focus trap.
- Scroll body, footer sticky.
- Escape/backdrop behavior.
- Mobile bottom sheet.
- Reduced motion.
- Fallback không có backdrop blur.
- Không che bàn phím mobile.

---

## 20. Anti-patterns bị cấm

- Toàn bộ dashboard nền đỏ cherry.
- Chữ vàng trên nền trắng cho nội dung nhỏ.
- Card nào cũng glassmorphism.
- Bảng dữ liệu trong suốt đặt trên ảnh nền.
- Modal không có nhãn nút cụ thể.
- Sidebar chứa chức năng người dùng không có quyền.
- Hiển thị CCCD đầy đủ trong list, toast hoặc log.
- Tự động xác nhận dữ liệu đọc từ QR.
- QR thất bại làm khóa hồ sơ.
- Xóa ảnh CCCD cũ trước khi ảnh mới được xác minh.
- Upload file qua body Vercel Function.
- Link Drive công khai hoặc nút “Mở trên Drive”.
- Dùng màu thương hiệu để thay thế màu trạng thái.
- Animation kéo dài làm chậm thao tác nghiệp vụ.
- Mobile chỉ là bản desktop thu nhỏ.

---

## 21. Definition of Done cho UI

Một màn hình chỉ được coi là hoàn thành khi:

- Bám đúng quyền và trạng thái nghiệp vụ trong `AGENTS.md`.
- Có responsive desktop/tablet/mobile.
- Có loading, empty, error và offline state.
- Tương tác bàn phím và focus đúng.
- Không lộ PII, token, QR raw, Drive ID/link hoặc stack trace.
- Mọi thao tác write có trạng thái loading và chống gửi lặp.
- Modal glass có fallback nền đặc.
- Trạng thái không chỉ dựa vào màu.
- Test component/E2E phù hợp đã chạy.
- Tài liệu và working log được cập nhật theo quy tắc dự án.

---

## 22. Checklist trước khi coding agent bắt đầu

- [ ] Đã đọc toàn bộ `AGENTS.md`.
- [ ] Đã đọc `docs/brain/` và Code Graph.
- [ ] Đã xác định route thuộc public hay internal.
- [ ] Đã xác định role/capability được phép.
- [ ] Đã xác định API và trạng thái nghiệp vụ.
- [ ] Đã dùng tokens, không hardcode màu tùy ý.
- [ ] Đã thiết kế mobile trước.
- [ ] Đã có state loading/error/offline/conflict.
- [ ] Đã kiểm tra PII và audit requirement.
- [ ] Đã chuẩn bị test và cập nhật tài liệu sau khi code.

---

## 23. Prompt triển khai mẫu cho Codex/Claude Code

```text
Đọc AGENTS.md, DESIGN.md và toàn bộ docs/brain/ trước khi code.
Triển khai màn hình [TÊN MÀN HÌNH] theo phong cách Cherry Gold Civic Glass.
Giữ đúng design tokens, responsive mobile-first, accessibility và modal glass có fallback.
Không thay đổi schema/API/quy tắc nghiệp vụ. Không gọi Google API trực tiếp từ component.
Không hiển thị PII đầy đủ, QR raw, Drive ID/link, token hoặc stack trace.
Bổ sung đầy đủ loading, empty, error, offline, permission denied và version conflict nếu liên quan.
Sau khi hoàn thành, chạy test phù hợp, liệt kê file thay đổi và cập nhật docs/brain/06-ai-working-log.md.
```

---

## 24. Kết luận thiết kế

Giao diện phải nổi bật bằng **đỏ cherry và vàng kim**, nhưng nền tảng vẫn là một sản phẩm hành chính số rõ ràng, an toàn và hiệu quả. Glassmorphism là ngôn ngữ cho các lớp nổi và khoảnh khắc cần tập trung; dữ liệu nghiệp vụ dài phải nằm trên bề mặt đặc, tương phản cao. Mọi quyết định thị giác phải phục vụ ba ưu tiên: **đọc đúng dữ liệu, thao tác đúng quyền và tránh sai sót hồ sơ**.

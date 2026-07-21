import type { Metadata } from "next";

import { IntakeWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Kê khai hồ sơ đất đai",
  description: "Người dân kê khai và nộp giấy tờ đất đai trực tuyến, không cần tài khoản.",
};

export default function IntakePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div
        className="pc-card mb-6"
        style={{ background: "var(--warning-surface)", borderColor: "var(--warning-border)" }}
      >
        <p className="font-bold">BẢN CHẠY THỬ — DỮ LIỆU ĐƯỢC LƯU THẬT</p>
        <p className="mt-1 text-sm">
          Bản kê khai và ảnh giấy tờ bạn nhập ở đây <strong>được lưu thật</strong> vào Google Sheets
          và Google Drive của hệ thống. Hệ thống đang chạy thử và{" "}
          <strong>chưa bật lớp chống lạm dụng (Turnstile, giới hạn truy cập)</strong> — vì vậy chỉ
          dùng dữ liệu giả để kiểm thử, đừng nhập CCCD hoặc thông tin cá nhân thật.
        </p>
      </div>

      <header className="mb-8">
        <p className="text-sm font-semibold tracking-[0.16em]" style={{ color: "var(--accent)" }}>
          PHƯỜNG PHONG CHÂU
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Kê khai hồ sơ đất đai
        </h1>
        <p className="mt-3 text-lg" style={{ color: "var(--muted)" }}>
          Dành cho trường hợp thửa đất đã có Giấy chứng nhận. Bạn không cần tài khoản — kê khai xong
          sẽ nhận mã tra cứu.
        </p>
      </header>

      <IntakeWizard />
    </main>
  );
}

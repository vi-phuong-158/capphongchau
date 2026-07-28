import type { Metadata } from "next";

import { requireActiveUser } from "@/modules/auth/authorization";
import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { SUBMISSION_READ_ROLES } from "@/modules/submissions/review";

import { AssistedIntakeWizard } from "./assisted-wizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kê khai hộ người dân",
  description: "Chế độ cán bộ hỗ trợ kê khai hồ sơ đất đai tại cơ sở.",
  // Chế độ nội bộ, không để công cụ tìm kiếm lập chỉ mục.
  robots: { index: false, follow: false },
};

/**
 * Chế độ cán bộ hỗ trợ kê khai.
 *
 * Góp ý: "Làm phần mềm được ko để anh em đi làm cho dân". Không xây app native riêng — cán bộ mở
 * chính PWA này trên điện thoại hoặc máy tính bảng, đăng nhập, rồi nhập hộ.
 *
 * Khác `/ke-khai` đúng ba điểm:
 *   1. bắt buộc đăng nhập (proxy Edge chặn trước, `requireActiveUser` kiểm lại vai trò ở đây);
 *   2. tạo hồ sơ qua `/api/staff/assisted-submissions` để máy chủ gắn nhãn `OFFICER_ASSISTED`;
 *   3. không có Turnstile — phiên đăng nhập + CSRF mạnh hơn hẳn một bài kiểm tra bot.
 *
 * Không đi qua chốt Cloudflare như trang công khai: đây là đường cán bộ, đã có auth thật.
 */
export default async function AssistedIntakePage() {
  // Kiểm lại vai trò tại trang, không chỉ dựa vào proxy Edge: JWT cũ vẫn còn hạn sau khi quản trị
  // viên khóa tài khoản, nên Edge thấy "có session" là chưa đủ.
  const user = await requireActiveUser(SUBMISSION_READ_ROLES);
  const environment = loadPublicIntakeEnvironment();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6">
        <div
          className="rounded-xl border p-4"
          style={{ background: "var(--warning-surface)", borderColor: "var(--warning-border)" }}
        >
          <p
            className="text-sm font-bold tracking-wide uppercase"
            style={{ color: "var(--warning)" }}
          >
            Chế độ cán bộ hỗ trợ kê khai
          </p>
          <p className="mt-1 text-sm">
            Đang đăng nhập: <strong>{user.displayName}</strong>. Hồ sơ tạo ở màn hình này được ghi
            nhận là <strong>cán bộ nhập hộ</strong>.
          </p>
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Kê khai hộ người dân</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Nhập theo giấy tờ hộ dân đưa. Bắt buộc: số điện thoại liên hệ, tên chủ sử dụng, ảnh CCCD
          hai mặt và ít nhất một ảnh Giấy chứng nhận. Các thông tin khác nhập được thì nhập, không
          rõ thì bỏ trống để hoàn thiện sau ở màn hình quản trị.
        </p>
      </header>

      {environment.PUBLIC_INTAKE_MODE === "PAUSED" ? (
        <div
          className="rounded-lg border p-6 text-center"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <h2 className="mb-2 text-xl font-semibold">Tạm dừng tiếp nhận</h2>
          <p style={{ color: "var(--muted)" }}>
            Hệ thống đang tạm dừng tiếp nhận hồ sơ mới. Vui lòng quay lại sau.
          </p>
        </div>
      ) : (
        <AssistedIntakeWizard officerName={user.displayName} />
      )}
    </main>
  );
}

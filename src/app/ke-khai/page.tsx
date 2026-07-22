import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";
import { COVERAGE_NOTICE } from "@/modules/public-intake/support-contacts";

import { IntakeWizard } from "./wizard";

export const metadata: Metadata = {
  title: "Kê khai hồ sơ đất đai",
  description: "Người dân kê khai và nộp giấy tờ đất đai trực tuyến, không cần tài khoản.",
};

export default async function IntakePage() {
  // Trang này cũng phải sau Cloudflare, không riêng API: mở được biểu mẫu ở URL *.vercel.app là
  // mở luôn đường tấn công không qua WAF (PLAN_NL §10.2). 404 để không xác nhận trang có tồn tại.
  const environment = loadPublicIntakeEnvironment();
  if (!isTrustedEdgeRequest(await headers(), environment.ORIGIN_SHARED_SECRET)) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Dải cherry ở đầu trang thay cho một khối màu lớn — màu thương hiệu làm điểm neo thị
          giác, không phủ dày toàn màn hình (DESIGN.md §1.3, §9.1). */}
      <header className="mb-8">
        <div
          aria-hidden="true"
          className="mb-6 h-1 w-16 rounded-full"
          style={{
            background: "linear-gradient(90deg, var(--cherry-700), var(--gold-500))",
          }}
        />
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
        {/* Phạm vi áp dụng nêu ngay đầu trang: người có thửa đất ngoài địa bàn phải biết trước khi
            bỏ công kê khai và tải ảnh, không phải sau khi cán bộ từ chối. */}
        <p
          className="mt-4 rounded-lg border p-3 text-sm"
          style={{
            background: "var(--warning-surface)",
            borderColor: "var(--warning-border)",
          }}
        >
          {COVERAGE_NOTICE}
        </p>
      </header>

      <IntakeWizard />
    </main>
  );
}

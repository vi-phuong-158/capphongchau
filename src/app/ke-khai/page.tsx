import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import logoPhongChau from "@/../public/logo-phongchau.png";
import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";
import { COVERAGE_NOTICE } from "@/modules/public-intake/support-contacts";

import { IntakeWizard } from "./wizard";

export const dynamic = "force-dynamic";

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
      <header className="mb-8">
        <div className="mb-6 flex items-center gap-3">
          <Image
            src={logoPhongChau}
            alt="Logo Phường Phong Châu"
            width={48}
            height={48}
            className="h-12 w-12 object-contain"
          />
          <p className="text-sm font-semibold tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            PHƯỜNG PHONG CHÂU
          </p>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Kê khai hồ sơ đất đai
        </h1>
        <p className="mt-3 text-lg" style={{ color: "var(--muted)" }}>
          Dành cho trường hợp thửa đất đã có Giấy chứng nhận. Bạn không cần tài khoản. Kê khai
          xong sẽ nhận mã tra cứu.
        </p>
        <p className="mt-3">
          Đã có mã tiếp nhận?{" "}
          <a className="font-semibold underline" href="/tra-cuu">
            Tra cứu hoặc tiếp tục hồ sơ
          </a>
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

      {environment.PUBLIC_INTAKE_MODE === "PAUSED" ? (
        <div
          className="mt-6 rounded-lg border p-6 text-center"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
          }}
        >
          <h2 className="text-xl font-semibold mb-2">Tạm dừng tiếp nhận</h2>
          <p style={{ color: "var(--muted)" }}>
            Hệ thống hiện đang tạm dừng tiếp nhận hồ sơ mới để bảo trì hoặc xử lý dữ liệu. Vui lòng quay lại sau.
          </p>
        </div>
      ) : (
        <IntakeWizard />
      )}
    </main>
  );
}

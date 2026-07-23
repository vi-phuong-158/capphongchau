import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";

import { PublicLookup } from "./public-lookup";

export const metadata: Metadata = {
  title: "Tra cứu hồ sơ đất đai",
  description: "Tra cứu hồ sơ đã nộp bằng mã tiếp nhận và mã bí mật.",
};

export default async function LookupPage() {
  const environment = loadPublicIntakeEnvironment();
  if (!isTrustedEdgeRequest(await headers(), environment.ORIGIN_SHARED_SECRET)) notFound();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="text-sm font-semibold tracking-[0.16em]" style={{ color: "var(--accent)" }}>
          PHƯỜNG PHONG CHÂU
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Tra cứu / tiếp tục hồ sơ</h1>
        <p className="mt-3" style={{ color: "var(--muted)" }}>
          Dùng mã tiếp nhận và mã bí mật đã được cấp khi bắt đầu kê khai.
        </p>
      </header>
      <PublicLookup />
    </main>
  );
}

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import logoPhongChau from "@/../public/logo-phongchau.png";
import { loadPublicIntakeEnvironment } from "@/modules/common/env";
import { isTrustedEdgeRequest } from "@/modules/public-intake/edge-guard";

import { PublicLookup } from "./public-lookup";

export const dynamic = "force-dynamic";

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
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Tra cứu / tiếp tục hồ sơ</h1>
        <p className="mt-3" style={{ color: "var(--muted)" }}>
          Dùng mã tiếp nhận và mã bí mật đã được cấp khi bắt đầu kê khai.
        </p>
        <p className="mt-3">
          <Link href="/" className="text-sm underline" style={{ color: "var(--accent)" }}>
            Quay lại trang chủ
          </Link>
        </p>
      </header>
      <PublicLookup />
    </main>
  );
}

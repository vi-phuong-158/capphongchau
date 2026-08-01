import Image from "next/image";
import Link from "next/link";

import logoPhongChau from "@/../public/logo-phongchau.png";
import { signIn } from "@/auth";
import { appMetadata } from "@/lib/app-metadata";
import { CertificateLookup } from "@/components/certificate-lookup";
import { PwaInstallButton } from "@/components/pwa-install-button";

export default function HomePage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const rawCallback = searchParams?.callbackUrl;
  const callbackUrl = (typeof rawCallback === "string" && rawCallback.startsWith("/")) ? rawCallback : "/admin/dashboard";
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-16 sm:py-24">
      <section className="w-full space-y-12 text-center pc-fade-in">
        <div className="flex flex-col items-center justify-center gap-4">
          <Image
            src={logoPhongChau}
            alt="Biểu trưng Phường Phong Châu"
            width={112}
            height={112}
            priority
            className="h-24 w-24 sm:h-28 sm:w-28 object-contain drop-shadow-sm"
          />
          <div className="space-y-1">
            <p
              className="text-xs sm:text-sm font-bold tracking-[0.2em] uppercase"
              style={{ color: "var(--accent)" }}
            >
              Phường Phong Châu
            </p>
            <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl leading-tight">
              CSDL Đất đai
            </h1>
          </div>
          <p
            className="max-w-lg mx-auto text-base sm:text-lg mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            {appMetadata.description}
          </p>
        </div>

        <div className="space-y-8 text-left">
          <div
            className="pc-card flex flex-col gap-6 p-8 sm:p-10 shadow-md relative overflow-hidden"
            style={{ borderTop: "4px solid var(--cherry-600)", background: "var(--surface)" }}
          >
            <div className="space-y-2 text-center">
              <span
                className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-2"
                style={{ background: "var(--cherry-50)", color: "var(--cherry-700)" }}
              >
                Dành cho công dân
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold">Kê khai trực tuyến</h2>
              <p
                className="text-sm sm:text-base max-w-md mx-auto"
                style={{ color: "var(--text-secondary)" }}
              >
                Thực hiện nộp hồ sơ, giấy chứng nhận trực tuyến nhanh chóng. Không yêu cầu đăng ký
                tài khoản.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <Link
                href="/ke-khai"
                className="pc-button-gold w-full sm:w-auto text-base sm:text-lg px-8 py-3 shadow-sm no-underline"
              >
                Bắt đầu kê khai
              </Link>
              <Link
                href="/tra-cuu"
                className="pc-button-quiet w-full sm:w-auto text-base px-6 py-3 no-underline"
              >
                Tra cứu kết quả
              </Link>
            </div>
            <PwaInstallButton />
          </div>

          <div className="text-left">
            <CertificateLookup />
          </div>
        </div>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div
              className="w-full border-t border-dashed"
              style={{ borderColor: "var(--border-strong)" }}
            ></div>
          </div>
        </div>

        <div className="mx-auto max-w-sm">
          <div className="flex flex-col items-center gap-3 text-center opacity-80 hover:opacity-100 transition-opacity">
            <div className="space-y-1">
              <h2
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-muted)" }}
              >
                Khu vực nội bộ
              </h2>
            </div>
            <form
              action={async (formData: FormData) => {
                "use server";
                const cb = formData.get("callbackUrl");
                const safeCb = (typeof cb === "string" && cb.startsWith("/")) ? cb : "/admin/dashboard";
                await signIn("google", { redirectTo: safeCb });
              }}
              className="w-full"
            >
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <button
                className="pc-button-quiet w-full text-sm py-2"
                style={{
                  color: "var(--text-secondary)",
                  borderColor: "transparent",
                  backgroundColor: "var(--neutral-soft)",
                }}
                type="submit"
              >
                Đăng nhập dành cho cán bộ
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}

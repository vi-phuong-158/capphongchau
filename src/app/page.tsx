import Image from "next/image";
import Link from "next/link";

import logoPhongChau from "@/../public/logo-phongchau.png";
import { signIn } from "@/auth";
import { appMetadata } from "@/lib/app-metadata";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full space-y-8 text-center">
        <div className="flex flex-col items-center justify-center gap-3">
          <Image
            src={logoPhongChau}
            alt="Biểu trưng Phường Phong Châu"
            width={96}
            height={96}
            priority
            className="h-20 w-20 sm:h-24 sm:w-24 object-contain"
          />
          <p className="text-sm font-semibold tracking-[0.16em]" style={{ color: "var(--accent)" }}>
            PHƯỜNG PHONG CHÂU
          </p>
        </div>

        <div className="flex flex-col items-center space-y-3">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            {appMetadata.name}
          </h1>
          <p className="max-w-xl text-lg" style={{ color: "var(--muted)" }}>
            {appMetadata.description}
          </p>
        </div>

        {/* Hai đường đi tách bạch: người dân không được hiểu nhầm là phải đăng nhập. */}
        <div className="grid gap-6 text-left sm:grid-cols-2">
          <div
            className="pc-card flex flex-col gap-4 shadow-sm"
            style={{ borderTop: "4px solid var(--gold-500)" }}
          >
            <div className="space-y-1">
              <span
                className="inline-block text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                style={{ background: "var(--gold-100)", color: "var(--gold-900)" }}
              >
                Dành cho công dân
              </span>
              <h2 className="text-xl font-bold">Người dân</h2>
            </div>
            <p className="flex-1 text-sm sm:text-base" style={{ color: "var(--muted)" }}>
              Kê khai hồ sơ đất đai và nộp ảnh giấy tờ trực tuyến. Không cần tài khoản.
            </p>
            <div className="space-y-3 pt-2">
              <Link
                href="/ke-khai"
                className="pc-button flex w-full items-center justify-center no-underline"
              >
                Kê khai hồ sơ
              </Link>
              <div className="text-center">
                <Link
                  href="/tra-cuu"
                  className="text-sm font-medium no-underline hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Tra cứu hồ sơ đã nộp
                </Link>
              </div>
            </div>
          </div>

          <div className="pc-card flex flex-col justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-lg font-bold">Cán bộ</h2>
              <p className="text-sm sm:text-base" style={{ color: "var(--muted)" }}>
                Tiếp nhận, kiểm tra và duyệt hồ sơ. Chỉ dành cho email đã được quản trị viên cho phép.
              </p>
            </div>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/profile" });
              }}
            >
              <button className="pc-button-quiet w-full" type="submit">
                Đăng nhập bằng Google
              </button>
            </form>
          </div>
        </div>

        <p
          className="pc-card text-sm text-center sm:text-left"
          style={{ background: "var(--warning-surface)", borderColor: "var(--warning-border)" }}
        >
          Bản thử nghiệm chỉ hoạt động khi có kết nối mạng.
        </p>
      </section>
    </main>
  );
}

import Link from "next/link";

import { signIn } from "@/auth";
import { appMetadata } from "@/lib/app-metadata";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full space-y-6">
        <div
          aria-hidden="true"
          className="h-1 w-16 rounded-full"
          style={{ background: "linear-gradient(90deg, var(--cherry-700), var(--gold-500))" }}
        />
        <p className="text-sm font-semibold tracking-[0.16em]" style={{ color: "var(--accent)" }}>
          PHƯỜNG PHONG CHÂU
        </p>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          {appMetadata.name}
        </h1>
        <p className="max-w-xl text-lg" style={{ color: "var(--muted)" }}>
          {appMetadata.description}
        </p>

        {/* Hai đường đi tách bạch: người dân không được hiểu nhầm là phải đăng nhập. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="pc-card flex flex-col gap-3">
            <h2 className="text-lg font-bold">Người dân</h2>
            <p className="flex-1" style={{ color: "var(--muted)" }}>
              Kê khai hồ sơ đất đai và nộp ảnh giấy tờ trực tuyến. Không cần tài khoản.
            </p>
            <Link
              href="/ke-khai"
              className="pc-button inline-flex items-center justify-center no-underline"
            >
              Kê khai hồ sơ
            </Link>
          </div>

          <div className="pc-card flex flex-col gap-3">
            <h2 className="text-lg font-bold">Cán bộ</h2>
            <p className="flex-1" style={{ color: "var(--muted)" }}>
              Tiếp nhận, kiểm tra và duyệt hồ sơ. Chỉ dành cho email đã được quản trị viên cho phép.
            </p>
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
          className="pc-card text-sm"
          style={{ background: "var(--warning-surface)", borderColor: "var(--warning-border)" }}
        >
          Bản thử nghiệm chỉ hoạt động khi có kết nối mạng.
        </p>
      </section>
    </main>
  );
}

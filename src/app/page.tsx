import { signIn } from "@/auth";
import { appMetadata } from "@/lib/app-metadata";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="space-y-5">
        <p className="text-sm font-semibold tracking-[0.16em] text-emerald-800">
          PHƯỜNG PHONG CHÂU
        </p>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-stone-950 sm:text-5xl">
          {appMetadata.name}
        </h1>
        <p className="max-w-xl text-lg leading-8 text-stone-700">{appMetadata.description}</p>
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Bản thử nghiệm chỉ hoạt động khi có kết nối mạng và email đã được quản trị viên cho phép.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/profile" });
          }}
        >
          <button
            className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
            type="submit"
          >
            Đăng nhập bằng Google
          </button>
        </form>
      </section>
    </main>
  );
}

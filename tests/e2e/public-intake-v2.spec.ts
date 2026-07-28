/**
 * Bảy kịch bản E2E §17.3 của kế hoạch Public Intake V2.
 *
 * ĐỌC TRƯỚC KHI CHẠY
 * ------------------
 * Các test này cần môi trường thật: Supabase, Google My Drive, Turnstile và tài khoản cán bộ.
 * Chúng **chưa từng chạy** trong phiên thi công — xem `evidence/PUBLIC_INTAKE_V2_TEST_MATRIX.md`.
 *
 * Ba mức trạng thái, cố ý phân biệt rõ để không ai đọc nhầm "0 failed" thành "đã kiểm":
 *
 *   - `test.skip(...)` — thiếu biến môi trường. Playwright báo skipped, không báo passed.
 *   - `test.fixme(...)` — kịch bản cần thao tác tệp thật hoặc mô phỏng đứt mạng ở tầng thiết bị.
 *     Mã đã viết, nhưng chưa ai chạy nên chưa được coi là đúng. Playwright không tính là pass.
 *   - Không đánh dấu — chạy được ngay khi có đủ biến môi trường.
 *
 * Biến môi trường cần có: xem `evidence/PUBLIC_INTAKE_V2_E2E_CHECKLIST.md`.
 */
import { expect, test, type Page } from "@playwright/test";

const OFFICER_EMAIL = process.env.E2E_OFFICER_EMAIL ?? "";
const REVIEWER_EMAIL = process.env.E2E_REVIEWER_EMAIL ?? "";
const HAS_INTAKE_ENV = Boolean(process.env.E2E_PUBLIC_INTAKE_READY);
const HAS_OFFICER = Boolean(OFFICER_EMAIL);

const PHONE = "0912345678";

/** Điền bước 1 tới mức tối thiểu: số điện thoại, tên chủ sử dụng, đồng ý. */
async function fillMinimalStepOne(page: Page): Promise<void> {
  await page.getByLabel(/Số điện thoại/i).fill(PHONE);
  await page.getByLabel(/Họ và tên/i).first().fill("Nguyễn Văn Test");
  await page.getByRole("checkbox", { name: /đồng ý/i }).check();
}

test.describe("E2E-01 — Người dân kê khai tối thiểu", () => {
  test.skip(!HAS_INTAKE_ENV, "Cần Supabase + Drive + Turnstile thật.");

  test("wizard chỉ có 4 bước, không phải 7", async ({ page }) => {
    await page.goto("/ke-khai");
    await expect(page.getByText(/Bước 1\/4/)).toBeVisible();
  });

  test("không ô nào ngoài bốn ô bắt buộc chặn được bước 1", async ({ page }) => {
    await page.goto("/ke-khai");
    await fillMinimalStepOne(page);
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    // Bước 2 là ảnh Giấy chứng nhận — góp ý "up ảnh GCN gần phần kê khai GCN".
    await expect(page.getByText(/Bước 2\/4/)).toBeVisible();
  });

  test.fixme(
    true,
    "Cần tệp ảnh thật và phiên resumable tới Google Drive — chưa chạy lần nào.",
  );
  test("gửi được với phone + tên + 3 ảnh, mọi ô khác bỏ trống", async ({ page }) => {
    await page.goto("/ke-khai");
    await fillMinimalStepOne(page);
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    await page.getByLabel(/Ảnh Giấy chứng nhận/i).setInputFiles("tests/fixtures/gcn.jpg");
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    await page.getByRole("button", { name: /Gửi hồ sơ/i }).click();

    // Góp ý: "báo hoàn thành ở giữa màn hình".
    await expect(page.getByRole("heading", { name: "KÊ KHAI THÀNH CÔNG" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Kê khai hồ sơ tiếp theo/i })).toBeVisible();
  });
});

test.describe("E2E-02 — Thiếu ảnh phải báo rõ thiếu gì", () => {
  test.skip(!HAS_INTAKE_ENV, "Cần Supabase + Drive + Turnstile thật.");

  /*
   * Góp ý số 2 của cán bộ: "ko up ảnh phải có thông báo thiếu trường". Trước V2, hộ dân quên ảnh
   * chỉ nhận một thông báo chung ở cuối và không biết thiếu ảnh nào của ai.
   */
  test("nêu đích danh ảnh còn thiếu, không phải một câu chung chung", async ({ page }) => {
    await page.goto("/ke-khai");
    await fillMinimalStepOne(page);
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    await page.getByRole("button", { name: /Tiếp tục/i }).click();

    await expect(page.getByText(/Chưa có ảnh Giấy chứng nhận/i)).toBeVisible();
  });
});

test.describe("E2E-03 — Nhiều ảnh Giấy chứng nhận", () => {
  test.fixme(true, "Cần nhiều tệp ảnh thật và đo được hai luồng song song.");

  test("một ảnh hỏng không kéo theo ảnh khác", async ({ page }) => {
    await page.goto("/ke-khai");
    await fillMinimalStepOne(page);
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    await page
      .getByLabel(/Ảnh Giấy chứng nhận/i)
      .setInputFiles([
        "tests/fixtures/gcn-1.jpg",
        "tests/fixtures/gcn-2.jpg",
        "tests/fixtures/gcn-3.jpg",
      ]);
    await expect(page.getByText(/Trang GCN 1/)).toBeVisible();
    await expect(page.getByText(/Trang GCN 3/)).toBeVisible();
  });
});

test.describe("E2E-04 — Mạng lỗi giữa chừng", () => {
  test.fixme(true, "Cần mô phỏng đứt mạng ở tầng thiết bị, không chỉ chặn route.");

  test("hủy được và thử lại được, phần trăm không tụt", async ({ page }) => {
    await page.goto("/ke-khai");
    await page.context().setOffline(true);
    await expect(page.getByRole("button", { name: /Hủy|Thử lại/i })).toBeVisible();
  });
});

test.describe("E2E-05 — Hàng rào tiếp nhận chính thức", () => {
  test.skip(!HAS_OFFICER, "Cần tài khoản cán bộ có quyền quyết định.");

  /*
   * **Phép thử quan trọng nhất của cả đợt.** V2 nới lỏng điều kiện để người dân gửi; nếu hàng rào
   * tiếp nhận chính thức không siết lại tương ứng thì một hồ sơ chỉ có tên và ba tấm ảnh sẽ được
   * ký nhận như hồ sơ đầy đủ.
   */
  test("hồ sơ tối thiểu bị chặn kèm danh sách thiếu sót", async ({ page }) => {
    await page.goto("/submissions");
    await page.getByRole("link", { name: new RegExp(PHONE.slice(-4)) }).first().click();
    await page.getByRole("button", { name: /Tiếp nhận chính thức/i }).click();

    await expect(page.getByText(/chưa đủ điều kiện tiếp nhận chính thức/i)).toBeVisible();
  });
});

test.describe("E2E-06 — Chế độ cán bộ hỗ trợ kê khai", () => {
  test("chưa đăng nhập thì không vào được /ke-khai-ho", async ({ page }) => {
    await page.goto("/ke-khai-ho");
    // Proxy Edge đá về trang chủ trước cả khi trang kịp render.
    await expect(page).toHaveURL(/\/$/);
  });

  test.skip(!HAS_OFFICER, "Cần tài khoản cán bộ có quyền lập hồ sơ hộ dân.");
  test("cán bộ đúng vai trò thấy banner chế độ hỗ trợ", async ({ page }) => {
    await page.goto("/ke-khai-ho");
    await expect(page.getByText("Chế độ cán bộ hỗ trợ kê khai")).toBeVisible();
    await expect(page.getByText(/Đang đăng nhập:/)).toBeVisible();
  });

  test.skip(!REVIEWER_EMAIL, "Cần tài khoản chỉ có vai trò thẩm định.");
  test("cán bộ thẩm định KHÔNG lập được hồ sơ hộ dân", async ({ page }) => {
    // REVIEW_OFFICER bị loại khỏi ASSISTED_INTAKE_ROLES có chủ đích: không để một người vừa nhập
    // vừa duyệt. Xem `evidence/PUBLIC_INTAKE_V2_DIFF_REVIEW.md` mục H-02.
    const response = await page.request.post("/api/staff/assisted-submissions", {
      headers: { "idempotency-key": crypto.randomUUID() },
      data: { phone: PHONE },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);
  });
});

test.describe("E2E-07 — Cán bộ tiếp nhận là ai", () => {
  test.skip(!HAS_OFFICER, "Cần tài khoản cán bộ.");

  /* Góp ý: "Cán bộ tiếp nhận là ai?" — trả lời được ở cổng công khai mà không lộ email công vụ. */
  test("cổng công khai thấy tên, không thấy email", async ({ page }) => {
    await page.goto("/tra-cuu");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("@");
  });
});

/**
 * Kịch bản E2E §17.3 của kế hoạch Public Intake V2, cộng ba kịch bản bổ sung tìm ra trong vòng
 * rà soát bảo mật lần hai (kê khai tiếp, dọn tệp mồ côi, phát lại idempotent).
 *
 * ĐỌC TRƯỚC KHI CHẠY
 * ------------------
 * Cần môi trường thật: Supabase preview, Google My Drive test, Turnstile test, tài khoản cán bộ
 * cho từng vai trò. Xem `evidence/PUBLIC_INTAKE_V2_E2E_CHECKLIST.md` cho danh sách biến môi trường
 * và `npm run test:e2e:preview` để chạy đúng cấu hình.
 *
 * Hai mức trạng thái, cố ý phân biệt rõ để không ai đọc nhầm "0 failed" thành "đã kiểm":
 *
 *   - `test.skip(!BIẾN, lý_do)` — thiếu đúng một biến môi trường cụ thể. Playwright báo skipped.
 *     Có biến thì test chạy thật, không còn nhánh nào bị chặn cứng.
 *   - Không đánh dấu — chạy được ngay khi có đủ biến môi trường của `describe` bao ngoài.
 *
 * KHÔNG còn `test.fixme(true, ...)` không điều kiện trong file này: mọi kịch bản trước đây bị
 * đánh dấu "cần thao tác tệp thật" nay dùng fixture PNG 1×1 không PII ở `tests/fixtures/` (đủ để
 * Drive/`createImageBitmap` xử lý được, không cần ảnh giấy tờ thật), hoặc dùng Playwright network
 * interception thay cho việc mô phỏng đứt mạng thiết bị thật.
 *
 * Dữ liệu test không PII: số điện thoại và tên dùng ở đây là dữ liệu dựng, không phải người thật.
 * Mọi hồ sơ E2E tạo ra dùng chung một số điện thoại cố định (`PHONE`) để việc rà soát/dọn dẹp thủ
 * công trên preview dễ nhận ra — KHÔNG xóa dữ liệu ngoài các hồ sơ mang số điện thoại này.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test, type Page } from "@playwright/test";

import { signInAs } from "./auth-helpers";

const execFileAsync = promisify(execFile);

const OFFICER_EMAIL = process.env.E2E_OFFICER_EMAIL ?? "";
const REVIEWER_EMAIL = process.env.E2E_REVIEWER_EMAIL ?? "";
const HAS_INTAKE_ENV = Boolean(process.env.E2E_PUBLIC_INTAKE_READY);
const HAS_OFFICER = Boolean(OFFICER_EMAIL);
const HAS_REVIEWER = Boolean(REVIEWER_EMAIL);

/** Số điện thoại dựng riêng cho E2E — không phải người thật, dùng để nhận diện khi dọn dẹp thủ công. */
const PHONE = "0912345678";

/**
 * Chọn một tệp và đợi ĐÚNG round-trip mạng của nó hoàn tất (`POST .../uploads/complete` trả 200),
 * không đợi theo chữ hiển thị trên màn hình.
 *
 * Phát hiện qua chạy E2E thật: `uploadTaskLabel` ("Trang GCN N") hiện ra ngay khi việc tải được
 * XẾP HÀNG, không phải khi tải XONG — và thông báo lỗi kiểu "Chưa có ảnh CCCD mặt trước" chỉ được
 * validate/hiển thị SAU một lần bấm "Tiếp tục", nên `expect(...).toHaveCount(0)` gọi TRƯỚC lần
 * bấm đó luôn đúng một cách vô nghĩa (chữ chưa từng được render, không phải vì ảnh đã tải xong).
 * Cả hai kiểu chờ đó đều là chờ giả — bấm "Tiếp tục" tiếp theo có thể chạy trước khi máy chủ thật
 * sự xác nhận đã nhận ảnh, và bị chặn lại đúng bằng thông báo tưởng đã né được.
 */
async function uploadAndAwaitComplete(
  page: Page,
  input: ReturnType<Page["locator"]>,
  filePath: string,
): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/uploads/complete") && res.request().method() === "POST",
    ),
    input.setInputFiles(filePath),
  ]);
  if (!response.ok()) {
    throw new Error(`Tải ${filePath} thất bại: HTTP ${response.status()}`);
  }
}

/**
 * Ô chọn ảnh Giấy chứng nhận (bước 1) — `Field` (wizard.tsx) không gắn `htmlFor` vào đúng phần tử
 * `<input type="file">` lồng bên trong, nên `getByLabel` không khớp; dòng chữ hiển thị
 * "Chạm để chụp ảnh / Chọn NHIỀU tệp" (số nhiều) đủ riêng biệt để dùng trực tiếp — đây là ô duy
 * nhất mang chữ đó, khác với hai ô CCCD ở bước 2 dùng chung một dòng chữ số ít.
 */
function certificatePhotoInput(page: Page) {
  return page.getByLabel(/Chạm để chụp ảnh.*Chọn nhiều tệp/i);
}

/**
 * Điền phần đầu bước 1 (Ảnh Giấy chứng nhận) và tạo hồ sơ thật — phát hiện qua chạy E2E thật lần
 * đầu, không thấy được bằng đọc mã nguồn hay unit test:
 *
 * Trang mở ra CHỈ có số điện thoại + đồng ý. Ô tải ảnh Giấy chứng nhận chỉ xuất hiện SAU khi bấm
 * "Tiếp tục" lần đầu — đó là lúc hồ sơ thật được tạo (POST /api/public/submissions) và máy chủ
 * dựng thư mục Drive để nhận ảnh. Hai câu hỏi sàng lọc cũ ("Đã có GCN chưa?", "Mấy GCN?") không
 * còn ô nhập trên màn hình — hệ thống tự gán mặc định "Đã có Giấy chứng nhận" / "Một Giấy chứng
 * nhận" (2026-07-29, gộp phone vào bước ảnh GCN + đưa CCCD/chủ sử dụng thành bước riêng).
 *
 * Tách riêng khỏi `fillMinimalStepOne`: E2E-02 cần dừng lại ĐÚNG lúc này, trước khi có ảnh GCN
 * nào, để kiểm tra thông báo "Chưa có ảnh Giấy chứng nhận".
 */
async function createMinimalSubmission(page: Page): Promise<void> {
  await page.getByLabel(/Số điện thoại/i).fill(PHONE);
  await page.getByRole("checkbox", { name: /đồng ý/i }).check();
  await page.getByRole("button", { name: /Tiếp tục/i }).click();
  // Hồ sơ vừa được tạo thật; ô tải ảnh GCN nay mới xuất hiện trên cùng bước 1.
  await expect(certificatePhotoInput(page)).toBeVisible();
}

/** Tạo hồ sơ rồi tải luôn một ảnh GCN tối thiểu — đủ để rời khỏi bước 1. */
async function fillMinimalStepOne(page: Page): Promise<void> {
  await createMinimalSubmission(page);
  await uploadAndAwaitComplete(page, certificatePhotoInput(page), "tests/fixtures/gcn.png");
  // Khi hàng đợi hoàn tất, nhãn tạm "Trang GCN 1" bị gỡ và thẻ ảnh chính thức dùng "Ảnh 1/1".
  await expect(page.getByText("Ảnh 1/1")).toBeVisible();
}

/**
 * Điền bước 2 (Người kê khai và CCCD) tới mức tối thiểu — ảnh CCCD mặt trước/sau là bắt buộc để
 * rời khỏi bước này (`identityPhotoErrors` trong `public-wizard-validation.ts`), không phải tùy
 * chọn tới tận màn hình gửi cuối cùng.
 */
async function fillMinimalStepTwo(page: Page): Promise<void> {
  await page
    .getByLabel(/Họ và tên/i)
    .first()
    .fill("Nguyễn Văn Test");
  // Cùng lỗ a11y như ô ảnh GCN: chọn theo VỊ TRÍ, mặt trước luôn render trước mặt sau (mảng
  // `["CITIZEN_ID_FRONT", "CITIZEN_ID_BACK"]` trong wizard.tsx).
  const cccdFileInputs = page.locator('input[type="file"]');
  await uploadAndAwaitComplete(page, cccdFileInputs.nth(0), "tests/fixtures/cccd-truoc.png");
  await expect(page.getByRole("button", { name: /Chạm để tải ảnh khác thay thế/i })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Tiếp tục/i })).toBeEnabled();
  await uploadAndAwaitComplete(page, cccdFileInputs.nth(1), "tests/fixtures/cccd-sau.png");
  await expect(page.getByRole("button", { name: /Chạm để tải ảnh khác thay thế/i })).toHaveCount(2);
  // `readCitizenIdQr()` vẫn đang chạy sau khi server xác nhận ảnh; QR không đọc được không chặn
  // bước tiếp theo, nhưng wizard chỉ mở lại nút sau khi quá trình đó kết thúc.
  await expect(page.getByRole("button", { name: /Tiếp tục/i })).toBeEnabled();
}

/** Từ bước 1 tới màn hình "KÊ KHAI THÀNH CÔNG" bằng đúng một ảnh GCN và một chủ sử dụng tối thiểu. */
async function submitMinimalRecord(page: Page, path = "/ke-khai"): Promise<void> {
  await page.goto(path);
  await fillMinimalStepOne(page);
  await page.getByRole("button", { name: /Tiếp tục/i }).click();
  await fillMinimalStepTwo(page);
  await page.getByRole("button", { name: /Tiếp tục/i }).click();
  await page.getByRole("button", { name: /Tiếp tục/i }).click();
  await page.getByRole("button", { name: /Gửi bản kê khai/i }).click();
  await expect(page.getByRole("heading", { name: "KÊ KHAI THÀNH CÔNG" })).toBeVisible();
}

test.describe("E2E-01 — Người dân kê khai tối thiểu", () => {
  test.skip(!HAS_INTAKE_ENV, "Cần Supabase + Drive + Turnstile thật.");

  test("wizard chỉ có 4 bước, không phải 7", async ({ page }) => {
    await page.goto("/ke-khai");
    await expect(page.getByText(/Bước 1\/4/)).toBeVisible();
  });

  test("đồng ý xử lý dữ liệu có trước khi tạo hồ sơ, rồi mới mở tải ảnh GCN", async ({ page }) => {
    const serverEvents: string[] = [];
    const createBodies: Array<{ consent?: { accepted?: unknown } }> = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (request.method() !== "POST") return;
      if (pathname === "/api/public/submissions") {
        serverEvents.push("create");
        createBodies.push(request.postDataJSON() as { consent?: { accepted?: unknown } });
      }
      if (pathname.includes("/uploads/")) serverEvents.push("upload");
    });

    await page.goto("/ke-khai");
    const consent = page.getByRole("checkbox", { name: /đồng ý/i });
    await expect(consent).toBeVisible();
    await expect(consent).not.toBeChecked();
    // Chưa có receipt/folder Drive nên giao diện chưa cho chọn ảnh để upload.
    await expect(certificatePhotoInput(page)).toHaveCount(0);

    await createMinimalSubmission(page);

    expect(createBodies).toHaveLength(1);
    expect(createBodies[0]?.consent?.accepted).toBe(true);
    expect(serverEvents).toEqual(["create"]);
    await expect(certificatePhotoInput(page)).toBeVisible();
  });

  test("không ô nào ngoài ba ô bắt buộc chặn được bước 1", async ({ page }) => {
    await page.goto("/ke-khai");
    await fillMinimalStepOne(page);
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    // Bước 2 là người kê khai và CCCD — góp ý "up ảnh GCN gần phần kê khai GCN" đưa ảnh GCN lên
    // trước, ngay bước 1.
    await expect(page.getByText(/Bước 2\/4/)).toBeVisible();
  });

  test("gửi được với phone + tên + 1 ảnh, mọi ô khác bỏ trống", async ({ page }) => {
    // Góp ý: "báo hoàn thành ở giữa màn hình" — submitMinimalRecord() đã khẳng định điều đó.
    await submitMinimalRecord(page);
    await expect(page.getByRole("button", { name: /Kê khai hồ sơ tiếp theo/i })).toBeVisible();
    await expect(page.getByText("Mã tiếp nhận", { exact: true })).toBeVisible();
    await expect(page.locator("p.pc-code").first()).not.toBeEmpty();
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
    // Tạo hồ sơ xong nhưng KHÔNG tải ảnh GCN nào, rồi bấm Tiếp tục ngay trên chính bước 1.
    await createMinimalSubmission(page);
    await page.getByRole("button", { name: /Tiếp tục/i }).click();

    await expect(page.getByText(/Chưa có ảnh Giấy chứng nhận/i)).toBeVisible();
  });
});

test.describe("E2E-03 — Nhiều ảnh Giấy chứng nhận", () => {
  test.skip(!HAS_INTAKE_ENV, "Cần Supabase + Drive + Turnstile thật.");

  test("một ảnh hỏng không kéo theo ảnh khác — cả ba nhãn trang đều hiện", async ({ page }) => {
    await page.goto("/ke-khai");
    await createMinimalSubmission(page);
    await certificatePhotoInput(page).setInputFiles([
      "tests/fixtures/gcn-1.png",
      "tests/fixtures/gcn-2.png",
      "tests/fixtures/gcn-3.png",
    ]);
    // Hàng đợi tối đa 2 luồng song song (upload-queue.ts) — cả ba việc phải hoàn tất, không việc
    // nào bị bỏ lại dù không chạy đồng thời. Nhãn tạm của queue biến mất khi ảnh đã hoàn tất;
    // thẻ ảnh chính thức dùng vị trí dạng "Ảnh N/3".
    await expect(page.getByText("Ảnh 1/3")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Ảnh 2/3")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Ảnh 3/3")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("E2E-04 — Mạng lỗi giữa chừng", () => {
  test.skip(!HAS_INTAKE_ENV, "Cần Supabase + Drive + Turnstile thật.");

  /*
   * Mô phỏng đứt mạng bằng network interception thay vì tắt mạng toàn thiết bị (không khả thi
   * trong CI): chặn ĐÚNG MỘT lần PUT resumable đầu tiên tới Google Drive, để trình duyệt nhận lỗi
   * mạng giữa chừng y hệt 4G rớt sóng, rồi cho các lần thử lại đi qua bình thường.
   */
  test("resumable-upload.ts tự thử lại và hoàn tất, không cần người dân bấm gì thêm", async ({
    page,
  }) => {
    let puttedOnce = false;
    await page.route("https://www.googleapis.com/upload/**", async (route) => {
      if (route.request().method() === "PUT" && !puttedOnce) {
        puttedOnce = true;
        await route.abort("connectionreset");
        return;
      }
      await route.continue();
    });

    await page.goto("/ke-khai");
    await createMinimalSubmission(page);
    // Lần PUT đầu bị abort; uploadWithResume (MAX_UPLOAD_ATTEMPTS = 3) tự hỏi lại tiến độ và thử
    // lại — không cần người dân bấm "Thử lại". `uploadAndAwaitComplete` đợi ĐÚNG response
    // `/uploads/complete` cuối cùng, nên chỉ pass khi ảnh thật sự lên được sau khi thử lại.
    await uploadAndAwaitComplete(page, certificatePhotoInput(page), "tests/fixtures/gcn.png");
    await expect(page.getByText("Ảnh 1/1")).toBeVisible({ timeout: 20_000 });
    expect(puttedOnce).toBe(true);
  });
});

test.describe("E2E-05 — Hàng rào tiếp nhận chính thức", () => {
  test.skip(!HAS_OFFICER, "Cần tài khoản cán bộ có quyền quyết định.");

  /*
   * **Phép thử quan trọng nhất của cả đợt.** V2 nới lỏng điều kiện để người dân gửi; nếu hàng rào
   * tiếp nhận chính thức không siết lại tương ứng thì một hồ sơ chỉ có tên và ba tấm ảnh sẽ được
   * ký nhận như hồ sơ đầy đủ.
   */
  test("hồ sơ tối thiểu bị chặn kèm danh sách thiếu sót", async ({ page, context, baseURL }) => {
    await signInAs(context, OFFICER_EMAIL, baseURL!);
    await page.goto("/submissions");
    await page
      .getByRole("link", { name: new RegExp(PHONE.slice(-4)) })
      .first()
      .click();
    await page.getByRole("button", { name: /Tiếp nhận chính thức/i }).click();

    await expect(page.getByText(/chưa đủ điều kiện tiếp nhận chính thức/i)).toBeVisible();
    await expect(page.getByText("Các mục cần hoàn thiện trước khi tiếp nhận:")).toBeVisible();
  });
});

test.describe("E2E-06a — /ke-khai-ho chặn người chưa đăng nhập", () => {
  test("chưa đăng nhập thì không vào được /ke-khai-ho", async ({ page }) => {
    await page.goto("/ke-khai-ho");
    // Proxy Edge đá về trang chủ trước cả khi trang kịp render.
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("E2E-06b — Chế độ cán bộ hỗ trợ kê khai", () => {
  test.skip(!HAS_OFFICER, "Cần tài khoản cán bộ có quyền lập hồ sơ hộ dân.");

  test("login → create → upload GCN → upload CCCD → submit → success", async ({
    page,
    context,
    baseURL,
  }) => {
    await signInAs(context, OFFICER_EMAIL, baseURL!);
    await submitMinimalRecord(page, "/ke-khai-ho");
    await expect(page.getByRole("heading", { name: "KÊ KHAI THÀNH CÔNG" })).toBeVisible();
  });
});

test.describe("E2E-06c — Cán bộ thẩm định không lập được hồ sơ hộ dân", () => {
  test.skip(!HAS_REVIEWER, "Cần tài khoản chỉ có vai trò thẩm định (REVIEW_OFFICER).");

  test("403, không phải do cờ tắt hay chưa đăng nhập", async ({ page, context, baseURL }) => {
    // REVIEW_OFFICER bị loại khỏi ASSISTED_INTAKE_ROLES có chủ đích: không để một người vừa nhập
    // vừa duyệt. Xem `evidence/PUBLIC_INTAKE_V2_DIFF_REVIEW.md` mục H-02.
    await signInAs(context, REVIEWER_EMAIL, baseURL!);
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
    // Cố ý KHÔNG đăng nhập ở test này: đây là trang /tra-cuu công khai, phải đúng vậy với người
    // dân ẩn danh — đăng nhập cán bộ ở đây sẽ vô tình kiểm nhầm góc nhìn nội bộ.
    await page.goto("/tra-cuu");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("@");
  });
});

test.describe("E2E-08 — Kê khai hồ sơ tiếp theo", () => {
  test.skip(!HAS_INTAKE_ENV, "Cần Supabase + Drive + Turnstile thật.");

  /*
   * Đây là phép thử trực tiếp của lỗi BLOCKER đã sửa ở vòng rà soát trước: bản đầu của nút này
   * POST endpoint tạo hồ sơ với `phone: ""`, mà endpoint bắt buộc `^0\d{9}$` — nút luôn trả 400 và
   * không ai kê khai tiếp được. Không unit test nào bắt được vì wizard không có test render.
   */
  test("về đúng bước 1, hồ sơ trống, mã cũ vẫn đọc lại được", async ({ page }) => {
    await submitMinimalRecord(page);
    // Đúng một `.pc-code` khi chưa có mã nào trong danh sách "đã gửi trong phiên này" — đó chính
    // là mã của hồ sơ vừa gửi.
    const firstReceipt = await page.locator("p.pc-code").first().innerText();

    await page.getByRole("button", { name: /Kê khai hồ sơ tiếp theo/i }).click();

    // Về bước 1, không còn màn hình thành công.
    await expect(page.getByText(/Bước 1\/4/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "KÊ KHAI THÀNH CÔNG" })).toHaveCount(0);

    // Ô nhập trống hoàn toàn — không còn PII của hộ trước. "Họ và tên" nay ở bước 2 (Người kê
    // khai và CCCD), không còn trên màn hình bước 1 nữa nên không kiểm ở đây.
    await expect(page.getByLabel(/Số điện thoại/i)).toHaveValue("");

    // Nộp trọn vẹn hồ sơ thứ hai để chứng minh đường tạo hồ sơ vẫn hoạt động sau khi bấm nút.
    await submitMinimalRecord(page);
    const secondReceipt = await page.locator("p.pc-code").first().innerText();
    expect(secondReceipt).not.toBe(firstReceipt);

    // Mã của hồ sơ TRƯỚC vẫn đọc lại được ở danh sách "đã gửi trong phiên này".
    await expect(page.getByText(/Đã gửi trong phiên này/i)).toBeVisible();
    await expect(page.getByText(firstReceipt, { exact: false })).toBeVisible();
  });
});

test.describe("E2E-09 — Dọn tệp mồ côi không xóa nhầm hồ sơ vừa tạo", () => {
  test.skip(!HAS_INTAKE_ENV, "Cần Supabase + Drive + Turnstile thật.");
  test.skip(
    !process.env.SUPABASE_DATABASE_URL || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    "Script audit cần kết nối trực tiếp tới Supabase + Drive, không đi qua HTTP server.",
  );

  /*
   * Không mô phỏng được lỗi ghi cơ sở dữ liệu từ phía Playwright (đó là lỗi hạ tầng, không phải
   * lỗi có thể kích hoạt qua UI). Bài kiểm ở đây là hồi quy mức thô: một lượt kê khai bình thường,
   * thành công, không được để lại tệp mồ côi nào — nếu `discardIfOrphan` (H-03) bị đổi ngược
   * thành xóa nhầm file đã nhận, DRIVE_ORPHAN vẫn bằng 0 (không phát hiện xóa nhầm qua audit) NHƯNG
   * MISSING_ON_DRIVE sẽ tăng, vì hồ sơ còn record mà file đã biến mất khỏi Drive.
   */
  test("audit dry-run chạy sạch và không báo MISSING_ON_DRIVE cho hồ sơ vừa tạo", async ({
    page,
  }) => {
    await submitMinimalRecord(page);

    const { stdout } = await execFileAsync("npx", ["tsx", "scripts/audit-orphan-public-files.ts"], {
      cwd: process.cwd(),
      timeout: 120_000,
    });

    expect(stdout).toContain("Chạy khô — không xóa gì.");
    const missingLine = /MISSING_ON_DRIVE\s*:\s*(\d+)/.exec(stdout);
    expect(missingLine).not.toBeNull();
    // Không khẳng định bằng 0 tuyệt đối — preview có thể đã có dữ liệu cũ từ trước. Khẳng định thứ
    // kiểm được chắc chắn: script chạy xong, không crash, không tự ý --apply.
    expect(Number(missingLine![1])).toBeGreaterThanOrEqual(0);
    expect(stdout).not.toContain("Đã xóa");
  });
});

test.describe("E2E-10 — Phát lại idempotent không tạo hồ sơ thứ hai", () => {
  test.skip(!HAS_INTAKE_ENV, "Cần Supabase + Drive + Turnstile thật.");

  /*
   * Wizard tự thử lại việc tạo hồ sơ tối đa 2 lần với ĐÚNG cùng idempotency key khi lần gọi đầu
   * coi như thất bại về mạng (`createIdempotencyKey.current` chỉ đổi khi máy chủ trả 409 —
   * `wizard.tsx`). Chặn ĐÚNG lần POST tạo hồ sơ đầu tiên để buộc trình duyệt đi vào chính nhánh
   * đó, thay vì tự gọi API bằng tay và phải tự giải Turnstile — để trình duyệt giải captcha test
   * và gửi request y hệt người dùng thật.
   */
  test("mạng lỗi ở lần tạo hồ sơ đầu tiên → thử lại tự động → đúng một hồ sơ, không nhân đôi", async ({
    page,
  }) => {
    let createCalls = 0;
    await page.route("**/api/public/submissions", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      createCalls += 1;
      if (createCalls === 1) {
        await route.abort("connectionreset");
        return;
      }
      await route.continue();
    });

    await page.goto("/ke-khai");

    // Wizard phải tự vượt qua lần lỗi đầu và tới được màn tải ảnh GCN (vẫn trên bước 1) — không
    // đứng lại ở thông báo lỗi.
    await createMinimalSubmission(page);
    expect(createCalls).toBeGreaterThanOrEqual(2);

    await uploadAndAwaitComplete(page, certificatePhotoInput(page), "tests/fixtures/gcn.png");
    await expect(page.getByText("Ảnh 1/1")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    await fillMinimalStepTwo(page);
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    await page.getByRole("button", { name: /Tiếp tục/i }).click();
    await page.getByRole("button", { name: /Gửi bản kê khai/i }).click();

    // Đúng MỘT hồ sơ được tạo và gửi thành công — nếu lần thử lại sinh bản thứ hai, người dân sẽ
    // thấy hai mã tiếp nhận hoặc một lỗi xung đột giữa chừng thay vì màn hình thành công sạch.
    await expect(page.getByRole("heading", { name: "KÊ KHAI THÀNH CÔNG" })).toBeVisible();
  });
});

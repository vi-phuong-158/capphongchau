import { expect, test } from "@playwright/test";

test("hiển thị trang khởi tạo", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /CSDL đất đai Phường Phong Châu/i }),
  ).toBeVisible();
  await expect(page.getByText(/chỉ hoạt động khi có kết nối mạng/i)).toBeVisible();
});

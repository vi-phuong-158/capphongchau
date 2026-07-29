import { expect, test } from "@playwright/test";

test("hiển thị trang khởi tạo", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "CSDL Đất đai" })).toBeVisible();
  await expect(
    page.getByText(/Tiếp nhận và kiểm tra nhanh hồ sơ đất đai trong đợt 180 ngày/i),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Bắt đầu kê khai/i })).toBeVisible();
});

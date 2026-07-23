import { spawnSync } from "child_process";

console.log("=== MIGRATION PRODUCTION 20K ===");
console.log("Bắt đầu chạy migration bổ sung bảng và cột cho phiên bản 20.000 hồ sơ...\n");

// Chạy bootstrap để thêm REQUEST_LOG_INDEX
console.log("-> Đang cập nhật schema nội bộ (SHEET_DEFINITIONS)...");
const bootstrapResult = spawnSync("npx", ["tsx", "scripts/bootstrap-google.ts"], { stdio: "inherit" });
if (bootstrapResult.status !== 0) {
  console.error("Lỗi khi chạy bootstrap-google.ts");
  process.exit(1);
}

// Chạy migrate-public-intake để thêm EXPORT_JOBS và cột file_name vào PUBLIC_FILES
console.log("\n-> Đang cập nhật schema công khai (PUBLIC_SHEET_DEFINITIONS)...");
const publicIntakeResult = spawnSync("npx", ["tsx", "scripts/migrate-public-intake.ts"], { stdio: "inherit" });
if (publicIntakeResult.status !== 0) {
  console.error("Lỗi khi chạy migrate-public-intake.ts");
  process.exit(1);
}

console.log("\n=== HOÀN TẤT MIGRATION ===");

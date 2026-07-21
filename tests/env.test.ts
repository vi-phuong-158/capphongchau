import { describe, expect, it } from "vitest";

import {
  EnvironmentValidationError,
  loadGoogleStorageEnvironment,
  loadPublicIntakeEnvironment,
  loadServerEnvironment,
  type EnvironmentSource,
} from "@/modules/common/env";

const validEnvironment: EnvironmentSource = {
  APP_BASE_URL: "http://localhost:3000",
  AUTH_SECRET: "a".repeat(32),
  AUTH_GOOGLE_CLIENT_ID: "google-sign-in-client-id",
  AUTH_GOOGLE_CLIENT_SECRET: "google-sign-in-client-secret",
  GOOGLE_DRIVE_CLIENT_ID: "drive-client-id",
  GOOGLE_DRIVE_CLIENT_SECRET: "drive-client-secret",
  GOOGLE_DRIVE_REFRESH_TOKEN: "drive-refresh-token",
  GOOGLE_MY_DRIVE_ROOT_FOLDER_ID: "drive-root-folder-id",
  GOOGLE_SHEETS_SPREADSHEET_ID: "spreadsheet-id",
  SYSTEM_ADMIN_EMAIL: "anmphongandn@gmail.com",
  DATA_HASH_PEPPER: "b".repeat(32),
  MAX_UPLOAD_MB: "30",
  VERCEL_REGION: "sin1",
  PUBLIC_SESSION_SECRET: "c".repeat(32),
  PUBLIC_ACCESS_CODE_PEPPER: "d".repeat(32),
};

describe("cấu hình môi trường server", () => {
  it("đọc và chuẩn hóa cấu hình hợp lệ", () => {
    expect(loadServerEnvironment(validEnvironment)).toMatchObject({
      APP_BASE_URL: "http://localhost:3000",
      MAX_UPLOAD_MB: 30,
      VERCEL_REGION: "sin1",
    });
  });

  it("chỉ nêu tên biến cấu hình sai, không đưa giá trị secret vào lỗi", () => {
    const invalidEnvironment = {
      ...validEnvironment,
      AUTH_SECRET: "secret-khong-duoc-xuat-ra-loi",
      GOOGLE_DRIVE_REFRESH_TOKEN: "",
    };

    expect(() => loadServerEnvironment(invalidEnvironment)).toThrow(EnvironmentValidationError);

    try {
      loadServerEnvironment(invalidEnvironment);
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as EnvironmentValidationError).invalidKeys).toContain(
        "GOOGLE_DRIVE_REFRESH_TOKEN",
      );
      expect((error as EnvironmentValidationError).message).not.toContain(
        "secret-khong-duoc-xuat-ra-loi",
      );
    }
  });

  it("health check Google chỉ cần cấu hình kho Google của M1", () => {
    expect(loadGoogleStorageEnvironment(validEnvironment)).toMatchObject({
      GOOGLE_MY_DRIVE_ROOT_FOLDER_ID: "drive-root-folder-id",
      GOOGLE_SHEETS_SPREADSHEET_ID: "spreadsheet-id",
    });
  });

  it("cổng công khai chỉ cần secret phiên, pepper và giới hạn upload", () => {
    expect(loadPublicIntakeEnvironment(validEnvironment)).toMatchObject({
      PUBLIC_SESSION_SECRET: "c".repeat(32),
      MAX_UPLOAD_MB: 30,
    });
  });

  it("secret phiên công khai tách khỏi AUTH_SECRET và pepper tách khỏi DATA_HASH_PEPPER", () => {
    const shared = {
      ...validEnvironment,
      PUBLIC_SESSION_SECRET: "",
      PUBLIC_ACCESS_CODE_PEPPER: "",
    };

    try {
      loadServerEnvironment(shared);
      throw new Error("Lẽ ra phải ném EnvironmentValidationError.");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as EnvironmentValidationError).invalidKeys).toEqual([
        "PUBLIC_SESSION_SECRET",
        "PUBLIC_ACCESS_CODE_PEPPER",
      ]);
    }
  });
});

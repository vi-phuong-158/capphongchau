import { describe, expect, it } from "vitest";

import {
  EnvironmentValidationError,
  loadGoogleStorageEnvironment,
  loadLegacyGoogleSheetsEnvironment,
  loadPublicIntakeEnvironment,
  loadServerEnvironment,
  loadSupabaseEnvironment,
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
  SUPABASE_DATABASE_URL:
    "postgresql://postgres.example:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
  SYSTEM_ADMIN_EMAIL: "anmphongandn@gmail.com",
  DATA_HASH_PEPPER: "b".repeat(32),
  MAX_UPLOAD_MB: "30",
  VERCEL_REGION: "sin1",
  PUBLIC_SESSION_SECRET: "c".repeat(32),
  PUBLIC_ACCESS_CODE_PEPPER: "d".repeat(32),
  ORIGIN_SHARED_SECRET: "e".repeat(32),
  TURNSTILE_SECRET_KEY: "turnstile-secret-key",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "turnstile-site-key",
  CONSENT_NOTICE_VERSION: "v1",
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
    });
  });

  it("tách cấu hình Supabase runtime khỏi Google Sheets legacy", () => {
    expect(loadSupabaseEnvironment(validEnvironment)).toEqual({
      SUPABASE_DATABASE_URL:
        "postgresql://postgres.example:secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
    });
    expect(loadLegacyGoogleSheetsEnvironment(validEnvironment)).toMatchObject({
      GOOGLE_SHEETS_SPREADSHEET_ID: "spreadsheet-id",
    });
  });
  it("cổng công khai cần secret phiên, pepper, giới hạn upload và cấu hình lớp biên", () => {
    expect(loadPublicIntakeEnvironment(validEnvironment)).toMatchObject({
      PUBLIC_SESSION_SECRET: "c".repeat(32),
      MAX_UPLOAD_MB: 30,
      ORIGIN_SHARED_SECRET: "e".repeat(32),
      TURNSTILE_SECRET_KEY: "turnstile-secret-key",
      APP_BASE_URL: "http://localhost:3000",
    });
  });

  it("thiếu cấu hình lớp biên là lỗi cấu hình, không phải mặc định bỏ qua", () => {
    const withoutEdge = {
      ...validEnvironment,
      ORIGIN_SHARED_SECRET: "",
      TURNSTILE_SECRET_KEY: "",
    };

    try {
      loadPublicIntakeEnvironment(withoutEdge);
      throw new Error("Lẽ ra phải ném EnvironmentValidationError.");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as EnvironmentValidationError).invalidKeys).toEqual([
        "ORIGIN_SHARED_SECRET",
        "TURNSTILE_SECRET_KEY",
      ]);
    }
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

  it("chỉ chấp nhận worker key đủ dài khi bật AI", () => {
    expect(() =>
      loadServerEnvironment({
        ...validEnvironment,
        AI_EXTRACTION_ENABLED: "true",
        AI_WORKER_API_KEY: "ngắn",
      }),
    ).toThrow(EnvironmentValidationError);

    expect(
      loadServerEnvironment({
        ...validEnvironment,
        AI_EXTRACTION_ENABLED: "true",
        AI_WORKER_API_KEY: "k".repeat(32),
      }).AI_WORKER_API_KEY,
    ).toHaveLength(32);
  });

  describe("kill switch chế độ cán bộ hỗ trợ kê khai", () => {
    it("mặc định TẮT khi thiếu biến — thiếu cấu hình không được vô tình mở tính năng", () => {
      expect(loadServerEnvironment(validEnvironment).OFFICER_ASSISTED_INTAKE_ENABLED).toBe(false);
      expect(loadPublicIntakeEnvironment(validEnvironment).OFFICER_ASSISTED_INTAKE_ENABLED).toBe(
        false,
      );
    });

    it('chỉ bật khi giá trị đúng bằng chuỗi "true"', () => {
      for (const value of ["TRUE", "1", "yes", "on", " true", "true "]) {
        expect(
          loadServerEnvironment({ ...validEnvironment, OFFICER_ASSISTED_INTAKE_ENABLED: value })
            .OFFICER_ASSISTED_INTAKE_ENABLED,
        ).toBe(false);
      }
      expect(
        loadServerEnvironment({ ...validEnvironment, OFFICER_ASSISTED_INTAKE_ENABLED: "true" })
          .OFFICER_ASSISTED_INTAKE_ENABLED,
      ).toBe(true);
    });
  });
});

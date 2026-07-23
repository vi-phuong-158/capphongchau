import { z } from "zod";

const serverEnvironmentSchema = z.object({
  APP_BASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_CLIENT_ID: z.string().min(1),
  AUTH_GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_DRIVE_CLIENT_ID: z.string().min(1),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_MY_DRIVE_ROOT_FOLDER_ID: z.string().min(1),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1),
  SYSTEM_ADMIN_EMAIL: z.email(),
  DATA_HASH_PEPPER: z.string().min(32),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(30),
  VERCEL_REGION: z.literal("sin1"),
  // Cổng kê khai công khai: phiên của người dân không có email nên không dùng chung
  // AUTH_SECRET; pepper mã bí mật tách khỏi DATA_HASH_PEPPER để xoay được độc lập.
  PUBLIC_SESSION_SECRET: z.string().min(32),
  PUBLIC_ACCESS_CODE_PEPPER: z.string().min(32),
  // Lớp biên Cloudflare. Thiếu bất kỳ biến nào ở đây là cổng công khai chạy không có lớp chống
  // lạm dụng, nên chúng bắt buộc chứ không tùy chọn (PLAN_NL §10, §10.2).
  ORIGIN_SHARED_SECRET: z.string().min(32),
  TURNSTILE_SECRET_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
});

const googleStorageEnvironmentSchema = serverEnvironmentSchema.pick({
  GOOGLE_DRIVE_CLIENT_ID: true,
  GOOGLE_DRIVE_CLIENT_SECRET: true,
  GOOGLE_DRIVE_REFRESH_TOKEN: true,
  GOOGLE_MY_DRIVE_ROOT_FOLDER_ID: true,
  GOOGLE_SHEETS_SPREADSHEET_ID: true,
});

const publicIntakeEnvironmentSchema = serverEnvironmentSchema.pick({
  DATA_HASH_PEPPER: true,
  PUBLIC_SESSION_SECRET: true,
  PUBLIC_ACCESS_CODE_PEPPER: true,
  MAX_UPLOAD_MB: true,
  ORIGIN_SHARED_SECRET: true,
  TURNSTILE_SECRET_KEY: true,
  APP_BASE_URL: true,
});

export type ServerEnvironment = z.output<typeof serverEnvironmentSchema>;
export type GoogleStorageEnvironment = z.output<typeof googleStorageEnvironmentSchema>;
export type PublicIntakeEnvironment = z.output<typeof publicIntakeEnvironmentSchema>;

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export class EnvironmentValidationError extends Error {
  readonly invalidKeys: readonly string[];

  constructor(invalidKeys: readonly string[]) {
    super(`Biến môi trường thiếu hoặc không hợp lệ: ${invalidKeys.join(", ")}.`);
    this.name = "EnvironmentValidationError";
    this.invalidKeys = invalidKeys;
  }
}

/** Chỉ trả tên biến lỗi để thông báo không vô tình lộ secret cấu hình. */
export function loadServerEnvironment(source: EnvironmentSource = process.env): ServerEnvironment {
  return parseEnvironment(serverEnvironmentSchema, source);
}

/** Health check M1 chỉ cần cấu hình kho Google, không phụ thuộc OAuth đăng nhập M2. */
export function loadGoogleStorageEnvironment(
  source: EnvironmentSource = process.env,
): GoogleStorageEnvironment {
  return parseEnvironment(googleStorageEnvironmentSchema, source);
}

/** Cổng công khai chỉ cần secret phiên/pepper và giới hạn upload, không cần OAuth đăng nhập. */
export function loadPublicIntakeEnvironment(
  source: EnvironmentSource = process.env,
): PublicIntakeEnvironment {
  return parseEnvironment(publicIntakeEnvironmentSchema, source);
}

function parseEnvironment<T extends z.ZodType>(schema: T, source: EnvironmentSource): z.output<T> {
  const result = schema.safeParse(source);

  if (result.success) {
    return result.data;
  }

  const invalidKeys = [
    ...new Set(
      result.error.issues
        .map((issue) => issue.path[0])
        .filter((key): key is string => typeof key === "string"),
    ),
  ];

  throw new EnvironmentValidationError(invalidKeys);
}

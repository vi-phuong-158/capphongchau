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
});

export type ServerEnvironment = z.output<typeof serverEnvironmentSchema>;

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
  const result = serverEnvironmentSchema.safeParse(source);

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

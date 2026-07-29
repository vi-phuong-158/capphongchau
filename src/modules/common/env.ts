import { z } from "zod";

const serverEnvironmentBaseSchema = z.object({
  APP_BASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_CLIENT_ID: z.string().min(1),
  AUTH_GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_DRIVE_CLIENT_ID: z.string().min(1),
  GOOGLE_DRIVE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_DRIVE_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_MY_DRIVE_ROOT_FOLDER_ID: z.string().min(1),
  SUPABASE_DATABASE_URL: z.string().min(1),
  // Supavisor transaction pooler: giới hạn nhỏ theo từng Vercel runtime instance.
  // Không tăng vượt 3 khi chưa có benchmark Preview và theo dõi quota Supabase.
  SUPABASE_POOL_MAX: z.coerce.number().int().min(1).max(3).default(1),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1).optional(),
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
  // Các cấu hình giới hạn & chế độ vận hành (production handover)
  // Phiên bản thông báo điều khoản/bảo vệ dữ liệu được ghi kèm mỗi hồ sơ. Có default để thiếu cấu
  // hình không đánh sập cả cổng công khai; nên đặt tường minh trên môi trường triển khai.
  CONSENT_NOTICE_VERSION: z.string().min(1).default("v1"),
  MAX_DRAFT_JSON_BYTES: z.coerce.number().int().positive().default(45000),
  MIN_DRIVE_FREE_GB: z.coerce.number().int().positive().default(650),
  PUBLIC_INTAKE_MODE: z.enum(["LIVE", "PAUSED"]).default("LIVE"),
  /**
   * Kill switch phía máy chủ cho chế độ cán bộ hỗ trợ kê khai (`/ke-khai-ho`).
   *
   * Mặc định TẮT khi thiếu biến — một triển khai quên đặt biến này không được vô tình mở một
   * đường tạo hồ sơ nội bộ. Đây KHÔNG phải hàng rào bảo mật duy nhất: `ASSISTED_INTAKE_ROLES`
   * vẫn được kiểm sau khi cờ bật, y hệt trước khi có cờ. Cờ chỉ trả lời "tính năng có mở hay
   * không", vai trò trả lời "ai được dùng nó" — thiếu một trong hai là từ chối.
   */
  OFFICER_ASSISTED_INTAKE_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .default(false),
  AI_EXTRACTION_ENABLED: z
    .string()
    .optional()
    .transform((val) => val === "true")
    .default(false),
  // Chỉ bắt buộc khi bật AI; để optional giúp môi trường tắt AI vẫn khởi động được.
  AI_WORKER_API_KEY: z.string().min(32).optional(),
});

const serverEnvironmentSchema = serverEnvironmentBaseSchema.superRefine((environment, context) => {
  if (environment.AI_EXTRACTION_ENABLED && !environment.AI_WORKER_API_KEY) {
    context.addIssue({
      code: "custom",
      path: ["AI_WORKER_API_KEY"],
      message: "AI_WORKER_API_KEY bắt buộc khi bật AI_EXTRACTION_ENABLED.",
    });
  }
});

const googleStorageEnvironmentSchema = serverEnvironmentBaseSchema.pick({
  GOOGLE_DRIVE_CLIENT_ID: true,
  GOOGLE_DRIVE_CLIENT_SECRET: true,
  GOOGLE_DRIVE_REFRESH_TOKEN: true,
  GOOGLE_MY_DRIVE_ROOT_FOLDER_ID: true,
  MIN_DRIVE_FREE_GB: true,
});

const supabaseEnvironmentSchema = serverEnvironmentBaseSchema.pick({
  SUPABASE_DATABASE_URL: true,
  SUPABASE_POOL_MAX: true,
});

const legacyGoogleSheetsEnvironmentSchema = serverEnvironmentBaseSchema
  .pick({
    GOOGLE_DRIVE_CLIENT_ID: true,
    GOOGLE_DRIVE_CLIENT_SECRET: true,
    GOOGLE_DRIVE_REFRESH_TOKEN: true,
    GOOGLE_SHEETS_SPREADSHEET_ID: true,
  })
  .required({ GOOGLE_SHEETS_SPREADSHEET_ID: true });
const publicIntakeEnvironmentSchema = serverEnvironmentBaseSchema.pick({
  DATA_HASH_PEPPER: true,
  PUBLIC_SESSION_SECRET: true,
  PUBLIC_ACCESS_CODE_PEPPER: true,
  MAX_UPLOAD_MB: true,
  ORIGIN_SHARED_SECRET: true,
  TURNSTILE_SECRET_KEY: true,
  APP_BASE_URL: true,
  CONSENT_NOTICE_VERSION: true,
  MAX_DRAFT_JSON_BYTES: true,
  PUBLIC_INTAKE_MODE: true,
  OFFICER_ASSISTED_INTAKE_ENABLED: true,
});

export type ServerEnvironment = z.output<typeof serverEnvironmentSchema>;
export type GoogleStorageEnvironment = z.output<typeof googleStorageEnvironmentSchema>;
export type SupabaseEnvironment = z.output<typeof supabaseEnvironmentSchema>;
export type LegacyGoogleSheetsEnvironment = z.output<typeof legacyGoogleSheetsEnvironmentSchema>;
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

export function loadSupabaseEnvironment(
  source: EnvironmentSource = process.env,
): SupabaseEnvironment {
  return parseEnvironment(supabaseEnvironmentSchema, source);
}

/** Chỉ dành cho bootstrap/import dữ liệu cũ từ Google Sheets, không dùng ở request runtime. */
export function loadLegacyGoogleSheetsEnvironment(
  source: EnvironmentSource = process.env,
): LegacyGoogleSheetsEnvironment {
  return parseEnvironment(legacyGoogleSheetsEnvironmentSchema, source);
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

/**
 * Xác minh Cloudflare Turnstile phía server (PLAN_NL §10).
 *
 * Fail-closed tuyệt đối: siteverify lỗi mạng, timeout hay trả `success:false` đều là từ chối.
 * Không có nhánh "gọi không được thì cho qua" — nhánh đó biến cả lớp chống lạm dụng thành tùy chọn
 * của kẻ tấn công, vì chỉ cần làm nghẽn siteverify là mở toang cổng.
 *
 * Token không bao giờ được ghi log: nó là bí mật dùng một lần của phiên người dân.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;

/**
 * Bộ khóa sandbox mà Cloudflare công bố công khai để chạy local/CI.
 *
 * Với các khóa này, siteverify **không trả `action`** và luôn báo `hostname: "example.com"` —
 * không có gì để đối chiếu, nên hai phép kiểm bên dưới bị bỏ qua. Nhận diện dựa trên secret trong
 * cấu hình máy chủ, thứ kẻ tấn công không tác động được: gửi token kiểu gì cũng không tự biến
 * cấu hình production thành sandbox.
 */
const CLOUDFLARE_TESTING_SECRETS: ReadonlySet<string> = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

export const TURNSTILE_HEADER = "x-turnstile-token";

/**
 * Lý do từ chối đã in log, để một đợt bot không đẩy hàng nghìn dòng giống hệt nhau.
 *
 * Mỗi lý do chỉ in một lần trong vòng đời tiến trình: đủ để người vận hành biết cấu hình sai ở đâu,
 * không đủ để làm nhiễu log.
 */
const reportedRejections = new Set<string>();

/**
 * Ghi lý do Turnstile từ chối.
 *
 * Không có hàm này thì mọi nguyên nhân — secret sai cặp với site key, hostname lệch, token giả,
 * siteverify timeout — đều hiện ra ngoài y hệt nhau: một dòng "Chưa xác minh được thao tác này".
 * Người vận hành không có cách nào phân biệt, nên một lỗi cấu hình 30 giây có thể treo cả cổng
 * công khai.
 *
 * Chỉ ghi dữ liệu cấu hình: mã lỗi của Cloudflare, hostname và action mong đợi/nhận được. Hostname
 * là thông tin công khai. Token TUYỆT ĐỐI không được ghi — nó là bí mật dùng một lần của phiên
 * người dân, và ai đọc được log sẽ giải được thử thách thay họ.
 */
function reportRejection(reason: string, detail: string): void {
  if (reportedRejections.has(reason)) {
    return;
  }
  reportedRejections.add(reason);
  console.warn(`[turnstile] reject reason=${reason} ${detail}`);
}

/** Chỉ dùng cho test: xoá bộ nhớ "đã in" để các case không ảnh hưởng lẫn nhau. */
export function resetTurnstileRejectionReport(): void {
  reportedRejections.clear();
}

export type TurnstileAction = "create" | "recover" | "submit" | "lookup";

export interface TurnstileResult {
  readonly ok: boolean;
  /**
   * Token đã được dùng (`timeout-or-duplicate`). Không đủ để cho qua, nhưng phân biệt được với
   * token giả: lần thử lại trên mạng yếu gửi đúng token cũ, và luồng tạo nháp cần biết để cho
   * request đó đi tiếp vào đường replay idempotency thay vì tạo bản kê khai thứ hai.
   */
  readonly duplicate: boolean;
}

const REJECTED: TurnstileResult = { ok: false, duplicate: false };

interface SiteverifyResponse {
  readonly success?: boolean;
  readonly action?: string;
  readonly hostname?: string;
  readonly "error-codes"?: readonly string[];
}

export async function verifyTurnstileToken(input: {
  token: string | null | undefined;
  action: TurnstileAction;
  secretKey: string;
  /**
   * Các hostname được chấp nhận — chặn token giải trên site khác đem sang dùng.
   *
   * Là danh sách chứ không phải một giá trị: cùng một bản triển khai Vercel phục vụ nhiều tên miền
   * (alias production, URL preview theo nhánh, URL riêng của từng deployment). Ghim vào đúng một
   * `APP_BASE_URL` nghĩa là mọi tên miền còn lại đều bị từ chối 100%, kể cả khi người dân đang mở
   * đúng trang thật. Xem `turnstileHostnames`.
   */
  expectedHostnames: readonly string[];
}): Promise<TurnstileResult> {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (!token || token.length > 2048) {
    reportRejection("missing-token", `action=${input.action}`);
    return REJECTED;
  }

  let payload: SiteverifyResponse;
  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: input.secretKey, response: token }).toString(),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      reportRejection("siteverify-http", `status=${response.status}`);
      return REJECTED;
    }
    payload = (await response.json()) as SiteverifyResponse;
  } catch {
    reportRejection("siteverify-unreachable", `timeout_ms=${VERIFY_TIMEOUT_MS}`);
    return REJECTED;
  }

  if (payload.success !== true) {
    const errorCodes = payload["error-codes"] ?? [];
    // `invalid-input-secret` nghĩa là TURNSTILE_SECRET_KEY sai hoặc không cùng cặp với site key
    // đang nhúng ở client — lỗi cấu hình chặn toàn bộ người dân, không phải bot bị chặn.
    reportRejection("siteverify-failed", `error_codes=${errorCodes.join(",") || "none"}`);
    return {
      ok: false,
      duplicate: errorCodes.includes("timeout-or-duplicate"),
    };
  }

  // `success` chưa đủ: token phải được sinh cho đúng hành động và đúng site này. Khóa sandbox
  // không cung cấp hai trường đó nên chỉ kiểm với khóa thật.
  if (!CLOUDFLARE_TESTING_SECRETS.has(input.secretKey)) {
    if (payload.action !== input.action) {
      reportRejection(
        "action-mismatch",
        `expected=${input.action} got=${payload.action ?? "none"}`,
      );
      return REJECTED;
    }
    if (!input.expectedHostnames.includes(payload.hostname ?? "")) {
      reportRejection(
        "hostname-mismatch",
        `expected=${input.expectedHostnames.join("|")} got=${payload.hostname ?? "none"}`,
      );
      return REJECTED;
    }
  }

  return { ok: true, duplicate: false };
}

/**
 * Các hostname mà một token được phép mang.
 *
 * `APP_BASE_URL` là một giá trị duy nhất dùng chung cho cả Production lẫn Preview trên Vercel,
 * nhưng một project Vercel phục vụ nhiều tên miền cùng lúc: alias production
 * (`<project>.vercel.app`), URL theo nhánh, và URL riêng của từng deployment. Người dân mở alias
 * production trong khi `APP_BASE_URL` trỏ tới một alias khác là đủ để Turnstile từ chối mọi lượt
 * kê khai — thất bại toàn phần, không phải thỉnh thoảng.
 *
 * Các biến `VERCEL_*` do chính Vercel tiêm vào lúc chạy, client không tác động được, nên thêm chúng
 * không nới lỏng hàng rào: token vẫn phải được giải trên chính bản triển khai này, không phải trên
 * site của kẻ tấn công.
 */
export function turnstileHostnames(appBaseUrl: string): readonly string[] {
  const hostnames = new Set<string>([new URL(appBaseUrl).hostname]);
  for (const vercelHost of [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ]) {
    if (vercelHost) {
      hostnames.add(vercelHost);
    }
  }
  return [...hostnames];
}

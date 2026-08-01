import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StaffSubmissionDetail } from "@/modules/submissions/detail-types";

/**
 * Từ Đợt 2B, trang duyệt hồ sơ nạp sẵn dữ liệu trên server. Việc đó tạo ra hai nhánh lỗi rất dễ
 * lẫn vào nhau mà không nhánh nào được test:
 *
 *   - `loadStaffSubmissionDetail` trả `null` = **hồ sơ không tồn tại** (hoặc ngoài quyền đọc) → phải
 *     `notFound()`, tuyệt đối không render khung trang rỗng rồi để client tự dò.
 *   - `loadStaffSubmissionDetail` **ném lỗi** = sự cố tạm (mất kết nối cơ sở dữ liệu) → phải render với
 *     `initialSubmission={null}` để client tự fetch, không được biến thành trang 404.
 *
 * Đảo hai nhánh này là một dòng sửa: `catch { missing = true }` thay vì `initialSubmission = null`.
 * Hậu quả là cán bộ thấy "không tìm thấy hồ sơ" khi cơ sở dữ liệu chỉ chớp tắt một nhịp — sai
 * nghiêm trọng về nghiệp vụ nhưng typecheck và lint đều xanh.
 */

class AuthorizationError extends Error {}

const requireActiveUser = vi.fn();
const loadStaffSubmissionDetail = vi.fn();
const notFound = vi.fn(() => {
  // Next.js thật ném lỗi ở đây; giữ đúng hành vi đó để code sau lời gọi không chạy tiếp.
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((target: string) => {
  throw new Error(`NEXT_REDIRECT:${target}`);
});

vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("@/components/submission-detail", () => ({ SubmissionDetail: () => null }));
vi.mock("@/modules/auth/authorization", () => ({ AuthorizationError, requireActiveUser }));
vi.mock("@/modules/submissions/detail", () => ({ loadStaffSubmissionDetail }));

const OFFICER = { email: "canbo@example.com", roles: ["REVIEW_OFFICER"] };

/** React 19 để `ReactElement["props"]` là `unknown`; khai báo props để test đọc được từng trường. */
type DetailProps = {
  submissionId: string;
  currentUserEmail: string;
  isAdministrator: boolean;
  initialSubmission: StaffSubmissionDetail | null;
};

async function renderPage(submissionId = "1a2b3c"): Promise<ReactElement<DetailProps>> {
  const page = (await import("@/app/submissions/[submissionId]/page")).default;
  return (await page({
    params: Promise.resolve({ submissionId }),
  })) as ReactElement<DetailProps>;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireActiveUser.mockResolvedValue(OFFICER);
});

describe("trang duyệt hồ sơ — nhánh không tìm thấy so với nhánh lỗi tạm", () => {
  it("hồ sơ không tồn tại thì trả 404, không render trang rỗng", async () => {
    loadStaffSubmissionDetail.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("lỗi tạm khi nạp sẵn KHÔNG thành 404 — vẫn render để client tự fetch", async () => {
    loadStaffSubmissionDetail.mockRejectedValue(new Error("kết nối cơ sở dữ liệu bị ngắt"));

    const element = await renderPage();

    expect(notFound).not.toHaveBeenCalled();
    expect(element.props).toMatchObject({
      submissionId: "1a2b3c",
      currentUserEmail: OFFICER.email,
      initialSubmission: null,
    });
  });

  it("nạp sẵn thành công thì truyền thẳng hồ sơ xuống component, không gọi lại API", async () => {
    const submission = { id: "1a2b3c" } as unknown as StaffSubmissionDetail;
    loadStaffSubmissionDetail.mockResolvedValue(submission);

    const element = await renderPage();

    expect(notFound).not.toHaveBeenCalled();
    expect(element.props.initialSubmission).toBe(submission);
  });

  /**
   * Audit `SUBMISSION_SENSITIVE_DETAIL_VIEWED` nằm trong `loadStaffSubmissionDetail`. Nếu trang tự dựng
   * dữ liệu thay vì gọi hàm dùng chung thì dấu vết "ai đã xem hồ sơ nào" mất — nên khóa cả việc
   * trang thực sự gọi hàm đó, kèm `requestId` để ghép được với log.
   */
  it("luôn đi qua loadStaffSubmissionDetail để giữ dấu vết audit", async () => {
    loadStaffSubmissionDetail.mockResolvedValue({ id: "9z" } as unknown as StaffSubmissionDetail);

    await renderPage("9z");

    expect(loadStaffSubmissionDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: "9z",
        actorEmail: OFFICER.email,
        auditDetailView: true,
        requestId: expect.any(String),
      }),
    );
  });

  it("người không đủ quyền bị đưa về /profile chứ không thấy hồ sơ", async () => {
    requireActiveUser.mockRejectedValue(new AuthorizationError("không đủ quyền"));

    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/profile");
    expect(loadStaffSubmissionDetail).not.toHaveBeenCalled();
  });

  /** Lỗi hạ tầng lúc xác thực phải nổi lên nguyên vẹn, không bị hạ cấp thành redirect. */
  it("lỗi không phải phân quyền thì không bị biến thành redirect", async () => {
    requireActiveUser.mockRejectedValue(new Error("mất kết nối khi đọc allowlist"));

    await expect(renderPage()).rejects.toThrow("mất kết nối khi đọc allowlist");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("phân quyền admin được suy ra từ vai trò", async () => {
    loadStaffSubmissionDetail.mockResolvedValue({
      id: "1a2b3c",
    } as unknown as StaffSubmissionDetail);

    requireActiveUser.mockResolvedValue({ ...OFFICER, roles: ["REVIEW_OFFICER"] });
    expect((await renderPage()).props.isAdministrator).toBe(false);

    requireActiveUser.mockResolvedValue({ ...OFFICER, roles: ["WARD_ADMIN"] });
    expect((await renderPage()).props.isAdministrator).toBe(true);
  });
});

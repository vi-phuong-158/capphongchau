/**
 * Khóa lại các lỗi tìm được ở vòng rà soát diff `79f4ae6..HEAD`.
 *
 * Mỗi test ở đây tương ứng một phát hiện trong `evidence/PUBLIC_INTAKE_V2_DIFF_REVIEW.md`. Viết
 * riêng một file thay vì rải vào các file cũ để lần sau đọc lại biết ngay: đây là những chỗ **đã
 * từng sai**, không phải những chỗ nghĩ là có thể sai.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { emptyDraft } from "@/modules/public-intake/types";
import { validateDraftForSave } from "@/modules/public-intake/validation";
import { publicActorName } from "@/modules/public-intake/workflow";
import {
  assignedOfficerLabel,
  publicAssignedOfficer,
  publicHasAssignedOfficer,
} from "@/modules/submissions/assigned-officer";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const wizard = read("../src/app/ke-khai/wizard.tsx");

describe('BLOCKER — nút "Kê khai hồ sơ tiếp theo"', () => {
  /*
   * Bản đầu POST thẳng lên endpoint tạo hồ sơ với `phone: ""`, mà cả hai endpoint đều bắt buộc
   * `^0\d{9}$`. Nút luôn trả 400 — tức là một trong sáu góp ý của cán bộ không hề hoạt động, và
   * không test nào bắt được vì wizard không có test render.
   *
   * Số điện thoại của hộ **sau** thì lúc bấm nút chưa ai biết. Nên thao tác này phải thuần cục
   * bộ: dọn PII rồi quay về bước 1, để đúng một đường tạo hồ sơ duy nhất chạy như thường.
   */
  it("không gọi endpoint tạo hồ sơ với số điện thoại rỗng", () => {
    expect(wizard).not.toContain('JSON.stringify({ phone: "" })');
  });

  it("đóng phiên hồ sơ cũ để bước 1 tạo bản mới thay vì PATCH vào bản đã gửi", () => {
    const block = wizard.slice(
      wizard.indexOf("const startNextSubmission"),
      wizard.indexOf("const goBack"),
    );
    expect(block).toContain("setReceipt(null)");
    expect(block).toContain('setCsrfToken("")');
    expect(block).toContain("createIdempotencyKey.current = null");
    expect(block).toContain("CREATE_IDEMPOTENCY_STORAGE_KEY");
  });

  it("xóa sạch PII của hộ trước", () => {
    const block = wizard.slice(
      wizard.indexOf("const startNextSubmission"),
      wizard.indexOf("const goBack"),
    );
    for (const cleanup of [
      "setDraft(emptyDraft(",
      "setIdentityPhotos({})",
      "setCertificatePhotos([])",
      "setUploadTasks([])",
      "setExistingResults({})",
    ]) {
      expect(block).toContain(cleanup);
    }
  });

  it("danh sách mã vừa gửi chỉ chứa mã, không chứa tên hay số điện thoại", () => {
    const block = wizard.slice(
      wizard.indexOf("const startNextSubmission"),
      wizard.indexOf("const goBack"),
    );
    expect(block).toContain("setRecentReceipts");
    expect(block).not.toMatch(/fullName|identityNumber|draft\.phone/);
  });
});

describe("HIGH — email cán bộ không ra cổng công khai", () => {
  const claimed = {
    claimedBy: "canbo@phongchau.gov.vn",
    status: "UNDER_REVIEW" as const,
  };

  it("tên hiển thị đúng thì trả tên", () => {
    expect(publicAssignedOfficer({ ...claimed, claimedByDisplayName: "Trần Văn B" })).toEqual({
      displayName: "Trần Văn B",
    });
  });

  it("tên hiển thị lại là một địa chỉ thư thì KHÔNG trả ra ngoài", () => {
    // `users.display_name` là ô nhập tự do; quản trị viên rất hay điền bằng chính email công vụ.
    expect(
      publicAssignedOfficer({ ...claimed, claimedByDisplayName: "canbo@phongchau.gov.vn" }),
    ).toBeNull();
    expect(
      publicAssignedOfficer({ ...claimed, claimedByDisplayName: "B <b@phongchau.gov.vn>" }),
    ).toBeNull();
  });

  it("vẫn báo là đã có người xử lý, chỉ không nói là ai", () => {
    expect(
      publicHasAssignedOfficer({ ...claimed, claimedByDisplayName: "canbo@phongchau.gov.vn" }),
    ).toBe(true);
  });

  it("màn hình quản trị vẫn thấy đủ — chỉ cổng công khai bị chặn", () => {
    expect(
      assignedOfficerLabel({ ...claimed, claimedByDisplayName: "canbo@phongchau.gov.vn" }),
    ).toBe("canbo@phongchau.gov.vn");
  });

  it("dòng thời gian công khai cũng không phát tán địa chỉ thư", () => {
    expect(publicActorName("Trần Văn B")).toBe("Trần Văn B");
    expect(publicActorName("canbo@phongchau.gov.vn")).toBe("Cán bộ phường");
    expect(publicActorName("   ")).toBe("Cán bộ phường");
  });
});

describe("Nháp cũ có tài sản không mất dữ liệu khi lưu bằng wizard 4 bước", () => {
  /*
   * Wizard V2 bỏ bước tài sản khỏi giao diện nhưng **giữ nguyên** schema. Nếu tầng lưu nháp loại
   * `assets` ra thì hồ sơ nhập dở từ trước sẽ mất phần tài sản ngay lần lưu đầu tiên, im lặng.
   */
  it("schema lưu nháp vẫn nhận mảng tài sản", () => {
    const draft = emptyDraft("o1", "p1", "l1");
    draft.phone = "0912345678";
    draft.assets = [{ id: "a1", assetType: "NHA_O", description: "Nhà cấp 4" }];
    expect(validateDraftForSave(draft)).toBeNull();
  });

  it("wizard không dựng lại draft theo cách bỏ rơi trường ngoài giao diện", () => {
    // Nháp lấy về được spread nguyên vẹn; chỉ vai trò trên GCN được chuẩn hóa.
    expect(wizard).toContain("...body.draft,");
  });
});

describe("Cờ chuẩn hóa ảnh vẫn tắt mặc định", () => {
  it("chỉ bật khi biến môi trường đúng bằng chuỗi 'true'", () => {
    const normalization = read("../src/modules/public-intake/image-normalization.client.ts");
    expect(normalization).toContain(
      'process.env.NEXT_PUBLIC_INTAKE_IMAGE_NORMALIZATION_ENABLED === "true"',
    );
  });

  it("cờ tắt thì HEIC vẫn được chuyển như trước V2 — không đổi hành vi cũ", () => {
    const normalization = read("../src/modules/public-intake/image-normalization.client.ts");
    expect(normalization).toContain("if (!isNormalizationEnabled() && !heic) return unchanged(\"DISABLED\")");
  });
});

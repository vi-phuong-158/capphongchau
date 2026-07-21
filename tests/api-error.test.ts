import { describe, expect, it } from "vitest";

import { API_ERROR_STATUS, createApiErrorPayload } from "@/modules/common/api-error";

describe("định dạng lỗi API", () => {
  it("luôn trả payload lỗi chuẩn với details mặc định là null", () => {
    expect(
      createApiErrorPayload({
        code: "ACCESS_DENIED",
        message: "Bạn không có quyền thực hiện thao tác này.",
        requestId: "req_test_123",
      }),
    ).toEqual({
      error: {
        code: "ACCESS_DENIED",
        message: "Bạn không có quyền thực hiện thao tác này.",
        requestId: "req_test_123",
        details: null,
      },
    });
  });

  it("ánh xạ version conflict về HTTP 409", () => {
    expect(API_ERROR_STATUS.VERSION_CONFLICT).toBe(409);
  });
});

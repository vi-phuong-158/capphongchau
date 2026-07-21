import { describe, expect, it } from "vitest";

import {
  LAND_PURPOSE_OPTIONS,
  REFERENCE_CATALOG_VERSION,
  REFERENCE_IS_PLACEHOLDER,
} from "@/modules/public-intake/reference";

describe("reference catalog", () => {
  it("uses the published land-type codes for the demo catalog", () => {
    expect(REFERENCE_IS_PLACEHOLDER).toBe(false);
    expect(REFERENCE_CATALOG_VERSION).toMatch(/^TT08-2024-BTNMT/);
    expect(LAND_PURPOSE_OPTIONS).toEqual(
      expect.arrayContaining([
        { code: "ONT", label: "Đất ở tại nông thôn" },
        { code: "ODT", label: "Đất ở tại đô thị" },
        { code: "LUC", label: "Đất chuyên trồng lúa" },
      ]),
    );
  });
});

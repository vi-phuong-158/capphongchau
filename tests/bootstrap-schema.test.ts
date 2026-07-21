import { describe, expect, it } from "vitest";

import {
  createReferenceDataRows,
  NEIGHBORHOOD_CODES,
  REQUIRED_SHEET_TITLES,
  SHEET_DEFINITIONS,
} from "@/modules/bootstrap";
import { NEIGHBORHOODS, UserRole } from "@/modules/common/domain";

describe("schema bootstrap Google", () => {
  it("tạo đủ sheet bắt buộc với header không trùng", () => {
    expect(REQUIRED_SHEET_TITLES).toHaveLength(14);
    expect(new Set(REQUIRED_SHEET_TITLES).size).toBe(REQUIRED_SHEET_TITLES.length);
    expect(SHEET_DEFINITIONS.every((sheet) => sheet.headers.length > 0)).toBe(true);
  });

  it("seed đúng mười tổ dân phố và các enum dùng trong MVP", () => {
    const rows = createReferenceDataRows();
    const neighborhoods = rows.filter(([category]) => category === "NEIGHBORHOOD");
    const roles = rows.filter(([category]) => category === "USER_ROLE");

    expect(neighborhoods.map(([, code]) => code)).toEqual(NEIGHBORHOOD_CODES);
    expect(neighborhoods.map(([, , label]) => label)).toEqual(NEIGHBORHOODS);
    expect(roles.map(([, code]) => code)).toEqual(Object.values(UserRole));
  });
});

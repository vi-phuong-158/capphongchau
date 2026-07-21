import { describe, expect, it } from "vitest";
import { appMetadata } from "@/lib/app-metadata";

describe("appMetadata", () => {
  it("uses Vietnamese metadata for Phường Phong Châu", () => {
    expect(appMetadata.locale).toBe("vi-VN");
    expect(appMetadata.name).toContain("Phong Châu");
  });
});

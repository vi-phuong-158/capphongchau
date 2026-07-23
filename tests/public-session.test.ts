import { describe, expect, it } from "vitest";

import {
  accessSecretMatches,
  deriveResetAccessSecret,
  hashAccessSecret,
} from "@/modules/public-intake/session";

describe("reset access secret idempotency", () => {
  it("derives the same usable secret for the same scoped idempotency key", () => {
    const pepper = "a".repeat(40);
    const key = "ACCESS_SECRET_RESET:submission-1:request-1";
    const first = deriveResetAccessSecret(pepper, key);
    const second = deriveResetAccessSecret(pepper, key);

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Z0-9_-]{4}(?:-[A-Z0-9_-]{4}){5}$/);
    expect(accessSecretMatches(pepper, first, hashAccessSecret(pepper, second))).toBe(true);
    expect(deriveResetAccessSecret(pepper, `${key}-other`)).not.toBe(first);
  });
});
